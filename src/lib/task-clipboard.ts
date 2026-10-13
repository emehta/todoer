import type { Task } from "@/types/task";
import type { Category } from "@/types/category";
import {
  DAY_NAMES,
  MONTH_NAMES,
  addDays,
  formatDateLongWithWeekday,
  fromDateStr,
  isSameDay,
  ordinal,
  startOfDay,
} from "@/lib/date-utils";
import { formatTime, type TimeFormatPref } from "@/lib/time-format";
import { sortTasksForDisplay } from "@/lib/task-order";
import { descriptionOutline, type OutlineItem } from "@/lib/description-lists";

/**
 * A task as plain text, for pasting somewhere that is not this app.
 *
 * Kept deliberately plain: no bullets, no markdown, no emoji. The target is a
 * WhatsApp message, where a leading dash renders as a dash and an asterisk
 * turns the line bold by accident.
 *
 * Lines are only included when there is something to say, so a bare title
 * copies as one line rather than a title followed by two empty ones.
 */
export function formatTaskForClipboard(task: Task, timeFormat: TimeFormatPref): string {
  const lines: string[] = [task.title.trim()];

  const description = task.description?.trim();
  if (description) lines.push(description);

  const due = formatTaskDueLine(task, timeFormat);
  if (due) lines.push(due);

  return lines.join("\n");
}

/** "Due by 9:00 AM, Sunday, September 20, 2026", or just the date, or nothing. */
export function formatTaskDueLine(task: Task, timeFormat: TimeFormatPref): string | null {
  if (!task.due_date) return null;

  const date = fromDateStr(task.due_date);
  const dayPart = formatDateLongWithWeekday(date);

  if (!task.due_time) return `Due by ${dayPart}`;

  /*
   * A local Date built from the same day, so formatTime reads the user's
   * 12h/24h preference rather than this module guessing at one. due_time is
   * "HH:MM" or "HH:MM:SS"; anything else is treated as no time at all.
   */
  const [hours, minutes] = task.due_time.split(":");
  const hour = Number(hours);
  const minute = Number(minutes);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return `Due by ${dayPart}`;

  const withTime = new Date(date);
  withTime.setHours(hour, minute, 0, 0);

  return `Due by ${formatTime(withTime, timeFormat)}, ${dayPart}`;
}

/** A day's tasks for the clipboard: plain text for a message, HTML for an email. */
export interface DayClipboard {
  text: string;
  html: string;
}

/*
 * How the plain text marks a task and the lines under it. The plain text is
 * what WhatsApp pastes, and a line starting "- " is how WhatsApp writes a
 * bulleted list of its own, a real one that holds a long line in under its
 * bullet. It has no list inside a list (a "- " typed after spaces stays text
 * in its item), and folds a tab into one space, so a line under a task is
 * spaces and a mark of its own. Nine spaces put the mark past where the
 * task's text starts in WhatsApp's own list; at six it sat between the
 * task's bullet and its text and read as a stray character (owner's
 * screenshot, 6 Oct 2026). Each level further in is four more.
 */
const TASK_MARK = "- ";
const DETAIL_INDENT = 9;
const DETAIL_STEP = 4;
const DETAIL_BULLETS = ["◦", "▪"];
const NO_CATEGORY = "No category";
const COMPLETED = "Completed";

/**
 * A description as the lines the copy writes under its task, in order and
 * flat: a list's number kept ("1. Book the room"), a bullet's mark gone, and
 * blank lines dropped. The copy itself keeps the nesting (detailText).
 */
export function descriptionLines(description: string | null): string[] {
  const lines: string[] = [];
  const walk = (items: OutlineItem[]) => {
    for (const item of items) {
      lines.push(item.kind === "number" ? `${item.number}. ${item.text}` : item.text);
      walk(item.children);
    }
  };
  walk(descriptionOutline(description));
  return lines;
}

/**
 * "Today, Monday, 5th October", "Tomorrow, Tuesday, 6th October", "Wednesday,
 * 7th October", "No date". The year only when it is not this one ("Thursday,
 * 7th January 2027"). The recipient reads the message on its own, so the day
 * is written out in full, with the comma and the ordinal the owner asked for
 * on 5 Oct 2026.
 */
export function dayClipboardHeading(dateKey: string | null, today: Date): string {
  if (!dateKey) return "No date";
  const date = fromDateStr(dateKey);
  const dayMonth = `${ordinal(date.getDate())} ${MONTH_NAMES[date.getMonth()]}`;
  const year = date.getFullYear() === today.getFullYear() ? "" : ` ${date.getFullYear()}`;
  const dated = `${DAY_NAMES[date.getDay()]}, ${dayMonth}${year}`;
  if (isSameDay(date, today)) return `Today, ${dated}`;
  if (isSameDay(date, addDays(startOfDay(today), 1))) return `Tomorrow, ${dated}`;
  return dated;
}

/** ", due 3:00 PM" for a timed task; nothing for one with no time, or one that cannot be read. */
function dueTimeSuffix(task: Task, timeFormat: TimeFormatPref): string {
  if (!task.due_time || !task.due_date) return "";
  const [hours, minutes] = task.due_time.split(":");
  const hour = Number(hours);
  const minute = Number(minutes);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return "";
  const at = fromDateStr(task.due_date);
  at.setHours(hour, minute, 0, 0);
  return `, due ${formatTime(at, timeFormat)}`;
}

/**
 * The tasks under one category heading each, in the order the categories
 * first appear in the list, so the day still reads top to bottom as it does
 * on screen. A task with no category, or one whose category is gone, goes in
 * a last group of its own.
 */
function groupByCategory(tasks: Task[], categories: Category[]): { name: string; tasks: Task[] }[] {
  const names = new Map(categories.map((category) => [category.id, category.name.trim()]));
  const groups = new Map<string, { name: string; tasks: Task[] }>();
  const loose: Task[] = [];

  for (const task of tasks) {
    const name = task.category_id ? names.get(task.category_id) : undefined;
    if (!task.category_id || !name) {
      loose.push(task);
      continue;
    }
    /* By id, not name: two categories can share a name and are still two. */
    const group = groups.get(task.category_id) ?? { name, tasks: [] };
    group.tasks.push(task);
    groups.set(task.category_id, group);
  }

  const ordered = [...groups.values()];
  if (loose.length > 0) ordered.push({ name: NO_CATEGORY, tasks: loose });
  return ordered;
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] ?? char);

/** A day as the copy lays it out: sections of tasks, each task with its description lines. */
interface CopySection {
  heading: string;
  items: { line: string; details: OutlineItem[] }[];
}

function copyItems(tasks: Task[], timeFormat: TimeFormatPref): CopySection["items"] {
  return tasks.map((task) => ({
    line: `${task.title.trim()}${dueTimeSuffix(task, timeFormat)}`,
    details: descriptionOutline(task.description),
  }));
}

/*
 * Text as HTML that cannot change on the way: escaped, and every character
 * outside ASCII as a numeric reference. HTML on the clipboard often carries
 * no charset, and an app that reads it as Latin-1 turns "é" into "Ã©". A run
 * of spaces keeps its width, which HTML would otherwise fold into one.
 */
function htmlText(value: string): string {
  let out = "";
  for (const char of escapeHtml(value)) {
    const code = char.codePointAt(0) ?? 0;
    out += code > 0x7e ? `&#${code};` : char;
  }
  return out.replace(/ {2,}/g, (run) => ` ${"&nbsp;".repeat(run.length - 1)}`);
}

/*
 * No margin above or below a list, so the space between sections is only
 * the blank line, the same in a mail app as in Notes. The indent is left to
 * the app: it is what makes a list a list.
 */
const LIST_STYLE = 'style="margin-top:0;margin-bottom:0"';
const LIST_OPEN = `<ul ${LIST_STYLE}>`;

/*
 * A description's outline as lists nested in its task's item: its lines and
 * bullets as bullets, its numbers as a numbered list counting from where it
 * starts, each with what is under it nested in turn. A run of numbers that
 * does not count on by one starts a list of its own, so two numbered lists
 * do not run together.
 */
function detailHtml(items: OutlineItem[]): string {
  let html = "";
  let index = 0;
  while (index < items.length) {
    const numbered = items[index].kind === "number";
    let end = index + 1;
    while (end < items.length && (items[end].kind === "number") === numbered
      && (!numbered || items[end].number === (items[end - 1].number ?? 0) + 1)) end += 1;
    const start = items[index].number ?? 1;
    html += numbered ? `<ol${start === 1 ? "" : ` start="${start}"`} ${LIST_STYLE}>` : LIST_OPEN;
    for (const item of items.slice(index, end)) {
      html += `<li>${htmlText(item.text)}${item.children.length > 0 ? detailHtml(item.children) : ""}</li>`;
    }
    html += numbered ? "</ol>" : "</ul>";
    index = end;
  }
  return html;
}

/* The same outline as WhatsApp lines: indented, a white bullet, a square further in, or the number. */
function detailText(items: OutlineItem[], depth: number): string[] {
  const indent = " ".repeat(DETAIL_INDENT + DETAIL_STEP * depth);
  return items.flatMap((item) => {
    const mark = item.kind === "number" ? `${item.number}.` : DETAIL_BULLETS[Math.min(depth, DETAIL_BULLETS.length - 1)];
    return [`${indent}${mark} ${item.text}`, ...detailText(item.children, depth + 1)];
  });
}

/*
 * The HTML, which Notes, Mail, Gmail and Messages paste, is real lists: a
 * task is a list item, and its description a list nested in it, so the app
 * draws its own bullets and sub-bullets and holds a wrapped line in under
 * its text. It was bullets typed as characters for a day (6 Oct 2026), and
 * the owner saw what that is: not a list, a long line running back under the
 * bullet. Every other line is a <div>, and a blank one is <div><br></div>:
 * the blank lines are lines, not a margin an app can drop, which is how the
 * one under the heading went missing before (5 Oct 2026).
 */
function sectionsHtml(dayHeading: string, sections: CopySection[]): string {
  let html = `<div><b>${htmlText(dayHeading)}</b></div>`;
  for (const section of sections) {
    html += `<div><br></div><div><b>${htmlText(section.heading)}</b></div>${LIST_OPEN}`;
    for (const item of section.items) {
      html += `<li>${htmlText(item.line)}${item.details.length > 0 ? detailHtml(item.details) : ""}</li>`;
    }
    html += "</ul>";
  }
  return html;
}

function sectionsText(dayHeading: string, sections: CopySection[]): string {
  const lines = [dayHeading];
  for (const section of sections) {
    lines.push("", section.heading);
    for (const item of section.items) {
      lines.push(`${TASK_MARK}${item.line}`, ...detailText(item.details, 0));
    }
  }
  return lines.join("\n");
}

/**
 * One day of the list, for answering "what do you have on today?" in a
 * message or an email. The plain text:
 *
 *   Today, Monday, 5th October
 *
 *   Website
 *   - Home Page - Dashboard Refine
 *            ◦ Improve UI/UX
 *
 *   Completed
 *   - Calendar Page Fixes
 *            ◦ Changing event details not working
 *                ▪ A point nested under it
 *
 * The open tasks by category, then the done ones under Completed in one list
 * of their own, with no categories, each written the same way. Both in the
 * order given, which is the list's own. The HTML is the same outline as real
 * nested lists, the headings in bold and nothing coloured, so it reads the
 * same in a dark mail app.
 */
export function formatDayForClipboard(
  dateKey: string | null,
  tasks: Task[],
  categories: Category[],
  timeFormat: TimeFormatPref,
  today: Date,
): DayClipboard {
  const heading = dayClipboardHeading(dateKey, today);
  const sections: CopySection[] = groupByCategory(tasks.filter((task) => !task.completed), categories)
    .map((group) => ({ heading: group.name, items: copyItems(group.tasks, timeFormat) }));

  const done = tasks.filter((task) => task.completed);
  if (done.length > 0) sections.push({ heading: COMPLETED, items: copyItems(done, timeFormat) });

  return { text: sectionsText(heading, sections), html: sectionsHtml(heading, sections) };
}

/**
 * The done tasks a day's Copy lists under Completed: those due on that day
 * (`null` is No date) that `shown` keeps, in the order Historical shows them.
 * Current never draws a done task, so the page finds them here, held to the
 * same goal, search and priority as the open tasks they are copied with.
 */
export function completedOnDay(tasks: readonly Task[], dateKey: string | null, shown: (task: Task) => boolean): Task[] {
  return sortTasksForDisplay(tasks.filter((task) => task.completed && (task.due_date ?? null) === dateKey && shown(task)));
}

/**
 * Everything a day's Copy writes: the tasks its list shows for that day, in
 * the list's order, then the day's done tasks that are not among them.
 *
 * On Current and Overdue the list holds open tasks only, so this adds the
 * day's done ones under them. On Historical the list is the done tasks, so
 * nothing is added and the day copies as Completed alone: a past day's open
 * tasks are overdue, and overdue is never copied. No task is written twice,
 * whichever list it came from.
 */
export function dayCopyTasks(
  listed: readonly Task[],
  tasks: readonly Task[],
  dateKey: string | null,
  shown: (task: Task) => boolean,
): Task[] {
  const listedIds = new Set(listed.map((task) => task.id));
  return [...listed, ...completedOnDay(tasks, dateKey, (task) => !listedIds.has(task.id) && shown(task))];
}
