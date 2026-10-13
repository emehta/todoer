"use client";

import { useEffect, useState } from "react";
import type { RefObject } from "react";

/** Which ends of a horizontal scroller still have content behind them. */
export type ScrollEdge = "none" | "start" | "end" | "both";

/**
 * Watches a horizontal scroller and says which of its ends has more behind it.
 *
 * For rows of controls that are one line at a desktop width and too wide for a
 * phone. Hiding the scrollbar and letting the row end wherever the screen does
 * is the failure this exists to avoid — a row you cannot see the end of,
 * ending early — so the end that has something behind it is faded instead.
 *
 * Measured rather than painted on permanently: a fade at an end you have
 * already reached promises content that is not there, which is the same lie as
 * clipping silently. Pair the returned value with the `edgeFade` class in
 * `tasks/TaskControls.module.css`, which owns the mask.
 *
 * `deps` should carry whatever changes the row's contents, so the observer
 * picks up children added after mount.
 */
export function useScrollEdge(
  ref: RefObject<HTMLElement | null>,
  deps: readonly unknown[] = [],
): ScrollEdge {
  const [edge, setEdge] = useState<ScrollEdge>("none");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      // 1px of slack: a fractional scroll position at a real end would
      // otherwise leave the fade on with nothing behind it.
      const atStart = el.scrollLeft <= 1;
      const atEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 1;
      setEdge(atStart && atEnd ? "none" : atStart ? "end" : atEnd ? "start" : "both");
    };

    measure();
    el.addEventListener("scroll", measure, { passive: true });

    /* The row itself and each child: a renamed category or a relabelled filter
       changes a width without changing how many children there are. */
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const child of el.children) observer.observe(child);

    return () => {
      el.removeEventListener("scroll", measure);
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, ...deps]);

  return edge;
}
