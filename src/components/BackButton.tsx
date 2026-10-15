"use client";

import { ArrowLeft } from "@phosphor-icons/react";
import Tooltip from "@/components/Tooltip";
import { usePhone } from "@/lib/use-viewport-width";

/**
 * The way back: a bare arrow on a title's line, boxed only while you point
 * at it, with a label naming where it goes. Ramble's transcript has it, back
 * to the tasks.
 *
 * 32px square on a desktop, the height of a header row, so it never makes
 * the row taller. On a phone it is a 40px target, since it is pressed with a
 * thumb. Colour and fill come from `ui-hover-control`, not inline, so the
 * hover can change them.
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
