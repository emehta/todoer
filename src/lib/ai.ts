import { describeFailure, type ProviderSpec } from "@/lib/ramble/providers";

/**
 * Ramble's two calls, to whichever provider the user chose: speech to text,
 * then a JSON answer held to a schema. Server only: the key is the user's own
 * Groq key or this computer's publik key, and never reaches a browser.
 *
 * The I/O half; what is asked and how the answer is read is lib/ramble.
 */

/* Inside the route's 60 seconds, the chat across its one retry. Measured on
   Groq: Whisper about a second for a minute of speech, the chat 1.5 to 3. */
const TRANSCRIBE_TIMEOUT_MS = 20_000;
const CHAT_TIMEOUT_MS = 35_000;

export class AiError extends Error {
  readonly status: number;
  readonly topUpUrl: string | null;

  constructor(message: string, status: number, topUpUrl: string | null = null) {
    super(message);
    this.name = "AiError";
    this.status = status;
    this.topUpUrl = topUpUrl;
  }
}

export interface Caller {
  spec: ProviderSpec;
  apiKey: string;
  /** publik reports the balance after each call; the card can show it. */
  onBalance?: (micros: number) => void;
}

function timedOut(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

async function failure(caller: Caller, response: Response, step: string): Promise<AiError> {
  const body = await response.json().catch(() => null);
  const retry = Number(response.headers.get("retry-after"));
  const info = describeFailure(caller.spec, response.status, body, Number.isFinite(retry) ? retry : null, step);
  return new AiError(info.message, info.status, info.topUpUrl ?? null);
}

function noteBalance(caller: Caller, response: Response): void {
  const balance = Number(response.headers.get("x-publik-balance-micros") ?? response.headers.get("x-publik-balance"));
  if (caller.onBalance && Number.isFinite(balance)) caller.onBalance(balance);
}

/** What was said in `audio`, as Whisper writes it. */
export async function transcribe(caller: Caller, audio: Blob, fileName: string, prompt: string): Promise<string> {
  const form = new FormData();
  form.set("file", audio, fileName);
  form.set("model", caller.spec.transcribeModel);
  form.set("language", "en");
  form.set("temperature", "0");
  form.set("response_format", "json");
  if (prompt) form.set("prompt", prompt);

  let response: Response;
  try {
    response = await fetch(`${caller.spec.baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${caller.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS),
    });
  } catch (error) {
    throw new AiError(timedOut(error) ? `${caller.spec.label} took too long to write that down.` : `${caller.spec.label} could not be reached.`, 504);
  }
  if (!response.ok) throw await failure(caller, response, "write that down");
  noteBalance(caller, response);
  const body = (await response.json().catch(() => null)) as { text?: unknown } | null;
  return typeof body?.text === "string" ? body.text : "";
}

/**
 * A JSON answer constrained to `schema`. Asked with the provider's own strict
 * schema check where it has one; a reply that check rejects, or one that does
 * not parse, is asked once more, and the second time with the schema written
 * into the instructions and plain JSON mode, which every OpenAI-compatible
 * model accepts. The route checks the shape either way (checkRambleReply).
 */
export async function chatJson(caller: Caller, system: string, user: string, schema: Record<string, unknown>): Promise<unknown> {
  const deadline = Date.now() + CHAT_TIMEOUT_MS;
  const request = (strict: boolean) =>
    fetch(`${caller.spec.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${caller.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: caller.spec.chatModel,
        messages: [
          {
            role: "system",
            content: strict ? system : `${system}\n\nAnswer with one JSON object, and nothing else, matching this JSON Schema:\n${JSON.stringify(schema)}`,
          },
          { role: "user", content: user },
        ],
        response_format: strict
          ? { type: "json_schema", json_schema: { name: "ramble_tasks", strict: true, schema } }
          : { type: "json_object" },
        ...caller.spec.chatOptions,
      }),
      signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
    });

  let strict = caller.spec.strictSchema;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: Response;
    try {
      response = await request(strict);
    } catch (error) {
      throw new AiError(timedOut(error) ? `${caller.spec.label} took too long to read that.` : `${caller.spec.label} could not be reached.`, 504);
    }
    if (response.status === 400 && attempt === 0) {
      const body = (await response.clone().json().catch(() => null)) as { error?: { code?: unknown; message?: unknown } } | null;
      const text = `${String(body?.error?.code ?? "")} ${String(body?.error?.message ?? "")}`.toLowerCase();
      if (text.includes("json") || text.includes("schema") || text.includes("response_format")) {
        strict = false;
        continue;
      }
    }
    if (!response.ok) throw await failure(caller, response, "read that");
    noteBalance(caller, response);
    const body = (await response.json().catch(() => null)) as { choices?: Array<{ message?: { content?: unknown } }> } | null;
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      if (attempt === 0) {
        strict = false;
        continue;
      }
      throw new AiError(`${caller.spec.label} answered with nothing.`, 502);
    }
    try {
      return JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, ""));
    } catch {
      if (attempt === 0) {
        strict = false;
        continue;
      }
      throw new AiError(`${caller.spec.label}'s answer was not readable.`, 502);
    }
  }
  throw new AiError(`${caller.spec.label}'s answer did not fit the task list.`, 502);
}

/** Whether Groq accepts a key, without spending any of its limit: it lists the models. */
export async function checkGroqKey(baseUrl: string, key: string): Promise<"ok" | "refused" | "unreachable"> {
  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (response.ok) return "ok";
    return response.status === 401 || response.status === 403 ? "refused" : "unreachable";
  } catch {
    return "unreachable";
  }
}
