/**
 * What Ramble tells the model about the owner's list, and how the route
 * checks it.
 *
 * The page already holds the tasks and goals, so it builds this and sends it
 * with the recording: no Supabase round trip from sin1 before Groq is asked.
 * Goals and open tasks go out under short keys ("g1", "t4") rather than
 * their ids, which the model has only to pick from, never to copy; the ids
 * stay in the browser (RambleSource) and the keys are turned back into them
 * there.
 *
 * Pure, and tested in `scripts/ramble.test.mjs`.
 */

import type { Category } from "@/types/category";
import type { Task } from "@/types/task";

/** One of the owner's goals, with a few of its tasks to show what goes in it. */
export interface RambleGoal {
  ref: string;
  name: string;
  examples: string[];
}

/** An open task, for the model to say a new one is the same as it. */
export interface RambleOpenTask {
  ref: string;
  title: string;
  due_date: string | null;
}

/** Everything the route is sent beside the recording. */
export interface RambleContext {
  /** Today in the owner's own time zone, `YYYY-MM-DD`. */
  today: string;
  /** Minutes since the owner's local midnight. */
  nowMinutes: number;
  weekStart: "monday" | "sunday";
  goals: RambleGoal[];
  openTasks: RambleOpenTask[];
  /** The newest titles, newest first: the owner's style, and Whisper's words. */
  recentTitles: string[];
}

/** The context, and what the keys in it stand for, which stays in the browser. */
export interface RambleSource {
  context: RambleContext;
  goalIdByRef: Map<string, string>;
  openTaskByRef: Map<string, Pick<Task, "id" | "title" | "due_date">>;
  /** Every open task, for the check that a new one is not already there. */
  openTasks: Pick<Task, "id" | "title" | "due_date">[];
}

export const LIMITS = {
  goals: 40,
  examplesPerGoal: 6,
  openTasks: 80,
  recentTitles: 25,
  name: 80,
  title: 160,
  transcript: 8000,
} as const;

/** The owner's local day and minute, which only the browser knows. */
export function localClock(now: Date = new Date()): Pick<RambleContext, "today" | "nowMinutes"> {
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  return { today, nowMinutes: now.getHours() * 60 + now.getMinutes() };
}

function newestFirst<T extends Pick<Task, "created_at">>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
}

function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max).trimEnd() : clean;
}

/**
 * The context for a ramble from the page's tasks and goals. `today` and
 * `nowMinutes` are the owner's local date and time, which only the browser
 * knows.
 */
export function buildRambleSource(
  tasks: readonly Task[],
  categories: readonly Category[],
  { today, nowMinutes, weekStart }: Pick<RambleContext, "today" | "nowMinutes" | "weekStart">,
): RambleSource {
  const newest = newestFirst(tasks);
  const goalIdByRef = new Map<string, string>();
  const goals: RambleGoal[] = categories.slice(0, LIMITS.goals).map((category, index) => {
    const ref = `g${index + 1}`;
    goalIdByRef.set(ref, category.id);
    return {
      ref,
      name: clip(category.name, LIMITS.name),
      examples: newest
        .filter((task) => task.category_id === category.id)
        .slice(0, LIMITS.examplesPerGoal)
        .map((task) => clip(task.title, LIMITS.title)),
    };
  });

  const open = newest.filter((task) => !task.completed);
  const openTaskByRef = new Map<string, Pick<Task, "id" | "title" | "due_date">>();
  const openTasks: RambleOpenTask[] = open.slice(0, LIMITS.openTasks).map((task, index) => {
    const ref = `t${index + 1}`;
    openTaskByRef.set(ref, { id: task.id, title: task.title, due_date: task.due_date });
    return { ref, title: clip(task.title, LIMITS.title), due_date: task.due_date };
  });

  return {
    context: {
      today,
      nowMinutes,
      weekStart,
      goals,
      openTasks,
      recentTitles: newest.slice(0, LIMITS.recentTitles).map((task) => clip(task.title, LIMITS.title)),
    },
    goalIdByRef,
    openTaskByRef,
    openTasks: open.map((task) => ({ id: task.id, title: task.title, due_date: task.due_date })),
  };
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** A real `YYYY-MM-DD` day, not just the shape of one ("2026-02-30" is not). */
export function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_KEY.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function isText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim() !== "" && value.length <= max;
}

function isTextList(value: unknown, maxItems: number, maxLength: number): value is string[] {
  return Array.isArray(value) && value.length <= maxItems && value.every((item) => isText(item, maxLength));
}

export type ContextCheck = { ok: true; context: RambleContext } | { ok: false; message: string };

/**
 * The context as the route receives it: sizes held, keys well formed, so a
 * malformed or oversized body is a 400 and never reaches Groq.
 */
export function checkRambleContext(raw: unknown): ContextCheck {
  const fail = (message: string): ContextCheck => ({ ok: false, message });
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return fail("The context must be an object.");
  const body = raw as Record<string, unknown>;

  if (!isDateKey(body.today)) return fail("today must be a YYYY-MM-DD day.");
  const nowMinutes = body.nowMinutes;
  if (typeof nowMinutes !== "number" || !Number.isInteger(nowMinutes) || nowMinutes < 0 || nowMinutes > 1439) {
    return fail("nowMinutes must be a whole number of minutes from 0 to 1439.");
  }
  if (body.weekStart !== "monday" && body.weekStart !== "sunday") return fail("weekStart must be monday or sunday.");

  const goals = body.goals;
  if (!Array.isArray(goals) || goals.length > LIMITS.goals) return fail(`goals must be a list of at most ${LIMITS.goals}.`);
  for (const goal of goals as unknown[]) {
    const g = goal as Record<string, unknown> | null;
    if (!g || typeof g !== "object") return fail("Each goal must be an object.");
    if (typeof g.ref !== "string" || !/^g\d{1,3}$/.test(g.ref)) return fail("A goal's ref must look like g1.");
    if (!isText(g.name, LIMITS.name)) return fail("A goal needs a name.");
    if (!isTextList(g.examples, LIMITS.examplesPerGoal, LIMITS.title)) return fail("A goal's examples are malformed.");
  }

  const openTasks = body.openTasks;
  if (!Array.isArray(openTasks) || openTasks.length > LIMITS.openTasks) {
    return fail(`openTasks must be a list of at most ${LIMITS.openTasks}.`);
  }
  for (const task of openTasks as unknown[]) {
    const t = task as Record<string, unknown> | null;
    if (!t || typeof t !== "object") return fail("Each open task must be an object.");
    if (typeof t.ref !== "string" || !/^t\d{1,3}$/.test(t.ref)) return fail("An open task's ref must look like t1.");
    if (!isText(t.title, LIMITS.title)) return fail("An open task needs a title.");
    if (t.due_date !== null && !isDateKey(t.due_date)) return fail("An open task's due_date must be a day or null.");
  }

  if (!isTextList(body.recentTitles, LIMITS.recentTitles, LIMITS.title)) return fail("recentTitles is malformed.");

  const refs = [...(goals as RambleGoal[]).map((g) => g.ref), ...(openTasks as RambleOpenTask[]).map((t) => t.ref)];
  if (new Set(refs).size !== refs.length) return fail("Every ref must be different.");

  return {
    ok: true,
    context: {
      today: body.today as string,
      nowMinutes,
      weekStart: body.weekStart,
      goals: (goals as RambleGoal[]).map(({ ref, name, examples }) => ({ ref, name, examples })),
      openTasks: (openTasks as RambleOpenTask[]).map(({ ref, title, due_date }) => ({ ref, title, due_date })),
      recentTitles: body.recentTitles as string[],
    },
  };
}
