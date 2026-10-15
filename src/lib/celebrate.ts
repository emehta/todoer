"use client";

/**
 * One completed task, announced once. The pages that finish a task call
 * `celebrate()` and need not know what answers it. One module owns the
 * event's name, so a listener removed leaves an unused export, which lint
 * reports, rather than dispatches firing at nothing.
 */

const EVENT = "celebration";

export interface CelebrationOrigin {
  /** Viewport coordinates to burst from: normally the click that did it. */
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
