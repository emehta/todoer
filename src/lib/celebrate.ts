"use client";

/**
 * One completed task, announced once and heard in two places.
 *
 * The confetti and the nav banner are deliberately not the same component:
 * confetti belongs to the whole viewport and the banner belongs to the nav
 * pill, and the pages that finish a task should not have to know about
 * either. They call `celebrate()` and stop thinking about it.
 *
 * This existed before as a bare `window.dispatchEvent(new CustomEvent(
 * "vitae-celebration"))` written out at each call site, with the listener in
 * Sidebar spelling the same string a fifth time. When the nav was rebuilt in
 * `85d3725` the listener went with it and the four dispatchers kept firing at
 * nothing — silently, because a CustomEvent with no listener is not an error.
 * One module owning the name is what makes that failure impossible: delete
 * the listener now and the unused export is a lint error.
 */

const EVENT = "vitae-celebration";

export interface CelebrationOrigin {
  /** Viewport coordinates to burst from — normally the click that did it. */
  x: number;
  y: number;
}

/** Fire a celebration. `origin` omitted bursts from the centre of the screen. */
export function celebrate(origin?: CelebrationOrigin | null): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<CelebrationOrigin | null>(EVENT, { detail: origin ?? null }),
  );
}

/** Subscribe. Returns the unsubscribe function, for an effect cleanup. */
export function onCelebrate(
  handler: (origin: CelebrationOrigin | null) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  function listener(event: Event) {
    handler((event as CustomEvent<CelebrationOrigin | null>).detail ?? null);
  }
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
