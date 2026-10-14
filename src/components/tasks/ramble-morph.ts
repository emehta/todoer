import { flushSync } from "react-dom";

/**
 * How Ramble's card changes shape: out of the header button when it opens,
 * from the small listening card into the wide review, between the review
 * and its transcript, and back into the button when it closes. One box
 * easing from one size and place to the other (the browser's view
 * transitions), rather than a jump. Where the browser has none, or motion is
 * reduced, it simply changes.
 */

/** The name the button and the card take, one at a time, for the transition. */
export const MORPH = "ramble-card";

/*
 * The box eases on the card's own surface, solid because a transition's
 * snapshots carry no backdrop blur and the frosted card would read as
 * see-through; what was in it fades and what comes in rises over it,
 * neither stretched. Global by nature, as view transitions are, so it is
 * drawn by RambleButton, which stays mounted while the card comes and goes.
 */
export const MORPH_CSS = `
  ::view-transition-group(${MORPH}) {
    animation-duration: 420ms;
    animation-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
    background: var(--c-surface, #272727);
    box-shadow: var(--shadow-pop, 0 18px 48px rgb(0 0 0 / 0.4)), inset 0 0 0 1px var(--c-border, #333);
  }
  ::view-transition-image-pair(${MORPH}) { overflow: clip; }
  ::view-transition-old(${MORPH}),
  ::view-transition-new(${MORPH}) {
    width: 100%;
    height: 100%;
    object-fit: none;
    object-position: 50% 0;
  }
  ::view-transition-old(${MORPH}) { animation-duration: 180ms; }
  ::view-transition-new(${MORPH}) { animation-duration: 280ms; animation-delay: 60ms; }
`;

type Transition = { finished: Promise<void>; ready: Promise<void> };
type DocumentWithTransitions = Document & { startViewTransition?: (update: () => void) => Transition };

/** Whether this browser can draw the change, and the owner has not asked for less motion. */
export function canMorph(): boolean {
  const doc = document as DocumentWithTransitions;
  return typeof doc.startViewTransition === "function" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Applies `update` as a morph where the browser can, at once where it cannot. */
export function morph(update: () => void): Transition | null {
  if (!canMorph()) {
    update();
    return null;
  }
  const transition = (document as DocumentWithTransitions).startViewTransition!(() => flushSync(update));
  /* A transition the browser skips (the tab hidden, a second one started, a
     permission prompt in between) rejects `ready`. The update has still been
     applied, so there is nothing to do but not report it as an error. */
  transition.ready.catch(() => {});
  return transition;
}
