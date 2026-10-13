/**
 * What an edit to a task actually changed.
 *
 * The task card used to write all six of a task's fields on every save, so a
 * tab left open since the morning wrote its old description back over one
 * changed on the phone since, when all it was asked to change was the
 * priority. The card now saves only the fields that differ from the task as
 * it opened, and asks before Escape or a press outside throws away a card
 * that differs from what it opened with. Both questions are this one.
 *
 * Pure and exported so `scripts/task-changes.test.mjs` can hold it to that.
 */

import type { Priority } from "@/types/task";

/** A task's own fields, the ones its card edits. */
export type TaskFields = {
  title: string;
  description: string | null;
  due_date: string | null;
  due_time: string | null;
  priority: Priority;
  category_id: string | null;
};

/* What the card cannot show as a difference is none: spaces around the
   words, an empty description against none at all. */
function words(value: string | null | undefined): string {
  return (value ?? "").trim();
}

/* The card picks a time to the minute, and the database hands one back with
   its seconds, "09:00:00"; the two are the same time. */
function minute(value: string | null | undefined): string | null {
  return value ? value.slice(0, 5) : null;
}

/**
 * The fields of `after` that differ from `before`, carrying `after`'s values.
 * Nothing changed is an empty object.
 */
export function taskChanges(before: TaskFields, after: TaskFields): Partial<TaskFields> {
  const changes: Partial<TaskFields> = {};
  if (words(before.title) !== words(after.title)) changes.title = after.title;
  if (words(before.description) !== words(after.description)) changes.description = after.description;
  if ((before.due_date ?? null) !== (after.due_date ?? null)) changes.due_date = after.due_date;
  if (minute(before.due_time) !== minute(after.due_time)) changes.due_time = after.due_time;
  if (before.priority !== after.priority) changes.priority = after.priority;
  if ((before.category_id ?? null) !== (after.category_id ?? null)) changes.category_id = after.category_id;
  return changes;
}
