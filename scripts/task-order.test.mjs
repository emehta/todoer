/**
 * Where a task lands within its day. No framework: `npm test -- task-order`.
 *
 * The failure this defends against is quiet: a High task appended under three
 * Mediums looks like a list, just the wrong one, and a placement that
 * re-sorted the day would silently undo an order the owner dragged into place.
 */

import {
  DISPLAY_ORDER_STEP as STEP,
  placeManyByPriority,
  placeByPriority,
  sortTasksForDisplay,
} from "@/lib/task-order";

const failures = [];
let passed = 0;

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) { passed++; return; }
  failures.push(`  ${name}\n      got ${a}\n     want ${b}`);
}

let n = 0;
const task = (priority, display_order, extra = {}) => ({
  id: `t${++n}`,
  due_date: "2026-09-29",
  priority,
  display_order,
  completed: false,
  created_at: `2026-09-28T10:${String(n).padStart(2, "0")}:00Z`,
  ...extra,
});

/* Lands the placed task in the day at its display order and reads the day
   back as priorities, the way the list draws it. */
function after(day, priority, opts = {}) {
  const { displayOrder, renumber } = placeByPriority(day, { dueDate: "2026-09-29", priority, ...opts });
  const moved = new Map(renumber.map((r) => [r.id, r.display_order]));
  const placed = { ...task(priority, displayOrder), id: "new" };
  const next = [...day.filter((t) => t.id !== opts.excludeId).map((t) => ({ ...t, display_order: moved.get(t.id) ?? t.display_order })), placed];
  return sortTasksForDisplay(next.filter((t) => t.due_date === "2026-09-29")).map((t) => (t.id === "new" ? `*${t.priority}` : t.priority));
}

/* ── the owner's cases ─────────────────────────────────────────────────── */

const mixed = [task("critical", 1024), task("high", 2048), task("medium", 3072), task("low", 4096)];

check("a new Critical goes to the top, under the Criticals already there",
  after(mixed, "critical"), ["critical", "*critical", "high", "medium", "low"]);
check("a new High lands above the first Medium, never below it",
  after(mixed, "high"), ["critical", "high", "*high", "medium", "low"]);
check("a new Medium lands above the Lows",
  after(mixed, "medium"), ["critical", "high", "medium", "*medium", "low"]);
check("a new Low goes to the end",
  after(mixed, "low"), ["critical", "high", "medium", "low", "*low"]);

check("an empty day starts at one step",
  placeByPriority([], { dueDate: "2026-09-29", priority: "high" }), { displayOrder: STEP, renumber: [] });

check("a Critical on a day of Mediums goes above all of them",
  after([task("medium", 1024), task("medium", 2048)], "critical"), ["*critical", "medium", "medium"]);

/* ── a drag is final ───────────────────────────────────────────────────── */

/* The owner's real 29 Sep day: Mediums dragged into an order (512, 768, 896,
   960, 1024), then a High and a Low appended. The Mediums' arrangement has
   to survive a new High arriving. */
const dragged = [
  task("medium", 512, { id: "m-invest" }),
  task("medium", 768, { id: "m-combined" }),
  task("medium", 896, { id: "m-print" }),
  task("medium", 960, { id: "m-home" }),
  task("medium", 1024, { id: "m-summary" }),
  task("low", 6144, { id: "l-plumber" }),
];
const { renumber: draggedRenumber } = placeByPriority(dragged, { dueDate: "2026-09-29", priority: "high" });
check("placing a High above dragged Mediums moves none of them", draggedRenumber, []);
check("…and it lands above the first of them",
  placeByPriority(dragged, { dueDate: "2026-09-29", priority: "high" }).displayOrder < 512, true);

/* Placement never reorders what it does not move: a Low the owner dragged
   above a High stays above it when another task arrives, and the newcomer
   goes below the High rather than over it. */
const inverted = [task("low", 1024, { id: "dragged-low" }), task("high", 2048, { id: "high" })];
check("an inversion the owner dragged in is left alone, and nothing lands above the High",
  after(inverted, "medium"), ["low", "high", "*medium"]);
check("…while a Critical still goes to the very top",
  after(inverted, "critical"), ["*critical", "low", "high"]);

/* ── existing tasks ────────────────────────────────────────────────────── */

const moving = task("low", 1024, { id: "moving" });
const day = [moving, task("high", 2048), task("medium", 3072)];
check("raising a task's priority re-places it without counting itself",
  after(day, "critical", { excludeId: "moving" }), ["*critical", "high", "medium"]);

/* A done task is not in the list being arranged, so it neither holds the new
   one down nor counts as a neighbour to go below. */
check("done tasks do not decide the spot: the High still goes above the open Medium",
  after([task("low", 1024, { completed: true }), task("medium", 2048)], "high").filter((p) => p !== "low"),
  ["*high", "medium"]);
check("…and a done Critical does not pull a new Low to the top",
  after([task("critical", 1024, { completed: true }), task("medium", 2048)], "low").slice(-1), ["*low"]);

check("another day's tasks are ignored",
  placeByPriority([task("low", 1024, { due_date: "2026-09-30" })], { dueDate: "2026-09-29", priority: "high" }),
  { displayOrder: STEP, renumber: [] });

check("a task with no date is placed among the undated",
  placeByPriority([task("low", 1024, { due_date: null })], { dueDate: null, priority: "high" }).displayOrder < 1024, true);

/* ── when the neighbours leave no room ─────────────────────────────────── */

const tight = [task("high", 5, { id: "h" }), task("medium", 6, { id: "m" })];
const squeezed = placeByPriority(tight, { dueDate: "2026-09-29", priority: "high" });
check("adjacent neighbours renumber the day in its own order",
  after(tight, "high"), ["high", "*high", "medium"]);
check("…writing only the tasks whose number changed",
  squeezed.renumber.map((r) => r.id).sort(), ["h", "m"]);
check("…and every number in the day ends up distinct",
  new Set([squeezed.displayOrder, ...squeezed.renumber.map((r) => r.display_order)]).size, 3);

/* Twenty Highs in a row into the same gap still land in order. */
let crowded = [task("critical", 1024), task("medium", 2048)];
for (let i = 0; i < 20; i++) {
  const { displayOrder, renumber } = placeByPriority(crowded, { dueDate: "2026-09-29", priority: "high" });
  const moved = new Map(renumber.map((r) => [r.id, r.display_order]));
  crowded = [...crowded.map((t) => ({ ...t, display_order: moved.get(t.id) ?? t.display_order })), task("high", displayOrder)];
}
const crowdedOrder = sortTasksForDisplay(crowded).map((t) => t.priority);
check("twenty Highs into one gap stay between the Critical and the Medium",
  [crowdedOrder[0], crowdedOrder.slice(1, 21).every((p) => p === "high"), crowdedOrder[21]], ["critical", true, "medium"]);
check("…with no two tasks sharing a number",
  new Set(crowded.map((t) => t.display_order)).size, crowded.length);

/* ── several at once (Ramble) ──────────────────────────────────────────── */

/* Lands every arrival in the day at the order it was given, moves what had
   to move, and reads the day back as ids. */
function afterBatch(day, arrivals) {
  const { displayOrders, renumber } = placeManyByPriority(day, arrivals);
  const moved = new Map(renumber.map((r) => [r.id, r.display_order]));
  const placed = arrivals.map((a, i) => ({
    ...task(a.priority, displayOrders.get(a.id), { id: a.id, due_date: a.dueDate }),
    created_at: "2026-09-28T23:00:00Z",
    i,
  }));
  const next = [...day.map((t) => ({ ...t, display_order: moved.get(t.id) ?? t.display_order })), ...placed];
  return sortTasksForDisplay(next.filter((t) => t.due_date === "2026-09-29")).map((t) => t.id);
}
const arrive = (id, priority, dueDate = "2026-09-29") => ({ id, priority, dueDate });

const plain = [task("high", 1024, { id: "h" }), task("medium", 2048, { id: "m" }), task("low", 3072, { id: "l" })];
check("four new Mediums on one day come out in the order they were said, between High and Low",
  afterBatch(plain, [arrive("a", "medium"), arrive("b", "medium"), arrive("c", "medium"), arrive("d", "medium")]),
  ["h", "m", "a", "b", "c", "d", "l"]);
{
  const { displayOrders } = placeManyByPriority(plain, [arrive("a", "medium"), arrive("b", "medium"), arrive("c", "medium")]);
  check("no two arrivals on a day share an order (they all took one number before)",
    new Set(displayOrders.values()).size, 3);
}
check("a Critical said after two Lows still goes to the top",
  afterBatch(plain, [arrive("a", "low"), arrive("b", "low"), arrive("c", "critical")]),
  ["c", "h", "m", "l", "a", "b"]);
check("each priority in a mixed batch lands in its own band",
  afterBatch(plain, [arrive("a", "low"), arrive("b", "high"), arrive("c", "medium"), arrive("d", "critical")]),
  ["d", "h", "b", "m", "c", "l", "a"]);
check("arrivals on other days leave this day alone",
  afterBatch(plain, [arrive("x", "critical", "2026-09-30"), arrive("y", "high", null)]),
  ["h", "m", "l"]);
{
  /* No room between High and Medium: the day is renumbered, and only tasks
     that were already there come back to be written. */
  const tight = [task("high", 1024, { id: "h" }), task("medium", 1025, { id: "m" })];
  const { renumber } = placeManyByPriority(tight, [arrive("a", "high"), arrive("b", "high")]);
  check("a batch that has to renumber writes only tasks that were already there",
    renumber.every((r) => r.id === "h" || r.id === "m"), true);
  check("and still lands in order",
    afterBatch(tight, [arrive("a", "high"), arrive("b", "high")]), ["h", "a", "b", "m"]);
}
check("an empty batch moves nothing",
  placeManyByPriority(plain, []).renumber, []);

if (failures.length > 0) {
  console.error(`\n  ${failures.length} failed, ${passed} passed\n`);
  console.error(failures.join("\n\n"));
  process.exit(1);
}
console.log(`\n  ${passed} passed, 0 failed\n`);
