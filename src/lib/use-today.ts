"use client";

import { useSyncExternalStore } from "react";
import { todayStr } from "@/lib/date-utils";

/*
 * Tells React to read the day again: at local midnight, and whenever the tab
 * comes back into view or its window takes focus, because a timer does not
 * run while a laptop sleeps and a background tab's is held back. Reading it
 * again costs nothing, and only a different day re-renders anything.
 */
function subscribe(onChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;

  function schedule() {
    clearTimeout(timer);
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    /* A second past it, so the clock has certainly turned when it fires. */
    timer = setTimeout(() => {
      onChange();
      schedule();
    }, nextMidnight.getTime() - now.getTime() + 1000);
  }

  function wake() {
    if (document.visibilityState !== "visible") return;
    onChange();
    schedule();
  }

  schedule();
  document.addEventListener("visibilitychange", wake);
  window.addEventListener("focus", wake);
  return () => {
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", wake);
    window.removeEventListener("focus", wake);
  };
}

/**
 * Today's `YYYY-MM-DD` key, which moves on at local midnight.
 *
 * A page that works out "today" while it renders only moves on when
 * something else makes it render, so /tasks left open overnight went on
 * calling yesterday Today, with yesterday's unfinished tasks under it rather
 * than in Overdue, until the first click.
 */
export function useTodayKey(): string {
  return useSyncExternalStore(subscribe, todayStr, todayStr);
}
