"use client";

import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { CalendarBlank, Flag, PencilSimple, Tag, TextAlignLeft } from "@phosphor-icons/react";
import type { Task, Priority, NewTask } from "@/types/task";
import { PRIORITIES, PRIORITY_COLORS, PRIORITY_LABELS } from "@/types/task";
import { hueInk } from "@/lib/styles";
import type { Category } from "@/types/category";
import StatusBanner from "@/components/StatusBanner";
import { formatTime, useTimeFormat } from "@/lib/time-format";
import CategoryIcon from "./CategoryIcon";
import { useTaskQuickDates } from "./useTaskQuickDates";
import controls from "./TaskControls.module.css";
import { todayStr } from "@/lib/date-utils";
import { usePhone } from "@/lib/use-viewport-width";
import { DeleteAction, DialogButton, DialogCard, DialogFooter } from "@/components/form/Dialog";
import {
  DetailRow,
  FieldGroup,
  FieldLabel,
  FieldStack,
  TextField,
  ViewTitle,
} from "@/components/form/fields";
import DescriptionText from "@/components/form/DescriptionText";
import { DescriptionFieldLoading, DescriptionTextarea } from "@/components/form/DescriptionField";
import SelectField from "@/components/form/SelectField";
import DateField, { formatFieldDate } from "@/components/form/DateField";
import TimeField from "@/components/form/TimeField";
import { taskChanges, type TaskFields } from "@/lib/task-changes";
import { getErrorMessage } from "@/lib/error-utils";
import { contentColor } from "@/lib/content-palette";

/*
 * The description's list editor, loaded with the card rather than the page:
 * it is about 110KB compressed, and the list does not need it. The page
 * starts fetching it once idle (preloadDescriptionEditor), so it is usually
 * there before a card opens. Should the chunk not load at all, the field is
 * the plain text box it used to be rather than a broken card.
 */
const DescriptionEditor = lazy(() =>
  import("@/components/form/DescriptionEditor").catch(() => ({ default: DescriptionTextarea })),
);

/** The fields a dialog is filled from when a failed save brings it back. */
export type TaskDraft = TaskFields;

/* Long enough to read as a nudge, short enough not to delay a second try. */
const NUDGE_MS = 320;

interface Props {
  task?: Task;
  categories: Category[];
  /**
   * Saves an edit of `task`, the task as this card opened it. `changes` is
   * only what the card changed from it, and is all that is written; `draft`
   * is everything on the card, for the card a failed save brings back.
   */
  onSave?: (task: Task, changes: Partial<TaskDraft>, draft: TaskDraft) => Promise<void>;
  onCreate?: (task: NewTask) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onClose: () => void;
  startInEdit?: boolean;
  initialDueDate?: string | null;
  /** The goal a new task starts in: the one the page is filtered to, if any. */
  initialCategoryId?: string | null;
  /** What was typed before a save failed; it wins over the task's own values. */
  draft?: TaskDraft;
  /** Why that save failed, shown in the dialog it came back to. */
  initialError?: string;
}

/** What counts as "a control has focus" for the Enter-saves rule below. */
const INTERACTIVE = "button, a, input, textarea, select, [role='option'], [role='menuitem'], [contenteditable='true']";

function dueDateColor(date: string | null): string {
  if (!date) return "var(--c-text-3)";
  const today = todayStr();
  if (date < today) return "var(--c-danger)";
  if (date === today) return "var(--c-text-1)";
  return "var(--c-text-2)";
}

export default function TaskEditModal({ task, categories, onSave, onCreate, onDelete, onClose, startInEdit, initialDueDate, initialCategoryId, draft, initialError }: Props) {
  const isCreateMode = !task;
  const timeFmt = useTimeFormat();
  const phone = usePhone();
  const [editing, setEditing] = useState(isCreateMode || !!startInEdit || !!draft);

  const [title, setTitle] = useState(draft?.title ?? task?.title ?? "");
  const [description, setDescription] = useState(draft?.description ?? task?.description ?? "");
  const [dueDate, setDueDate] = useState<string | null>(
    draft ? draft.due_date : task?.due_date ?? initialDueDate ?? null,
  );
  const [dueTime, setDueTime] = useState<string | null>(draft ? draft.due_time : task?.due_time ?? null);
  const [priority, setPriority] = useState<Priority>(draft?.priority ?? task?.priority ?? "medium");
  /*
   * A new task starts in the goal the page is showing. Opening Add task from
   * inside Website and having to pick Website again was the complaint, and an
   * empty goal is also what turned Enter into a red nudge instead of a save.
   * Only a real category: a stale id would render as "Goal" and fail the save.
   */
  const [categoryId, setCategoryId] = useState<string | null>(
    draft ? draft.category_id : task?.category_id
      ?? (initialCategoryId && categories.some((c) => c.id === initialCategoryId) ? initialCategoryId : null),
  );
  /*
   * What the card opened with, read once on the first render, when the fields
   * above still hold it. Leaving is asked about only once they differ from it.
   */
  const [opened] = useState<TaskDraft>(() => ({
    title,
    description,
    due_date: dueDate,
    due_time: dueTime,
    priority,
    category_id: categoryId,
  }));
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [actionError, setActionError] = useState(initialError ?? "");
  /*
   * Required fields report themselves by colour and a nudge, not by text.
   *
   * The two "missing" flags are cleared by the change handlers rather than an
   * effect, so the red goes the moment the field is filled and stays put until
   * then — outliving the animation, which reduced motion flattens to nothing.
   */
  const [titleMissing, setTitleMissing] = useState(false);
  const [goalMissing, setGoalMissing] = useState(false);
  const [nudging, setNudging] = useState(false);
  const nudgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);

  useEffect(() => () => {
    if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
  }, []);

  /*
   * Plain Enter saves when no control has focus: the card's background, or
   * <body> if focus has been lost. A focused chip keeps Enter for opening its
   * picker, the textarea keeps it for a new line, and the title field saves
   * through its own handler. Listening on the document rather than the card,
   * because a keypress with focus on <body> never reaches the card.
   */
  /* With a picker open, focus is on its field or inside its menu, both
     controls, so Enter stays the picker's business. */
  const saveRef = useRef<() => void>(() => {});
  useEffect(() => {
    saveRef.current = () => { void handleSave(); };
  });
  useEffect(() => {
    if (!editing) return;
    function handle(event: KeyboardEvent) {
      if (event.key !== "Enter" || event.defaultPrevented || event.isComposing) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const active = document.activeElement;
      if (active && active !== document.body && active.matches(INTERACTIVE)) return;
      event.preventDefault();
      saveRef.current();
    }
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [editing]);

  function nudgeCard() {
    if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
    setNudging(true);
    nudgeTimer.current = setTimeout(() => setNudging(false), NUDGE_MS);
  }

  /*
   * Back to the title once a picker has done its job.
   *
   * A picker's option has focus when you choose it, and the picker unmounts on
   * the choice, so focus fell to <body>. Enter then went nowhere; a click on
   * the card to get back in focused the card itself, and the next key drew a
   * ring round it. On the title, Enter saves, which is what you pressed it for.
   * A frame late, so it lands after the popover has finished tearing down.
   */
  function refocusTitle() {
    requestAnimationFrame(() => titleRef.current?.focus({ preventScroll: true }));
  }

  /* Everything on the card, as a save writes it. */
  const fields: TaskDraft = {
    title: title.trim(),
    description: description.trim() || null,
    due_date: dueDate,
    due_time: dueTime,
    priority,
    category_id: categoryId,
  };

  /*
   * Whether closing would throw something away. A draft a failed save brought
   * back is unsaved from the start; otherwise, anything changed since the card
   * opened. Reading a task changes nothing.
   */
  const unsaved = editing && (Boolean(draft) || Object.keys(taskChanges(opened, fields)).length > 0);

  /*
   * Escape, a press outside the card and its X all come here. With nothing to
   * lose the card closes as it always has; with something typed it asks first,
   * in its footer, and any of the three again while it asks means keep
   * editing. Cancel is not asked about: it is the button that says it throws
   * the edit away.
   */
  function requestClose() {
    if (saving) return;
    if (confirmingDiscard) {
      keepEditing();
      return;
    }
    if (!unsaved) {
      onClose();
      return;
    }
    setConfirmingDelete(false);
    setConfirmingDiscard(true);
  }

  function keepEditing() {
    setConfirmingDiscard(false);
    refocusTitle();
  }

  async function handleSave() {
    /*
     * A ref, not the `saving` state, because two saves can start in the same
     * event: Cmd+Enter in the title reached both the title's handler and the
     * card's, both read `saving` as false, and two tasks were inserted.
     */
    if (saving || savingRef.current) return;

    /*
     * A new task has to name the goal it belongs to, and every task needs a
     * title. Neither disables the button: a dead button explains nothing, and
     * the click is what triggers the nudge that does.
     *
     * Only a new one needs the goal. Deleting a category leaves its tasks with
     * none, and requiring one on edit meant those tasks could not have so much
     * as a typo fixed without being filed somewhere first.
     */
    const hasTitle = Boolean(title.trim());
    const hasGoal = Boolean(categoryId) || !isCreateMode;
    if (!hasTitle || !hasGoal) {
      setTitleMissing(!hasTitle);
      setGoalMissing(!hasGoal);
      nudgeCard();
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setActionError("");

    try {
      if (isCreateMode) {
        if (!onCreate) throw new Error("Task creation is unavailable.");
        await onCreate(fields);
      } else if (task) {
        if (!onSave) throw new Error("Task editing is unavailable.");
        /* Only what this card changed, so a field changed somewhere else since
           it opened (on the phone, say) is not written back over. With nothing
           changed there is nothing to write. */
        const changes = taskChanges(task, fields);
        if (Object.keys(changes).length > 0) await onSave(task, changes, fields);
      }
      onClose();
    } catch (error) {
      setActionError(getErrorMessage(error, isCreateMode ? "Could not add this task. Try again." : "Could not save this task. Try again."));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!task || !onDelete || saving) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }

    setSaving(true);
    setActionError("");
    try {
      await onDelete(task.id);
      onClose();
    } catch {
      setActionError("Could not delete this task. Try again.");
      setConfirmingDelete(false);
    } finally {
      setSaving(false);
    }
  }

  const activeCat = categories.find((c) => c.id === categoryId) ?? null;

  function formattedDueTime(value: string | null): string | null {
    if (!value) return null;
    return formatTime(new Date(`2000-01-01T${value.slice(0, 5)}:00`), timeFmt);
  }

  /* The task picker's shortcuts, in the week order the owner set. */
  const quickDates = useTaskQuickDates();

  const deleteAction = !isCreateMode && onDelete ? (
    <DeleteAction
      armed={confirmingDelete}
      busy={saving}
      disabled={saving && !confirmingDelete}
      onPress={() => { void handleDelete(); }}
      onKeep={() => setConfirmingDelete(false)}
    />
  ) : undefined;

  function cancelEditing() {
    setActionError("");
    setConfirmingDelete(false);
    /* Opened straight into editing from the pencil, Cancel means "never mind"
       and closes, as a new task's does. */
    if (isCreateMode || startInEdit) {
      onClose();
      return;
    }
    /* Back to view mode with the saved task, not the draft: pressing Edit
       again used to bring the cancelled edits back as if they had been kept. */
    if (task) {
      setTitle(task.title);
      setDescription(task.description ?? "");
      setDueDate(task.due_date);
      setDueTime(task.due_time);
      setPriority(task.priority);
      setCategoryId(task.category_id);
    }
    setTitleMissing(false);
    setGoalMissing(false);
    setEditing(false);
  }

  const heading = isCreateMode ? "New task" : editing ? "Edit task" : "Task";

  /*
   * Asked in the footer rather than over the card, the way Delete asks: the
   * red button throws the edit away, Keep editing (focused, so Enter or Space
   * is the safe answer) goes back to it, and Save is still there.
   */
  const footer = confirmingDiscard ? (
    <DialogFooter
      start={(
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <DialogButton variant="danger" armed onClick={onClose} disabled={saving}>
            {isCreateMode ? "Discard task" : "Discard changes"}
          </DialogButton>
          <DialogButton variant="ghost" onClick={keepEditing} disabled={saving} autoFocus>
            Keep editing
          </DialogButton>
        </div>
      )}
    >
      <DialogButton variant="primary" onClick={() => { void handleSave(); }} busy={saving} disabled={saving}>
        {saving ? "Saving…" : isCreateMode ? "Add task" : "Save"}
      </DialogButton>
    </DialogFooter>
  ) : editing ? (
    <DialogFooter start={deleteAction}>
      <DialogButton variant="secondary" onClick={cancelEditing} disabled={saving}>
        Cancel
      </DialogButton>
      <DialogButton variant="primary" onClick={() => { void handleSave(); }} busy={saving} disabled={saving}>
        {saving && !confirmingDelete ? "Saving…" : isCreateMode ? "Add task" : "Save"}
      </DialogButton>
    </DialogFooter>
  ) : (
    <DialogFooter start={deleteAction}>
      <DialogButton variant="secondary" onClick={onClose} disabled={saving}>
        Close
      </DialogButton>
      <DialogButton variant="primary" onClick={() => setEditing(true)} disabled={saving}>
        <PencilSimple size={13} aria-hidden="true" />
        Edit
      </DialogButton>
    </DialogFooter>
  );

  const dueLine = task?.due_date
    ? `${formatFieldDate(task.due_date)}${task.due_time ? `, ${formattedDueTime(task.due_time)}` : ""}`
    : null;

  return (
    <DialogCard
      label={heading}
      heading={heading}
      onClose={requestClose}
      busy={saving}
      cardClassName={nudging ? controls.nudge : undefined}
      footer={footer}
      closeLabel="Close task dialog"
      onKeyDown={(event) => {
        /*
         * Cmd/Ctrl+Enter saves from anywhere in the card, a focused picker or
         * the description included. Plain Enter with no control focused is the
         * document listener above.
         */
        if (!editing || event.defaultPrevented) return;
        if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
        event.preventDefault();
        void handleSave();
      }}
    >
      {!editing && task && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <ViewTitle color={PRIORITY_COLORS[task.priority]}>{task.title}</ViewTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {dueLine && (
              <DetailRow icon={<CalendarBlank size={14} />}>
                {/* The row's rule: red when overdue, full ink today. */}
                <span style={{ color: dueDateColor(task.due_date) }}>{dueLine}</span>
              </DetailRow>
            )}
            <DetailRow icon={<Flag size={14} />}>
              <span className="ui-hue-ink" style={{ ["--hue" as string]: PRIORITY_COLORS[task.priority], fontWeight: 500 }}>
                {PRIORITY_LABELS[task.priority]} priority
              </span>
            </DetailRow>
            {activeCat && (
              <DetailRow icon={<CategoryIcon color={activeCat.color} size={14} />}>
                <span style={{ color: hueInk(contentColor(activeCat.color)), fontWeight: 500 }}>{activeCat.name}</span>
              </DetailRow>
            )}
          </div>
          <div style={{ paddingTop: 16, borderTop: "1px solid var(--c-border-sub)" }}>
            <FieldLabel>Description</FieldLabel>
            <DescriptionText text={task.description} empty="No description." />
          </div>
        </div>
      )}

      {editing && (
        <FieldStack grow>
          <FieldGroup label="Title" htmlFor="task-dialog-title">
            <TextField
              id="task-dialog-title"
              large
              inputRef={titleRef}
              /* Both on purpose: autoFocus covers switching an existing task
                 into edit mode, after Modal's focus effect has already run,
                 and data-autofocus is what that effect looks for on open. */
              autoFocus
              data-autofocus
              placeholder="Task title"
              value={title}
              invalid={titleMissing}
              onChange={(e) => {
                setTitle(e.target.value);
                if (titleMissing && e.target.value.trim()) setTitleMissing(false);
              }}
              onKeyDown={(e) => {
                // isComposing guards an IME: Enter there commits the candidate
                // rather than the task.
                if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                e.preventDefault();
                void handleSave();
              }}
            />
          </FieldGroup>

          <FieldGroup label="Description" htmlFor="task-dialog-description" style={{ display: "flex", flexDirection: "column", flex: "1 1 auto" }}>
            {/*
              Lists as Notes writes them: "- " a bullet, "1. " a number, Tab
              to nest (the owner's ask, 6 Oct 2026). Saved as plain lines.
            */}
            <Suspense
              fallback={(
                <DescriptionFieldLoading
                  id="task-dialog-description"
                  value={description}
                  onChange={setDescription}
                  placeholder="Add a description"
                  icon={<TextAlignLeft size={14} />}
                />
              )}
            >
              <DescriptionEditor
                id="task-dialog-description"
                value={description}
                onChange={setDescription}
                onSubmit={() => { void handleSave(); }}
                onEscape={requestClose}
                placeholder="Add a description"
                icon={<TextAlignLeft size={14} />}
              />
            </Suspense>
          </FieldGroup>

          {/*
            When, how important, and which goal: one line, under the
            description, the owner's order (29 Sep 2026). Two by two on a
            phone, where four fields across would be too narrow to read.
          */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: phone
                ? "repeat(2, minmax(0, 1fr))"
                : "minmax(0, 1.1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.05fr)",
              gap: phone ? 12 : 8,
            }}
          >
            <FieldGroup label="Date">
              <DateField
                ariaLabel="Due date"
                placeholder="No date"
                value={dueDate}
                clearable
                quickDates={quickDates}
                onChange={(next) => {
                  setDueDate(next);
                  /* A time on no day is not a due time. */
                  if (!next) setDueTime(null);
                  refocusTitle();
                }}
              />
            </FieldGroup>
            <FieldGroup label="Time">
              <TimeField
                ariaLabel="Due time"
                placeholder="No time"
                value={dueTime}
                clearable
                onChange={(next) => { setDueTime(next); refocusTitle(); }}
              />
            </FieldGroup>
            <FieldGroup label="Priority">
              <SelectField
                ariaLabel="Priority"
                value={priority}
                options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p], color: PRIORITY_COLORS[p] }))}
                onChange={(next) => { setPriority(next); refocusTitle(); }}
              />
            </FieldGroup>
            <FieldGroup label="Goal">
              <SelectField
                ariaLabel="Goal"
                icon={activeCat ? undefined : <Tag size={14} />}
                placeholder={categories.length ? "Goal" : "No goals yet"}
                value={categoryId}
                invalid={goalMissing}
                options={categories.map((c) => ({ value: c.id, label: c.name, color: c.color }))}
                onChange={(next) => {
                  setCategoryId(next);
                  setGoalMissing(false);
                  refocusTitle();
                }}
              />
            </FieldGroup>
          </div>
        </FieldStack>
      )}

      {actionError && (
        <StatusBanner
          message={actionError}
          onDismiss={() => setActionError("")}
          style={{ marginTop: 16 }}
        />
      )}
    </DialogCard>
  );
}
