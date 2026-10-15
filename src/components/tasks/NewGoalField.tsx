"use client";

import type { ReactNode } from "react";
import { Plus } from "@phosphor-icons/react";
import type { Category } from "@/types/category";
import { DialogButton } from "@/components/form/Dialog";
import { TextField } from "@/components/form/fields";

/** The goal picker's last option, which turns the field into a name box. */
export const NEW_GOAL = "__new_goal__";

/* With a plus, so it reads as an action and not as a goal of that name. */
export const NEW_GOAL_OPTION = { value: NEW_GOAL, label: "New goal", icon: <Plus size={14} weight="bold" /> };

/** The goal called `name`: the one already so named, or one made for it. Answers its id. */
export async function goalNamed(
  name: string,
  categories: readonly Category[],
  create: (name: string) => Promise<Category>,
): Promise<string> {
  const existing = categories.find((goal) => goal.name.trim().toLowerCase() === name.toLowerCase());
  return existing ? existing.id : (await create(name)).id;
}

/** A line under a field saying what is wrong with it, at the size of a label. */
export function FieldAlert({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <span id={id} role="alert" style={{ color: "var(--c-danger)", fontSize: "var(--ui-type-label)" }}>
      {children}
    </span>
  );
}

/**
 * The goal picker's New goal, once chosen: a name box with Add and Cancel,
 * in place of the picker. Enter adds, Escape goes back to the picker. The
 * task card and Ramble's review share it; each makes the goal itself.
 */
export default function NewGoalField({
  id,
  name,
  busy,
  error,
  invalid,
  onChange,
  onAdd,
  onCancel,
}: {
  /** The goal field's id, which names the error line under the box. */
  id: string;
  name: string;
  busy: boolean;
  /** Why the goal could not be made, said under the box. */
  error: string;
  invalid?: boolean;
  onChange: (name: string) => void;
  onAdd: () => void;
  onCancel: () => void;
}) {
  const errorId = `${id}-error`;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <TextField
        autoFocus
        aria-label="New goal's name"
        aria-describedby={error ? errorId : undefined}
        placeholder="Goal name"
        value={name}
        invalid={Boolean(error) || invalid}
        readOnly={busy}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onCancel();
            return;
          }
          if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
          event.preventDefault();
          event.stopPropagation();
          onAdd();
        }}
      />
      <div style={{ display: "flex", gap: 6 }}>
        <DialogButton variant="secondary" busy={busy} disabled={busy || !name.trim()} onClick={onAdd}>
          {busy ? "Adding…" : "Add"}
        </DialogButton>
        <DialogButton variant="ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </DialogButton>
      </div>
      {error && <FieldAlert id={errorId}>{error}</FieldAlert>}
    </div>
  );
}
