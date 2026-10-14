/**
 * The page's call to /api/tasks/ramble. A failure comes back as words for
 * the card, never as a throw, and with the transcript when Whisper had
 * already written it, so Try again does not send the audio twice.
 */

import { authedFetch } from "@/lib/authed-fetch";
import { getErrorMessage } from "@/lib/error-utils";
import type { RambleContext } from "./context";
import type { RambleReplyTask } from "./prompt";
import { recordingFileName } from "./recording";

/** What a failure can offer besides Try again: Settings, when Ramble is not set up, or publik's one link. */
export type RambleAction = { kind: "settings" } | { kind: "link"; label: string; href: string };

export type RambleResult =
  | { ok: true; transcript: string; tasks: RambleReplyTask[] }
  | { ok: false; message: string; transcript: string | null; action?: RambleAction };

const SETUP_CODES = new Set(["choose", "groq_key", "publik_setup"]);

type ReplyBody = { transcript?: unknown; tasks?: unknown; error?: unknown; code?: unknown; topUpUrl?: unknown } | null;

/** The route's answer as the card's result: the tasks, or words and the one thing to do about them. */
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
        ? { kind: "link", label: "Add credit", href: body.topUpUrl }
        : undefined;
  return { ok: false, message, transcript, action };
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
    return { ok: false, message: getErrorMessage(error, "Couldn't reach Todoer. Check it's still running."), transcript: null };
  }
}
