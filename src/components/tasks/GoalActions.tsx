"use client";

import { useEffect, useState } from "react";
import { Checks } from "@phosphor-icons/react";
import type { Category } from "@/types/category";
import Tooltip from "@/components/Tooltip";
import controls from "./TaskControls.module.css";

/** An armed Mark all done disarms itself if it is not confirmed in this long. */
const CONFIRM_MS = 5000;

/** The size of the tab row's own + button, so these line up with it. */
const ICON: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  height: 30,
  minWidth: 30,
  padding: "0 8px",
  borderRadius: "var(--ui-radius-md)",
  border: "1px solid var(--c-border-sub)",
  background: "transparent",
  color: "var(--c-text-3)",
  cursor: "pointer",
  fontSize: "var(--ui-type-label)",
  fontWeight: 600,
  whiteSpace: "nowrap",
  flexShrink: 0,
};

/** A tooltip only where it adds something: not over a button that spells itself out. */
function Tip({ label, children }: { label: string | null; children: React.ReactNode }) {
  return label ? <Tooltip label={label}>{children}</Tooltip> : <>{children}</>;
}

/**
 * The selected goal's own action, Mark all done, at the end of the goal tabs
 * beside the + that adds a goal.
 *
 * The owner chose this over a bar of buttons above the list (29 Sep 2026):
 * what acts on the whole list, Add task, is in the page header, and what acts
 * on the selected goal sits next to the goals. It names itself in a tooltip
 * and to a screen reader, and spells out its question ("Mark 5 tasks done?")
 * once armed, so the one thing that asks first is never hidden behind an
 * icon. It completes the goal's open tasks the list is showing, by id.
 *
 * Edit goal and Delete goal were icons here too; the owner asked for only Add
 * goal and Mark all done (29 Sep 2026). Both stay on the goal tab's own
 * menu (its ⋯, or a right-click), which is where they are reached now.
 *
 * Nothing on All: there is no selected goal to act on.
 */
export default function GoalActions({
  category,
  shownOpenIds,
  onMarkDone,
}: {
  category: Category;
  /** Open tasks of this goal that the list is showing: what Mark all done completes. */
  shownOpenIds: string[];
  onMarkDone: (ids: string[]) => Promise<void>;
}) {
  const [completeArmed, setCompleteArmed] = useState(false);
  const [marking, setMarking] = useState(false);

  /* An armed Mark all done belongs to the goal it was armed on. */
  const [armedFor, setArmedFor] = useState(category.id);
  if (armedFor !== category.id) {
    setArmedFor(category.id);
    setCompleteArmed(false);
  }

  useEffect(() => {
    if (!completeArmed) return;
    const timer = setTimeout(() => setCompleteArmed(false), CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [completeArmed]);

  const openCount = shownOpenIds.length;
  const markLabel = marking
    ? "Marking…"
    : openCount === 0
      ? "Nothing to mark done"
      : completeArmed
        ? `Mark ${openCount} ${openCount === 1 ? "task" : "tasks"} done?`
        : "Mark all done";

  async function markAll() {
    if (marking || openCount === 0) return;
    if (!completeArmed) {
      setCompleteArmed(true);
      return;
    }
    setMarking(true);
    try {
      await onMarkDone(shownOpenIds);
    } catch {
      // The page's banner says what went wrong.
    } finally {
      setMarking(false);
      setCompleteArmed(false);
    }
  }

  const spelledOut = completeArmed || marking;

  return (
    <div role="group" aria-label={`${category.name} goal actions`} style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
      <Tip label={spelledOut ? null : markLabel}>
        <button
          type="button"
          onClick={() => { void markAll(); }}
          disabled={marking || openCount === 0}
          aria-label={spelledOut ? undefined : markLabel}
          aria-live="polite"
          className={controls.iconButton}
          style={{
            ...ICON,
            ...(completeArmed ? { background: "var(--c-accent-strong)", color: "var(--c-on-accent)", borderColor: "transparent" } : {}),
            opacity: openCount === 0 ? 0.45 : 1,
            cursor: marking ? "wait" : openCount === 0 ? "default" : "pointer",
          }}
        >
          <Checks size={14} weight="bold" aria-hidden="true" />
          {spelledOut && markLabel}
        </button>
      </Tip>

      {/* Sets the goal's own action apart from the + that adds another. */}
      <span aria-hidden="true" style={{ width: 1, height: 18, background: "var(--c-border)", margin: "0 4px 0 6px", flexShrink: 0 }} />
    </div>
  );
}
