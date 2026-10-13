/**
 * A task's description as lists: the lines it is stored as, read into
 * paragraphs and lists and written back, the editor's document both ways,
 * and the outline the copy and the row read. No framework:
 * `npm test -- description-lists`.
 */

import {
  descriptionOutline,
  descriptionPreview,
  descriptionToDoc,
  docToDescription,
  formatDescription,
  parseDescription,
} from "@/lib/description-lists";

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

const normal = (text) => formatDescription(parseDescription(text));
const list = (ordered, start, items) => ({ kind: "list", ordered, start, items });
const item = (text, children = []) => ({ text, children });
const para = (text) => ({ kind: "paragraph", text });

/* ─── Lines into lists ─── */

check("bullets typed as \"- \" are one list",
  parseDescription("- Clear the old magazines\n- Add a small reading lamp\n- Hang the new print"),
  [list(false, 1, [item("Clear the old magazines"), item("Add a small reading lamp"), item("Hang the new print")])]);

check("a line indented past an item nests under it, as deep as it goes",
  parseDescription("- a\n  - b\n    - c\n- d"),
  [list(false, 1, [item("a", [list(false, 1, [item("b", [list(false, 1, [item("c")])])])]), item("d")])]);

check("four spaces or a tab nest the same as two",
  [parseDescription("- a\n    - b"), parseDescription("- a\n\t- b")],
  [
    [list(false, 1, [item("a", [list(false, 1, [item("b")])])])],
    [list(false, 1, [item("a", [list(false, 1, [item("b")])])])],
  ]);

check("numbers make a numbered list that starts where the first one does",
  [parseDescription("1. a\n2. b"), parseDescription("3. a\n4. b"), parseDescription("1) a\n2) b")],
  [[list(true, 1, [item("a"), item("b")])], [list(true, 3, [item("a"), item("b")])], [list(true, 1, [item("a"), item("b")])]]);

check("numbers under a bullet",
  parseDescription("- Plan\n  1. Book the room\n  2. Send the invite"),
  [list(false, 1, [item("Plan", [list(true, 1, [item("Book the room"), item("Send the invite")])])])]);

check("a number where bullets were, at the same depth, is a list of its own beside them",
  parseDescription("- a\n1. b"),
  [list(false, 1, [item("a")]), list(true, 1, [item("b")])]);

check("a blank line ends a list and is kept",
  parseDescription("- a\n\n- b"),
  [list(false, 1, [item("a")]), para(""), list(false, 1, [item("b")])]);

check("a line of text after a list ends it",
  parseDescription("- a\nThen this"),
  [list(false, 1, [item("a")]), para("Then this")]);

check("an indented line with no mark is a further line of the item above",
  parseDescription("- a\n  more about a\n- b"),
  [list(false, 1, [item("a", [para("more about a")]), item("b")])]);

check("a list pasted from WhatsApp, word joiners and all, is a list",
  parseDescription("Make list of items\n•⁠  ⁠Desk 63in x 30in - White\n•⁠  ⁠Reading Lamp"),
  [para("Make list of items"), list(false, 1, [item("Desk 63in x 30in - White"), item("Reading Lamp")])]);

check("stars, pluses and white bullets are bullets too, and a second mark goes",
  parseDescription("* one\n+ two\n◦ three\n• - four"),
  [list(false, 1, [item("one"), item("two"), item("three"), item("four")])]);

check("a dash or a number that is content stays text",
  parseDescription("-5 degrees\nDesk - White\n1.5 kg\n+1 555 0100"),
  [para("-5 degrees"), para("Desk - White"), para("1.5 kg"), para("+1 555 0100")]);

check("an empty item is an item, and Windows line endings split the same",
  parseDescription("- a\r\n-\r\n- b"),
  [list(false, 1, [item("a"), item(""), item("b")])]);

check("nothing, or only blank lines", [parseDescription(null), parseDescription(""), parseDescription("\n")], [[], [], [para(""), para("")]]);

/* ─── Lists back into lines ─── */

check("bullets, nesting under each item's text, numbers counted on from the start",
  formatDescription([list(false, 1, [item("a", [list(true, 3, [item("x"), item("y", [list(false, 1, [item("deep")])])])]), item("b")])]),
  "- a\n  3. x\n  4. y\n     - deep\n- b");

check("numbers are renumbered, and nesting by four spaces or a tab is written as two",
  [normal("1. a\n1. b\n7. c"), normal("- a\n    - b"), normal("- a\n\t- b")],
  ["1. a\n2. b\n3. c", "- a\n  - b", "- a\n  - b"]);

check("a WhatsApp list is written as bullets",
  normal("Make list of items\n•⁠  ⁠Desk\n•⁠  ⁠Reading Lamp"),
  "Make list of items\n- Desk\n- Reading Lamp");

check("a blank line between two lists, and the further line of an item, come back as they were",
  [normal("- a\n\n- b"), normal("- a\n  more about a\n- b")],
  ["- a\n\n- b", "- a\n  more about a\n- b"]);

check("an empty line inside an item is not written, since it would end the list",
  formatDescription([list(false, 1, [item("a", [para(""), para("more")])])]),
  "- a\n  more");

/* ─── Descriptions shaped like real ones ───
 * Each keeps a shape a real description had: WhatsApp's bullets, a trailing
 * space, an apostrophe year, arrows, ampersands and slashes, names one to a
 * line, a blank line inside prose. The words are made up. */

const real = [
  "- Tidy the garage\n- Sort the tools by size\n- Donate the old bike",
  "- Find the insurance papers\n- Scan them and file them by year\n- Renew the policy for Sept '26",
  "- Booking form not saving\n- Books on the shelf need to be sorted Short->Long\n- Books due back soon should show first in the weekly view.",
  "- Garden plan \n- Rethink the vegetable beds\n- rethink the compost corner",
  "Make list of things to buy for the new flat\n•⁠  ⁠Desk 63in x 30in - White\n•⁠  ⁠Reading lamp\n•⁠  ⁠Glass/ Ceramic (blue/ green) vase",
  "Alex\nSam\nJordan1\nJordan2",
  "Okay, so take your time. Do all of it properly. \n\nAlso - Then what I also want is a note on each of the rooms",
  "Cooking, Music & Art, Travel, Garden/Patio",
  "Pens + Paper",
  "- Why bother",
];

for (const text of real) {
  const once = normal(text);
  ok(`written once, it reads back the same: ${JSON.stringify(text.slice(0, 40))}`, normal(once) === once);
  const words = (value) => value.replace(/[⁠]/g, "").split(/\s+/).filter((word) => word && !/^[-*+•◦▪‣·]$/.test(word));
  ok(`no word is lost: ${JSON.stringify(text.slice(0, 40))}`, JSON.stringify(words(once)) === JSON.stringify(words(text)));
}

check("a plain description is untouched",
  [normal("Alex\nSam"), normal("Pens + Paper")],
  ["Alex\nSam", "Pens + Paper"]);

/* ─── The editor's document ─── */

check("a description as the editor's document",
  descriptionToDoc("Intro\n- a\n  1. x\n\n- b"),
  {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Intro" }] },
      { type: "bulletList", content: [
        { type: "listItem", content: [
          { type: "paragraph", content: [{ type: "text", text: "a" }] },
          { type: "orderedList", attrs: { start: 1 }, content: [
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }] },
          ] },
        ] },
      ] },
      { type: "paragraph" },
      { type: "bulletList", content: [
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "b" }] }] },
      ] },
    ],
  });

check("no description is one empty line to type on",
  [descriptionToDoc(null), descriptionToDoc("")],
  [{ type: "doc", content: [{ type: "paragraph" }] }, { type: "doc", content: [{ type: "paragraph" }] }]);

for (const text of [...real, "- a\n  - b\n    1. c\n- d", "1. a\n2. b\n\n4. c", "- a\n  more\n- b", "Intro\n\n- a"]) {
  ok(`the editor's document writes back what it read: ${JSON.stringify(text.slice(0, 30))}`,
    docToDescription(descriptionToDoc(text)) === normal(text).replace(/\s+$/, ""));
}

const typed = {
  type: "doc",
  content: [
    { type: "paragraph" },
    { type: "paragraph", content: [{ type: "text", text: "Intro" }, { type: "hardBreak" }, { type: "text", text: "line" }] },
    { type: "orderedList", attrs: { start: 1, type: null }, content: [
      { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "First" }] }, { type: "paragraph" }] },
      { type: "listItem", content: [
        { type: "paragraph", content: [{ type: "text", text: "Second" }] },
        { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "detail" }] }] }] },
      ] },
      { type: "listItem", content: [{ type: "paragraph" }] },
    ] },
    { type: "paragraph" },
  ],
};
check("what the editor holds after typing, as lines: no blank line at either end, an empty item's line kept",
  docToDescription(typed),
  "Intro line\n1. First\n2. Second\n   - detail\n3.");

/* ─── The outline the copy and the row read ─── */

check("an outline: lines, bullets and numbers, each with what is under it, blank lines gone",
  descriptionOutline("Intro\n\n- a\n  1. x\n  2. y\n- b"),
  [
    { kind: "line", text: "Intro", number: null, children: [] },
    { kind: "bullet", text: "a", number: null, children: [
      { kind: "number", text: "x", number: 1, children: [] },
      { kind: "number", text: "y", number: 2, children: [] },
    ] },
    { kind: "bullet", text: "b", number: null, children: [] },
  ]);

check("an empty item gives its place to what is under it",
  descriptionOutline("-\n  - under the empty one\n- b"),
  [
    { kind: "bullet", text: "under the empty one", number: null, children: [] },
    { kind: "bullet", text: "b", number: null, children: [] },
  ]);

check("the row's one line: bullets as dots, numbers as numbers, text as it is",
  [descriptionPreview("- Copying Completed tasks\n- Seeing historical tasks"), descriptionPreview("1. a\n2. b"), descriptionPreview("Pens + Paper"), descriptionPreview(null)],
  ["• Copying Completed tasks • Seeing historical tasks", "1. a 2. b", "Pens + Paper", ""]);

if (failures.length > 0) {
  console.error(`description-lists: ${failures.length} failed, ${passed} passed\n${failures.join("\n")}`);
  process.exit(1);
}
console.log(`description-lists: ${passed} passed`);
