"use client";

import { useEffect, useRef, useState } from "react";

/* As long as TaskControls' .nudge runs: long enough to read as a nudge,
   short enough not to delay a second try. */
const NUDGE_MS = 320;

/**
 * A card's shake when something it needs is missing, as the task card and
 * Ramble's review give it: whether it is shaking now, for the card's class,
 * and the call that starts it again.
 */
export function useNudge(): [boolean, () => void] {
  const [nudging, setNudging] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function nudge() {
    if (timer.current) clearTimeout(timer.current);
    setNudging(true);
    timer.current = setTimeout(() => setNudging(false), NUDGE_MS);
  }

  return [nudging, nudge];
}
