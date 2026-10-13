"use client";

import { useImperativeHandle, useRef, type CSSProperties, type InputHTMLAttributes, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { MagnifyingGlass, X } from "@phosphor-icons/react";
import { usePhone } from "@/lib/use-viewport-width";
import { useSearchShortcut } from "@/lib/search-shortcut";
import styles from "./SearchField.module.css";

/**
 * The app's one search field: every list narrowed by typing uses it, at the
 * filter row's size, or at the large size where a page leads with search.
 *
 * What it does the same everywhere:
 * - Escape empties the field, and a second Escape leaves it.
 * - The ✕ empties it and keeps the caret in it, so typing carries on.
 * - "/" from anywhere on the page puts the caret in it, as on GitHub and
 *   YouTube, unless something else is being typed in or a dialog is open. The
 *   key is shown inside the empty field wherever there is a keyboard.
 *
 * What a page decides is how its list matches, which is `lib/text-match`
 * everywhere but Finance (searched in the database) and Home (ranked).
 */

export type SearchFieldSize = "md" | "lg";

/**
 * The field's height, for the controls that share its row: a filter row's
 * pickers are this tall, so the row lines up. Matches SearchField.module.css.
 */
export function searchFieldHeight(phone: boolean, size: SearchFieldSize = "md"): number {
  if (size === "lg") return 44;
  return phone ? 40 : 32;
}

/** What a page may hand the input beyond its value: Home's combobox wiring. */
type PassThrough = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type" | "placeholder" | "aria-label" | "className" | "style" | "size"
>;

export interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** What the field searches, for a screen reader: "Search tasks". */
  label: string;
  placeholder: string;
  /** "md" in a filter row (32px, 40 on a phone); "lg" where it is the page's main control. */
  size?: SearchFieldSize;
  /** Whether "/" reaches this field. Off for a second field on the same page. */
  shortcut?: boolean;
  /** A control inside the field, before the glass: what the search is scoped to. */
  leading?: ReactNode;
  /** Holds the focus look while a panel hangs off the field. */
  open?: boolean;
  /** Sizing in the row it sits in: flex, width. The look is the field's own. */
  style?: CSSProperties;
  ref?: Ref<HTMLInputElement>;
  inputProps?: PassThrough;
}

export default function SearchField({
  value,
  onChange,
  label,
  placeholder,
  size = "md",
  shortcut = true,
  leading,
  open = false,
  style,
  ref,
  inputProps,
}: SearchFieldProps) {
  const phone = usePhone();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const glassSize = size === "lg" ? 18 : 14;

  useSearchShortcut(inputRef, shortcut);

  /* The page's ref (Home moves the caret back after a clear) is this input. */
  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement, []);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    inputProps?.onKeyDown?.(event);
    if (event.defaultPrevented || event.key !== "Escape") return;
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
      data-size={size}
      data-phone={phone ? "true" : undefined}
      data-open={open ? "true" : undefined}
      /* A press anywhere on the field, the glass included, starts typing;
         one on a control inside it is that control's. */
      onMouseDown={(event) => {
        const target = event.target as HTMLElement;
        if (target === inputRef.current || target.closest("button, a, input, [role='listbox']")) return;
        event.preventDefault();
        inputRef.current?.focus();
      }}
      style={style}
    >
      {leading && (
        <>
          <span className={styles.leading}>{leading}</span>
          <span aria-hidden="true" className={styles.rule} />
        </>
      )}
      <MagnifyingGlass size={glassSize} aria-hidden="true" className={styles.glass} />
      <input
        {...inputProps}
        ref={inputRef}
        type="search"
        className={styles.input}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label={label}
        aria-keyshortcuts={shortcut ? "/" : undefined}
        autoComplete={inputProps?.autoComplete ?? "off"}
        spellCheck={inputProps?.spellCheck ?? false}
        enterKeyHint={inputProps?.enterKeyHint ?? "search"}
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
          <X size={size === "lg" ? 14 : 12} weight="bold" aria-hidden="true" />
        </button>
      ) : shortcut ? (
        <kbd aria-hidden="true" className={styles.hint}>/</kbd>
      ) : null}
    </div>
  );
}
