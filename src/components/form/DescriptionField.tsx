"use client";

import type { ReactNode, Ref } from "react";
import { parseDescription, type DescriptionBlock } from "@/lib/description-lists";
import { TextAreaField } from "./fields";
import formStyles from "./form.module.css";
import styles from "./DescriptionEditor.module.css";

/** What the description field takes, whichever of its three forms draws it. */
export interface DescriptionFieldProps {
  id: string;
  value: string;
  onChange: (next: string) => void;
  /** Cmd+Enter: the card's save. */
  onSubmit?: () => void;
  /** Escape: the card's close. */
  onEscape?: () => void;
  placeholder: string;
  icon?: ReactNode;
  /** Takes the caret at the end as it appears. */
  autoFocus?: boolean;
}

/** The description's box on the card: the text box's own border, size and icon. */
export function DescriptionBox({ icon, children, onMouseDown, boxRef }: {
  icon?: ReactNode;
  children: ReactNode;
  onMouseDown?: (event: React.MouseEvent<HTMLDivElement>) => void;
  boxRef?: Ref<HTMLDivElement>;
}) {
  return (
    <div ref={boxRef} className={`${formStyles.field} ${formStyles.fieldGrow}`} onMouseDown={onMouseDown}>
      {icon && <span style={{ display: "flex", marginTop: 3, color: "var(--c-text-3)", flexShrink: 0 }}>{icon}</span>}
      {children}
    </div>
  );
}

/* Lists drawn as the editor draws them: an item's text in a <p>, as ProseMirror writes it. */
export function renderDescriptionBlocks(blocks: DescriptionBlock[]): ReactNode[] {
  return blocks.map((block, index) => {
    if (block.kind === "paragraph") return <p key={index}>{block.text || <br />}</p>;
    const items = block.items.map((item, itemIndex) => (
      <li key={itemIndex}>
        <p>{item.text || <br />}</p>
        {renderDescriptionBlocks(item.children)}
      </li>
    ));
    return block.ordered
      ? <ol key={index} start={block.start === 1 ? undefined : block.start}>{items}</ol>
      : <ul key={index}>{items}</ul>;
  });
}

/**
 * The field as it looks while the editor is on its way: the same box and
 * the same lists, so the card does not flicker from text into bullets when
 * it arrives a moment later.
 */
export function DescriptionFieldLoading({ value, placeholder, icon }: DescriptionFieldProps) {
  const blocks = parseDescription(value);
  return (
    <DescriptionBox icon={icon}>
      <div className={styles.wrap} aria-busy="true">
        <div className={`${styles.editor} ${styles.lists}`}>
          {blocks.length > 0
            ? renderDescriptionBlocks(blocks)
            : <p style={{ color: "var(--c-text-4)" }}>{placeholder}</p>}
        </div>
      </div>
    </DescriptionBox>
  );
}

/**
 * The text box the description used to be, for when the editor cannot be
 * loaded (offline, or a deploy that replaced its chunk): the lines can
 * still be read and changed, only not drawn as lists while typing.
 */
export function DescriptionTextarea({ id, value, onChange, placeholder, icon, autoFocus }: DescriptionFieldProps) {
  return (
    <TextAreaField
      id={id}
      grow
      icon={icon}
      placeholder={placeholder}
      value={value}
      autoFocus={autoFocus}
      onChange={(event) => onChange(event.target.value)}
      rows={5}
    />
  );
}

/** Starts fetching the editor before a card asks for it. */
export function preloadDescriptionEditor() {
  void import("./DescriptionEditor").catch(() => undefined);
}
