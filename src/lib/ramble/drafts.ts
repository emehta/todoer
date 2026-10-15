/**
 * A ramble's tasks as the review card shows them: every field the model read
 * settled by code, so what lands in the list follows the owner's rules and
 * not the model's mood.
 *
 * The owner's rules (7 Oct 2026):
 * - A task with no day said is for today, as Add task opens on today.
 * - A bare hour ("at 7") on a task for today is the half of the day still to
 *   come: past 7am it is 7pm. Any other bare hour is asked, on the card, as
 *   "7:00 am or 7:00 pm"; a bare 12 is noon, unless noon has passed today.
 * - A task that is literally one already open is flagged and left out, with
 *   Add anyway to put it in.
 * - No em dashes or en dashes in anything written.
 *
 * Pure, and tested in `scripts/ramble.test.mjs`.
 */

import { foldText } from "@/lib/text-match";
import type { Priority, Task } from "@/types/task";
import type { RambleSource } from "./context";
import { isDateKey } from "./context";
import { clock, type RambleReplyTask, type SpokenTime } from "./prompt";

/** A time the card asks about: the hour as said, and the two it could be. */
export interface TimeQuestion {
  am: string;
  pm: string;
}

export interface RambleDraft {
  /** A key for the card's row; not the task's id. */
  key: string;
  title: string;
  description: string | null;
  due_date: string;
  due_time: string | null;
  /** Set when the hour could be either: the card asks before adding. */
  timeQuestion: TimeQuestion | null;
  priority: Priority;
  category_id: string | null;
  /** The open task this one already is, when it is one. */
  duplicateOf: Pick<Task, "id" | "title" | "due_date"> | null;
  /** On the card's Add: off for a duplicate until Add anyway. */
  include: boolean;
}

/* ─── text ─── */

/* Words that say nothing about which task it is. */
const FILLER = new Set(["a", "an", "the", "my", "to", "for", "of", "and", "on", "in", "at", "with", "up"]);

/**
 * Text as the owner writes it: no em or en dashes (a spaced one becomes a
 * spaced hyphen, as in "Tasks Page Fix - Page cutoff Glitch"), single
 * spaces, nothing trailing.
 */
export function cleanText(text: string): string {
  return text
    .replace(/\s*[—–]\s*/g, (match) => (/\s/.test(match) ? " - " : "-"))
    .replace(/\s+/g, " ")
    .trim();
}

const UNITS: Record<string, number> = {
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const ONES: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };

/**
 * Counts as figures, as the owner writes them ("20 pages of Archer book",
 * "4 math drills"): "four eggs" is "4 eggs", "twenty five" is "25". "One"
 * alone is left as a word, since it is as often "the red one" as a count.
 */
/* A clock time or a date said in words stays words: "seven thirty" is a
   time, not "7 30", and "twenty first" a date, not "20 first". */
const HOUR = "(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)";
const ORDINAL = "(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth)";
const MINUTE = "(?:oh|fifteen|twenty|thirty|forty|fifty|hundred)";
const TENS_WORDS = new RegExp(
  `(?<!\\b${HOUR}[\\s-])\\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?![\\s-]${ORDINAL}\\b)(?:[\\s-](one|two|three|four|five|six|seven|eight|nine))?\\b`,
  "gi",
);
const UNIT_WORDS = new RegExp(
  `(?<!\\b${HOUR}[\\s-])\\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)\\b(?![\\s-]${MINUTE}\\b)`,
  "gi",
);

export function digitsForNumbers(text: string): string {
  return text
    .replace(/\b(a|one) hundred\b/gi, "100")
    .replace(TENS_WORDS, (_, tens: string, ones: string | undefined) => String(TENS[tens.toLowerCase()] + (ones ? ONES[ones.toLowerCase()] : 0)))
    .replace(UNIT_WORDS, (word: string) => String(UNITS[word.toLowerCase()]));
}

/* A capital first, unless the word is cased inside already ("iPhone", "eBay"). */
function capitalFirst(text: string): string {
  return /^[a-z][A-Z]/.test(text) ? text : text.charAt(0).toUpperCase() + text.slice(1);
}

/** A title: clean, counts as figures, no full stop or colon on the end, a capital first. */
export function cleanTitle(text: string): string {
  return capitalFirst(digitsForNumbers(cleanText(text)).replace(/[.,;:!]+$/, "").trim().slice(0, 120).trimEnd());
}

/* A title's or a detail's words, folded, without filler or punctuation. */
function wordsOf(text: string): string[] {
  return foldText(digitsForNumbers(cleanText(text)))
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word && !FILLER.has(word));
}

/**
 * The details as the list's own description: a "- " line each, starting
 * with a capital, counts as figures, or none at all. A detail that only says
 * the title again ("medicine" under "Take Medicine", "four eggs" under "Eat
 * 4 Eggs") is left out: those were most of what the model wrote on 7 Oct.
 */
export function detailsToDescription(details: readonly string[], title: string): string | null {
  const titleWords = new Set(wordsOf(title));
  const lines: string[] = [];
  for (const raw of details) {
    /* A bullet or a list number, but never the "1." of "1.5 litres". */
    const bare = cleanText(raw.replace(/^\s*(?:[-*\u2022]|\d+[.)](?=\s))\s*/, ""));
    /* A closing full stop goes, but not the last dot of "7 a.m.". */
    const line = capitalFirst(digitsForNumbers(bare).replace(/(?<![a-z]\.[a-z])[.;]+$/i, "").slice(0, 200).trimEnd());
    const words = wordsOf(line);
    if (words.length === 0 || words.every((word) => titleWords.has(word))) continue;
    if (lines.some((kept) => foldText(kept) === foldText(line))) continue;
    lines.push(line);
    if (lines.length === 8) break;
  }
  return lines.length > 0 ? lines.map((line) => `- ${line}`).join("\n") : null;
}

/* ─── priority ─── */

const SAID_LOW = /\b(low priority|not (?:that |very |super |too )?(?:urgent|important|critical)|no rush|no hurry|whenever i can|some ?day|if i (?:have|get) (?:the )?time|can wait|priority four|p4)\b/;
const SAID_CRITICAL = /\b(critical|top priority|highest priority|priority one|p1|most important|super urgent|extremely urgent|really urgent|very urgent)\b/;
const SAID_HIGH = /\b(high priority|important|urgent|urgently|asap|as soon as possible|priority two|p2)\b/;
const SAID_MEDIUM = /\b(medium priority|normal priority|priority three|p3)\b/;

/**
 * The priority the words name, when they name one. "Not urgent" is Low,
 * which is why Low is read first.
 */
export function priorityFromWords(words: string): Priority | null {
  const text = foldText(words);
  if (SAID_LOW.test(text)) return "low";
  if (SAID_CRITICAL.test(text)) return "critical";
  if (SAID_HIGH.test(text)) return "high";
  if (SAID_MEDIUM.test(text)) return "medium";
  return null;
}

/* ─── when ─── */

export type TimeAnswer =
  | { time: string | null; question: null }
  | { time: null; question: TimeQuestion };

/**
 * A time as said, on `date`, with the owner's rule for a bare hour (see the
 * module comment). `nowMinutes` is the owner's local time today.
 */
export function resolveSpokenTime(
  spoken: SpokenTime | null,
  date: string,
  today: string,
  nowMinutes: number,
): TimeAnswer {
  if (!spoken) return { time: null, question: null };
  const { hour, minute, meridiem } = spoken;
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return { time: null, question: null };
  }

  /* Hour 0 is midnight only when it was said as such; otherwise it is the
     model filling in a part of the day ("in the afternoon" came back as
     00:00 on 8 Oct), and there is no time. */
  if (hour === 0) return meridiem === "am" ? { time: clock(minute), question: null } : { time: null, question: null };

  /* A 24-hour time ("19:30") says its own half of the day. */
  if (hour >= 13) return { time: clock(hour * 60 + minute), question: null };

  if (meridiem === "am") return { time: clock((hour % 12) * 60 + minute), question: null };
  if (meridiem === "pm") return { time: clock(((hour % 12) + 12) * 60 + minute), question: null };

  const am = (hour % 12) * 60 + minute;
  const pm = am + 12 * 60;
  const isToday = date === today;

  if (hour === 12) {
    /* "At 12" is lunch, not midnight, unless lunch has already gone. */
    if (!isToday || nowMinutes < pm) return { time: clock(pm), question: null };
    return { time: null, question: { am: clock(am), pm: clock(pm) } };
  }

  /* Today, with the morning hour gone and the evening one still to come. */
  if (isToday && nowMinutes >= am && nowMinutes < pm) return { time: clock(pm), question: null };
  return { time: null, question: { am: clock(am), pm: clock(pm) } };
}

/** The day a task is for: the one said when it is real and not past, else today. */
export function resolveDate(date: string | null, today: string): string {
  return date && isDateKey(date) && date >= today ? date : today;
}

/* ─── duplicates ─── */


/** A title's words, folded and sorted, without filler: "Send the insurance form" and "Insurance Form Send" match. */
export function titleKey(title: string): string {
  return foldText(digitsForNumbers(cleanText(title)))
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word && !FILLER.has(word))
    .sort()
    .join(" ");
}

/**
 * The open task a new one literally is: the one the model named, or one with
 * the same words in its title. Never a task that is only similar.
 */
export function findDuplicate(
  title: string,
  named: Pick<Task, "id" | "title" | "due_date"> | null,
  openTasks: readonly Pick<Task, "id" | "title" | "due_date">[],
): Pick<Task, "id" | "title" | "due_date"> | null {
  if (named) return named;
  const key = titleKey(title);
  if (!key) return null;
  return openTasks.find((task) => titleKey(task.title) === key) ?? null;
}

/* ─── the drafts ─── */

/**
 * The review card's rows from the model's answer. `fallbackGoalId` is the
 * goal the page is showing, for a task the model could file nowhere.
 */
export function rambleDrafts(
  tasks: readonly RambleReplyTask[],
  source: RambleSource,
  fallbackGoalId: string | null = null,
): RambleDraft[] {
  const { today, nowMinutes } = source.context;
  const drafts: RambleDraft[] = [];
  const seen = new Set<string>();

  tasks.forEach((task, index) => {
    const title = cleanTitle(task.title);
    const key = titleKey(title);
    if (!title || !key || seen.has(key)) return;
    seen.add(key);

    const dueDate = resolveDate(task.date, today);
    const when = resolveSpokenTime(task.time, dueDate, today, nowMinutes);
    const duplicateOf = findDuplicate(
      title,
      task.same_as ? source.openTaskByRef.get(task.same_as) ?? null : null,
      source.openTasks,
    );
    const goalId = task.goal ? source.goalIdByRef.get(task.goal) ?? null : null;

    drafts.push({
      key: `r${index}`,
      title,
      description: detailsToDescription(task.details, title),
      due_date: dueDate,
      due_time: when.time,
      timeQuestion: when.question,
      priority: priorityFromWords(task.urgency) ?? task.priority,
      category_id: goalId ?? fallbackGoalId,
      duplicateOf,
      include: duplicateOf === null,
    });
  });
  return drafts;
}

/**
 * The row that names the review's fields (Date, Time, Priority, Goal) for
 * the rows under it: the first that will be added. A task already in the
 * list shows no fields, so it cannot be the one.
 */
export function labelledDraftKey(drafts: readonly Pick<RambleDraft, "key" | "include">[]): string | null {
  return drafts.find((draft) => draft.include)?.key ?? null;
}
