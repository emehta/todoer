/**
 * What an edit to a task changed: the fields the card writes, and whether
 * leaving the card would throw anything away. No framework:
 * `npm test -- task-changes`.
 */

import { goalChanges, taskChanges } from "@/lib/task-changes";

const failures = [];
let passed = 0;

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) { passed++; return; }
  failures.push(`  ${name}\n      got ${a}\n     want ${b}`);
}

/* A task as the card opens it, the way the database hands it over. */
const opened = {
  title: "Call the bank",
  description: "- ask about the card\n- the new address",
  due_date: "2026-10-08",
  due_time: "09:00:00",
  priority: "medium",
  category_id: "goal-personal",
};

/* The card's own fields as a save builds them: trimmed, an empty
   description as none, a time picked to the minute. */
const card = (edits = {}) => ({ ...opened, ...edits });

check("nothing touched, nothing written", taskChanges(opened, card()), {});

check("spaces around the title are not a change",
  taskChanges({ ...opened, title: "Call the bank " }, card()), {});
check("spaces around the description are not a change",
  taskChanges({ ...opened, description: `${opened.description}\n` }, card()), {});
check("an empty description and none are the same",
  taskChanges({ ...opened, description: "" }, card({ description: null })), {});
check("a time with and without its seconds is the same time",
  taskChanges(opened, card({ due_time: "09:00" })), {});

/* Each field alone, so a change to one never writes another. */
check("the title alone", taskChanges(opened, card({ title: "Call the bank today" })), { title: "Call the bank today" });
check("the description alone", taskChanges(opened, card({ description: "- ask about the card" })), { description: "- ask about the card" });
check("the day alone", taskChanges(opened, card({ due_date: "2026-10-09" })), { due_date: "2026-10-09" });
check("the time alone", taskChanges(opened, card({ due_time: "10:30" })), { due_time: "10:30" });
check("the priority alone", taskChanges(opened, card({ priority: "high" })), { priority: "high" });
check("the goal alone", taskChanges(opened, card({ category_id: "goal-website" })), { category_id: "goal-website" });

/* Clearing is a change, written as none. */
check("a description cleared", taskChanges(opened, card({ description: null })), { description: null });
check("a day cleared, and its time with it",
  taskChanges(opened, card({ due_date: null, due_time: null })), { due_date: null, due_time: null });
check("a goal taken away", taskChanges(opened, card({ category_id: null })), { category_id: null });
check("a time added to a task that had none",
  taskChanges({ ...opened, due_time: null }, card({ due_time: "18:15" })), { due_time: "18:15" });

/*
 * The owner's case: the laptop's card opened in the morning, the phone has
 * since rewritten the description, and the laptop changes only the priority.
 * Measured against what the card opened with, the save is the priority and
 * nothing else, so the phone's description stands.
 */
check("only the priority leaves a stale tab, not its old description",
  taskChanges(opened, card({ priority: "critical" })), { priority: "critical" });

check("several fields at once, each carried as the card has it",
  taskChanges(opened, card({ title: "Call the bank", due_date: "2026-10-10", priority: "low" })),
  { due_date: "2026-10-10", priority: "low" });

/* A new task's card, measured against the blank card it opened as. */
const blank = { title: "", description: "", due_date: "2026-10-07", due_time: null, priority: "medium", category_id: "goal-personal" };
check("a blank new card untouched is nothing to lose", taskChanges(blank, { ...blank, description: null }), {});
check("a title typed on a new card is", Object.keys(taskChanges(blank, { ...blank, title: "Buy a lamp" })), ["title"]);
check("spaces alone on a new card are not", taskChanges(blank, { ...blank, title: "   " }), {});

/* A goal's card, the same question: only what it changed is written. */
const goal = { name: "Gym", color: "#22C55E", description: "Three times a week", deadline: "2026-12-31", goal_type: "long-term" };
const goalCard = (changes = {}) => ({ name: "Gym", color: "#22c55e", description: "Three times a week", deadline: "2026-12-31", goal_type: "long-term", ...changes });
check("a goal's card untouched writes nothing, the colour's case included", goalChanges(goal, goalCard()), {});
check("a goal renamed writes the name alone", goalChanges(goal, goalCard({ name: "Gym and swim" })), { name: "Gym and swim" });
check("a stale tab recolouring a goal leaves the phone's description",
  goalChanges(goal, goalCard({ color: "#3b82f6" })), { color: "#3b82f6" });
check("a deadline and a term cleared are written as none",
  goalChanges(goal, goalCard({ deadline: null, goal_type: null })), { deadline: null, goal_type: null });
check("an empty description against none is no change",
  goalChanges({ ...goal, description: null }, goalCard({ description: "" })), {});

if (failures.length > 0) {
  console.error(`\n  ${failures.length} failed, ${passed} passed\n`);
  console.error(failures.join("\n\n"));
  process.exit(1);
}
console.log(`\n  ${passed} passed, 0 failed\n`);
