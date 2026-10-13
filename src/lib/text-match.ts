/**
 * How a search field narrows a list, and what it marks in the rows it keeps.
 *
 * One rule for every search in the app: every word typed must appear
 * somewhere in the record, in any order, ignoring case and accents, so
 * "edit reel" finds a task called "Reel edit".
 *
 * The marks come from the same folding as the match, so a highlight never
 * disagrees with the reason a row is on screen.
 *
 * Pure, and tested in `scripts/text-match.test.mjs`.
 */

/** A character's search form: lower case, accents off, curly quotes straight. */
function foldChar(char: string): string {
  return char
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, "\"");
}

/** Text in its search form: "Café’s" reads as "cafe's". */
export function foldText(text: string): string {
  let out = "";
  for (const char of text) out += foldChar(char);
  return out;
}

/** The words of a query, folded, each once. An empty or blank query has none. */
export function searchWords(query: string): string[] {
  const words = foldText(query).split(/\s+/).filter(Boolean);
  return [...new Set(words)];
}

/** True when every word is in at least one of the fields. No words matches everything. */
export function matchesWords(words: readonly string[], fields: readonly (string | null | undefined)[]): boolean {
  if (words.length === 0) return true;
  const folded = fields.filter((field): field is string => Boolean(field)).map(foldText);
  return words.every((word) => folded.some((field) => field.includes(word)));
}

export interface TextSegment {
  text: string;
  match: boolean;
}

/**
 * The folded text, with each of its characters' place in the original.
 *
 * Folding can change a character's length ("ﬁ" stays one, "İ" loses its dot),
 * so a match found in the folded text is mapped back through this rather than
 * assumed to sit at the same offsets.
 */
function foldWithMap(text: string): { folded: string; starts: number[]; ends: number[] } {
  let folded = "";
  const starts: number[] = [];
  const ends: number[] = [];
  let offset = 0;
  for (const char of text) {
    const piece = foldChar(char);
    /* A combining accent folds to nothing; it belongs to the letter before it,
       so a mark on that letter takes the accent with it. */
    if (piece.length === 0 && ends.length > 0) ends[ends.length - 1] = offset + char.length;
    for (let i = 0; i < piece.length; i++) {
      starts.push(offset);
      ends.push(offset + char.length);
    }
    folded += piece;
    offset += char.length;
  }
  return { folded, starts, ends };
}

/** Where the words occur in the text, as merged [start, end) ranges of the original. */
export function matchRanges(text: string, words: readonly string[]): [number, number][] {
  if (!text || words.length === 0) return [];
  const { folded, starts, ends } = foldWithMap(text);
  const ranges: [number, number][] = [];
  for (const word of words) {
    let from = 0;
    for (;;) {
      const at = folded.indexOf(word, from);
      if (at === -1) break;
      ranges.push([starts[at], ends[at + word.length - 1]]);
      from = at + word.length;
    }
  }
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: [number, number][] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([range[0], range[1]]);
  }
  return merged;
}

/** The text cut into plain and matched pieces, which join back into it exactly. */
export function highlightSegments(text: string, words: readonly string[]): TextSegment[] {
  const ranges = matchRanges(text, words);
  if (ranges.length === 0) return text ? [{ text, match: false }] : [];
  const segments: TextSegment[] = [];
  let at = 0;
  for (const [start, end] of ranges) {
    if (start > at) segments.push({ text: text.slice(at, start), match: false });
    segments.push({ text: text.slice(start, end), match: true });
    at = end;
  }
  if (at < text.length) segments.push({ text: text.slice(at), match: false });
  return segments;
}

/**
 * The text from a little before its first match, so a match deep in a long
 * description is on screen in a row that shows one or two lines of it.
 *
 * Starts at a word, never mid-word, with "…" where the start was cut; the text
 * whole when the first match is already near its start, or when nothing in it
 * matches.
 */
export function excerptAround(text: string, words: readonly string[], lead = 32): string {
  const ranges = matchRanges(text, words);
  if (ranges.length === 0) return text;
  const first = ranges[0][0];
  if (first <= lead) return text;
  /* The last word that starts at or before the lead, else the first one after
     it, else the match itself: a word longer than the lead starts at the match. */
  const before = text.lastIndexOf(" ", first - lead);
  const after = text.indexOf(" ", first - lead);
  const cut = before !== -1 ? before + 1 : after !== -1 && after < first ? after + 1 : first;
  return cut <= 0 ? text : `…${text.slice(cut)}`;
}
