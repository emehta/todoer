/**
 * Ramble: what the model is told and allowed to answer, and every rule code
 * applies to the answer before a task reaches the review card.
 * No framework: `npm test -- ramble`.
 *
 * What goes wrong here leaves no trace on screen until it is in the list: a
 * "7" landing at 7am, a task filed under a goal that does not exist, a second
 * copy of a task already open, an em dash the user never wrote.
 */

import { buildRambleSource, checkRambleContext, isDateKey, localClock, LIMITS } from "@/lib/ramble/context";
import {
  CALENDAR_DAYS,
  MAX_TASKS,
  WHISPER_PROMPT_CHARS,
  calendarLines,
  checkRambleReply,
  cleanTranscript,
  nextWeekStart,
  transcriptSentences,
  rambleSchema,
  rambleSystemPrompt,
  titleStyle,
  weekendStart,
  whisperPrompt,
} from "@/lib/ramble/prompt";
import {
  cleanText,
  cleanTitle,
  detailsToDescription,
  digitsForNumbers,
  findDuplicate,
  labelledDraftKey,
  priorityFromWords,
  rambleDrafts,
  resolveDate,
  resolveSpokenTime,
  titleKey,
} from "@/lib/ramble/drafts";
import {
  ASK_BEFORE_DISCARD_MS,
  MAX_RECORDING_MS,
  MAX_UPLOAD_BYTES,
  SEND_AT_BYTES,
  pauseClock,
  readClock,
  resumeClock,
  startClock,
  takeLimitMs,
  formatRecordingTime,
  microphoneProblem,
  recordingFileName,
  recordingType,
} from "@/lib/ramble/recording";
import { BAR_CAPACITY, BAR_MS, advanceWave, barHeight, newWaveScroll, pendingHeight, readingLight, voiceLevel, waveOffset } from "@/lib/ramble/waveform";
import { parseDescription } from "@/lib/description-lists";

const failures = [];
let passed = 0;

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) { passed++; return; }
  failures.push(`  ${name}\n      got ${a}\n     want ${b}`);
}

/* ── a list like a real one, on 7 Oct 2026 ───────────────────────────── */

const TODAY = "2026-10-07"; // a Wednesday
const goal = (id, name) => ({ id, name, color: "#22c55e", display_order: 0, created_at: "2026-01-01T00:00:00Z", description: null, deadline: null, goal_type: null });
const categories = [
  goal("work", "Work"),
  goal("personal", "Personal"),
  goal("academic", "Academic"),
  goal("social", "Social"),
  goal("career", "Career"),
  goal("brand", "Brand"),
  goal("website", "Website"),
];
let made = 0;
const task = (title, category_id, extra = {}) => ({
  id: `task-${++made}`,
  title,
  description: null,
  due_date: null,
  due_time: null,
  priority: "medium",
  completed: false,
  created_at: `2026-10-0${Math.min(7, 1 + Math.floor(made / 4))}T0${made % 10}:00:00Z`,
  category_id,
  display_order: 1024,
  ...extra,
});
const tasks = [
  task("Go grocery shopping at Trader Joe's", "personal", { completed: true }),
  task("Online Courses Finish", "work", { priority: "critical", due_date: "2026-10-07" }),
  task("Insurance Form Send", "website", { priority: "high", due_date: "2026-10-07" }),
  task("Old Drives Clear", "brand", { priority: "high", due_date: "2026-10-08" }),
  task("Call Alex", "social", { priority: "critical", due_date: "2026-10-08", due_time: "09:00:00" }),
  task("Update Resumes", "career", { priority: "high" }),
  task("Schedule the Driving Test", "academic", { priority: "high" }),
  task("Scripting - Search feature", "brand", { completed: true }),
];

const source = buildRambleSource(tasks, categories, { today: TODAY, nowMinutes: 15 * 60 + 30, weekStart: "monday" });
const { context } = source;
const goalRef = (id) => [...source.goalIdByRef].find(([, value]) => value === id)[0];
const taskRef = (id) => [...source.openTaskByRef].find(([, value]) => value.id === id)[0];

/* ── the context ───────────────────────────────────────────────────────── */

check("the local clock is the user's own day and minute",
  localClock(new Date(2026, 9, 7, 15, 42)), { today: "2026-10-07", nowMinutes: 942 });
check("every goal goes out under a short key, in the tabs' order",
  context.goals.map((g) => `${g.ref} ${g.name}`),
  ["g1 Work", "g2 Personal", "g3 Academic", "g4 Social", "g5 Career", "g6 Brand", "g7 Website"]);
check("a goal carries its own tasks as examples, newest first",
  context.goals.find((g) => g.name === "Brand").examples, ["Scripting - Search feature", "Old Drives Clear"]);
check("only open tasks are offered as ones a ramble could repeat",
  context.openTasks.map((t) => t.title).sort(),
  ["Call Alex", "Insurance Form Send", "Old Drives Clear", "Online Courses Finish", "Schedule the Driving Test", "Update Resumes"]);
check("no id leaves the browser, only keys",
  JSON.stringify(context).includes("task-") || JSON.stringify(context).includes("\"website\""), false);
check("the recent titles are the newest, the user's style",
  context.recentTitles[0], "Scripting - Search feature");

check("the route accepts the context the page builds",
  checkRambleContext(JSON.parse(JSON.stringify(context))).ok, true);
const bad = (patch) => checkRambleContext({ ...JSON.parse(JSON.stringify(context)), ...patch });
check("a day that does not exist is refused", bad({ today: "2026-02-30" }).ok, false);
check("a minute past the day is refused", bad({ nowMinutes: 1440 }).ok, false);
check("a fractional minute is refused", bad({ nowMinutes: 61.5 }).ok, false);
check("a week start other than the two is refused", bad({ weekStart: "friday" }).ok, false);
check("too many goals are refused",
  bad({ goals: Array.from({ length: LIMITS.goals + 1 }, (_, i) => ({ ref: `g${i + 1}`, name: "x", examples: [] })) }).ok, false);
check("a malformed key is refused", bad({ goals: [{ ref: "website", name: "Website", examples: [] }] }).ok, false);
check("two things under one key are refused",
  bad({ goals: [{ ref: "g1", name: "A", examples: [] }, { ref: "g1", name: "B", examples: [] }] }).ok, false);
check("an oversized title is refused",
  bad({ openTasks: [{ ref: "t1", title: "x".repeat(LIMITS.title + 1), due_date: null }] }).ok, false);
check("a body that is not an object is refused", checkRambleContext("hello").ok, false);
check("isDateKey wants a real day", [isDateKey("2026-10-07"), isDateKey("2026-13-01"), isDateKey("7 Oct")], [true, false, false]);

/* ── what Whisper and the model are told ──────────────────────────────── */

const spoken = whisperPrompt(context);
check("Whisper's prompt fits its 224 tokens", spoken.length <= WHISPER_PROMPT_CHARS, true);
check("Whisper's prompt names the goals", spoken.startsWith("My tasks, for Work, Personal, Academic, Social, Career, Brand, Website."), true);
check("Whisper's prompt is punctuated sentences, so the transcript is too", spoken.endsWith("."), true);
check("Whisper's prompt carries the user's own spellings", spoken.includes("Insurance Form Send") && spoken.includes("Online Courses"), true);
{
  const long = buildRambleSource(
    Array.from({ length: 30 }, (_, i) => task(`A rather long task title number ${i} for the prompt`, "personal")),
    categories,
    { today: TODAY, nowMinutes: 600, weekStart: "monday" },
  );
  const prompt = whisperPrompt(long.context);
  check("a long list is cut to the limit at a whole title", prompt.length <= WHISPER_PROMPT_CHARS && prompt.endsWith("prompt."), true);
}

const days = calendarLines(TODAY);
check("the calendar starts today, a Wednesday", days[0], "Wed 7 Oct 2026 = 2026-10-07 (today)");
check("then tomorrow", days[1], "Thu 8 Oct 2026 = 2026-10-08 (tomorrow)");
check("it runs six weeks", days.length, CALENDAR_DAYS);
check("it crosses into November on the right weekday", days[25], "Sun 1 Nov 2026 = 2026-11-01");
check("and across a new year", calendarLines("2026-12-30", 4).slice(2), ["Fri 1 Jan 2027 = 2027-01-01", "Sat 2 Jan 2027 = 2027-01-02"]);
check("next week starts on the user's Monday", nextWeekStart(TODAY, "monday"), "2026-10-12");
check("or on Sunday for a Sunday week", nextWeekStart(TODAY, "sunday"), "2026-10-11");
check("next week from a Monday is the Monday after", nextWeekStart("2026-10-12", "monday"), "2026-10-19");
check("this weekend from a Wednesday is the Saturday", weekendStart(TODAY), "2026-10-10");
check("this weekend on a Saturday is today", weekendStart("2026-10-10"), "2026-10-10");
check("this weekend on a Sunday is the next Saturday", weekendStart("2026-10-11"), "2026-10-17");

const system = rambleSystemPrompt(context);
check("the instructions carry no em or en dash", /[—–]/.test(system), false);
check("the instructions ask for a description whenever the task is described, and none for a bare one",
  system.includes("When they describe the task") && system.includes("Leave the list empty only when they said nothing beyond the task itself"), true);
check("the instructions say a part of the day is not a time", system.includes("a part of the day alone (morning, this afternoon, tonight) is not a time"), true);
check("the instructions say today and the time", system.includes("Today is Wednesday 7 October 2026 and the time is 15:30."), true);
check("the instructions name the end of the month", system.includes("\"End of the month\" is 2026-10-31."), true);
check("every goal is in the instructions under its key", context.goals.every((g) => system.includes(`${g.ref} ${g.name}:`)), true);
check("every open task is in the instructions under its key", context.openTasks.every((t) => system.includes(`${t.ref} ${t.title}`)), true);

/* Titles in the user's own capitals. */
check("Title Case titles are read as Title Case",
  titleStyle(["Renew Car Insurance", "Send Invoice to Client", "Book the Dentist", "Buy Milk"]), "title");
check("sentence case titles are read as sentence case",
  titleStyle(["Renew car insurance", "Send invoice to client", "Book the dentist", "Buy milk"]), "sentence");
check("a new list, with no titles yet, is sentence case", titleStyle([]), "sentence");
check("two titles are too few to tell", titleStyle(["Renew Car Insurance", "Buy Milk"]), "sentence");
check("one-word titles, acronyms and figures tell nothing",
  titleStyle(["Laundry", "Email HR about PTO", "Pay 3 bills", "Gym"]), "sentence");
check("names inside a sentence-case title do not make it Title Case",
  titleStyle(["Call Alex about the trip", "Ask Priya for the slides", "Pick up the parcel", "Water the plants"]), "sentence");
check("a list mostly in Title Case is Title Case",
  titleStyle(["Renew Car Insurance", "Send Invoice to Client", "Book the Dentist", "water the plants"]), "title");
check("the instructions ask for the user's own style, with examples in it",
  [rambleSystemPrompt({ ...context, recentTitles: [] }).includes("\"Buy milk\""),
   rambleSystemPrompt({ ...context, recentTitles: ["Renew Car Insurance", "Send Invoice to Client", "Book the Dentist"] }).includes("\"Buy Milk\""),
   rambleSystemPrompt({ ...context, recentTitles: [] }).includes("\"Buy Milk\"")],
  [true, true, false]);

/* Groq's strict mode: every object closed, every field required. */
function strictProblems(schema, path = "$") {
  const problems = [];
  if (schema.anyOf) schema.anyOf.forEach((option, i) => problems.push(...strictProblems(option, `${path}|${i}`)));
  if (schema.type === "object") {
    if (schema.additionalProperties !== false) problems.push(`${path} is not closed`);
    const keys = Object.keys(schema.properties ?? {}).sort();
    if (JSON.stringify([...(schema.required ?? [])].sort()) !== JSON.stringify(keys)) problems.push(`${path} does not require every field`);
    for (const [key, value] of Object.entries(schema.properties ?? {})) problems.push(...strictProblems(value, `${path}.${key}`));
  }
  if (schema.type === "array" && schema.items) problems.push(...strictProblems(schema.items, `${path}[]`));
  return problems;
}
const schema = rambleSchema(context);
check("the schema meets strict mode everywhere", strictProblems(schema), []);
const item = schema.properties.tasks.items.properties;
check("a goal is always one of the keys, never none, while there are goals", item.goal, { type: "string", enum: ["g1", "g2", "g3", "g4", "g5", "g6", "g7"] });
check("a repeat can only name an open task's key, or none", item.same_as.anyOf[0].enum.length, context.openTasks.length);
check("with no goals at all, the goal can only be none",
  rambleSchema({ ...context, goals: [], openTasks: [] }).properties.tasks.items.properties.goal, { type: "null" });

/* ── the model's answer, held to the schema ───────────────────────────── */

const reply = (tasksOut) => checkRambleReply({ tasks: tasksOut }, context);
const answer = (extra) => ({
  title: "Something", details: [], date: null, time: null, priority: "medium", urgency: "", goal: null, same_as: null, ...extra,
});
check("an answer that is not a list is refused", checkRambleReply({ nope: true }, context).ok, false);
check("null is refused", checkRambleReply(null, context).ok, false);
check("a task with no title is left out", reply([answer({ title: "  " }), answer({ title: "Kept" })]).tasks.map((t) => t.title), ["Kept"]);
check("a goal key that was never offered is dropped", reply([answer({ goal: "g99" })]).tasks[0].goal, null);
check("an open task key that was never offered is dropped", reply([answer({ same_as: "t99" })]).tasks[0].same_as, null);
check("a priority outside the four reads as Medium", reply([answer({ priority: "p1" })]).tasks[0].priority, "medium");
check("a time with a made-up meridiem is dropped", reply([answer({ time: { hour: 7, minute: 0, meridiem: "eve" } })]).tasks[0].time, null);
check("no more than the cap of tasks", reply(Array.from({ length: MAX_TASKS + 5 }, (_, i) => answer({ title: `T${i}` }))).tasks.length, MAX_TASKS);

check("silence Whisper filled in reads as nothing heard",
  ["Thank you.", "Thanks for watching!", " you ", "...", ""].map(cleanTranscript), ["", "", "", "", ""]);
check("a real transcript is kept, spaces tidied", cleanTranscript("  Thank you  for the  call, Alex. "), "Thank you for the call, Alex.");

/* ── the rule for a bare hour ─────────────────────────────────────────── */

const at = (hour, meridiem = "unsaid", minute = 0) => ({ hour, minute, meridiem });
const AFTERNOON = 15 * 60 + 30;
check("\"at 7\" today, said at 3:30pm, is 7pm: the morning has gone",
  resolveSpokenTime(at(7), TODAY, TODAY, AFTERNOON), { time: "19:00", question: null });
check("\"at 7\" today, said at 6am, is asked: both are still to come",
  resolveSpokenTime(at(7), TODAY, TODAY, 6 * 60), { time: null, question: { am: "07:00", pm: "19:00" } });
check("\"at 7\" today, said at 9pm, is asked: both have gone",
  resolveSpokenTime(at(7), TODAY, TODAY, 21 * 60), { time: null, question: { am: "07:00", pm: "19:00" } });
check("\"at 7\" tomorrow is asked",
  resolveSpokenTime(at(7), "2026-10-08", TODAY, AFTERNOON), { time: null, question: { am: "07:00", pm: "19:00" } });
check("\"at 7:30\" tomorrow asks with the minutes",
  resolveSpokenTime(at(7, "unsaid", 30), "2026-10-08", TODAY, AFTERNOON).question, { am: "07:30", pm: "19:30" });
check("\"7pm\" is never asked", resolveSpokenTime(at(7, "pm"), "2026-10-08", TODAY, AFTERNOON).time, "19:00");
check("\"7 in the morning\" is never asked", resolveSpokenTime(at(7, "am"), "2026-10-08", TODAY, AFTERNOON).time, "07:00");
check("a 24-hour time says its own half", resolveSpokenTime(at(19, "unsaid", 15), "2026-10-08", TODAY, AFTERNOON).time, "19:15");
check("an hour 0 the words did not make midnight is no time (\"in the afternoon\" came back as 00:00)",
  [resolveSpokenTime(at(0, "pm"), TODAY, TODAY, AFTERNOON), resolveSpokenTime(at(0), TODAY, TODAY, AFTERNOON)], [{ time: null, question: null }, { time: null, question: null }]);
check("midnight said as such is 00:00", resolveSpokenTime(at(0, "am", 15), "2026-10-08", TODAY, AFTERNOON).time, "00:15");
check("\"at 12\" tomorrow is noon", resolveSpokenTime(at(12), "2026-10-08", TODAY, AFTERNOON).time, "12:00");
check("\"at 12\" today before noon is noon", resolveSpokenTime(at(12), TODAY, TODAY, 9 * 60).time, "12:00");
check("\"at 12\" today after noon is asked",
  resolveSpokenTime(at(12), TODAY, TODAY, AFTERNOON).question, { am: "00:00", pm: "12:00" });
check("\"12am\" is midnight", resolveSpokenTime(at(12, "am"), "2026-10-08", TODAY, AFTERNOON).time, "00:00");
check("\"12pm\" is noon", resolveSpokenTime(at(12, "pm"), "2026-10-08", TODAY, AFTERNOON).time, "12:00");
check("no time said is no time", resolveSpokenTime(null, TODAY, TODAY, AFTERNOON), { time: null, question: null });
check("an impossible time is dropped, not guessed", resolveSpokenTime(at(7, "unsaid", 75), TODAY, TODAY, AFTERNOON), { time: null, question: null });

check("no day said is today", resolveDate(null, TODAY), TODAY);
check("a day said is kept", resolveDate("2026-10-16", TODAY), "2026-10-16");
check("a day that does not exist is today", resolveDate("2026-02-30", TODAY), TODAY);
check("a day already gone is today", resolveDate("2026-10-01", TODAY), TODAY);

/* ── priority words ───────────────────────────────────────────────────── */

check("the words name a priority",
  ["this is urgent", "top priority", "not urgent", "no rush on this", "it's important", "medium priority", "pick up groceries"].map(priorityFromWords),
  ["high", "critical", "low", "low", "high", "medium", null]);
check("\"not that important\" is Low, never High", priorityFromWords("it's not that important"), "low");
check("\"really urgent\" is Critical", priorityFromWords("this one is really urgent"), "critical");

/* ── text as people write it ──────────────────────────────────────────── */

check("a spaced em dash becomes a spaced hyphen", cleanText("Tasks Page Fix — Page cutoff"), "Tasks Page Fix - Page cutoff");
check("an en dash in a range becomes a hyphen", cleanText("9–10 pages"), "9-10 pages");
check("a title loses its full stop and gains a capital", cleanTitle("pick up groceries."), "Pick up groceries");
check("a title is held to 120 characters", cleanTitle("x".repeat(200)).length, 120);
const description = detailsToDescription(["- pasta", "• seasoned chicken", "Pick Up Groceries", "", "snacks — the good ones"], "Pick Up Groceries");
check("details become the list's own \"- \" lines, each with a capital, the title and bullets dropped, dashes cleaned",
  description, "- Pasta\n- Seasoned chicken\n- Snacks - the good ones");
check("a detail that only says the title again is no description (7 Oct: \"- four eggs\" under eating them)",
  [detailsToDescription(["four eggs"], cleanTitle("Eat four eggs")), detailsToDescription(["medicine"], "Take Medicine")], [null, null]);
check("a detail with something of its own is kept, with a capital",
  detailsToDescription(["after lunch", "the blue strip"], "Take Medicine"), "- After lunch\n- The blue strip");
check("counts become figures",
  ["Eat four eggs", "read twenty five pages", "Fifteen minutes of stretching", "a hundred push ups"].map(digitsForNumbers),
  ["Eat 4 eggs", "read 25 pages", "15 minutes of stretching", "100 push ups"]);
check("\"one\" and words that only contain a number stay words",
  ["the red one", "someone", "often", "Tennis", "network"].map(digitsForNumbers), ["the red one", "someone", "often", "Tennis", "network"]);
check("a title's count is a figure", cleanTitle("eat four eggs"), "Eat 4 eggs");
check("a clock time or a date said in words stays words",
  ["seven thirty", "six fifteen", "Twelve thirty lunch", "the twenty first", "thirty first of October", "two hundred"].map(digitsForNumbers),
  ["seven thirty", "six fifteen", "Twelve thirty lunch", "the twenty first", "thirty first of October", "two hundred"]);
check("a range or a count beside it still turns", ["nine to five", "ten minutes", "fifteen pages"].map(digitsForNumbers), ["9 to 5", "10 minutes", "15 pages"]);
check("the 1. of 1.5 is a decimal, not a list number",
  detailsToDescription(["1.5 litres of milk", "2. eggs", "3) bread"], "Groceries"), "- 1.5 litres of milk\n- Eggs\n- Bread");
check("a word cased inside keeps its case, and a.m. keeps its last dot",
  detailsToDescription(["iPhone charger", "before 7 a.m."], "Pack Bag"), "- iPhone charger\n- Before 7 a.m.");
check("a title said with a count matches one written with a figure", titleKey("Eat four eggs"), titleKey("Eat 4 Eggs"));
check("which the task card reads back as one list of three",
  parseDescription(description).map((block) => (block.kind === "list" ? block.items.length : 0)), [3]);
check("no details is no description", detailsToDescription([], "Anything"), null);

/* ── a task already open ──────────────────────────────────────────────── */

check("the same words in any order are the same title", titleKey("Send the insurance form"), titleKey("Insurance Form Send"));
check("a different word is a different task", titleKey("Insurance Form Review") === titleKey("Insurance Form Send"), false);
check("a title matching an open one is found",
  findDuplicate("Send my Insurance Form", null, source.openTasks)?.title, "Insurance Form Send");
check("a similar title is not a duplicate", findDuplicate("Insurance Form Review", null, source.openTasks), null);
check("a done task is not one to repeat",
  findDuplicate("Scripting - Search feature", null, source.openTasks), null);

/* ── a real-shaped ramble, end to end ─────────────────────────────────── */

/* "I have to go pick up groceries tomorrow at 12, and then I also have to
   edit my video, and then finish my photography course, and then I
   have to send my insurance form to the bank." */
const drafts = rambleDrafts(reply([
  answer({ title: "Pick Up Groceries", date: "2026-10-08", time: at(12), goal: goalRef("personal") }),
  answer({ title: "Video Edit", goal: goalRef("brand") }),
  answer({ title: "Photography Course Finish", goal: null }),
  answer({ title: "Insurance Form Send", details: ["Send it to the bank"], goal: goalRef("website"), same_as: taskRef("task-3") }),
]).tasks, source, null);

check("four things said are four rows", drafts.map((d) => d.title), ["Pick Up Groceries", "Video Edit", "Photography Course Finish", "Insurance Form Send"]);
check("groceries: tomorrow at noon, in Personal",
  [drafts[0].due_date, drafts[0].due_time, drafts[0].category_id], ["2026-10-08", "12:00", "personal"]);
check("the video, with no day said, is today, in Brand",
  [drafts[1].due_date, drafts[1].due_time, drafts[1].category_id], [TODAY, null, "brand"]);
check("the course, filed nowhere, waits for a goal on the card", drafts[2].category_id, null);
check("the insurance form is already open: flagged and left out",
  [drafts[3].duplicateOf?.id, drafts[3].include], ["task-3", false]);
check("everything else is in", drafts.slice(0, 3).every((d) => d.include), true);
check("a task the model filed nowhere takes the goal the page shows",
  rambleDrafts(reply([answer({ title: "Photography Course Finish" })]).tasks, source, "career")[0].category_id, "career");
check("the same task said twice is one row",
  rambleDrafts(reply([answer({ title: "Call Mum" }), answer({ title: "call mum." })]).tasks, source).length, 1);
check("a priority said outright beats the model's",
  rambleDrafts(reply([answer({ title: "Visa Form", priority: "medium", urgency: "this is top priority" })]).tasks, source)[0].priority, "critical");
check("the model's priority stands when nothing was said about it",
  rambleDrafts(reply([answer({ title: "Interview Prep", priority: "high" })]).tasks, source)[0].priority, "high");
check("a duplicate the model missed is caught by its words",
  rambleDrafts(reply([answer({ title: "Clear Old Drives" })]).tasks, source)[0].duplicateOf?.title, "Old Drives Clear");

/* A row already in the list shows no fields, so it cannot be the one naming them. */
check("the first row to be added names the fields", labelledDraftKey(drafts), drafts[0].key);
check("…not a row already in the list above it",
  labelledDraftKey([{ key: "dup", include: false }, { key: "new", include: true }]), "new");
check("…and none when nothing is to be added", labelledDraftKey([{ key: "dup", include: false }]), null);

/* ── the waveform (8 Oct 2026: a take running right to left) ───────────── */

check("a room's hum reads as silence", [0, 0.001, 0.0035].map(voiceLevel), [0, 0, 0]);
check("a voice passes as its amplitude", voiceLevel(0.1), 0.1);
check("nothing that is not a number becomes NaN", [NaN, -1, undefined].map(voiceLevel), [0, 0, 0]);
check("the loudest word stands just short of the top, never flat against it", barHeight(0.2, 0.2) > 0.85 && barHeight(0.2, 0.2) < 0.9, true);
check("half as loud is a little under half as tall", barHeight(0.1, 0.2) > 0.42 && barHeight(0.1, 0.2) < 0.52, true);
{
  const scroll = newWaveScroll();
  for (let i = 0; i < 20; i++) advanceWave(scroll, 0.5, BAR_MS / 4);
  check("a bar each BAR_MS, however the frames fall", scroll.bars.length, 5);
  check("between bars the take slides a fraction of a bar", waveOffset(scroll) >= 0 && waveOffset(scroll) < 1, true);
  advanceWave(scroll, 0, BAR_MS * 0.5);
  check("halfway to the next bar is half a bar along", Math.abs(waveOffset(scroll) - 0.5) < 1e-9, true);
}
{
  const scroll = newWaveScroll();
  advanceWave(scroll, 0.01, 10);
  advanceWave(scroll, 0.09, 10);
  check("the bar still growing at the edge shows its slice so far", pendingHeight(scroll) > 0.3, true);
  advanceWave(scroll, 0.02, BAR_MS - 20);
  const average = Math.sqrt((0.01 ** 2 * 10 + 0.09 ** 2 * 10 + 0.02 ** 2 * (BAR_MS - 20)) / BAR_MS);
  check("a bar is its slice's average loudness, not its loudest moment", Math.abs(scroll.bars[0] - barHeight(average, Math.max(average, 0.03))) < 1e-9, true);
}
{
  const scroll = newWaveScroll();
  advanceWave(scroll, 0, BAR_MS * 10);
  check("silence is bars at rest, drawn as dots", scroll.bars.every((bar) => bar === 0) && scroll.bars.length === 10, true);
  advanceWave(scroll, 0.02, BAR_MS * 3);
  check("a quiet voice still stands well up", scroll.bars.at(-1) > 0.55, true);
  advanceWave(scroll, 1, BAR_MS * 400);
  check("the take keeps no more bars than it can show", scroll.bars.length, BAR_CAPACITY);
}
{
  const scroll = newWaveScroll();
  advanceWave(scroll, 0.3, BAR_MS);
  /* A slice begins with the moment it began in, so the loud one carries
     into the next 55 ms; the one after is quiet. */
  advanceWave(scroll, 0.05, BAR_MS * 2);
  const justAfter = scroll.bars.at(-1);
  advanceWave(scroll, 0.05, BAR_MS * 120);
  check("just after a loud word a quiet one stands lower, then the scale eases back", justAfter < scroll.bars.at(-1), true);
}
check("a pause stops the take: no time, no bars", advanceWave(newWaveScroll(), 1, 0).bars.length, 0);
{
  /* Syllables of a steady voice, loud and soft, with a breath between words:
     the bars rise and fall, and none sits flat against the top. */
  const scroll = newWaveScroll();
  const syllables = [0.12, 0.05, 0.14, 0.09, 0.03, 0.13, 0.06, 0, 0.11, 0.15, 0.04, 0.1];
  for (let i = 0; i < 600; i++) advanceWave(scroll, syllables[Math.floor(i / 6) % syllables.length], 1000 / 60);
  check("a steady voice never stands flat against the top", scroll.bars.every((bar) => bar < 0.95), true);
  check("and its bars rise and fall", Math.max(...scroll.bars) - Math.min(...scroll.bars) > 0.5, true);
}
{
  const xs = Array.from({ length: 61 }, (_, i) => i * 5);
  const lights = xs.map((x) => readingLight(x, 300, 0.7));
  check("while reading, every bar stays visible and one part is lit", lights.every((l) => l >= 0.3 && l <= 1) && Math.max(...lights) > 0.9, true);
  const brightest = (seconds) => xs.reduce((best, x) => (readingLight(x, 300, seconds) > readingLight(best, 300, seconds) ? x : best), 0);
  check("the light travels right to left", brightest(0.35) > brightest(0.7) && brightest(0.7) > brightest(1.05), true);
}

/* ── the transcript view and the take's clock ──────────────────────── */

check("a transcript reads a sentence a line",
  transcriptSentences("Okay, so I need to call Mr. Shah tomorrow. Then pay 2.5 dollars! And eat four eggs."),
  ["Okay, so I need to call Mr. Shah tomorrow.", "Then pay 2.5 dollars!", "And eat four eggs."]);
check("U.S. and e.g. do not end a sentence",
  transcriptSentences("Email the U.S. Embassy tomorrow. Buy snacks, e.g. Pringles."), ["Email the U.S. Embassy tomorrow.", "Buy snacks, e.g. Pringles."]);
check("a transcript with no stops is one line", transcriptSentences("pick up groceries and edit my video"), ["pick up groceries and edit my video"]);
{
  let clock = startClock(1000);
  check("the clock counts from the start", readClock(clock, 4000), 3000);
  clock = pauseClock(clock, 4000);
  check("a pause holds it", readClock(clock, 60_000), 3000);
  check("pausing twice changes nothing", readClock(pauseClock(clock, 90_000), 90_000), 3000);
  clock = resumeClock(clock, 60_000);
  check("and it carries on from where it stopped", readClock(clock, 62_500), 5500);
  check("resuming twice changes nothing", readClock(resumeClock(clock, 61_000), 62_500), 5500);
  check("a few seconds are let go without asking; more are asked about", ASK_BEFORE_DISCARD_MS > 1000 && ASK_BEFORE_DISCARD_MS <= 5000, true);
}

/* ── the recording ────────────────────────────────────────────────────── */

check("Opus in WebM first, as Chrome and Arc record",
  recordingType((type) => type.startsWith("audio/webm")), "audio/webm;codecs=opus");
check("MP4 where only that records, as older Safari",
  recordingType((type) => type.startsWith("audio/mp4")), "audio/mp4;codecs=mp4a.40.2");
check("a browser that throws on the question gets its own default",
  recordingType(() => { throw new Error("no"); }), "");
check("the file name tells Groq the format",
  ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", ""].map(recordingFileName),
  ["ramble.webm", "ramble.mp4", "ramble.ogg", "ramble.webm"]);
check("the timer reads minutes and seconds", [0, 7_400, 165_000].map(formatRecordingTime), ["0:00", "0:07", "2:45"]);
check("three minutes at 32 kbps is far inside the upload limit", 180 * 32_000 / 8 < MAX_UPLOAD_BYTES, true);
/* Safari may record AAC at its own rate, well over the 32 kbps asked for. */
check("at 32 kbps a take runs its full three minutes", takeLimitMs(10 * 4_000, 10_000), MAX_RECORDING_MS);
check("before anything is recorded the limit is three minutes", [takeLimitMs(0, 0), takeLimitMs(0, 5_000)], [MAX_RECORDING_MS, MAX_RECORDING_MS]);
const at256 = takeLimitMs(10 * 32_000, 10_000);
check("at 256 kbps a take ends early, when its bytes would reach the budget", at256 < MAX_RECORDING_MS && Math.abs(at256 / 1000 * 32_000 - SEND_AT_BYTES) < 32_000, true);
check("the budget leaves room under the upload limit for the second still in the encoder, even at 320 kbps",
  MAX_UPLOAD_BYTES - SEND_AT_BYTES > 2 * 40_000, true);
check("a refused microphone says how to allow it",
  microphoneProblem(Object.assign(new Error("x"), { name: "NotAllowedError" })).startsWith("The microphone is blocked"), true);
check("a missing one says so", microphoneProblem({ name: "NotFoundError" }), "No microphone was found.");

if (failures.length > 0) {
  console.error(`\n  ${failures.length} failed, ${passed} passed\n`);
  console.error(failures.join("\n\n"));
  process.exit(1);
}
console.log(`\n  ${passed} passed, 0 failed\n`);
