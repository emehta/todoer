"use client";

import { useRef, type KeyboardEvent } from "react";
import { MagnifyingGlass, X } from "@phosphor-icons/react";
import { usePhone } from "@/lib/use-viewport-width";
import { useSearchShortcut } from "@/lib/search-shortcut";
import styles from "./SearchField.module.css";

/**
 * The task list's search field, at the filter row's size.
 *
 * - Escape empties the field, and a second Escape leaves it.
 * - The ✕ empties it and keeps the caret in it, so typing carries on.
 * - "/" from anywhere on the page puts the caret in it, as on GitHub and
 *   YouTube, unless something else is being typed in or a dialog is open. The
 *   key is shown inside the empty field wherever there is a keyboard.
 *
 * How the list matches is `lib/text-match`.
 */

/**
 * The field's height, for the controls that share its row: the filter row's
 * pickers are this tall, so the row lines up. Matches SearchField.module.css.
 */
export function searchFieldHeight(phone: boolean): number {
  return phone ? 40 : 32;
}

export interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** What the field searches, for a screen reader: "Search tasks". */
  label: string;
  placeholder: string;
}

export default function SearchField({ value, onChange, label, placeholder }: SearchFieldProps) {
  const phone = usePhone();
  const inputRef = useRef<HTMLInputElement | null>(null);

  useSearchShortcut(inputRef);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Escape") return;
    /* Kept from a dialog or page underneath, which would read it as "close". */
    event.preventDefault();
    if (value) onChange("");
    else event.currentTarget.blur();
  }

  function clear() {
    onChange("");
    inputRef.current?.focus();
  }

  return (
    <div
      className={styles.field}
      data-phone={phone ? "true" : undefined}
      /* A press anywhere on the field, the glass included, starts typing;
         one on the ✕ is the ✕'s. */
      onMouseDown={(event) => {
        const target = event.target as HTMLElement;
        if (target === inputRef.current || target.closest("button")) return;
        event.preventDefault();
        inputRef.current?.focus();
      }}
    >
      <MagnifyingGlass size={14} aria-hidden="true" className={styles.glass} />
      <input
        ref={inputRef}
        type="search"
        className={styles.input}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label={label}
        aria-keyshortcuts="/"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
      />
      {value ? (
        <button
          type="button"
          className={styles.clear}
          aria-label="Clear search"
          /* Kept from taking focus, so the caret stays in the field. */
          onMouseDown={(event) => event.preventDefault()}
          onClick={clear}
        >
          <X size={12} weight="bold" aria-hidden="true" />
        </button>
      ) : (
        <kbd aria-hidden="true" className={styles.hint}>/</kbd>
      )}
    </div>
  );
}
