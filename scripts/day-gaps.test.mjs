/**
 * Which empty days in the task list fold into one gap, and what the gap says.
 * No framework: `npm test -- day-gaps`.
 */

import { collapseEmptyDays, dragDayEntries, DRAG_OPEN_DAYS, gapLabel } from "@/lib/day-gaps";
import { shiftDateStr } from "@/lib/date-utils";

const failures = [];
let passed = 0;

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) { passed++; return; }
  failures.push(`  ${name}\n      got ${a}\n     want ${b}`);
}

const shape = (entries) => entries.map((e) => (e.kind === "day" ? e.date.slice(5) : `gap ${e.from.slice(5)}..${e.to.slice(5)} (${e.days})`));
const fromSet = (withTasks) => (date) => !withTasks.includes(date);

/* The owner's case: tasks on 30 Sep and 3 Oct, nothing on 1 and 2 Oct. */
const days = ["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03"];
check("two empty days between two task days become one gap",
  shape(collapseEmptyDays(days, fromSet(["2026-09-29", "2026-09-30", "2026-10-03"]))),
  ["09-29", "09-30", "gap 10-01..10-02 (2)", "10-03"]);

check("an empty today is the start of the gap, not a day of its own",
  shape(collapseEmptyDays(["2026-09-29", "2026-09-30", "2026-10-01"], fromSet(["2026-10-01"]))),
  ["gap 09-29..09-30 (2)", "10-01"]);

check("a single empty day is a gap of one",
  shape(collapseEmptyDays(["2026-09-29", "2026-09-30", "2026-10-01"], fromSet(["2026-09-29", "2026-10-01"]))),
  ["09-29", "gap 09-30..09-30 (1)", "10-01"]);

check("two separate gaps stay separate",
  shape(collapseEmptyDays(["01", "02", "03", "04", "05"].map((d) => `2026-10-${d}`), fromSet(["2026-10-01", "2026-10-03", "2026-10-05"]))),
  ["10-01", "gap 10-02..10-02 (1)", "10-03", "gap 10-04..10-04 (1)", "10-05"]);

check("days that all have tasks are left alone",
  shape(collapseEmptyDays(days, () => false)), days.map((d) => d.slice(5)));

check("nothing in, nothing out", collapseEmptyDays([], () => true), []);

check("a list that is all empty is one gap",
  shape(collapseEmptyDays(days, () => true)), ["gap 09-29..10-03 (5)"]);

/* Labels, and no dash in any of them. */
check("one day", gapLabel("2026-10-01", "2026-10-01"), "1 Oct");
check("inside a month, the month once", gapLabel("2026-10-01", "2026-10-02"), "1 to 2 Oct");
check("across a month, both months", gapLabel("2026-09-30", "2026-10-02"), "30 Sep to 2 Oct");
check("across a year, both years", gapLabel("2026-12-31", "2027-01-02"), "31 Dec 2026 to 2 Jan 2027");
check("the same month a year on names both years, so it never reads backwards",
  gapLabel("2026-10-30", "2027-10-02"), "30 Oct 2026 to 2 Oct 2027");
check("the audit's case", gapLabel("2026-10-08", "2027-10-06"), "8 Oct 2026 to 6 Oct 2027");
check("a gap inside a later year needs no year, like the days around it",
  gapLabel("2027-01-04", "2027-01-10"), "4 to 10 Jan");
check("a lone day in a later year needs none either", gapLabel("2027-01-04", "2027-01-04"), "4 Jan");
check("no label carries an em or en dash",
  [["2026-10-01", "2026-10-02"], ["2026-09-30", "2026-10-02"], ["2026-12-31", "2027-01-02"], ["2026-10-08", "2027-10-06"]]
    .some(([f, t]) => /[–—]/.test(gapLabel(f, t))), false);

/*
 * While a task is dragged: the empty days of the next two weeks open as rows
 * to drop onto, and empty days further out stay folded. The owner's list on
 * 7 Oct 2026: tasks today, on 10 Oct and on 26 Dec, everything between empty.
 */
const run = (from, to) => {
  const out = [];
  for (let d = from; d <= to; d = shiftDateStr(d, 1)) out.push(d);
  return out;
};
const today = "2026-10-07";
check("two weeks counted from today", DRAG_OPEN_DAYS, 14);
check("the next two weeks open, the rest of the way to 26 Dec stays one gap",
  shape(dragDayEntries(run(today, "2026-12-26"), fromSet([today, "2026-10-10", "2026-12-26"]), today)),
  [...run(today, "2026-10-20").map((d) => d.slice(5)), "gap 10-21..12-25 (66)", "12-26"]);
check("the last open day is today and thirteen more; the next folds",
  shape(dragDayEntries(run(today, "2026-10-22"), fromSet([today, "2026-10-22"]), today)).slice(-3),
  ["10-20", "gap 10-21..10-21 (1)", "10-22"]);
check("a list that ends within two weeks opens every day, as it always did",
  shape(dragDayEntries(run(today, "2026-10-10"), fromSet([today, "2026-10-10"]), today)),
  ["10-07", "10-08", "10-09", "10-10"]);
check("an empty today opens, for a task pulled out of Overdue",
  shape(dragDayEntries([today, "2026-10-08"], fromSet(["2026-10-08"]), today)),
  ["10-07", "10-08"]);
check("a day with tasks far out is still a day to drop onto",
  shape(dragDayEntries(run(today, "2027-03-01"), fromSet(["2027-03-01"]), today)).slice(-2),
  ["gap 10-21..02-28 (131)", "03-01"]);
check("the two weeks carry across a new year",
  shape(dragDayEntries(run("2026-12-25", "2027-01-10"), fromSet(["2027-01-10"]), "2026-12-25")).slice(-3),
  ["01-07", "gap 01-08..01-09 (2)", "01-10"]);
check("at rest the same list folds every empty day",
  shape(collapseEmptyDays(run(today, "2026-10-10"), fromSet([today, "2026-10-10"]))),
  ["10-07", "gap 10-08..10-09 (2)", "10-10"]);

if (failures.length > 0) {
  console.error(`\n  ${failures.length} failed, ${passed} passed\n`);
  console.error(failures.join("\n\n"));
  process.exit(1);
}
console.log(`\n  ${passed} passed, 0 failed\n`);
