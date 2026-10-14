"use client";

import { useEffect, useRef } from "react";
import type { Recorder } from "@/lib/ramble/recorder";
import { BAR_CAPACITY, advanceWave, newWaveScroll, pendingHeight, readingLight, voiceLevel, waveOffset, type WaveScroll } from "@/lib/ramble/waveform";
import styles from "./Ramble.module.css";

export type WaveMode = "waiting" | "live" | "paused" | "reading";

/* Each bar 3px wide with 2.5px between: about sixty across the card. */
const BAR = 3;
const GAP = 2.5;

/**
 * The take as it is heard, drawn every frame on a canvas without a React
 * render (lib/ramble/waveform): bars enter at the right edge and slide
 * left, smoothly between bars rather than in steps, and fade out at the
 * left. A pause holds them where they are, dimmed; while the ramble is
 * read a light passes over the bars that were heard; before the
 * microphone answers there is only a row of dots. The colour is the
 * Ramble mark's ink, read from the canvas's CSS.
 */
export default function RambleWaveform({ recorder, mode }: { recorder: Recorder; mode: WaveMode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /* One take's bars, kept across modes and started afresh for a new take. */
  const scrollRef = useRef<{ recorder: Recorder; scroll: WaveScroll } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    if (scrollRef.current?.recorder !== recorder) scrollRef.current = { recorder, scroll: newWaveScroll() };
    const { scroll } = scrollRef.current;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    /* The Ramble mark's own ink (Ramble.module.css), so the button and the
       card share one colour: deeper where the take fades out, lit where it
       is being said. */
    const css = getComputedStyle(canvas);
    const inkFrom = css.getPropertyValue("--ink-from").trim() || "#2fa97f";
    const inkTo = css.getPropertyValue("--ink-to").trim() || "#9bd9bf";

    let width = 0;
    let height = 0;
    let ratio = 1;
    const size = () => {
      const box = canvas.getBoundingClientRect();
      ratio = Math.min(window.devicePixelRatio || 1, 3);
      width = box.width;
      height = box.height;
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
    };
    size();
    const observer = new ResizeObserver(size);
    observer.observe(canvas);

    const step = BAR + GAP;
    const started = performance.now();
    let last = started;
    let frame = 0;

    const bar = (x: number, value: number, alpha: number) => {
      const tall = Math.max(BAR, value * (height - 2));
      context.globalAlpha = alpha;
      context.beginPath();
      /* Rounded where the browser can (Safari 16 on); square bars before. */
      if (typeof context.roundRect === "function") context.roundRect(x - BAR / 2, (height - tall) / 2, BAR, tall, BAR / 2);
      else context.rect(x - BAR / 2, (height - tall) / 2, BAR, tall);
      context.fill();
    };

    const draw = (now: number) => {
      /* A frame late after a stall (a hidden tab) moves the take on by a
         tenth of a second at most, not by however long it was away. */
      const elapsed = Math.min(100, now - last);
      last = now;
      if (mode === "live") advanceWave(scroll, voiceLevel(recorder.rms()), elapsed);

      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      const ink = context.createLinearGradient(0, 0, width, 0);
      ink.addColorStop(0.3, inkFrom);
      ink.addColorStop(1, inkTo);
      context.fillStyle = ink;

      const right = width - BAR / 2 - 1;
      const offset = mode === "live" ? waveOffset(scroll) : 0;
      const visible = Math.min(BAR_CAPACITY, Math.ceil(width / step) + 2);
      const seconds = reduced ? 0.7 : (now - started) / 1000;
      const alphaAt = (x: number) =>
        mode === "reading" ? readingLight(x, width, seconds)
          : mode === "paused" ? 0.7
            : mode === "waiting" ? 0.5
              : 1;

      /* The slice being gathered, at the right edge, growing as it is said. */
      if (mode === "live") bar(right - offset * step, pendingHeight(scroll), 1);
      /* Then every finished bar, newest first; past the take, dots. */
      for (let k = 0; k < visible; k++) {
        const x = right - (k + 1 + offset) * step;
        if (x < -BAR) break;
        const value = scroll.bars[scroll.bars.length - 1 - k] ?? 0;
        bar(x, value, alphaAt(x));
      }
      context.globalAlpha = 1;

      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [recorder, mode]);

  return (
    <div className={styles.wave} aria-hidden="true">
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  );
}
