/**
 * Which AI Ramble runs on, and how each is asked. Pure, so the choice and
 * the error wording are tested (scripts/ramble-providers.test.mjs).
 *
 * The user chooses in Settings:
 * - "groq": their own free Groq key. Free, limited per minute and per day.
 * - "publik": publik API, with no key of their own: a balance that starts at
 *   $0.00, $0.05 free once their computer is linked to a publik account,
 *   then paid per use.
 * Both speak the OpenAI API, so one client calls either.
 */

export type ProviderName = "groq" | "publik";

export interface ProviderSpec {
  name: ProviderName;
  label: string;
  baseUrl: string;
  transcribeModel: string;
  chatModel: string;
  /** Extra fields on the chat request: how hard to think, how long to answer. */
  chatOptions: Record<string, unknown>;
  /** Whether the provider holds a reply to a strict JSON schema itself. */
  strictSchema: boolean;
}

export const GROQ: ProviderSpec = {
  name: "groq",
  label: "Groq",
  baseUrl: "https://api.groq.com/openai/v1",
  transcribeModel: "whisper-large-v3-turbo",
  chatModel: "openai/gpt-oss-120b",
  /* Low effort answers in two or three seconds and leaves room in the free
     plan's 8K tokens a minute for a second ramble. Temperature 0, because the
     same words should give the same tasks. */
  chatOptions: { reasoning_effort: "low", temperature: 0, max_completion_tokens: 4096 },
  strictSchema: true,
};

export const PUBLIK_BASE_URL = "https://publikhq.com/api/v1";

export function publikSpec(baseUrl: string | null | undefined): ProviderSpec {
  return {
    name: "publik",
    label: "publik",
    baseUrl: baseUrl || PUBLIK_BASE_URL,
    /* publik passes transcription to the provider at its own price; it takes
       OpenAI's model name for it. */
    transcribeModel: "whisper-1",
    /* A tier, never a vendor model (publik's rule): the cheapest, which is
       enough to read a ramble into tasks, so the free $0.05 goes furthest. */
    chatModel: "publik-fast",
    chatOptions: { temperature: 0, max_tokens: 4096 },
    strictSchema: true,
  };
}

/** What Ramble knows about the user's choice, as the route reads it. */
export interface RambleChoice {
  provider: ProviderName | null;
  groqKey: string | null;
  publikKey: string | null;
  publikBaseUrl: string | null;
}

export type Resolution =
  | { ok: true; spec: ProviderSpec; apiKey: string }
  | { ok: false; code: "choose" | "groq_key" | "publik_setup"; message: string };

/**
 * The provider for this ramble, or what is missing. Nothing is guessed: with
 * no choice made, Ramble asks for one rather than picking for the user, since
 * one of the two can cost them money.
 */
export function resolveProvider(choice: RambleChoice): Resolution {
  if (choice.provider === "groq") {
    return choice.groqKey
      ? { ok: true, spec: GROQ, apiKey: choice.groqKey }
      : { ok: false, code: "groq_key", message: "Add your Groq key in Settings." };
  }
  if (choice.provider === "publik") {
    return choice.publikKey
      ? { ok: true, spec: publikSpec(choice.publikBaseUrl), apiKey: choice.publikKey }
      : { ok: false, code: "publik_setup", message: "Set up publik in Settings." };
  }
  return { ok: false, code: "choose", message: "Choose how Ramble listens in Settings." };
}

/** A Groq key as Groq issues them. */
export function looksLikeGroqKey(key: string): boolean {
  return /^gsk_[A-Za-z0-9]{20,}$/.test(key.trim());
}

/** The last four characters, to show which key is saved without showing it. */
export function keyHint(key: string | null): string | null {
  return key && key.length > 8 ? `ends ${key.slice(-4)}` : null;
}

export interface FailureInfo {
  status: number;
  message: string;
  /** The one link a publik 402 carries, to add credit or link the computer. */
  topUpUrl?: string | null;
}

/**
 * A provider's failed answer, in words the card can show. `step` is what was
 * being done ("write that down", "read that").
 */
export function describeFailure(
  spec: Pick<ProviderSpec, "name" | "label">,
  status: number,
  body: unknown,
  retryAfterSeconds: number | null,
  step: string,
): FailureInfo {
  const error = (body as { error?: { message?: unknown; top_up_url?: unknown } } | null)?.error;
  const detail = typeof error?.message === "string" ? error.message.slice(0, 300) : "";
  if (status === 401 || status === 403) {
    return spec.name === "groq"
      ? { status: 502, message: "Groq refused your key. Check it in Settings." }
      : { status: 502, message: "publik refused this computer's key. Set it up again in Settings." };
  }
  if (status === 402) {
    return {
      status: 402,
      message: detail || "Your publik balance has run out.",
      topUpUrl: typeof error?.top_up_url === "string" ? error.top_up_url : null,
    };
  }
  if (status === 429) {
    const when =
      retryAfterSeconds && retryAfterSeconds > 0
        ? retryAfterSeconds < 90
          ? ` Try again in ${Math.ceil(retryAfterSeconds)} seconds.`
          : ` Try again in ${Math.ceil(retryAfterSeconds / 60)} minutes.`
        : " Try again shortly.";
    return {
      status: 429,
      message: spec.name === "groq" ? `Groq's free limit is used up for now.${when}` : `publik is busy.${when}`,
    };
  }
  if (status === 413) return { status: 413, message: `That recording is too long for ${spec.label}.` };
  const ending = detail ? `: ${detail}${/[.!?]$/.test(detail) ? "" : "."}` : ".";
  return { status: 502, message: `${spec.label} could not ${step}${ending}` };
}
