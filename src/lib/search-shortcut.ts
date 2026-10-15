"use client";

import { useEffect, type RefObject } from "react";

/**
 * "/" puts the caret in the page's search field (`SearchField`), as on GitHub
 * and YouTube.
 */

/*
 * The fields that answer "/", oldest first. The newest one on screen takes
 * the key: a field mounted later is on what is being looked at.
 */
const shortcutFields: HTMLInputElement[] = [];

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.closest("input, textarea, select, [role='textbox'], [contenteditable='true']") !== null;
}

function onShortcut(event: globalThis.KeyboardEvent) {
  if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented || event.isComposing) return;
  if (isTyping(event.target)) return;
  /* A dialog has the page's attention; the field behind it is not reachable. */
  if (document.querySelector("[role='dialog'][aria-modal='true']")) return;
  for (let i = shortcutFields.length - 1; i >= 0; i--) {
    const input = shortcutFields[i];
    if (!input.isConnected || input.disabled || input.getClientRects().length === 0) continue;
    event.preventDefault();
    input.focus();
    input.select();
    return;
  }
}

function registerShortcut(input: HTMLInputElement): () => void {
  if (shortcutFields.length === 0) document.addEventListener("keydown", onShortcut);
  shortcutFields.push(input);
  return () => {
    const at = shortcutFields.indexOf(input);
    if (at !== -1) shortcutFields.splice(at, 1);
    if (shortcutFields.length === 0) document.removeEventListener("keydown", onShortcut);
  };
}

/** Lets "/" reach this input while it is on screen and `enabled`. */
export function useSearchShortcut(ref: RefObject<HTMLInputElement | null>, enabled = true): void {
  useEffect(() => {
    const input = ref.current;
    if (!enabled || !input) return;
    return registerShortcut(input);
  }, [ref, enabled]);
}
