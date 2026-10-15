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
import NewGoalField, { FieldAlert, NEW_GOAL, goalNamed } from "./NewGoalField";
import { getDueDateStyle } from "./TaskItem";
import { useNudge } from "./useNudge";
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
 * a plain text box rather than a broken card. Ramble's review uses it too.
 */
export const DescriptionEditor = lazy(() =>
  import("@/components/form/DescriptionEditor").catch(() => ({ default: DescriptionTextarea })),
);

/** The fields a dialog is filled from when a failed save brings it back. */
export type TaskDraft = TaskFields;

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
  /**
   * Makes a goal from the picker's New goal, so a task is never stuck for
   * want of one: a new account's first task, or a goal not made yet.
   */
  onCreateGoal?: (name: string) => Promise<Category>;
}

/** What counts as "a control has focus" for the Enter-saves rule below. */
const INTERACTIVE = "button, a, input, textarea, select, [role='option'], [role='menuitem'], [contenteditable='true']";

export default function TaskEditModal({ task, categories, onSave, onCreate, onDelete, onClose, startInEdit, initialDueDate, initialCategoryId, draft, initialError, onCreateGoal }: Props) {
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
   * A new task starts in the goal the page is showing, so Add task from
   * inside Website does not ask for Website again, and Enter saves rather
   * than nudging for a goal. Only a real category: a stale id would render as
   * no goal and fail the save.
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
  const [newGoalName, setNewGoalName] = useState<string | null>(null);
  const [newGoalBusy, setNewGoalBusy] = useState(false);
  const [newGoalError, setNewGoalError] = useState("");

  /* The goal picker's trigger, to hand focus back to when New goal closes:
     left on <body>, the card's Enter-saves listener would take the next Enter. */
  const goalFieldId = `task-goal-${task?.id ?? "new"}`;
  function focusGoalPicker() {
    requestAnimationFrame(() => document.getElementById(goalFieldId)?.focus({ preventScroll: true }));
  }
  function closeNewGoal() {
    setNewGoalName(null);
    setNewGoalError("");
    focusGoalPicker();
  }
  /**
   * The name typed under New goal, as a goal: one already named that is
   * picked rather than made twice. Answers its id, or null when nothing was
   * made (no name, or the create failed and says why under the field).
   */
  async function confirmNewGoal(): Promise<string | null> {
    const name = (newGoalName ?? "").trim();
    if (!name || !onCreateGoal) {
      closeNewGoal();
      return null;
    }
    let id: string;
    setNewGoalBusy(true);
    setNewGoalError("");
    try {
      id = await goalNamed(name, categories, onCreateGoal);
    } catch (error) {
      setNewGoalError(getErrorMessage(error, "Could not make that goal."));
      return null;
    } finally {
      setNewGoalBusy(false);
    }
    setCategoryId(id);
    setGoalMissing(false);
    setNewGoalName(null);
    setNewGoalError("");
    focusGoalPicker();
    return id;
  }
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [actionError, setActionError] = useState(initialError ?? "");
  /*
   * Required fields report themselves by colour and a nudge; a missing goal
   * also says so under its field, since a new account's first task has none
   * picked and nothing else would say one is needed.
   *
   * The two "missing" flags are cleared by the change handlers rather than an
   * effect, so the red goes the moment the field is filled and stays put until
   * then, outliving the animation, which reduced motion flattens to nothing.
   */
  const [titleMissing, setTitleMissing] = useState(false);
  const [goalMissing, setGoalMissing] = useState(false);
  const [nudging, nudgeCard] = useNudge();
  const titleRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);

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
     * event (Cmd+Enter reaches both the title's handler and the card's), and
     * set before anything is awaited: a second press while a New goal name is
     * being made would otherwise make the goal and the task twice.
     */
    if (saving || savingRef.current) return;
    savingRef.current = true;

    try {
      /*
       * A new task has to name the goal it belongs to, and every task needs a
       * title. Neither disables the button: a dead button explains nothing,
       * and the click is what triggers the nudge that does.
       *
       * Only a new one needs the goal. Deleting a goal leaves its tasks with
       * none, and those must still take a typo fix without being filed
       * somewhere first.
       */
      /* A name typed under New goal and never confirmed is still the goal the
         person meant: it is made (or found) first, then the task saved in it. */
      let goalId = categoryId;
      if (newGoalName !== null && newGoalName.trim()) {
        const made = await confirmNewGoal();
        if (!made) return;
        goalId = made;
      }
      const hasTitle = Boolean(title.trim());
      const hasGoal = Boolean(goalId) || !isCreateMode;
      if (!hasTitle || !hasGoal) {
        setTitleMissing(!hasTitle);
        setGoalMissing(!hasGoal);
        nudgeCard();
        return;
      }

      setSaving(true);
      setActionError("");

      const toSave: TaskDraft = goalId === fields.category_id ? fields : { ...fields, category_id: goalId };
      if (isCreateMode) {
        if (!onCreate) throw new Error("Task creation is unavailable.");
        await onCreate(toSave);
      } else if (task) {
        if (!onSave) throw new Error("Task editing is unavailable.");
        /* Only what this card changed, so a field changed somewhere else since
           it opened (on the phone, say) is not written back over. With nothing
           changed there is nothing to write. */
        const changes = taskChanges(task, toSave);
        if (Object.keys(changes).length > 0) await onSave(task, changes, toSave);
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
    } catch (error) {
      setActionError(getErrorMessage(error, "Could not delete this task. Try again."));
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
    /* Back to view mode with the saved task, not the draft, so pressing Edit
       again does not bring the cancelled edits back as if kept. */
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
                <span style={getDueDateStyle(task.due_date, todayStr())}>{dueLine}</span>
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
              {newGoalName === null ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <SelectField
                    id={goalFieldId}
                    ariaLabel="Goal"
                    icon={activeCat ? undefined : <Tag size={14} />}
                    placeholder={categories.length ? "Choose a goal" : "No goals yet"}
                    value={categoryId}
                    invalid={goalMissing}
                    options={[
                      ...categories.map((c) => ({ value: c.id, label: c.name, color: c.color })),
                      ...(onCreateGoal ? [{ value: NEW_GOAL, label: "New goal" }] : []),
                    ]}
                    onChange={(next) => {
                      if (next === NEW_GOAL) {
                        setNewGoalName("");
                        setNewGoalError("");
                        return;
                      }
                      setCategoryId(next);
                      setGoalMissing(false);
                      refocusTitle();
                    }}
                  />
                  {goalMissing && <FieldAlert>Choose a goal.</FieldAlert>}
                </div>
              ) : (
                <NewGoalField
                  id={goalFieldId}
                  name={newGoalName}
                  busy={newGoalBusy}
                  error={newGoalError}
                  invalid={goalMissing}
                  onChange={(name) => {
                    setNewGoalName(name);
                    setNewGoalError("");
                  }}
                  onAdd={() => { void confirmNewGoal(); }}
                  onCancel={closeNewGoal}
                />
              )}
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
