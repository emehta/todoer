import { NextResponse } from "next/server";
import { AiError, chatJson, transcribe, type Caller } from "@/lib/ai";
import { LIMITS, checkRambleContext } from "@/lib/ramble/context";
import { checkRambleReply, cleanTranscript, rambleSchema, rambleSystemPrompt, whisperPrompt } from "@/lib/ramble/prompt";
import { resolveProvider } from "@/lib/ramble/providers";
import { MAX_UPLOAD_BYTES, recordingFileName } from "@/lib/ramble/recording";
import { fail, fromError } from "@/selfhost/http";
import { requireOwner } from "@/selfhost/owner";
import { readChoice } from "@/selfhost/ramble-settings";

export const dynamic = "force-dynamic";

/** A provider's failure, with the transcript when it was already written, so Try again does not send the audio twice. */
function aiFailure(error: AiError, transcript: string | null) {
  const body: Record<string, unknown> = { error: error.message };
  if (transcript) body.transcript = transcript;
  if (error.topUpUrl) {
    body.code = "publik_balance";
    body.topUpUrl = error.topUpUrl;
  } else if (error.code) {
    body.code = error.code;
  }
  return NextResponse.json(body, { status: error.status, headers: { "cache-control": "no-store" } });
}

/* A second or so to write a minute down and a few more to read it; this
   leaves room for one retry of each. */
export const maxDuration = 60;

/**
 * POST /api/tasks/ramble
 *
 * A ramble, as multipart form data: `audio` (the recording) or `text`, and
 * `context` (lib/ramble/context, built by the page from the list it holds).
 * Answers `{ transcript, tasks }`: what was said, and the tasks the model
 * read in it, checked for shape. The page settles them (lib/ramble/drafts),
 * shows them for review, and adds them itself. Nothing is written here and
 * nothing is kept: not the audio, not the transcript.
 *
 * It runs on the AI the owner chose in Settings: their own Groq key, or
 * publik. With none chosen, it says so with `code`, and the card links to
 * Settings. A publik balance that has run out comes back as a 402 with its
 * one link, `topUpUrl`.
 */
export async function POST(request: Request) {
  try {
    const owner = await requireOwner(request);
    const resolved = resolveProvider(await readChoice(owner));
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.message, code: resolved.code }, { status: 409, headers: { "cache-control": "no-store" } });
    }
    const caller: Caller = { spec: resolved.spec, apiKey: resolved.apiKey };

    const form = await request.formData().catch(() => null);
    if (!form) return fail("Send the ramble as form data.");

    let parsed: unknown = null;
    try {
      const rawContext = form.get("context");
      parsed = typeof rawContext === "string" ? JSON.parse(rawContext) : null;
    } catch {
      parsed = null;
    }
    const checked = checkRambleContext(parsed);
    if (!checked.ok) return fail(checked.message);
    const { context } = checked;

    const audio = form.get("audio");
    const text = form.get("text");
    let transcript: string;
    if (audio instanceof Blob) {
      if (audio.size === 0) return fail("The recording is empty.");
      if (audio.size > MAX_UPLOAD_BYTES) return fail("The recording is too long. Keep a ramble under three minutes.");
      transcript = cleanTranscript(await transcribe(caller, audio, recordingFileName(audio.type), whisperPrompt(context)));
    } else if (typeof text === "string") {
      if (text.length > LIMITS.transcript) return fail("That is too much text for one ramble.");
      transcript = cleanTranscript(text);
    } else {
      return fail("Send a recording or some text.");
    }

    if (!transcript) {
      return NextResponse.json({ error: "Nothing was heard. Try again a little closer to the microphone." }, { status: 422 });
    }

    let raw: unknown;
    try {
      raw = await chatJson(caller, rambleSystemPrompt(context), transcript, rambleSchema(context));
    } catch (error) {
      if (error instanceof AiError) return aiFailure(error, transcript);
      throw error;
    }
    const reply = checkRambleReply(raw, context);
    if (!reply.ok) return NextResponse.json({ error: reply.message, transcript }, { status: 502 });

    return NextResponse.json({ transcript, tasks: reply.tasks }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof AiError) return aiFailure(error, null);
    return fromError(error);
  }
}
