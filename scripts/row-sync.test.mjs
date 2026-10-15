/**
 * The order of a task row's saves, and which answers still speak for it
 * (lib/row-sync). What goes wrong here leaves no trace until a reload: a
 * tick on a task still being added that never reached the database, an
 * edit's answer putting back a tick made after it, a failed save undoing a
 * newer change. `npm test -- row-sync`.
 */

import { DELETED_ELSEWHERE, createRowSync, putBack, updateOutcome } from "@/lib/row-sync";

const failures = [];
let passed = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) { passed++; return; }
  failures.push(`  ${name}\n      got ${a}\n     want ${b}`);
}

/* A promise settled from outside, as a slow round trip is. */
function later() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/* ─── A save waits for its row's insert ─── */
{
  const rows = createRowSync();
  const log = [];
  const insert = later();
  const inserted = rows.insert(["a"], () => insert.promise, (answer, id) => answer[id] ?? id);
  const ticked = rows.queue(["a"], ([id]) => { log.push(`update ${id}`); return Promise.resolve("ticked"); });
  await tick();
  check("a tick on a row still being inserted waits for the insert", log, []);
  insert.resolve({});
  await inserted;
  check("and is sent once it has answered", await ticked, "ticked");
  check("to the row's own id", log, ["update a"]);
}

{
  const rows = createRowSync();
  const insert = later();
  void rows.insert(["a"], () => insert.promise, (answer, id) => answer[id] ?? id).catch(() => undefined);
  const deleted = rows.queue(["a"], ([id]) => Promise.resolve(id));
  insert.resolve({ a: "a-in-the-database" });
  check("a row the insert gave another id is saved under that id", await deleted, "a-in-the-database");
  check("and so is every save after it", await rows.queue(["a"], ([id]) => Promise.resolve(id)), "a-in-the-database");
}

{
  const rows = createRowSync();
  const insert = later();
  const inserted = rows.insert(["a", "b"], () => insert.promise, (_answer, id) => id).catch((error) => error.message);
  const edit = rows.queue(["b"], ([id]) => Promise.resolve(id));
  insert.reject(new Error("refused"));
  check("a failed insert still fails for the page to say", await inserted, "refused");
  check("and a save of a row it never made is told there is no row", await edit, null);
}

/* ─── A row's saves go in order ─── */
{
  const rows = createRowSync();
  const log = [];
  const first = later();
  const done = rows.queue(["a"], () => { log.push("done sent"); return first.promise.then(() => log.push("done answered")); });
  const undone = rows.queue(["a"], () => { log.push("undo sent"); return Promise.resolve(); });
  const other = rows.queue(["b"], () => { log.push("other row sent"); return Promise.resolve(); });
  await other;
  check("another row's save does not wait", log, ["done sent", "other row sent"]);
  first.resolve();
  await Promise.all([done, undone]);
  check("an undo is sent only once the tick it undoes has answered", log, ["done sent", "other row sent", "done answered", "undo sent"]);
}

{
  const rows = createRowSync();
  const log = [];
  const slow = later();
  const failed = rows.queue(["a"], () => slow.promise).catch(() => "failed");
  const next = rows.queue(["a", "b"], (ids) => { log.push(ids); return Promise.resolve(); });
  slow.reject(new Error("no network"));
  check("a failed save is reported", await failed, "failed");
  await next;
  check("and the next one still goes, after it, for every row it names", log, [["a", "b"]]);
}

/* ─── Versions ─── */
{
  const rows = createRowSync();
  const edit = rows.touch("a");
  check("an answer speaks for the row while nothing has changed it since", rows.current("a", edit), true);
  rows.touch("a");
  check("and not once it has been changed again", rows.current("a", edit), false);
  check("a row never touched is at the start", rows.current("b", 0), true);
}

/* ─── What an update says ─── */
check("rows back is saved", updateOutcome([{ id: "a" }], null), "saved");
check("no rows back is a task deleted elsewhere", [updateOutcome([], null), updateOutcome(null, null)], ["gone", "gone"]);
check("PGRST116 is too", updateOutcome(null, { code: "PGRST116", message: "0 rows" }), "gone");
check("any other error is a failure", updateOutcome(null, { code: "42501", message: "denied" }), "failed");
check("the words for it", DELETED_ELSEWHERE, "This task was deleted elsewhere.");

/* ─── Putting a failed save back ─── */
const row = { id: "a", title: "Call the bank", priority: "high", completed: false };
check("a failed save's fields go back",
  putBack(row, { priority: "high" }, { priority: "low" }), { ...row, priority: "low" });
check("but a field changed again since keeps its newer value",
  putBack({ ...row, priority: "critical" }, { priority: "high" }, { priority: "low" }), { ...row, priority: "critical" });
check("and fields the save never wrote are left alone",
  putBack({ ...row, completed: true }, { title: "Call the bank" }, { title: "Call bank" }), { ...row, completed: true, title: "Call bank" });

if (failures.length > 0) {
  console.error(`\n  ${failures.length} failed, ${passed} passed\n`);
  console.error(failures.join("\n\n"));
  process.exit(1);
}
console.log(`\n  ${passed} passed, 0 failed\n`);
