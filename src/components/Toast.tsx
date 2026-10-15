"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "@phosphor-icons/react";
import Tooltip from "@/components/Tooltip";

const subscribeToNothing = () => () => {};

/**
 * Where the page's notes appear: at the foot of the screen, over everything,
 * so one is seen wherever the list is scrolled and never pushes the list
 * down. Above a card's scrim too, so a save that failed behind a card is
 * still read. In <body>, like the cards, since a fixed element inside a
 * scroller is not fixed in every browser.
 */
export function ToastStack({ children }: { children: ReactNode }) {
  const mounted = useSyncExternalStore(subscribeToNothing, () => true, () => false);
  if (!mounted) return null;
  return createPortal(
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: "calc(16px + env(safe-area-inset-bottom))",
        zIndex: 60,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        padding: "0 12px",
        /* Only the notes themselves take a press: the strip between them is the page's. */
        pointerEvents: "none",
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

const TONES = {
  plain: { background: "var(--page-bg)", border: "var(--c-border)", color: "var(--c-text-1)" },
  error: { background: "var(--c-danger-wash)", border: "var(--c-danger-line)", color: "var(--c-danger)" },
} as const;

/**
 * One note: a line of words, a button to act on it (Undo), and a Close for
 * one that stays until it is read. A failure says so as an alert; anything
 * else is only announced.
 */
export default function Toast({
  message,
  tone = "plain",
  action,
  onClose,
}: {
  message: string;
  tone?: keyof typeof TONES;
  action?: { label: string; onClick: () => void };
  onClose?: () => void;
}) {
  const colors = TONES[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      style={{
        pointerEvents: "auto",
        display: "flex",
        alignItems: "center",
        gap: 10,
        maxWidth: "min(480px, 100%)",
        minHeight: 44,
        padding: "6px 6px 6px 14px",
        border: `1px solid ${colors.border}`,
        borderRadius: "var(--ui-radius-item)",
        background: colors.background,
        boxShadow: "var(--shadow-pop)",
        color: colors.color,
        fontSize: "var(--ui-type-body-sm)",
        fontWeight: 500,
        lineHeight: 1.4,
      }}
    >
      <span style={{ flex: "1 1 auto", minWidth: 0, padding: "4px 0" }}>{message}</span>
      {action && (
        <button
          type="button"
          className="ui-hover-fill"
          onClick={action.onClick}
          style={{
            flexShrink: 0,
            minWidth: 32,
            height: 32,
            padding: "0 10px",
            border: "none",
            borderRadius: "var(--ui-radius-md)",
            background: "transparent",
            color: "var(--c-accent)",
            fontWeight: 650,
            cursor: "pointer",
          }}
        >
          {action.label}
        </button>
      )}
      {onClose && (
        <Tooltip label="Close">
          <button
            type="button"
            className="ui-hover-fill"
            onClick={onClose}
            aria-label="Close"
            style={{
              flexShrink: 0,
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              borderRadius: "var(--ui-radius-md)",
              background: "transparent",
              color: "inherit",
              cursor: "pointer",
            }}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </Tooltip>
      )}
    </div>
  );
}
