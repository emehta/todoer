/**
 * A day of tasks as the Copy button on each day heading writes it: every task
 * a bullet, every line of its description a bullet under it, the open tasks
 * grouped by category in the list's order and the done ones under Completed.
 * The plain text in WhatsApp's own list marks, the HTML as real nested lists.
 * No framework: `npm test -- task-share`.
 */

import { completedOnDay, dayClipboardHeading, dayCopyTasks, descriptionLines, formatDayForClipboard } from "@/lib/task-clipboard";

const failures = [];
let passed = 0;

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) { passed++; return; }
  failures.push(`  ${name}\n      got ${a}\n     want ${b}`);
}

function ok(name, condition) {
  if (condition) { passed++; return; }
  failures.push(`  ${name}`);
}

const decode = (value) => value
  .replace(/&nbsp;/g, " ")
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&amp;/g, "&");

const LIST_STYLE = 'style="margin-top:0;margin-bottom:0"';
const LIST_OPEN = `<ul ${LIST_STYLE}>`;
const LIST_TAG = /^<(?:ul|ol(?: start="(\d+)")?) style="margin-top:0;margin-bottom:0">$/;

/*
 * The HTML read back as an outline, the way an app that pastes HTML sees it:
 * each <div> a line (<div><br></div> a blank one), each item of a top list a
 * "•" line, and each item of a list nested in it a line indented two more
 * spaces, marked "◦" a level down, "▪" further, or by its number in a
 * numbered list. Anything else (a <p>, text outside a line, a list with a
 * margin) is null, so it fails the comparison rather than passing it.
 */
function htmlOutline(html) {
  const lines = [];
  const bold = [];
  const lists = [];
  let openItems = 0;
  let item = null;
  let div = null;
  const endItem = () => {
    if (item) lines.push(`${"  ".repeat(item.depth - 1)}${item.mark} ${item.text}`);
    item = null;
  };
  const token = /<(\/?)(\w+)([^>]*)>|([^<]+)/g;
  let end = 0;
  for (let match = token.exec(html); match; match = token.exec(html)) {
    if (match.index !== end) return null;
    end = token.lastIndex;
    const [whole, close, tag, attrs, text] = match;
    if (text !== undefined) {
      if (div) div.text += decode(text);
      else if (item) item.text += decode(text);
      else return null;
      continue;
    }
    if (attrs && !(!close && (tag === "ul" || tag === "ol") && LIST_TAG.test(whole))) return null;
    if (tag === "div") {
      if (lists.length > 0) return null;
      if (close) {
        if (!div) return null;
        lines.push(div.text);
        if (div.bold) bold.push(div.text);
        div = null;
      } else {
        if (div) return null;
        div = { text: "", bold: false };
      }
    } else if (tag === "b") {
      if (!div) return null;
      if (!close) div.bold = true;
    } else if (tag === "br") {
      if (!div || div.text) return null;
    } else if (tag === "ul" || tag === "ol") {
      if (close) {
        endItem();
        if (!lists.pop() || openItems !== lists.length) return null;
      } else {
        /* A list is at the top, or inside an item of the list around it. */
        if (div || openItems !== lists.length || !attrs) return null;
        endItem();
        lists.push({ ordered: tag === "ol", next: Number(LIST_TAG.exec(whole)[1] ?? 1) });
      }
    } else if (tag === "li") {
      if (close) {
        endItem();
        openItems -= 1;
        if (openItems !== lists.length - 1) return null;
      } else {
        const list = lists[lists.length - 1];
        if (!list || openItems !== lists.length - 1) return null;
        endItem();
        openItems += 1;
        const depth = lists.length;
        const mark = list.ordered ? `${list.next++}.` : depth === 1 ? "•" : depth === 2 ? "◦" : "▪";
        item = { depth, mark, text: "" };
      }
    } else return null;
  }
  return end === html.length && lists.length === 0 && openItems === 0 && !div ? { lines, bold } : null;
}

/*
 * The plain text in the same terms: "- " a "•" line, and a line nine spaces
 * in a level down from it, four more for each level further, kept with its
 * own mark.
 */
function textOutline(text) {
  return text.split("\n").map((line) => {
    if (line.startsWith("- ")) return `• ${line.slice(2)}`;
    const detail = /^( +)(◦|▪|\d+\.) (.*)$/.exec(line);
    if (!detail) return line;
    const depth = (detail[1].length - 9) / 4 + 2;
    return Number.isInteger(depth) && depth >= 2 ? `${"  ".repeat(depth - 1)}${detail[2]} ${detail[3]}` : `?${line}`;
  });
}

const TODAY = new Date(2026, 9, 1); // Thursday 1 October 2026

const categories = [
  { id: "c-personal", name: "Personal", color: "#06b6d4", display_order: 0, created_at: "", description: null, deadline: null, goal_type: null },
  { id: "c-website", name: "Website", color: "#22c55e", display_order: 1, created_at: "", description: null, deadline: null, goal_type: null },
  { id: "c-personal-2", name: "Personal", color: "#38bdf8", display_order: 2, created_at: "", description: null, deadline: null, goal_type: null },
  { id: "c-admin", name: "Admin + Social", color: "#a855f7", display_order: 3, created_at: "", description: null, deadline: null, goal_type: null },
];

let n = 0;
function task(title, extra = {}) {
  n++;
  return {
    id: `t${n}`,
    title,
    description: null,
    due_date: "2026-10-01",
    due_time: null,
    priority: "medium",
    completed: false,
    created_at: `2026-09-30T00:00:${String(n).padStart(2, "0")}Z`,
    category_id: null,
    display_order: n,
    ...extra,
  };
}

/* ─── The owner's real day, 1 Oct 2026 ─── */

const day = [
  task("Old Drives Clear", { description: "Pens + Paper", category_id: "c-personal", priority: "high" }),
  task("Torches Charge", { description: "Pens + Paper Pads", category_id: "c-personal", priority: "high" }),
  task("Phone Photos Clean", { category_id: "c-personal" }),
  task("Living Room - Shelf Refresh", { description: "- Clear the old magazines\n- Add a small reading lamp\n- Hang the new print", category_id: "c-website" }),
  task("Budget Sheet Update", { category_id: "c-website" }),
];

check("the owner's day, every description line a bullet under its task",
  formatDayForClipboard("2026-10-01", day, categories, "12h", TODAY).text.split("\n"),
  [
    "Today, Thursday, 1st October",
    "",
    "Personal",
    "- Old Drives Clear",
    "         ◦ Pens + Paper",
    "- Torches Charge",
    "         ◦ Pens + Paper Pads",
    "- Phone Photos Clean",
    "",
    "Website",
    "- Living Room - Shelf Refresh",
    "         ◦ Clear the old magazines",
    "         ◦ Add a small reading lamp",
    "         ◦ Hang the new print",
    "- Budget Sheet Update",
  ]);

check("the same day as HTML: a real list, the description a list inside its task, a blank line its own, nothing coloured",
  formatDayForClipboard("2026-10-01", day.slice(3), categories, "12h", TODAY).html,
  "<div><b>Today, Thursday, 1st October</b></div><div><br></div><div><b>Website</b></div>"
    + LIST_OPEN
    + "<li>Living Room - Shelf Refresh" + LIST_OPEN + "<li>Clear the old magazines</li><li>Add a small reading lamp</li><li>Hang the new print</li></ul></li>"
    + "<li>Budget Sheet Update</li>"
    + "</ul>");

/* ─── The owner's real day, 5 Oct 2026, with what was done ─── */

const MONDAY = new Date(2026, 9, 5);
const fifth = (title, extra) => task(title, { due_date: "2026-10-05", category_id: "c-website", ...extra });
const october5 = [
  fifth("Garden Shed - Shelves + Lock Repair", { display_order: -1024, priority: "critical" }),
  fifth("Kitchen Tidy", { completed: true, display_order: -768, description: "- Clearing the top cupboards\n- Sorting the spices in alphabetical order" }),
  fifth("Bike Repairs", { completed: true, display_order: -512, description: "- Back brake not gripping\n- Gears need to be set in order of Low->High\n- Chain should be cleaned and oiled before the ride on Saturday." }),
  fifth("Front Door Handle fix", { completed: true, display_order: -256, description: "- Tighten the screws on the handle and the lock plate" }),
  fifth("Garden Shed Paint Touch-up", { completed: true, display_order: 0, category_id: "c-admin" }),
  fifth("Living Room - Shelf Refresh", { display_order: 1024, description: "- Clear the old magazines\n- Add a small reading lamp\n- Hang the new print" }),
  fifth("Photo Album - Print + Sort", { completed: true, display_order: 4096, description: "- Pick the photos for @family.album\n- Fix photo/ print sizes + ensure the dates are right" }),
];

/* What the page hands over from Current: the list's open tasks, then the day's done ones. */
const open5 = october5.filter((t) => !t.completed);
const copied5 = formatDayForClipboard("2026-10-05", dayCopyTasks(open5, october5, "2026-10-05", () => true), categories, "12h", MONDAY);

check("today's copy: the open tasks by category, then Completed in one list with every description line under its task",
  copied5.text.split("\n"),
  [
    "Today, Monday, 5th October",
    "",
    "Website",
    "- Garden Shed - Shelves + Lock Repair",
    "- Living Room - Shelf Refresh",
    "         ◦ Clear the old magazines",
    "         ◦ Add a small reading lamp",
    "         ◦ Hang the new print",
    "",
    "Completed",
    "- Kitchen Tidy",
    "         ◦ Clearing the top cupboards",
    "         ◦ Sorting the spices in alphabetical order",
    "- Bike Repairs",
    "         ◦ Back brake not gripping",
    "         ◦ Gears need to be set in order of Low->High",
    "         ◦ Chain should be cleaned and oiled before the ride on Saturday.",
    "- Front Door Handle fix",
    "         ◦ Tighten the screws on the handle and the lock plate",
    "- Garden Shed Paint Touch-up",
    "- Photo Album - Print + Sort",
    "         ◦ Pick the photos for @family.album",
    "         ◦ Fix photo/ print sizes + ensure the dates are right",
  ]);

check("and its HTML is the same outline as real lists, the day, the categories and Completed in bold",
  [htmlOutline(copied5.html)?.lines, htmlOutline(copied5.html)?.bold],
  [textOutline(copied5.text), ["Today, Monday, 5th October", "Website", "Completed"]]);

check("a done task in another category sits in Completed with no category heading of its own",
  copied5.text.split("\n").filter((line) => line === "Admin + Social"),
  []);

check("a day with nothing done has no Completed",
  formatDayForClipboard("2026-10-05", open5, categories, "12h", MONDAY).text.split("\n").includes("Completed"),
  false);

check("a day with every task done copies them under Completed",
  formatDayForClipboard("2026-10-01", [task("x", { completed: true, category_id: "c-personal" })], categories, "12h", TODAY),
  {
    text: "Today, Thursday, 1st October\n\nCompleted\n- x",
    html: "<div><b>Today, Thursday, 1st October</b></div><div><br></div><div><b>Completed</b></div>" + LIST_OPEN + "<li>x</li></ul>",
  });

check("a done task keeps its time, like an open one",
  formatDayForClipboard("2026-10-01", [task("Call", { completed: true, due_time: "15:00" })], categories, "12h", TODAY).text.split("\n").slice(2),
  ["Completed", "- Call, due 3:00 PM"]);

/* ─── Which done tasks a day's Copy lists ─── */

const pool = [
  task("Open today", { display_order: 1 }),
  task("Done today, late", { completed: true, display_order: 300 }),
  task("Done today, early", { completed: true, display_order: -50 }),
  task("Done yesterday", { completed: true, due_date: "2026-09-30" }),
  task("Done, no date", { completed: true, due_date: null }),
  task("Done today, other goal", { completed: true, category_id: "c-website", display_order: 0 }),
  task("Done today, same order, made second", { completed: true, display_order: 300, created_at: "2026-09-30T00:00:59Z" }),
];
const poolBefore = JSON.stringify(pool);
const titles = (tasks) => tasks.map((t) => t.title);

check("only that day's done tasks, in the list's order (its order, then the older first)",
  titles(completedOnDay(pool, "2026-10-01", () => true)),
  ["Done today, early", "Done today, other goal", "Done today, late", "Done today, same order, made second"]);

check("held to the same goal, search and priority as the open ones",
  titles(completedOnDay(pool, "2026-10-01", (t) => t.category_id === "c-website")),
  ["Done today, other goal"]);

check("No date is its own day",
  titles(completedOnDay(pool, null, () => true)),
  ["Done, no date"]);

check("a day with nothing done has none", completedOnDay(pool, "2026-10-02", () => true), []);
ok("and the tasks handed in are left as they were", JSON.stringify(pool) === poolBefore);

/* ─── What Current and Historical each hand a day's Copy ─── */

const done5 = october5.filter((t) => t.completed);
check("Current: the open tasks it lists, then every done task of the day",
  titles(dayCopyTasks(open5, october5, "2026-10-05", () => true)),
  [...titles(open5), "Kitchen Tidy", "Bike Repairs", "Front Door Handle fix", "Garden Shed Paint Touch-up", "Photo Album - Print + Sort"]);

check("Historical: the done tasks it lists and nothing added, so no task twice",
  titles(dayCopyTasks(done5, october5, "2026-10-05", () => true)),
  titles(done5));

const withOverdue = [...pool, task("Still open on a past day", { due_date: "2026-09-30" })];
const pastDone = completedOnDay(withOverdue, "2026-09-30", () => true);
check("Historical on a past day never brings in that day's open tasks, which are overdue",
  titles(dayCopyTasks(pastDone, withOverdue, "2026-09-30", () => true)),
  ["Done yesterday"]);

check("a goal tab: Historical lists only its done tasks, and only those are copied",
  titles(dayCopyTasks(pool.filter((t) => t.completed && t.due_date === "2026-10-01" && t.category_id === "c-website"), pool, "2026-10-01", (t) => t.category_id === "c-website")),
  ["Done today, other goal"]);

const ids = dayCopyTasks([...open5, done5[0]], october5, "2026-10-05", () => true).map((t) => t.id);
ok("a done task already listed is not added again", ids.length === new Set(ids).size && ids.length === october5.length);

check("a Historical day copies as its heading, then Completed",
  formatDayForClipboard("2026-10-01", dayCopyTasks(
    [task("Torches Charge", { completed: true, description: "Pens + Paper Pads", category_id: "c-personal" }), task("Budget Sheet Update", { completed: true, category_id: "c-website" })],
    [], "2026-10-01", () => true), categories, "12h", MONDAY).text.split("\n"),
  [
    "Thursday, 1st October",
    "",
    "Completed",
    "- Torches Charge",
    "         ◦ Pens + Paper Pads",
    "- Budget Sheet Update",
  ]);

/* ─── Descriptions ─── */

check("a list pasted from WhatsApp loses its bullet, word joiners and spaces",
  descriptionLines("Make list of items\n•⁠  ⁠Desk 63in x 30in - White\n•⁠  ⁠Reading Lamp"),
  ["Make list of items", "Desk 63in x 30in - White", "Reading Lamp"]);

check("typed dashes, stars and white bullets lose theirs too, and blank lines go",
  descriptionLines("* one\n\n  - two  \n◦ three\n\r\n• - four"),
  ["one", "two", "three", "four"]);

check("a dash inside a line is content, and a numbered line keeps its number",
  descriptionLines("Desk - White\n1. Book the room\n-5 degrees"),
  ["Desk - White", "1. Book the room", "-5 degrees"]);

check("no description, or only blank lines, means no bullets under the task",
  [descriptionLines(null), descriptionLines(""), descriptionLines(" \n ⁠ \n")],
  [[], [], []]);

check("Windows line endings split the same way",
  descriptionLines("a\r\nb"),
  ["a", "b"]);

/* ─── Times ─── */

const timed = [
  task("Call", { due_time: "15:00:00", category_id: "c-personal" }),
  task("Gym", { due_time: "07:05", category_id: "c-personal" }),
  task("Odd", { due_time: "later", category_id: "c-personal" }),
];

check("a time follows the owner's 12h setting, and one that cannot be read is left off",
  formatDayForClipboard("2026-10-01", timed, categories, "12h", TODAY).text.split("\n").slice(3),
  ["- Call, due 3:00 PM", "- Gym, due 7:05 AM", "- Odd"]);

check("and the 24h one",
  formatDayForClipboard("2026-10-01", timed.slice(0, 2), categories, "24h", TODAY).text.split("\n").slice(3),
  ["- Call, due 15:00", "- Gym, due 07:05"]);

/* ─── What goes in, and in what order ─── */

const mixed = [
  task("First website", { category_id: "c-website" }),
  task("Loose one"),
  task("A personal", { category_id: "c-personal" }),
  task("Second website", { category_id: "c-website" }),
  task("Done already", { category_id: "c-personal", completed: true }),
  task("Gone category", { category_id: "c-deleted" }),
  task("Other Personal", { category_id: "c-personal-2" }),
  task("Done too", { category_id: "c-website", completed: true }),
];

check("categories in the order they first appear, tasks in the list's order, no category last, then what is done",
  formatDayForClipboard("2026-10-01", mixed, categories, "12h", TODAY).text.split("\n"),
  [
    "Today, Thursday, 1st October",
    "",
    "Website",
    "- First website",
    "- Second website",
    "",
    "Personal",
    "- A personal",
    "",
    "Personal",
    "- Other Personal",
    "",
    "No category",
    "- Loose one",
    "- Gone category",
    "",
    "Completed",
    "- Done already",
    "- Done too",
  ]);

const onlyOverdueBox = [task("Plumber Number Save + Pay", { due_date: "2026-09-30", category_id: "c-personal" })];
const shared = formatDayForClipboard("2026-10-01", day, categories, "12h", TODAY).text;
ok("an overdue task is never in today's copy unless it is handed in", !shared.includes(onlyOverdueBox[0].title));

check("titles are trimmed",
  formatDayForClipboard(null, [task("  Spaced  ", { due_date: null })], categories, "12h", TODAY).text.split("\n"),
  ["No date", "", "No category", "- Spaced"]);

/* ─── One blank line under the heading, and between sections ─── */

const sectioned = formatDayForClipboard("2026-10-01", mixed, categories, "12h", TODAY);
const lines = sectioned.text.split("\n");
ok("the heading, then exactly one blank line, then the first category", lines[1] === "" && lines[2] === "Website");
ok("never two blank lines in a row, and none at either end",
  lines.every((line, i) => line !== "" || (i > 0 && i < lines.length - 1 && lines[i - 1] !== "" && lines[i + 1] !== "")));
ok("every heading under the day (a category or Completed) follows a blank line, and a bullet never does",
  lines.every((line, i) => i < 2 || (lines[i - 1] === "") === !/^(?:-| {9}◦) /.test(line) || line === ""));

/* ─── The same outline, whichever one an app pastes ─── */

const everything = formatDayForClipboard("2026-10-01", [...day, ...timed, ...mixed, ...october5], categories, "12h", TODAY);
check("the HTML is the text's outline: every task an item, every description line an item inside it, blank lines kept",
  htmlOutline(everything.html)?.lines, textOutline(everything.text));
ok("the blank lines are lines of their own, never a <p>'s margin a paste drops", !/<p\b/.test(everything.html) && everything.html.includes("<div><br></div>"));
ok("nothing outside ASCII in the HTML, so a paste read as Latin-1 cannot garble a word", /^[\x00-\x7e]*$/.test(everything.html));

const accented = formatDayForClipboard("2026-10-01", [task("Café  run 😀", { description: "Crème brûlée", category_id: "c-personal" })], categories, "12h", TODAY);
check("an accent, an emoji and a double space come back exactly",
  htmlOutline(accented.html)?.lines.slice(3),
  ["• Café  run 😀", "  ◦ Crème brûlée"]);

/* ─── The plain text, as WhatsApp reads it ─── */

const textLines = everything.text.split("\n");
const taskCount = [...day, ...timed, ...mixed, ...october5].length;
ok("every task is one line starting with WhatsApp's own list mark, so it becomes a real bulleted list",
  textLines.filter((line) => line.startsWith("- ")).length === taskCount);
ok("every description line is nine spaces and a white bullet: past where WhatsApp starts a task's text",
  textLines.filter((line) => line.startsWith(" ")).every((line) => /^ {9}◦ \S/.test(line))
    && textLines.filter((line) => line.startsWith("         ◦ ")).length > 10);
ok("no tab anywhere, which WhatsApp folds into one space", !everything.text.includes("\t"));
ok("a heading or a blank line carries no mark",
  textLines.filter((line) => !/^(?:- | {9}◦ )/.test(line)).every((line) => !/^[-*•◦] /.test(line)));

/* ─── Lists inside a description ─── */

const nested = formatDayForClipboard("2026-10-01", [
  task("Bike Repairs", {
    category_id: "c-website",
    description: "- Back brake not gripping\n  - The colour does not save\n    - Nor the link\n- Tasks arranged Crit to Low\nPlan:\n1. Book the room\n2. Send the invite\n   - with the agenda\n\n1. A second list",
  }),
], categories, "12h", TODAY);

check("in the plain text, each level of a description four spaces further in, a square past the first, numbers kept",
  nested.text.split("\n").slice(3),
  [
    "- Bike Repairs",
    "         ◦ Back brake not gripping",
    "             ▪ The colour does not save",
    "                 ▪ Nor the link",
    "         ◦ Tasks arranged Crit to Low",
    "         ◦ Plan:",
    "         1. Book the room",
    "         2. Send the invite",
    "             ▪ with the agenda",
    "         1. A second list",
  ]);

check("in the HTML, the same as real lists inside lists, the numbers a numbered list, a new count its own list",
  nested.html.slice(nested.html.indexOf("<li>")),
  "<li>Bike Repairs"
    + LIST_OPEN + "<li>Back brake not gripping"
    + LIST_OPEN + "<li>The colour does not save" + LIST_OPEN + "<li>Nor the link</li></ul></li></ul></li>"
    + "<li>Tasks arranged Crit to Low</li><li>Plan:</li></ul>"
    + `<ol ${LIST_STYLE}><li>Book the room</li><li>Send the invite${LIST_OPEN}<li>with the agenda</li></ul></li></ol>`
    + `<ol ${LIST_STYLE}><li>A second list</li></ol>`
    + "</li></ul>");

check("and the two read as the same outline",
  htmlOutline(nested.html)?.lines, textOutline(nested.text));

const restarted = formatDayForClipboard("2026-10-01", [task("Steps", { category_id: "c-website", description: "3. Third\n4. Fourth" })], categories, "12h", TODAY);
ok("a numbered list that starts past one says so", restarted.html.includes(`<ol start="3" ${LIST_STYLE}><li>Third</li><li>Fourth</li></ol>`));
check("and its numbers are the ones written", restarted.text.split("\n").slice(4), ["         3. Third", "         4. Fourth"]);

/* ─── HTML is text, never markup ─── */

const html = formatDayForClipboard("2026-10-01", [task("<b>Bold</b> & co", { description: "\"quoted\" <script>x</script>", category_id: "c-personal" })], categories, "12h", TODAY).html;
ok("a title or description cannot add an element to the HTML", !html.includes("<script>") && !html.includes("<b>Bold</b>"));
ok("and is escaped rather than dropped", html.includes("&lt;b&gt;Bold&lt;/b&gt; &amp; co") && html.includes("&quot;quoted&quot; &lt;script&gt;"));
ok("the plain text keeps it as typed", formatDayForClipboard("2026-10-01", [task("<b>Bold</b> & co")], categories, "12h", TODAY).text.includes("- <b>Bold</b> & co"));

/* ─── Headings ─── */

check("today, tomorrow, another day, another year, no date",
  [
    dayClipboardHeading("2026-10-01", TODAY),
    dayClipboardHeading("2026-10-02", TODAY),
    dayClipboardHeading("2026-10-06", TODAY),
    dayClipboardHeading("2026-09-30", TODAY),
    dayClipboardHeading("2027-01-07", TODAY),
    dayClipboardHeading(null, TODAY),
  ],
  [
    "Today, Thursday, 1st October",
    "Tomorrow, Friday, 2nd October",
    "Tuesday, 6th October",
    "Wednesday, 30th September",
    "Thursday, 7th January 2027",
    "No date",
  ]);

check("the ordinal on every kind of day: st, nd, rd, the teens, and the twenties",
  ["2026-10-03", "2026-10-11", "2026-10-12", "2026-10-13", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-31"].map((date) => dayClipboardHeading(date, TODAY)),
  [
    "Saturday, 3rd October",
    "Sunday, 11th October",
    "Monday, 12th October",
    "Tuesday, 13th October",
    "Wednesday, 21st October",
    "Thursday, 22nd October",
    "Friday, 23rd October",
    "Saturday, 31st October",
  ]);

check("tomorrow across a month and a year end",
  [dayClipboardHeading("2026-11-01", new Date(2026, 9, 31)), dayClipboardHeading("2027-01-01", new Date(2026, 11, 31, 23, 59))],
  ["Tomorrow, Sunday, 1st November", "Tomorrow, Friday, 1st January 2027"]);

check("today read late in the evening is still today",
  dayClipboardHeading("2026-10-01", new Date(2026, 9, 1, 23, 59)),
  "Today, Thursday, 1st October");

/* ─── Nothing the house style bans ─── */

ok("no em or en dash anywhere in what is copied", !/[–—]/.test(everything.text + htmlOutline(everything.html).lines.join("\n")));

if (failures.length > 0) {
  console.error(`task-share: ${failures.length} failed, ${passed} passed\n${failures.join("\n")}`);
  process.exit(1);
}
console.log(`task-share: ${passed} passed`);
