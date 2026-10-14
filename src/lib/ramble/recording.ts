/**
 * How a ramble is recorded and sent: the format, its file name for Groq, and
 * the limits. Pure, and tested in `scripts/ramble.test.mjs`.
 */

/** A ramble stops itself after this long. */
export const MAX_RECORDING_MS = 3 * 60 * 1000;

/* Mono speech at 32 kbps is about 240 KB a minute: three minutes is under a
   megabyte, far inside Vercel's 4.5 MB request limit, and Groq's Whisper
   hears no difference at this rate. Safari may record AAC at its own rate. */
export const RECORDING_BITS_PER_SECOND = 32_000;

/** The most the route takes: under publik's 4 MB and Vercel's 4.5 MB, with room for the context. */
export const MAX_UPLOAD_BYTES = 3_500_000;

/* Opus in WebM is what Chrome and Arc record; Safari records MP4 (AAC), and
   since 18.4 WebM as well. Groq accepts all of these. */
const PREFERRED_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

/** The first format this browser records, or "" for its own default. */
export function recordingType(isTypeSupported: (type: string) => boolean): string {
  for (const type of PREFERRED_TYPES) {
    try {
      if (isTypeSupported(type)) return type;
    } catch {
      // A browser that throws on the question does not record that type.
    }
  }
  return "";
}

/** The file name Groq is sent, whose extension is how it reads the format. */
export function recordingFileName(mimeType: string): string {
  const type = mimeType.toLowerCase();
  if (type.includes("webm")) return "ramble.webm";
  if (type.includes("mp4") || type.includes("aac") || type.includes("m4a")) return "ramble.mp4";
  if (type.includes("ogg")) return "ramble.ogg";
  if (type.includes("wav")) return "ramble.wav";
  if (type.includes("mpeg") || type.includes("mp3")) return "ramble.mp3";
  return "ramble.webm";
}

/** "0:07", "2:45": the card's timer. */
export function formatRecordingTime(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** What a refused or failed microphone means, in words for the card. */
export function microphoneProblem(error: unknown): string {
  const name = error instanceof Error || (typeof error === "object" && error !== null && "name" in error)
    ? String((error as { name?: unknown }).name)
    : "";
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") {
    return "The microphone is blocked for this site. Allow it in the browser's site settings, then try again.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") {
    return "No microphone was found.";
  }
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") {
    return "The microphone is in use by another app.";
  }
  if (name === "NotSupportedError" || name === "TypeError") {
    return "This browser cannot record here.";
  }
  return "The microphone could not start.";
}

/**
 * How long a take has recorded, paused stretches left out: what the card's
 * timer shows and what the three-minute limit counts. `since` is when the
 * current stretch began, null while paused.
 */
export interface TakeClock {
  banked: number;
  since: number | null;
}

export function startClock(now: number): TakeClock {
  return { banked: 0, since: now };
}

export function pauseClock(clock: TakeClock, now: number): TakeClock {
  return clock.since === null ? clock : { banked: clock.banked + Math.max(0, now - clock.since), since: null };
}

export function resumeClock(clock: TakeClock, now: number): TakeClock {
  return clock.since === null ? { ...clock, since: now } : clock;
}

export function readClock(clock: TakeClock, now: number): number {
  return clock.banked + (clock.since === null ? 0 : Math.max(0, now - clock.since));
}

/* Under this much recorded, a take is let go without asking. */
export const ASK_BEFORE_DISCARD_MS = 3000;

/** The clock's time, from the page's own monotonic clock, as event.timeStamp is. */
export function monotonicNow(): number {
  return performance.now();
}
