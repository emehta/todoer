"use client";

import { useEffect, useId, useRef, type RefObject } from "react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import styles from "./Ramble.module.css";

/*
 * Ramble's mark, "Triad" (the owner's pick from the previews, 8 Oct 2026):
 * three sine waves of a voice, still at rest, flowing and breathing while
 * the button it sits in is pointed at or focused, and gliding back to rest
 * when it is left, never freezing wherever they were.
 *
 * Each strand is a fixed gradient seen through a mask that holds the wave,
 * and the wave is what moves: a gradient on the moving path itself would
 * travel with it, and the wave slide out of its own colour. The colours are the
 * theme's accent (Ramble.module.css, --ink-from and --ink-to), and the fade
 * at each end is short, so the waves fill the icon.
 *
 * Drawn here rather than taken from Phosphor because its parts move apart;
 * a Phosphor icon is one merged path (CLAUDE.md, Icons).
 */

/* One period of the waves, in the 256 grid; a flow slides by exactly this. */
const PERIOD = 212;

/** A sine across the grid with a period spare at each side, so the slide loops with no seam. */
function sine(amplitude: number, phase: number): string {
  const points: string[] = [];
  for (let x = -PERIOD; x <= 256 + PERIOD; x += 4) {
    points.push(`${x},${(128 - amplitude * Math.sin(((x + phase) / PERIOD) * Math.PI * 2)).toFixed(1)}`);
  }
  return `M${points.join(" L")}`;
}

/* Every motion is a loop that starts and ends on the rest pose. */
const FLOW_LEFT: Keyframe[] = [{ transform: "translateX(0)" }, { transform: `translateX(-${PERIOD}px)` }];
const FLOW_RIGHT: Keyframe[] = [{ transform: `translateX(-${PERIOD}px)` }, { transform: "translateX(0)" }];
const BREATHE: Keyframe[] = [
  { transform: "scaleY(1)", easing: "ease-in-out" },
  { transform: "scaleY(1.18)", easing: "ease-in-out" },
  { transform: "scaleY(1)" },
];

const STRANDS = [
  /* Faint and slow behind, a lighter one against the grain, the main wave in front. */
  { d: sine(20, 140), width: 10, opacity: 0.45, paint: "from", flow: FLOW_LEFT, flowMs: 3100, breatheMs: 2900 },
  { d: sine(38, 70), width: 14, opacity: 0.7, paint: "to", flow: FLOW_RIGHT, flowMs: 2300, breatheMs: 2900 },
  { d: sine(62, 0), width: 20, opacity: 1, paint: "both", flow: FLOW_LEFT, flowMs: 1500, breatheMs: 2200 },
] as const;

/* The longest a wave takes to come back to rest once the button is left. */
const SETTLE_MS = 600;

/**
 * Runs the waves while the button around the mark is pointed at (a finger
 * on a phone does not count) or has keyboard focus, and brings them back to
 * rest when it is left: each loop eases to whichever end of its turn is
 * nearer, carrying its pace into the glide, so a wave that has just set off
 * slides back and one nearly round goes on.
 */
function useWaves(svgRef: RefObject<SVGSVGElement | null>, still: boolean) {
  useEffect(() => {
    const svg = svgRef.current;
    const host = svg?.closest("button");
    if (still || !svg || !host || typeof svg.animate !== "function") return;

    const loops = STRANDS.flatMap((strand, index) => {
      const breathe = svg.querySelector(`[data-breathe="${index}"]`);
      const flow = svg.querySelector(`[data-flow="${index}"]`);
      return [
        breathe && { animation: breathe.animate(BREATHE, { duration: strand.breatheMs, iterations: Infinity }), period: strand.breatheMs },
        flow && { animation: flow.animate(strand.flow, { duration: strand.flowMs, iterations: Infinity }), period: strand.flowMs },
      ].filter((loop) => loop !== null);
    });
    for (const { animation } of loops) animation.pause();

    let pointed = false;
    let focused = false;
    let running = false;
    let frame = 0;

    function settle() {
      const plans = loops.map(({ animation, period }) => {
        const from = Number(animation.currentTime ?? 0);
        const into = ((from % period) + period) % period;
        const distance = (into > period / 2 ? period : 0) - into;
        animation.pause();
        /* Twice the distance is a steady slowing from full pace; past the
           cap the glide starts quicker, and it never overshoots rest. */
        return { animation, from, distance, span: Math.min(SETTLE_MS, 2 * Math.abs(distance)) };
      });
      let start = -1;
      const step = (now: number) => {
        if (start < 0) start = now;
        let moving = false;
        for (const { animation, from, distance, span } of plans) {
          const s = span > 0 ? Math.min(1, (now - start) / span) : 1;
          if (s < 1) {
            moving = true;
            /* A cubic from the loop's own pace (one millisecond of the loop
               a millisecond) at the start to a stop on the rest pose. */
            animation.currentTime = from + distance * (3 * s * s - 2 * s * s * s) + span * (s - 2 * s * s + s * s * s);
          } else {
            animation.currentTime = 0;
          }
        }
        if (moving) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    }

    function update() {
      const wanted = pointed || focused;
      if (wanted === running) return;
      running = wanted;
      cancelAnimationFrame(frame);
      if (running) {
        for (const { animation } of loops) animation.play();
      } else {
        settle();
      }
    }

    const onEnter = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      pointed = true;
      update();
    };
    const onLeave = () => {
      pointed = false;
      update();
    };
    const onFocus = () => {
      focused = host.matches(":focus-visible");
      update();
    };
    const onBlur = () => {
      focused = false;
      update();
    };

    host.addEventListener("pointerenter", onEnter);
    host.addEventListener("pointerleave", onLeave);
    host.addEventListener("focus", onFocus);
    host.addEventListener("blur", onBlur);
    return () => {
      host.removeEventListener("pointerenter", onEnter);
      host.removeEventListener("pointerleave", onLeave);
      host.removeEventListener("focus", onFocus);
      host.removeEventListener("blur", onBlur);
      cancelAnimationFrame(frame);
      for (const { animation } of loops) animation.cancel();
    };
  }, [svgRef, still]);
}

export default function RambleIcon({ size = 26 }: { size?: number }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const svgRef = useRef<SVGSVGElement>(null);
  useWaves(svgRef, useReducedMotion());
  const paint = (which: "from" | "to" | "both") => `url(#${id}-${which})`;

  return (
    <svg ref={svgRef} className={styles.triad} viewBox="0 0 256 256" width={size} height={size} aria-hidden="true" focusable="false">
      <defs>
        {(["from", "to", "both"] as const).map((which) => {
          const start = which === "to" ? "var(--ink-to, #9bd9bf)" : "var(--ink-from, #2fa97f)";
          const end = which === "from" ? "var(--ink-from, #2fa97f)" : "var(--ink-to, #9bd9bf)";
          return (
            <linearGradient key={which} id={`${id}-${which}`} gradientUnits="userSpaceOnUse" x1="4" y1="0" x2="252" y2="0">
              <stop offset="0" style={{ stopColor: start, stopOpacity: 0 }} />
              <stop offset="0.07" style={{ stopColor: start }} />
              <stop offset="0.93" style={{ stopColor: end }} />
              <stop offset="1" style={{ stopColor: end, stopOpacity: 0 }} />
            </linearGradient>
          );
        })}
        {STRANDS.map((strand, index) => (
          <mask key={index} id={`${id}-m${index}`} maskUnits="userSpaceOnUse" x="0" y="0" width="256" height="256">
            <g className={styles.breathe} data-breathe={index}>
              <path
                data-flow={index}
                d={strand.d}
                fill="none"
                stroke="#fff"
                strokeOpacity={strand.opacity}
                strokeWidth={strand.width}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          </mask>
        ))}
      </defs>
      {STRANDS.map((strand, index) => (
        <rect key={index} x="0" y="0" width="256" height="256" fill={paint(strand.paint)} mask={`url(#${id}-m${index})`} />
      ))}
    </svg>
  );
}
