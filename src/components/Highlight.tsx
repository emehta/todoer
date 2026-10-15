"use client";

import { createContext, Fragment, useContext, type ReactNode } from "react";
import { excerptAround, highlightSegments, searchWords } from "@/lib/text-match";

/**
 * The words a search typed, marked in the rows it kept.
 *
 * A list wraps itself in `HighlightScope` with the page's query, and a row
 * draws its title and description through `Highlight`. The row does not need
 * to be told about the search, so a row drawn outside a search is drawn
 * exactly as before.
 *
 * Marks are found with the same folding as the match (`lib/text-match`), so
 * "cafe" marks "Café" and a row never shows a match it was not kept for.
 */

const HighlightContext = createContext<readonly string[]>([]);

/* The search's mark, themed in every theme (--c-search-mark). */
const MARK: React.CSSProperties = {
  background: "var(--c-search-mark, rgba(47, 169, 127, 0.3))",
  color: "inherit",
  borderRadius: "var(--ui-radius-item)",
  /* Out by as much as it is padded, so marking a word never moves the line. */
  padding: "0 1px",
  margin: "0 -1px",
  boxDecorationBreak: "clone",
  WebkitBoxDecorationBreak: "clone",
};

export function HighlightScope({ query, children }: { query: string; children: ReactNode }) {
  return <HighlightContext value={searchWords(query)}>{children}</HighlightContext>;
}

/** The search's words where a row is drawn, folded; none outside a search. */
export function useSearchWords(): readonly string[] {
  return useContext(HighlightContext);
}

/**
 * The text with the search's words marked.
 *
 * `excerpt` starts a long text a little before its first match, for a row that
 * shows only a line or two of it: otherwise a match in the fourth line of a
 * description keeps the row on screen with no sign of why.
 */
export function Highlight({ text, excerpt = false }: { text: string; excerpt?: boolean }) {
  const words = useContext(HighlightContext);
  if (words.length === 0 || !text) return <>{text}</>;
  const shown = excerpt ? excerptAround(text, words) : text;
  return (
    <>
      {highlightSegments(shown, words).map((segment, index) => (
        <Fragment key={index}>
          {segment.match ? <mark style={MARK}>{segment.text}</mark> : segment.text}
        </Fragment>
      ))}
    </>
  );
}
