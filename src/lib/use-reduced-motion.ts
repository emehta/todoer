"use client";

import { useSyncExternalStore } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Whether the reader has asked for less motion. For motion started from JS,
 * which the blanket `prefers-reduced-motion` rule at the end of globals.css
 * cannot reach: a video's `play()`, a requestAnimationFrame loop.
 *
 * False on the server and on the first client render, so a reader who has
 * asked sees the still until hydration, never a frame of the clip.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(REDUCED_MOTION_QUERY);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );
}
