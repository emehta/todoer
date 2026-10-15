/**
 * Global time formatting utilities.
 *
 * Reads user preference from localStorage ("time-format": "12h" | "24h").
 * Provides pure functions and a React hook for reactive updates.
 *
 * Until one is chosen in Settings, the clock is the one this browser's
 * language and region use (lib/locale-defaults). The server, which knows
 * neither, says 24h.
 */

import { useSyncExternalStore } from "react";
import { localeClock } from "@/lib/locale-defaults";

export type TimeFormatPref = "12h" | "24h";

let localeDefault: TimeFormatPref | null = null;

/** Read current preference (safe for SSR, where it is 24h). */
export function getTimeFormat(): TimeFormatPref {
  if (typeof window === "undefined") return "24h";
  try {
    const stored = localStorage.getItem("time-format");
    if (stored === "12h" || stored === "24h") return stored;
  } catch {
    // Storage blocked: the locale's own clock, below.
  }
  localeDefault ??= localeClock();
  return localeDefault;
}

/** Persist the choice from Settings and tell every mounted clock. */
export function setTimeFormat(value: TimeFormatPref): void {
  try {
    localStorage.setItem("time-format", value);
  } catch {
    // The event below still updates every mounted consumer for this session.
  }
  window.dispatchEvent(new CustomEvent("preference-change", { detail: { timeFormat: value } }));
}

/** React hook: re-renders when the user changes the preference in Settings. */
export function useTimeFormat(): TimeFormatPref {
  return useSyncExternalStore(subscribe, getTimeFormat, getServerSnapshot);
}

function subscribe(callback: () => void): () => void {
  window.addEventListener("preference-change", callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("preference-change", callback);
    window.removeEventListener("storage", callback);
  };
}

function getServerSnapshot(): TimeFormatPref {
  return "24h";
}

/*
 * The two formatters, held. `toLocaleTimeString` builds one per call (about
 * 40 microseconds), and the list formats a time for every timed task on
 * every render. A held formatter keeps the time zone it was made in, so they
 * are made again when this device's zone changes (a flight), which the
 * offsets on two fixed days of the year tell.
 */
const JANUARY = new Date(2026, 0, 1);
const JULY = new Date(2026, 6, 1);
let timeFormatters: { zone: string; h12: Intl.DateTimeFormat; h24: Intl.DateTimeFormat } | null = null;

function timeFormatter(is24: boolean): Intl.DateTimeFormat {
  const zone = `${JANUARY.getTimezoneOffset()}/${JULY.getTimezoneOffset()}`;
  if (timeFormatters?.zone !== zone) {
    timeFormatters = {
      zone,
      h12: new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }),
      h24: new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: false }),
    };
  }
  return is24 ? timeFormatters.h24 : timeFormatters.h12;
}

/** Format a Date's time portion (e.g. "3:42 PM" or "15:42"). */
export function formatTime(date: Date, format?: TimeFormatPref): string {
  return timeFormatter((format ?? getTimeFormat()) === "24h").format(date);
}
