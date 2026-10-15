import type { CSSProperties } from "react";

/**
 * Flatter inset card, for cards nested inside another card where a second drop
 * shadow would read as clutter, as in Insights.
 */
export const GLASS_CARD_INSET: CSSProperties = {
  background: "var(--c-surface)",
  border: "1px solid var(--c-border)",
  borderRadius: "var(--ui-radius-lg)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
};

/**
 * The surface every dialog and flyout sits on.
 *
 * Frosted rather than solid: a flat, opaque card on a blurred backdrop reads
 * as a rectangle pasted over the app rather than a panel floating above it.
 * A translucent surface over its own blur keeps the page legible underneath.
 *
 * No inner top highlight: on top of the 1px border it would draw a second
 * line, and every dialog would read as having a top border twice as thick as
 * its other three. The edge is the border, the same weight all the way round.
 *
 * color-mix keeps this themed: it resolves against whatever --c-surface is
 * for the active theme, so there is no hardcoded colour to keep in step.
 */
export const GLASS_POPOVER: CSSProperties = {
  background: "color-mix(in srgb, var(--c-surface) 80%, transparent)",
  backdropFilter: "blur(24px) saturate(150%)",
  WebkitBackdropFilter: "blur(24px) saturate(150%)",
  border: "1px solid var(--c-border)",
  boxShadow: "var(--shadow-pop)",
};

/**
 * The surface a "more options" menu sits on, inside a Popover.
 *
 * --page-bg rather than the frosted popover surface: a menu of one-line items
 * has to stay legible over whatever it covers, and a blur behind ten words of
 * 12px text reads as smudged rather than as depth. Width stays with the menu,
 * which knows how long its own labels are.
 */
export const MENU_PANEL: CSSProperties = {
  background: "var(--page-bg)",
  border: "1px solid var(--c-border)",
  borderRadius: "var(--ui-radius-lg)",
  boxShadow: "var(--shadow-pop)",
};

/**
 * One selectable option in a group: a filter chip, a category picker, a mode
 * switch. Pair with the `.ui-choice` class, which owns the unselected hover
 * state and keys off aria-pressed.
 *
 * Square, one border weight, one selected treatment, so every group of
 * options draws "selected" the same way.
 *
 * Where an option has a colour of its own, carry it with a dot rather than by
 * recolouring the control, so a row of them reads as one group.
 */
export const CHOICE_CHIP: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  padding: "6px 12px",
  borderRadius: "var(--ui-radius-md)",
  fontSize: "var(--ui-type-label)",
  cursor: "pointer",
  transition: "var(--transition-ui)",
  whiteSpace: "nowrap",
};

/**
 * The one selected look: an accent wash and border, and a bold label. See
 * --c-selected-bg in globals.css. Every tab, segment and chip uses this.
 */
export const SELECTED: CSSProperties = {
  background: "var(--c-selected-bg)",
  border: "1px solid var(--c-selected-border)",
  color: "var(--c-text-1)",
  fontWeight: 600,
};

export const CHOICE_CHIP_SELECTED: CSSProperties = SELECTED;

export const CHOICE_CHIP_UNSELECTED: CSSProperties = {
  background: "transparent",
  border: "1px solid var(--c-border)",
  color: "var(--c-text-3)",
  fontWeight: 400,
};

/**
 * Viewport width below which the signed-in app uses its phone layout.
 *
 * One number for the whole app shell: the header and the page gutters have
 * to turn over at the same moment, and a header that changes while the page
 * is still on desktop gutters reads as a bug rather than a layout.
 */
export const APP_PHONE_BREAKPOINT = 620;

/**
 * The app shell's horizontal gutter, in pixels.
 *
 * Everything with a left or a right edge on a signed-in page is measured from
 * these two numbers: the header, and the scrolling column the pages render
 * into, so the header's contents and the page's line up.
 *
 * A gutter is not a per-component decision, so it is not stated per component.
 * Import these rather than writing a number; the one page that deliberately
 * differs is /tasks, which says so where it does it.
 */
export const APP_GUTTER = 32;
export const APP_GUTTER_PHONE = 16;

/**
 * The room kept at the foot of the page, which AppShell sets (there is no
 * dock, so a plain margin). The tasks page, which fills the screen and
 * scrolls inside itself, reaches over that room with `UNDER_DOCK_MARGIN` and
 * puts `DOCK_ROOM` at the end of its own scroller instead, so the scroller
 * runs to the bottom edge and its last row still ends clear of it.
 */
export const DOCK_ROOM = "var(--app-nav-clearance, 104px)";
export const UNDER_DOCK_MARGIN = `calc(-1 * ${DOCK_ROOM})`;

/**
 * The app header's height: the bar with the name and Settings, floating over
 * the top of the page, with the list scrolling up under it into its blur.
 * AppShell measures the bar into the variable, so a reader's larger text that
 * makes it taller moves the page down with it; 56 is a desktop's at rest.
 * The tasks page, which scrolls inside itself, reaches up over it and starts
 * its own scroller's content below it.
 */
export const HEADER_ROOM = "var(--app-header-height, 56px)";

/*
 * An open task in its priority's colour (`PRIORITY_COLORS`): the fill and
 * edge of a row on /tasks. How much hue each theme takes, and what it is mixed
 * into, are the --priority-wash* variables, which
 * components/tasks/PriorityWash.module.css sets on whatever carries the
 * class. The fallbacks are Midnight's, so a stylesheet that arrives late
 * leaves the task tinted, never transparent.
 */

/** A task's fill; `hover` is the row under the cursor, a little more of its hue. */
export function priorityFill(hue: string, hover = false): string {
  const share = hover ? "var(--priority-wash-hover, 23%)" : "var(--priority-wash, 16%)";
  return `color-mix(in srgb, ${hue} ${share}, var(--priority-wash-base, var(--c-surface)))`;
}

/** A task's edge. */
export function priorityLine(hue: string): string {
  return `color-mix(in srgb, ${hue} var(--priority-wash-line, 30%), var(--c-border-sub))`;
}

/**
 * The centred column the task list sits in. A row is a line of text with a
 * couple of fields pinned to its right edge, and run to the full width of a
 * 1440px monitor it is both tiring to read and pointlessly sparse, the
 * description ending a third of the way across.
 */
export const LIST_COLUMN_WIDTH = 780;

/**
 * A content hue as text, mixed with the theme's own ink: the inline twin of
 * `.ui-hue-ink` in globals.css, for style objects that take a colour value.
 * Works on hex and on `var()` alike.
 */
export function hueInk(color: string): string {
  return `color-mix(in srgb, ${color} var(--hue-ink, 40%), var(--c-text-1))`;
}
