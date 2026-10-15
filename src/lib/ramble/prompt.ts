/**
 * What the AI is asked for a ramble, and the shape its answer is held to.
 *
 * Two requests: Whisper writes down what was said, with a prompt of the
 * user's own goal names and recent titles so it spells their names and
 * acronyms the way their list does; then a chat model reads the transcript
 * into tasks, constrained to the schema below. The model only reads and picks. Every date, time, priority word,
 * duplicate and dash is settled afterwards by code (drafts.ts), which is what
 * the tests hold to.
 *
 * Pure, and tested in `scripts/ramble.test.mjs`.
 */

import { DAY_NAMES, DAYS_SHORT, MONTH_NAMES, MONTHS_SHORT, monthKeyEnd, shiftDateStr, toMonthKey, weekdayOfDateStr } from "@/lib/date-utils";
import { PRIORITIES, type Priority } from "@/types/task";
import type { RambleContext } from "./context";

/* Whisper reads at most 224 tokens of prompt; this many characters stays
   well inside that. */
export const WHISPER_PROMPT_CHARS = 600;

/** How far ahead the calendar the model reads dates from runs. */
export const CALENDAR_DAYS = 42;

export const MAX_TASKS = 20;

/**
 * Whisper's prompt: the goal names and recent titles, as punctuated
 * sentences. Whisper copies the prompt's style, so a bare word list would
 * have it drop punctuation and capitals from the transcript.
 */
export function whisperPrompt(context: RambleContext): string {
  const goals = context.goals.map((goal) => goal.name);
  const lead = goals.length > 0 ? `My tasks, for ${[...new Set(goals)].join(", ")}.` : "My tasks for this week.";
  let prompt = lead;
  const titles = [...new Set(context.recentTitles)];
  if (titles.length > 0) {
    let line = " Recent ones:";
    for (const title of titles) {
      const next = `${line} ${title},`;
      if (prompt.length + next.length + 1 > WHISPER_PROMPT_CHARS) break;
      line = next;
    }
    if (line !== " Recent ones:") prompt += `${line.slice(0, -1)}.`;
  }
  return prompt.slice(0, WHISPER_PROMPT_CHARS);
}

/* What Whisper writes for a recording with nobody speaking in it: phrases
   from the video subtitles it learned on. */
const SILENCE = /^(?:thank you\.?|thanks for watching!?|thank you for watching\.?|you|bye\.?|\.+|\s*)$/i;

/** The transcript, or "" when Whisper heard nothing but silence. */
export function cleanTranscript(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return SILENCE.test(clean) ? "" : clean;
}

/**
 * A transcript a sentence a line, for the card's transcript view: split
 * after a full stop, question or exclamation mark, never inside "Mr.",
 * "U.S.", "e.g." or a figure like "2.5".
 */
export function transcriptSentences(text: string): string[] {
  return cleanTranscript(text)
    .split(/(?<!\b(?:Mr|Mrs|Ms|Dr|St|vs|U\.S|e\.g|i\.e)\.)(?<=[.!?])\s+(?=[A-Z0-9"\u201c])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence !== "");
}

function dayLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return `${DAYS_SHORT[weekdayOfDateStr(dateKey)]} ${d} ${MONTHS_SHORT[m - 1]} ${y}`;
}

/** The calendar the model reads days from, one a line, today first. */
export function calendarLines(today: string, days = CALENDAR_DAYS): string[] {
  const lines: string[] = [];
  for (let i = 0; i < days; i++) {
    const key = shiftDateStr(today, i);
    const note = i === 0 ? " (today)" : i === 1 ? " (tomorrow)" : "";
    lines.push(`${dayLabel(key)} = ${key}${note}`);
  }
  return lines;
}

/** The first day of next week, by the owner's week start. */
export function nextWeekStart(today: string, weekStart: RambleContext["weekStart"]): string {
  const start = weekStart === "monday" ? 1 : 0;
  const ahead = (start - weekdayOfDateStr(today) + 7) % 7 || 7;
  return shiftDateStr(today, ahead);
}

/** This weekend's Saturday: today when it is Saturday, else the next one. */
export function weekendStart(today: string): string {
  const weekday = weekdayOfDateStr(today);
  return weekday === 6 ? today : shiftDateStr(today, (6 - weekday + 7) % 7);
}

/** Minutes since midnight as "HH:MM". */
export function clock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function longDate(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return `${DAY_NAMES[weekdayOfDateStr(dateKey)]} ${d} ${MONTH_NAMES[m - 1]} ${y}`;
}

export type TitleStyle = "title" | "sentence";

/* Words Title Case leaves small: "Clear Out the Garage". */
const SMALL_WORDS = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "of", "on", "or", "the", "to", "up", "via", "with"]);

/**
 * How the user writes their titles, read from their recent ones, so a ramble
 * matches the list it lands in. A title is Title Case when most of its words
 * after the first (not small words, not figures or acronyms) start with a
 * capital. Most of their titles that way, and it is Title Case; otherwise,
 * and with too few titles to tell (a new list), a capital on the first word
 * only. Asked of the model in words alone, it kept its own habit (14 Oct
 * 2026, publik-fast: sentence case under a list of Title Case titles).
 */
export function titleStyle(recentTitles: readonly string[]): TitleStyle {
  let judged = 0;
  let titled = 0;
  for (const title of recentTitles) {
    const words = title.split(/\s+/).slice(1).filter((word) => /^\p{L}/u.test(word) && !SMALL_WORDS.has(word.toLowerCase()) && word !== word.toUpperCase());
    if (words.length === 0) continue;
    judged += 1;
    const capitals = words.filter((word) => /^\p{Lu}/u.test(word)).length;
    if (capitals / words.length > 0.5) titled += 1;
  }
  return judged >= 3 && titled / judged > 0.5 ? "title" : "sentence";
}

/** The same examples in either style, so the model sees only the one it should write. */
const EXAMPLES: Record<TitleStyle, { rule: string; count: string; garage: string; milk: string }> = {
  title: { rule: "Title Case, as their titles are (\"Call the Dentist\")", count: "Eat 4 Eggs", garage: "Clear Out the Garage", milk: "Buy Milk" },
  sentence: { rule: "a capital on the first word only, as their titles are (\"Call the dentist\")", count: "Eat 4 eggs", garage: "Clear out the garage", milk: "Buy milk" },
};

/** The instructions, with the user's goals, titles, open tasks and calendar. */
export function rambleSystemPrompt(context: RambleContext): string {
  const { today } = context;
  const style = EXAMPLES[titleStyle(context.recentTitles)];
  const goals = context.goals.length > 0
    ? context.goals.map((goal) => `${goal.ref} ${goal.name}: ${goal.examples.length > 0 ? goal.examples.join("; ") : "(no tasks yet)"}`)
    : ["(none)"];
  const open = context.openTasks.length > 0
    ? context.openTasks.map((task) => `${task.ref} ${task.title}${task.due_date ? ` (due ${task.due_date})` : ""}`)
    : ["(none)"];
  const titles = context.recentTitles.length > 0 ? context.recentTitles.map((title) => `- ${title}`) : ["(none yet)"];

  return [
    "You turn a spoken ramble into tasks for one person's task list. The ramble is a transcript of them talking, so it has filler, false starts and corrections.",
    "",
    `Today is ${longDate(today)} and the time is ${clock(context.nowMinutes)}.`,
    "",
    "Splitting:",
    "- One task for each separate thing they need to do. Two mentions of the same thing are one task.",
    "- Apply their corrections: \"actually\", \"no wait\", \"scratch that\", \"make that Friday\" change or remove what came before.",
    "- Leave out anything that is not a task: how they feel, thinking aloud, greetings.",
    "- Never invent a task, a detail, a day or a time that was not said.",
    "",
    `title: the work itself, named in a few words: ${style.rule}, acronyms kept in capitals (AI, PDF), counts as figures ("${style.count}"), no full stop at the end, never an em dash or en dash. Name what is to be done, not the first words they said. Their recent titles, for their words and length:`,
    ...titles,
    "",
    "details: the task's description, as short lines. When they describe the task (what it involves, how it should look or work, what is wrong now, the steps, the items, who or where, why), write each point they made as its own line, in sentence case, keeping their own words for things, with the filler, repeats and asides taken out; a list of things is just the things (\"Milk\", \"2 loaves of bread\"), not the verb again; counts as figures. Leave the list empty only when they said nothing beyond the task itself. Never invent, never pad, never just repeat the title.",
    `For example, said: "I need to sort out the garage this weekend, the bikes should go up on the wall, the old paint cans have to go to the dump, and I want the floor clear so the car fits." That is one task, title "${style.garage}", details "Hang the bikes on the wall", "Take the old paint cans to the dump", "Clear the floor so the car fits". Said: "buy milk". Title "${style.milk}", no details.`,
    "",
    "date: the day they said, as YYYY-MM-DD, read from this calendar. null when no day was said.",
    ...calendarLines(today),
    `"Next week" with no day is ${nextWeekStart(today, context.weekStart)}. "This weekend" is ${weekendStart(today)}. "End of the month" is ${monthKeyEnd(toMonthKey(today))}.`,
    "",
    "time: null unless a time of day was said; a part of the day alone (morning, this afternoon, tonight) is not a time. hour and minute as said. meridiem is \"am\" or \"pm\" only when they said it or the words make it plain (morning, afternoon, evening, tonight, noon, midnight, breakfast, lunch, dinner, a 24-hour time). Otherwise \"unsaid\", with the hour as they said it.",
    "",
    "priority: most tasks are \"medium\". Another only when they said how important it is, or it is plainly urgent (an interview, an exam, something lost, a deadline today): \"critical\" for the most urgent, \"high\" for important, \"low\" when they said it can wait.",
    "",
    "goal: the key of the goal the task most likely belongs to, judged by what the tasks already in each are about. Always the closest one.",
    ...goals,
    "",
    "same_as: the key of a task already open in their list when this is the same piece of work, even in other words (\"Ring Mum back\" is \"Call Mum\", \"Book the dentist\" is \"Schedule Dentist\"). Never a different task on the same subject (\"Pay the dentist\" is not \"Schedule Dentist\"). Otherwise null.",
    ...open,
    "",
    "urgency: the words they used about how urgent or important this one task is (\"really urgent\", \"no rush\", \"top priority\"), copied exactly. Only words about this task, never another's. An empty string when they said none.",
  ].join("\n");
}

const MERIDIEMS = ["am", "pm", "unsaid"] as const;
export type Meridiem = (typeof MERIDIEMS)[number];

/** A key the model picks, or null; a list of none allows null alone. */
function refOrNull(refs: readonly string[]) {
  return refs.length > 0
    ? { anyOf: [{ type: "string", enum: [...refs] }, { type: "null" }] }
    : { type: "null" };
}

/**
 * The answer's shape, for Groq's strict structured output: every field
 * required, nothing extra, goals and open tasks only by their keys.
 */
export function rambleSchema(context: RambleContext): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["tasks"],
    properties: {
      tasks: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "details", "date", "time", "priority", "urgency", "goal", "same_as"],
          properties: {
            title: { type: "string" },
            details: { type: "array", items: { type: "string" } },
            date: { type: ["string", "null"] },
            time: {
              anyOf: [
                { type: "null" },
                {
                  type: "object",
                  additionalProperties: false,
                  required: ["hour", "minute", "meridiem"],
                  properties: {
                    hour: { type: "integer" },
                    minute: { type: "integer" },
                    meridiem: { type: "string", enum: [...MERIDIEMS] },
                  },
                },
              ],
            },
            priority: { type: "string", enum: [...PRIORITIES] },
            urgency: { type: "string" },
            /* A goal always, when there are any: told to pick the closest,
               the model still left a third of them empty, and the card
               shows the guess for the owner to change. */
            goal: context.goals.length > 0
              ? { type: "string", enum: context.goals.map((goal) => goal.ref) }
              : { type: "null" },
            same_as: refOrNull(context.openTasks.map((task) => task.ref)),
          },
        },
      },
    },
  };
}

export interface SpokenTime {
  hour: number;
  minute: number;
  meridiem: Meridiem;
}

/** One task as the model read it, checked for shape but not yet settled. */
export interface RambleReplyTask {
  title: string;
  details: string[];
  date: string | null;
  time: SpokenTime | null;
  priority: Priority;
  /** What they said about how urgent it is, for code to read (drafts.ts). */
  urgency: string;
  goal: string | null;
  same_as: string | null;
}

export type ReplyCheck = { ok: true; tasks: RambleReplyTask[] } | { ok: false; message: string };

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * The model's answer, held to the schema. Strict decoding should make this a
 * formality, but a key that is not in the context is dropped rather than
 * trusted, a task with no title is left out, and an answer that is not the
 * shape at all is refused.
 */
export function checkRambleReply(raw: unknown, context: RambleContext): ReplyCheck {
  if (raw === null || typeof raw !== "object" || !Array.isArray((raw as { tasks?: unknown }).tasks)) {
    return { ok: false, message: "The model's answer was not a list of tasks." };
  }
  const goalRefs = new Set(context.goals.map((goal) => goal.ref));
  const taskRefs = new Set(context.openTasks.map((task) => task.ref));
  const tasks: RambleReplyTask[] = [];

  for (const item of (raw as { tasks: unknown[] }).tasks) {
    if (item === null || typeof item !== "object") continue;
    const task = item as Record<string, unknown>;
    const title = asText(task.title).trim();
    if (!title) continue;

    let time: SpokenTime | null = null;
    const t = task.time as Record<string, unknown> | null | undefined;
    if (t && typeof t === "object") {
      const { hour, minute, meridiem } = t;
      if (Number.isInteger(hour) && Number.isInteger(minute) && MERIDIEMS.includes(meridiem as Meridiem)) {
        time = { hour: hour as number, minute: minute as number, meridiem: meridiem as Meridiem };
      }
    }

    tasks.push({
      title,
      details: Array.isArray(task.details) ? task.details.map(asText).filter((line) => line.trim() !== "") : [],
      date: typeof task.date === "string" ? task.date : null,
      time,
      priority: PRIORITIES.includes(task.priority as Priority) ? (task.priority as Priority) : "medium",
      urgency: asText(task.urgency),
      goal: typeof task.goal === "string" && goalRefs.has(task.goal) ? task.goal : null,
      same_as: typeof task.same_as === "string" && taskRefs.has(task.same_as) ? task.same_as : null,
    });
    if (tasks.length >= MAX_TASKS) break;
  }
  return { ok: true, tasks };
}
