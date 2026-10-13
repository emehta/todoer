"use client";

import { useEffect, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { Extension, wrappingInputRule } from "@tiptap/core";
import { Document } from "@tiptap/extension-document";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Text } from "@tiptap/extension-text";
import { BulletList, ListItem, ListKeymap, OrderedList } from "@tiptap/extension-list";
import { Placeholder, UndoRedo } from "@tiptap/extensions";
import { Fragment, Slice } from "@tiptap/pm/model";
import { descriptionToDoc, docToDescription, type DescriptionNode } from "@/lib/description-lists";
import { DescriptionBox, type DescriptionFieldProps } from "./DescriptionField";
import styles from "./DescriptionEditor.module.css";

/*
 * "- ", "* " and "+ " start a bullet, as in Notes, and so does "• ", the
 * mark the field shows and WhatsApp copies out.
 */
const Bullets = BulletList.extend({
  addInputRules() {
    return [wrappingInputRule({ find: /^\s*([-+*•])\s$/, type: this.type })];
  },
});

/*
 * Tab inside a list is the list's, as in Notes: it nests the item when it
 * can and otherwise does nothing, rather than jumping to the date field
 * from the first item of a list. Outside a list it moves on as before.
 */
const TabStaysInLists = Extension.create({
  name: "tabStaysInLists",
  priority: 50,
  addKeyboardShortcuts() {
    return {
      Tab: () => this.editor.isActive("listItem"),
      "Shift-Tab": () => this.editor.isActive("listItem"),
    };
  },
});

/*
 * Backspace at the start of an item takes its bullet or number away, as in
 * Notes: a nested item comes out a level, a top one becomes a line of text
 * keeping what was written. Ahead of TipTap's own Backspace, which on a
 * bullet just made from "- " put the "- " back as text instead. Cmd+Z still
 * undoes the bullet.
 */
const BackspaceLeavesLists = Extension.create({
  name: "backspaceLeavesLists",
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      Backspace: () => {
        const { selection } = this.editor.state;
        const { $from } = selection;
        if (!selection.empty || $from.parentOffset !== 0 || $from.depth < 2) return false;
        if ($from.node(-1).type.name !== "listItem" || $from.index(-1) !== 0) return false;
        return this.editor.commands.liftListItem("listItem");
      },
    };
  },
});

/*
 * The card's own keys, given back to it. ProseMirror marks every Enter and
 * Escape as handled whether or not it does anything with them, and the card
 * leaves a handled key alone, so Cmd+Enter in the description did not save
 * and Escape did not close the card, as both do from the text box.
 */
const SUBMIT_EVENT = "description-submit";
const ESCAPE_EVENT = "description-escape";

const CardKeys = Extension.create({
  name: "cardKeys",
  priority: 1000,
  addKeyboardShortcuts() {
    const send = (type: string) => {
      /* Up to the field's box, which the component listens on. */
      this.editor.view.dom.dispatchEvent(new CustomEvent(type, { bubbles: true }));
      return true;
    };
    return {
      "Mod-Enter": () => send(SUBMIT_EVENT),
      Escape: () => send(ESCAPE_EVENT),
    };
  },
});

/* A paste with more than one line, or a list mark, is read as lines. */
const LIST_LIKE = /\n|^\s*(?:[-*+•◦▪‣·]|\d{1,9}[.)])\s/;

/**
 * The description field on a task card: lists as Notes writes them.
 *
 * "- " or "* " starts a bullet and "1. " a numbered list; Enter adds the
 * next item, and Enter or Backspace on an empty one leaves the list; Tab
 * nests an item under the one above and Shift+Tab brings it back out; Cmd+Z
 * undoes. A long line wraps in under its own text. Tab outside a list, or on
 * a first item that has nothing to nest under, moves on to the next field as
 * it did in the text box.
 *
 * What it holds is the description's plain lines (lib/description-lists),
 * so the database, search, the row and the day's Copy read it as before. It
 * writes only once something is typed, so opening a task and saving it
 * leaves its description exactly as it was.
 *
 * Loaded with the card rather than the page: the editor is most of a
 * hundred kilobytes that a visit to the list does not need.
 */
export default function DescriptionEditor({ id, value, onChange, onSubmit, onEscape, placeholder, icon, autoFocus = false }: DescriptionFieldProps) {
  const editor = useEditor({
    /* Only ever on the client: the card is portalled, after mount. */
    immediatelyRender: true,
    autofocus: autoFocus ? "end" : false,
    extensions: [
      Document,
      Paragraph,
      Text,
      Bullets,
      OrderedList,
      ListItem,
      ListKeymap,
      BackspaceLeavesLists,
      TabStaysInLists,
      CardKeys,
      UndoRedo,
      Placeholder.configure({ placeholder }),
    ],
    content: descriptionToDoc(value),
    editorProps: {
      attributes: {
        id,
        class: `${styles.editor} ${styles.lists}`,
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": "Description",
      },
      /*
       * Plain text pasted in, a list copied from WhatsApp or a note, comes
       * in as the list it was rather than as lines with dashes on them.
       */
      clipboardTextParser(text, _context, _plain, view) {
        const { schema } = view.state;
        if (!LIST_LIKE.test(text)) return text ? new Slice(Fragment.from(schema.text(text)), 0, 0) : Slice.empty;
        return Slice.maxOpen(schema.nodeFromJSON(descriptionToDoc(text)).content);
      },
      /* And what is copied out of it is the same lines it is stored as. */
      clipboardTextSerializer(slice) {
        return docToDescription({ type: "doc", content: slice.content.toJSON() as DescriptionNode[] });
      },
    },
  });

  /*
   * The editor is made once; these follow the card's latest handlers. Edits
   * are written only as they happen, so a description opened and saved
   * untouched is saved exactly as it was. The keys are heard on the box,
   * which exists from the first render; the editor's own element is only
   * there once it has mounted, and reading it before then throws.
   */
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = box.current;
    if (!editor || !element) return;
    const update = () => onChange(docToDescription(editor.getJSON() as DescriptionNode));
    const submit = () => onSubmit?.();
    const escape = () => onEscape?.();
    editor.on("update", update);
    element.addEventListener(SUBMIT_EVENT, submit);
    element.addEventListener(ESCAPE_EVENT, escape);
    return () => {
      editor.off("update", update);
      element.removeEventListener(SUBMIT_EVENT, submit);
      element.removeEventListener(ESCAPE_EVENT, escape);
    };
  }, [editor, onChange, onSubmit, onEscape]);

  return (
    <DescriptionBox
      boxRef={box}
      icon={icon}
      /* A press on the box's edge, outside the text, puts the caret at the end. */
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget || !editor) return;
        event.preventDefault();
        editor.commands.focus("end");
      }}
    >
      <EditorContent editor={editor} className={styles.wrap} />
    </DescriptionBox>
  );
}
