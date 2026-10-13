"use client";

import { ArrowLeft } from "@phosphor-icons/react";
import Tooltip from "@/components/Tooltip";
import { usePhone } from "@/lib/use-viewport-width";

/**
 * The way back to a hub: a bare arrow on the page title's line (PageTitle
 * draws it there), boxed only while you point at it, with a label naming
 * where it goes. The one copy, for every tool, Finance view and Reflect
 * screen.
 *
 * 32px square on a desktop, the height of a page header row, so it never
 * makes the row taller. On a phone it is a 40px target, since it is pressed
 * with a thumb, and PageTitle lets it overhang the line rather than move it.
 * Colour and fill come from `ui-hover-control`, not inline, so the hover can
 * change them.
 */
export default function BackButton({ label, onBack }: { label: string; onBack: () => void }) {
  const phone = usePhone();
  const size = phone ? 40 : 32;
  const name = `Back to ${label}`;
  return (
    /* Above the arrow, as every other tooltip in the app (the owner, 7 Oct
       2026: under it was wrong); Tooltip drops it below only at the top of
       the window. */
    <Tooltip label={name}>
      <button
        type="button"
        onClick={onBack}
        aria-label={name}
        className="ui-hover-control"
        style={{
          width: size,
          height: size,
          display: "inline-grid",
          placeItems: "center",
          padding: 0,
          border: "none",
          borderRadius: "var(--ui-radius-md)",
          cursor: "pointer",
          transition: "var(--transition-ui)",
        }}
      >
        <ArrowLeft size={20} aria-hidden="true" />
      </button>
    </Tooltip>
  );
}
