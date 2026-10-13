/**
 * The days between two days that have tasks, folded into one gap.
 *
 * The task list used to draw every day from today to the last task as its own
 * heading with an "Add task" row, so a task two days out came with two empty
 * days above it saying "Add task, Add task". The owner asked for those runs
 * to become one quiet connector instead (29 Sep 2026). While a task is being
 * dragged the days of the next two weeks open again, so there is still
 * somewhere to drop a task onto 1 October (dragDayEntries); that switch is in
 * TaskList, and this module only decides what folds.
 *
 * Pure and exported, so `scripts/day-gaps.test.mjs` can hold it to that.
 */

import { MONTHS_SHORT, shiftDateStr } from "@/lib/date-utils";

export type DayEntry =
  | { kind: "day"; date: string }
  | { kind: "gap"; from: string; to: string; days: number };

/**
 * The dates, in order, with each run of empty ones replaced by a single gap.
 * A day with tasks is always its own entry; so is the lone day that is empty
 * only because every one of its tasks is hidden, since `isEmpty` decides.
 */
export function collapseEmptyDays(dates: readonly string[], isEmpty: (date: string) => boolean): DayEntry[] {
  const entries: DayEntry[] = [];
  let runStart: number | null = null;

  const closeRun = (end: number) => {
    if (runStart === null) return;
    entries.push({ kind: "gap", from: dates[runStart], to: dates[end], days: end - runStart + 1 });
    runStart = null;
  };

  dates.forEach((date, index) => {
    if (isEmpty(date)) {
      if (runStart === null) runStart = index;
      return;
    }
    closeRun(index - 1);
    entries.push({ kind: "day", date });
  });
  closeRun(dates.length - 1);

  return entries;
}

function dayMonth(date: string): { day: number; month: string; year: number } {
  const [year, month, day] = date.split("-").map(Number);
  return { day, month: MONTHS_SHORT[month - 1], year };
}

/**
 * "1 Oct", "1 to 2 Oct", "30 Sep to 2 Oct": the month once when the gap stays
 * inside one, and on both ends when it crosses one. A gap into another year
 * names both years, "31 Dec 2026 to 2 Jan 2027": without them a gap from
 * 8 October to 6 October a year later read "8 Oct to 6 Oct", a range that
 * runs backwards. "to" rather than a dash, which the owner does not want
 * anywhere in the app.
 */
export function gapLabel(from: string, to: string): string {
  const a = dayMonth(from);
  const b = dayMonth(to);
  if (from === to) return `${a.day} ${a.month}`;
  if (a.year !== b.year) return `${a.day} ${a.month} ${a.year} to ${b.day} ${b.month} ${b.year}`;
  if (a.month === b.month) return `${a.day} to ${b.day} ${b.month}`;
  return `${a.day} ${a.month} to ${b.day} ${b.month}`;
}

/** How far ahead a drag opens empty days: today and the thirteen after it. */
export const DRAG_OPEN_DAYS = 14;

/**
 * The days while a task is being dragged: every day with tasks, and each
 * empty day from today through the next two weeks as a row to drop onto,
 * this week and next whichever day the week starts on. Empty days further
 * out stay folded, as they are at rest.
 *
 * A drag used to open every empty day up to the furthest task, one row each:
 * a task 80 days out made 78 rows of "Drop here", the list grew from 1,148px
 * to 8,784px under the finger, and moving that task to next week meant
 * dragging it up through 7,600px of them. A day further out than two weeks
 * is set with the row's date picker.
 */
export function dragDayEntries(dates: readonly string[], isEmpty: (date: string) => boolean, today: string): DayEntry[] {
  const lastOpen = shiftDateStr(today, DRAG_OPEN_DAYS - 1);
  return collapseEmptyDays(dates, (date) => isEmpty(date) && date > lastOpen);
}
