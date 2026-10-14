/**
 * Global time formatting utilities.
 *
 * Reads user preference from localStorage ("vitae_time_format": "12h" | "24h").
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
    const stored = localStorage.getItem("vitae_time_format");
    if (stored === "12h" || stored === "24h") return stored;
  } catch {
    // Storage blocked: the locale's own clock, below.
  }
  localeDefault ??= localeClock();
  return localeDefault;
}

/** React hook: re-renders when the user changes the preference in Settings. */
export function useTimeFormat(): TimeFormatPref {
  return useSyncExternalStore(subscribe, getTimeFormat, getServerSnapshot);
}

function subscribe(callback: () => void): () => void {
  window.addEventListener("vitae-preference", callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("vitae-preference", callback);
    window.removeEventListener("storage", callback);
  };
}

function getServerSnapshot(): TimeFormatPref {
  return "24h";
}

/*
 * The two formatters, held. `toLocaleTimeString` builds one per call (about
 * 40 microseconds), and the calendar formats every event's times on every
 * render, 1,500 or more across its strip of days. A held formatter keeps the
 * time zone it was made in, so they are made again when this device's zone
 * changes (a flight), which the offsets on two fixed days of the year tell.
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

/** Format an hour number (0-23) as a label (e.g. "3 PM" or "15:00"). */
export function formatHour(hour: number, format?: TimeFormatPref): string {
  const is24 = (format ?? getTimeFormat()) === "24h";
  if (is24) return `${String(hour).padStart(2, "0")}:00`;
  if (hour === 0) return "12 AM";
  if (hour === 12) return "12 PM";
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

/** Format a time range from two Dates (e.g. "3:00 PM – 4:30 PM"). */
export function formatTimeRange(start: Date, end: Date, format?: TimeFormatPref): string {
  return `${formatTime(start, format)} – ${formatTime(end, format)}`;
}
