/**
 * The Ramble card's waveform: what the microphone hears, as bars that run
 * from right to left, the newest at the right edge, the way Voice Memos
 * draws a take (the owner, 8 Oct 2026). Each bar is how loud its slice of
 * time was, so a word stands up and a pause drops to dots; a pause in the
 * take stops the bars where they are.
 *
 * Pure, and tested in `scripts/ramble.test.mjs`. RambleWaveform draws it.
 */

/** A new bar this often: about three seconds of the take across the card. */
export const BAR_MS = 55;

/** More bars than the widest card shows, so none appears out of nowhere. */
export const BAR_CAPACITY = 96;

/* Below this RMS (about -48 dBFS) the signal is a room's hum, drawn as dots. */
const GATE = 0.004;

/* The bars are scaled to the loudest the voice has been lately, never to
   less than this, so a quiet voice still stands well up and a breath does
   not. */
const MIN_PEAK = 0.03;

/* How fast that scale lets go after a loud word: about seven seconds to
   halve, a bar at a time, so one shout does not flatten what follows. */
const PEAK_DECAY = 0.995;

/* Heights are the amplitude itself, as Voice Memos draws a take: each bar
   the average loudness of its slice (its RMS), scaled to the recent peak
   with a little headroom so the loudest word stands just short of the top.
   Measured on a spoken clip (8 Oct 2026): decibels stood two bars in three
   at full height, a block with notches; each slice's loudest moment, half
   of them, a barcode; this none, and half the bars between a fifth and four
   fifths. */
const HEADROOM = 1.15;
const CURVE = 0.9;

/** A signal's RMS as the waveform's level: the amplitude, or 0 for a room's hum. */
export function voiceLevel(rms: number): number {
  return Number.isFinite(rms) && rms >= GATE ? Math.min(1, rms) : 0;
}

export interface WaveScroll {
  /** Finished bars, oldest first, 0 to 1. */
  bars: number[];
  /** The slice being gathered: its energy so far (level squared by ms). */
  energy: number;
  /** How far into that slice, in ms. */
  sinceBar: number;
  /** The loudest of the recent bars, which they are scaled to. */
  peak: number;
}

export function newWaveScroll(): WaveScroll {
  return { bars: [], energy: 0, sinceBar: 0, peak: MIN_PEAK };
}

/** A level as a bar's height, 0 to 1, against the scroll's recent peak. */
export function barHeight(level: number, peak: number): number {
  return Math.min(1, level / (Math.max(peak, MIN_PEAK) * HEADROOM)) ** CURVE;
}

/** The slice being gathered as a height, for the bar growing at the right edge. */
export function pendingHeight(scroll: WaveScroll): number {
  return scroll.sinceBar > 0 ? barHeight(Math.sqrt(scroll.energy / scroll.sinceBar), scroll.peak) : 0;
}

/**
 * Moves the take on by `elapsedMs` at `level` (voiceLevel), in place: the
 * slice gathers its energy, and each time a slice is full it becomes a bar,
 * a frame that spans two slices giving each its share. Call it only while
 * recording; a paused take is simply not moved on.
 */
export function advanceWave(scroll: WaveScroll, level: number, elapsedMs: number): WaveScroll {
  const now = Math.min(1, Math.max(0, level || 0));
  let left = Math.max(0, elapsedMs || 0);
  while (left > 0) {
    const take = Math.min(BAR_MS - scroll.sinceBar, left);
    scroll.energy += now * now * take;
    scroll.sinceBar += take;
    left -= take;
    if (scroll.sinceBar >= BAR_MS - 1e-9) {
      const average = Math.sqrt(scroll.energy / BAR_MS);
      scroll.peak = Math.max(average, scroll.peak * PEAK_DECAY, MIN_PEAK);
      scroll.bars.push(barHeight(average, scroll.peak));
      if (scroll.bars.length > BAR_CAPACITY) scroll.bars.splice(0, scroll.bars.length - BAR_CAPACITY);
      scroll.energy = 0;
      scroll.sinceBar = 0;
    }
  }
  return scroll;
}

/** How far the bars have slid towards the next one, 0 to just under 1. */
export function waveOffset(scroll: WaveScroll): number {
  return Math.min(0.999, Math.max(0, scroll.sinceBar / BAR_MS));
}

/**
 * While the ramble is read: how lit a bar at `x` is, `seconds` in, as a
 * light passes over the take from right to left, once every 1.4 seconds.
 * The bars stay as they were heard; only the light moves.
 */
export function readingLight(x: number, width: number, seconds: number): number {
  const sweep = 1 - ((seconds / 1.4) % 1);
  const centre = -0.2 * width + sweep * 1.4 * width;
  const distance = (x - centre) / (width * 0.16);
  return 0.45 + 0.55 * Math.exp(-distance * distance);
}
