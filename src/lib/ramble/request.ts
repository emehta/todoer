/**
 * The page's calls to /api/tasks/ramble. A failure comes back as words for
 * the card, never as a throw, and with the transcript when Whisper had
 * already written it, so Try again does not send the audio twice.
 */

import { authedFetch } from "@/lib/authed-fetch";
import { getErrorMessage, isNetworkError } from "@/lib/error-utils";
import type { RambleContext } from "./context";
import type { RambleReplyTask } from "./prompt";
import { recordingFileName } from "./recording";

/** What a failure can offer besides Try again: Settings, when Ramble is not set up, or publik's one link. */
export type RambleAction = { kind: "settings" } | { kind: "link"; label: string; href: string };

export type RambleResult =
  | { ok: true; transcript: string; tasks: RambleReplyTask[] }
  | { ok: false; message: string; transcript: string | null; action?: RambleAction; retry: boolean };

const SETUP_CODES = new Set(["choose", "groq_key", "publik_setup"]);

/** Said when the page could not reach Todoer's own server at all: its window was closed, which stops it. */
export const UNREACHABLE = "Could not reach Todoer. Check it's still running.";

type ReplyBody = { transcript?: unknown; tasks?: unknown; error?: unknown; code?: unknown; topUpUrl?: unknown } | null;

/**
 * The route's answer as the card's result: the tasks, or words and the one
 * thing to do about them. Try again is offered only where the same audio can
 * fare differently: a provider that was busy (429) or failed (5xx). A
 * recording too long, empty or with nothing heard in it fails the same way
 * every time.
 */
export function readRambleReply(status: number, ok: boolean, body: ReplyBody): RambleResult {
  const transcript = typeof body?.transcript === "string" ? body.transcript : null;
  if (ok && Array.isArray(body?.tasks) && transcript !== null) {
    return { ok: true, transcript, tasks: body.tasks as RambleReplyTask[] };
  }
  const message = typeof body?.error === "string" ? body.error : `Ramble could not read that (${status}).`;
  const action: RambleAction | undefined =
    typeof body?.code === "string" && SETUP_CODES.has(body.code)
      ? { kind: "settings" }
      : typeof body?.topUpUrl === "string" && /^https:\/\//.test(body.topUpUrl)
        ? { kind: "link", label: "Open publik", href: body.topUpUrl }
        : undefined;
  return { ok: false, message, transcript, action, retry: status === 429 || status >= 500 };
}

export async function requestRamble(
  input: { audio: Blob } | { text: string },
  context: RambleContext,
): Promise<RambleResult> {
  const form = new FormData();
  form.set("context", JSON.stringify(context));
  if ("audio" in input) form.set("audio", input.audio, recordingFileName(input.audio.type));
  else form.set("text", input.text);

  try {
    const response = await authedFetch("/api/tasks/ramble", { method: "POST", body: form });
    const body = (await response.json().catch(() => null)) as ReplyBody;
    return readRambleReply(response.status, response.ok, body);
  } catch (error) {
    return {
      ok: false,
      message: isNetworkError(error) ? UNREACHABLE : getErrorMessage(error, UNREACHABLE),
      transcript: null,
      retry: true,
    };
  }
}

/**
 * The route's answer to whether a ramble would run: null when it would, the
 * words for what to set up in Settings when it would not, undefined when the
 * answer says neither.
 */
export function readRambleSetup(ok: boolean, body: { ready?: unknown; error?: unknown } | null): string | null | undefined {
  if (!ok || !body) return undefined;
  if (body.ready === true) return null;
  return body.ready === false && typeof body.error === "string" ? body.error : undefined;
}

/** Whether Ramble can listen, asked before the microphone is: see readRambleSetup. Undefined when Todoer could not be asked. */
export async function rambleSetup(): Promise<string | null | undefined> {
  try {
    const response = await authedFetch("/api/tasks/ramble", { cache: "no-store" });
    return readRambleSetup(response.ok, await response.json().catch(() => null));
  } catch {
    return undefined;
  }
}
