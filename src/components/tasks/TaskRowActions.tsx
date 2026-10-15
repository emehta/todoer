"use client";

import { useEffect, useRef, useState } from "react";
import {
  CalendarBlank,
  Copy,
  CopySimple,
  DotsThree,
  PencilSimple,
  Trash,
} from "@phosphor-icons/react";
import type { Priority, Task } from "@/types/task";
import { PRIORITIES, PRIORITY_COLORS, PRIORITY_LABELS } from "@/types/task";
import Tooltip from "@/components/Tooltip";
import { MENU_PANEL, SELECTED } from "@/lib/styles";
import { usePhone } from "@/lib/use-viewport-width";
import DatePicker from "./DatePicker";
import Popover from "@/components/Popover";
import controls from "./TaskControls.module.css";

/** What a row can change about its task without opening the dialog. */
export interface TaskPatch {
  due_date?: string | null;
  due_time?: string | null;
  priority?: Priority;
}

export interface TaskRowActionHandlers {
  /** Open the dialog straight into edit mode. */
  onEdit: (task: Task) => void;
  onPatch: (id: string, patch: TaskPatch) => Promise<void>;
  onDuplicate: (task: Task) => Promise<void>;
  onCopy: (task: Task) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const ICON_BUTTON: React.CSSProperties = {
  width: 32,
  height: 32,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  border: "1px solid transparent",
  background: "transparent",
  color: "var(--c-text-3)",
  borderRadius: "var(--ui-radius-item)",
  cursor: "pointer",
};

/* A thumb, not a pointer: two of these fit where three 32px ones did. */
const PHONE_ICON_BUTTON: React.CSSProperties = { ...ICON_BUTTON, width: 38, height: 38 };

/** Long enough to swallow a held spinner, short enough to feel immediate. */
const TIME_WRITE_DELAY_MS = 450;

const MENU_STYLE: React.CSSProperties = { width: 208, ...MENU_PANEL };

function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      aria-hidden="true"
      style={{
        fontSize: "var(--ui-type-micro)",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "var(--tracking-label)",
        color: "var(--c-text-4)",
        padding: "8px 12px 4px",
      }}
    >
      {children}
    </p>
  );
}

function MenuItem({
  icon,
  label,
  danger = false,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className={`${controls.action} ${danger ? controls.danger : ""} flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs`}
      style={{ color: danger ? "var(--c-danger)" : "var(--c-text-2)", background: "transparent" }}
    >
      <span style={{ display: "flex", flexShrink: 0 }}>{icon}</span>
      {label}
    </button>
  );
}

export default function TaskRowActions({
  task,
  actions,
  backgroundTint,
}: {
  task: Task;
  actions: TaskRowActionHandlers;
  /** The row's own fill, so the cluster sits on it rather than over it. */
  backgroundTint: string;
}) {
  const [showDate, setShowDate] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const dateButtonRef = useRef<HTMLButtonElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  /*
   * On a phone the cluster is always showing and sits over the title, so
   * every button in it is width the title loses. Tapping the title already
   * opens the task with Edit on it, so the pencil only saved one tap, and it
   * is the cheapest of the three to drop.
   */
  const phone = usePhone();

  /*
   * The picker's time field reports every change, and a spinner held down
   * reports a lot of them. In the dialog those land in local state and cost
   * nothing; here each one is a write, so ten arrow presses would be ten
   * updates racing each other to decide the final value.
   *
   * The date half still writes immediately, because picking a date closes the
   * picker and there is nothing left to coalesce.
   */
  const pendingTime = useRef<{ timer: ReturnType<typeof setTimeout>; run: () => void } | null>(null);

  function flushPendingTime() {
    const pending = pendingTime.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingTime.current = null;
    pending.run();
  }

  function queueTimeChange(run: () => void) {
    if (pendingTime.current) clearTimeout(pendingTime.current.timer);
    pendingTime.current = {
      run,
      timer: setTimeout(() => { pendingTime.current = null; run(); }, TIME_WRITE_DELAY_MS),
    };
  }

  // A pending change must not be lost because the row scrolled out of view.
  useEffect(() => () => flushPendingTime(), []);

  const anyOpen = showDate || showMenu;

  function closeMenu() {
    setShowMenu(false);
    setDeleteArmed(false);
  }

  /* A choice made in the menu hands focus back to its button, so the
     keyboard carries on from the row (and a card it opens returns there). */
  function chooseFromMenu(run: () => void) {
    menuButtonRef.current?.focus({ preventScroll: true });
    closeMenu();
    run();
  }

  return (
    <>
      <div
        className={controls.rowActions}
        /* Held open while a popover of its own is: the popover is portalled to
           the body, so :focus-within on the row never sees it, and the cluster
           would fade out from under the menu it opened. */
        data-open={anyOpen ? "true" : undefined}
        style={{
          position: "absolute",
          top: "50%",
          right: 8,
          transform: "translateY(-50%)",
          display: "flex",
          alignItems: "center",
          gap: 2,
          paddingLeft: 30,
          /* Long titles fade out under the cluster instead of being chopped. */
          background: `linear-gradient(to right, transparent, ${backgroundTint} 30px)`,
        }}
      >
        {!phone && (
          <Tooltip label="Edit task">
            <button
              type="button"
              className="ui-hover-control"
              aria-label={`Edit ${task.title}`}
              onClick={() => actions.onEdit(task)}
              style={ICON_BUTTON}
            >
              <PencilSimple size={17} />
            </button>
          </Tooltip>
        )}

        <Tooltip label="Set date">
          <button
            type="button"
            ref={dateButtonRef}
            className="ui-hover-control"
            aria-label={`Set date for ${task.title}`}
            aria-haspopup="dialog"
            aria-expanded={showDate}
            onClick={() => { setShowMenu(false); setShowDate((open) => !open); }}
            style={phone ? PHONE_ICON_BUTTON : ICON_BUTTON}
          >
            <CalendarBlank size={phone ? 19 : 17} />
          </button>
        </Tooltip>

        <Tooltip label="More options">
          <button
            type="button"
            ref={menuButtonRef}
            className="ui-hover-control"
            aria-label={`More options for ${task.title}`}
            aria-haspopup="menu"
            aria-expanded={showMenu}
            onClick={() => { setShowDate(false); setDeleteArmed(false); setShowMenu((open) => !open); }}
            style={phone ? PHONE_ICON_BUTTON : ICON_BUTTON}
          >
            <DotsThree size={21} weight="bold" />
          </button>
        </Tooltip>
      </div>

      {showDate && (
        <DatePicker
          anchorRef={dateButtonRef}
          value={task.due_date}
          timeValue={task.due_time}
          preferredPlacement="bottom"
          onChange={(date, time) => {
            const patch = {
              due_date: date || null,
              due_time: date ? time ?? null : null,
            };
            const write = () => { void actions.onPatch(task.id, patch); };

            // Same date means the time field moved; anything else is a pick.
            if (date && date === task.due_date) queueTimeChange(write);
            else { flushPendingTime(); write(); }
          }}
          onClose={() => { flushPendingTime(); setShowDate(false); }}
        />
      )}

      {showMenu && (
        <Popover
          anchorRef={menuButtonRef}
          onClose={closeMenu}
          preferredPlacement="bottom"
          align="right"
          ariaLabel={`Options for ${task.title}`}
          style={MENU_STYLE}
        >
          <div role="menu" className="py-1">
            {/* The heading is decoration; the group is what a reader announces. */}
            <div role="group" aria-label="Priority">
            <MenuLabel>Priority</MenuLabel>
            {PRIORITIES.map((priority) => (
              <button
                type="button"
                role="menuitemradio"
                key={priority}
                aria-checked={task.priority === priority}
                onClick={() => chooseFromMenu(() => { void actions.onPatch(task.id, { priority }); })}
                /* The hover is for the others: the current one keeps its look. */
                className={`${task.priority === priority ? "" : controls.action} flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs`}
                style={task.priority === priority
                  ? SELECTED
                  : { color: "var(--c-text-2)", background: "transparent", border: "1px solid transparent", fontWeight: 400 }}
              >
                <span
                  className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                  style={{ background: PRIORITY_COLORS[priority] }}
                />
                {PRIORITY_LABELS[priority]}
              </button>
            ))}
            </div>

            <div role="separator" className="mx-3 my-1" style={{ borderTop: "1px solid var(--c-border-sub)" }} />

            <MenuItem
              icon={<CopySimple size={13} />}
              label="Duplicate"
              onSelect={() => chooseFromMenu(() => { void actions.onDuplicate(task); })}
            />
            <MenuItem
              icon={<Copy size={13} />}
              label="Copy as text"
              onSelect={() => chooseFromMenu(() => { void actions.onCopy(task); })}
            />

            <div role="separator" className="mx-3 my-1" style={{ borderTop: "1px solid var(--c-border-sub)" }} />

            {/* Two steps, like every other delete in the app. */}
            <MenuItem
              icon={<Trash size={13} />}
              label={deleteArmed ? "Confirm delete" : "Delete task"}
              danger
              onSelect={() => {
                if (!deleteArmed) { setDeleteArmed(true); return; }
                chooseFromMenu(() => { void actions.onDelete(task.id); });
              }}
            />
          </div>
        </Popover>
      )}
    </>
  );
}
