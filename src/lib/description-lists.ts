/**
 * A task's description as lists: the way the card's editor writes it, and
 * the way the card, the row, search and the day's Copy read it.
 *
 * Stored as plain lines, so nothing that reads a description had to change
 * shape: "- " starts a bullet, "1. " a numbered item, a line indented past
 * the item above it sits under that item, and any other line is a line of
 * text. That is how the owner typed lists before there was an editor, and
 * how a list pasted from WhatsApp ("•⁠  ⁠item") or Notes arrives, so every
 * description written before the editor opens in it as the list it meant.
 *
 * Pure, and tested by scripts/description-lists.test.mjs.
 */

export interface DescriptionParagraph {
  kind: "paragraph";
  text: string;
}

export interface DescriptionList {
  kind: "list";
  ordered: boolean;
  /** The first item's number; the rest follow it. */
  start: number;
  items: DescriptionItem[];
}

export type DescriptionBlock = DescriptionParagraph | DescriptionList;

export interface DescriptionItem {
  text: string;
  /** Lists nested under the item, and any further lines of its own. */
  children: DescriptionBlock[];
}

/*
 * Word joiners and zero-width spaces: WhatsApp writes "•⁠  ⁠" round each
 * item of a list copied out of it, and they would otherwise sit invisibly
 * at the start of the text.
 */
const INVISIBLE = /[​-‍⁠﻿]/g;
const BULLET = /^[-*+•◦▪‣·](?:\s+(.*))?$/;
const NUMBERED = /^(\d{1,9})[.)](?:\s+(.*))?$/;
const TAB_WIDTH = 4;

function indentOf(line: string): number {
  let width = 0;
  for (const char of line) {
    if (char === "\t") width += TAB_WIDTH;
    else if (char === " " || char === " ") width += 1;
    else break;
  }
  return width;
}

/** A bullet's text with any second marker gone: "• - four" is one bullet, "four". */
function bulletText(text: string): string {
  let rest = text;
  for (let match = BULLET.exec(rest); match && match[1] !== undefined; match = BULLET.exec(rest)) rest = match[1];
  return rest.trim();
}

function marker(content: string): { ordered: boolean; number: number; text: string } | null {
  const bullet = BULLET.exec(content);
  if (bullet) return { ordered: false, number: 1, text: bulletText(bullet[1] ?? "") };
  const numbered = NUMBERED.exec(content);
  if (numbered) return { ordered: true, number: Number(numbered[1]), text: (numbered[2] ?? "").trim() };
  return null;
}

/**
 * The description's lines as paragraphs and lists. A blank line ends any
 * list and is kept as a blank paragraph, as it is in Notes. A list line
 * indented past the open item nests under it; one level with it continues
 * that list; a line indented past an item with no marker of its own is a
 * further line of that item.
 */
export function parseDescription(text: string | null | undefined): DescriptionBlock[] {
  const blocks: DescriptionBlock[] = [];
  if (!text) return blocks;

  /* The open lists, outermost first, each with the indent of its markers. */
  let open: { indent: number; list: DescriptionList }[] = [];
  const lastItem = (list: DescriptionList) => list.items[list.items.length - 1];

  for (const line of text.replace(INVISIBLE, "").split(/\r\n|\r|\n/)) {
    const content = line.trim();
    if (!content) {
      open = [];
      blocks.push({ kind: "paragraph", text: "" });
      continue;
    }

    const indent = indentOf(line);
    const found = marker(content);

    if (!found) {
      while (open.length > 0 && indent <= open[open.length - 1].indent) open.pop();
      const top = open[open.length - 1];
      if (top) lastItem(top.list).children.push({ kind: "paragraph", text: content });
      else blocks.push({ kind: "paragraph", text: content });
      continue;
    }

    while (open.length > 0 && indent < open[open.length - 1].indent) open.pop();
    let top = open[open.length - 1];
    /* A numbered item where bullets were, or the other way round, at the
       same depth: a new list beside the old one, not more of it. */
    if (top && top.indent === indent && top.list.ordered !== found.ordered) {
      open.pop();
      top = open[open.length - 1];
    }
    if (top && top.indent === indent) {
      top.list.items.push({ text: found.text, children: [] });
      continue;
    }

    const list: DescriptionList = {
      kind: "list",
      ordered: found.ordered,
      start: found.ordered ? found.number : 1,
      items: [{ text: found.text, children: [] }],
    };
    if (top) lastItem(top.list).children.push(list);
    else blocks.push(list);
    open.push({ indent, list });
  }

  return blocks;
}

/**
 * Back to lines: "- " for a bullet, "1. " counting on from the list's start
 * for a number, and each nested list or further line indented to the text
 * of the item it belongs to. A line's own leading spaces are not kept: they
 * would read back as a nesting that was never there. An empty line inside an
 * item is not written either, since a blank line ends a list.
 */
export function formatDescription(blocks: DescriptionBlock[]): string {
  const lines: string[] = [];

  const writeBlocks = (list: DescriptionBlock[], indent: string, insideItem: boolean) => {
    for (const block of list) {
      if (block.kind === "list") {
        writeList(block, indent);
        continue;
      }
      const text = block.text.trim();
      if (text || !insideItem) lines.push(text ? `${indent}${text}` : "");
    }
  };

  const writeList = (list: DescriptionList, indent: string) => {
    list.items.forEach((item, index) => {
      const mark = list.ordered ? `${list.start + index}. ` : "- ";
      lines.push(`${indent}${mark}${item.text.trim()}`);
      writeBlocks(item.children, indent + " ".repeat(mark.length), true);
    });
  };

  writeBlocks(blocks, "", false);
  return lines.join("\n");
}

/* ─── The editor's document ─────────────────────────────────────────────── */

/** The JSON a ProseMirror document is written as, as far as this file reads it. */
export interface DescriptionNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: DescriptionNode[];
  text?: string;
}

const paragraphNode = (text: string): DescriptionNode =>
  text ? { type: "paragraph", content: [{ type: "text", text }] } : { type: "paragraph" };

function blockNode(block: DescriptionBlock): DescriptionNode {
  if (block.kind === "paragraph") return paragraphNode(block.text);
  return {
    type: block.ordered ? "orderedList" : "bulletList",
    ...(block.ordered ? { attrs: { start: block.start } } : {}),
    content: block.items.map((item) => ({
      type: "listItem",
      content: [paragraphNode(item.text), ...item.children.map(blockNode)],
    })),
  };
}

/** A description as the editor's document. Empty, it is one empty line to type on. */
export function descriptionToDoc(text: string | null | undefined): DescriptionNode {
  const blocks = parseDescription(text);
  return { type: "doc", content: blocks.length > 0 ? blocks.map(blockNode) : [paragraphNode("")] };
}

function textOf(node: DescriptionNode): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return " ";
  return (node.content ?? []).map(textOf).join("");
}

function nodeBlocks(nodes: DescriptionNode[]): DescriptionBlock[] {
  return nodes.map((node): DescriptionBlock => {
    if (node.type === "bulletList" || node.type === "orderedList") {
      const start = Number(node.attrs?.start);
      return {
        kind: "list",
        ordered: node.type === "orderedList",
        start: Number.isInteger(start) && start >= 0 ? start : 1,
        items: (node.content ?? []).map(itemOf),
      };
    }
    return { kind: "paragraph", text: textOf(node) };
  });
}

function itemOf(node: DescriptionNode): DescriptionItem {
  const [first, ...rest] = node.content ?? [];
  if (first && first.type === "paragraph") return { text: textOf(first), children: nodeBlocks(rest) };
  return { text: "", children: nodeBlocks(node.content ?? []) };
}

/** The editor's document as description lines, with no blank line at either end. */
export function docToDescription(doc: DescriptionNode): string {
  return formatDescription(nodeBlocks(doc.content ?? [])).replace(/^\n+|\s+$/g, "");
}

/* ─── What the copy and the row read ────────────────────────────────────── */

/** One line of a description as an outline: a line of text, a bullet or a numbered item. */
export interface OutlineItem {
  kind: "line" | "bullet" | "number";
  text: string;
  /** The item's number, for a numbered one. */
  number: number | null;
  children: OutlineItem[];
}

function outlineOf(blocks: DescriptionBlock[]): OutlineItem[] {
  const out: OutlineItem[] = [];
  for (const block of blocks) {
    if (block.kind === "paragraph") {
      if (block.text.trim()) out.push({ kind: "line", text: block.text.trim(), number: null, children: [] });
      continue;
    }
    block.items.forEach((item, index) => {
      const children = outlineOf(item.children);
      const text = item.text.trim();
      /* An empty item says nothing; what is under it moves up to its place. */
      if (!text) {
        out.push(...children);
        return;
      }
      out.push({
        kind: block.ordered ? "number" : "bullet",
        text,
        number: block.ordered ? block.start + index : null,
        children,
      });
    });
  }
  return out;
}

/**
 * The description as an outline with nothing empty in it: every line of
 * text, bullet and numbered item, each with what is nested under it. Blank
 * lines go, and an empty item gives its place to what is under it.
 */
export function descriptionOutline(text: string | null | undefined): OutlineItem[] {
  return outlineOf(parseDescription(text));
}

/**
 * The description on one line, for the task row: a line of text as it is, a
 * bullet as "• ", a number as "1. ", each after the last. The row used to
 * show the raw text, so every list read "- one - two".
 */
export function descriptionPreview(text: string | null | undefined): string {
  const parts: string[] = [];
  const walk = (items: OutlineItem[]) => {
    for (const item of items) {
      parts.push(item.kind === "bullet" ? `• ${item.text}` : item.kind === "number" ? `${item.number}. ${item.text}` : item.text);
      walk(item.children);
    }
  };
  walk(descriptionOutline(text));
  return parts.join(" ");
}
