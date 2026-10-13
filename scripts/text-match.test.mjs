/**
 * Cases for the one rule every in-page search follows, and the marks it puts
 * on the rows it keeps. No framework: `npm run test:text-match`.
 *
 * A search that drops the row you wanted looks exactly like a search that
 * found nothing, and a highlight a character off looks like a rendering
 * glitch rather than a bug, so both are pinned here.
 */

import {
  excerptAround,
  foldText,
  highlightSegments,
  matchRanges,
  matchesWords,
  searchWords,
} from "@/lib/text-match";

const failures = [];
let passed = 0;

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) { passed++; return; }
  failures.push(`  ${name}\n      got ${a}\n     want ${b}`);
}

/** The segments back as one string, with the matched pieces in brackets. */
function marked(text, query) {
  return highlightSegments(text, searchWords(query)).map((s) => (s.match ? `[${s.text}]` : s.text)).join("");
}

/* ── folding ───────────────────────────────────────────────────────────── */

check("lower case", foldText("Reel EDIT"), "reel edit");
check("accents off", foldText("Café crème brûlée"), "cafe creme brulee");
check("curly apostrophes read as straight ones", foldText("Don’t"), "don't");
check("curly double quotes too", foldText("“Hook”"), "\"hook\"");

/* ── the query ─────────────────────────────────────────────────────────── */

check("a blank query has no words", searchWords("   "), []);
check("words split on any run of space", searchWords("  reel \t edit\n"), ["reel", "edit"]);
check("a word typed twice is one word", searchWords("reel Reel"), ["reel"]);
check("the query is folded like the text", searchWords("CAFÉ"), ["cafe"]);

/* ── matching ──────────────────────────────────────────────────────────── */

const reelEdit = ["Reel edit", "Cut the intro down to five seconds"];

check("no words matches everything", matchesWords([], reelEdit), true);
check("a word in the title", matchesWords(searchWords("reel"), reelEdit), true);
check("a word in the description", matchesWords(searchWords("intro"), reelEdit), true);
check("part of a word", matchesWords(searchWords("sec"), reelEdit), true);
check("the words in any order", matchesWords(searchWords("edit reel"), reelEdit), true);
check("one word from each field", matchesWords(searchWords("reel seconds"), reelEdit), true);
check("every word must be found", matchesWords(searchWords("reel podcast"), reelEdit), false);
check("case and accents ignored", matchesWords(searchWords("RÉEL"), reelEdit), true);
check("an accented record found by a plain query", matchesWords(searchWords("cafe"), ["Café opening"]), true);
check("a curly apostrophe found by a straight one", matchesWords(searchWords("don't"), ["Don’t post at 9"]), true);
check("absent fields are skipped", matchesWords(searchWords("reel"), [null, undefined, "", "Reel"]), true);
check("…and never match", matchesWords(searchWords("null"), [null, undefined]), false);
/* The old rule on Tasks: the whole query as one phrase. Everything it found
   is still found, since a phrase in the text has each of its words in it. */
check("a phrase is still found", matchesWords(searchWords("intro down"), reelEdit), true);

/* ── marks ─────────────────────────────────────────────────────────────── */

check("nothing to mark with no words", highlightSegments("Reel edit", []), [{ text: "Reel edit", match: false }]);
check("an empty text has no segments", highlightSegments("", ["reel"]), []);
check("the matched word marked in its own case", marked("Reel edit", "reel"), "[Reel] edit");
check("every occurrence marked", marked("reel after reel", "reel"), "[reel] after [reel]");
check("each word marked", marked("Reel edit", "edit reel"), "[Reel] [edit]");
check("part of a word", marked("Seconds", "cond"), "Se[cond]s");
check("overlapping words merge into one mark", marked("seasons", "seas sons"), "[seasons]");
check("touching words merge too", marked("filmed", "film ed"), "[filmed]");
check("an accented letter marked whole", marked("Café opening", "cafe"), "[Café] opening");
check("a decomposed accent kept inside its mark", marked("Café opening", "cafe"), "[Café] opening");
check("a curly apostrophe marked with its word", marked("Don’t post", "don't"), "[Don’t] post");
check("an emoji before the match does not shift it", marked("🎬 Reel edit", "edit"), "🎬 Reel [edit]");
check("the segments join back into the text exactly",
  highlightSegments("Ça va? Ça va.", ["ca"]).map((s) => s.text).join(""), "Ça va? Ça va.");
check("ranges are in the original's offsets",
  matchRanges("🎬 Reel", ["reel"]), [[3, 7]]);

/* ── excerpts ──────────────────────────────────────────────────────────── */

const long = "Open on the desk, then the long walk through the office before the reveal of the new camera rig";

check("whole when nothing matches", excerptAround(long, searchWords("podcast")), long);
check("whole when the match is near the start", excerptAround(long, searchWords("desk")), long);
check("from a word before a deep match",
  excerptAround(long, searchWords("camera")), "…office before the reveal of the new camera rig");
check("the excerpt still holds the match",
  excerptAround(long, searchWords("camera")).includes("camera"), true);
check("never starts mid-word",
  /^…\S+\s/.test(excerptAround(long, searchWords("rig"))), true);
check("a word longer than the lead starts at the match",
  excerptAround(`${"a".repeat(60)}${"b".repeat(40)} target`, ["target"], 10), "…target");

if (failures.length > 0) {
  console.error(`\n  ${failures.length} failed, ${passed} passed\n`);
  console.error(failures.join("\n\n"));
  process.exit(1);
}
console.log(`\n  ${passed} passed, 0 failed\n`);
