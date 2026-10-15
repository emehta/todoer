"use client";

import { useState } from "react";
import { TextAlignLeft } from "@phosphor-icons/react";
import type { Category } from "@/types/category";
import { GOAL_COLORS, firstFreeGoalColor } from "@/types/category";
import { usePhone } from "@/lib/use-viewport-width";
import { DialogButton, DialogCard, DialogFooter } from "@/components/form/Dialog";
import {
  ChoiceChips,
  ColorSwatches,
  FieldGroup,
  FieldRow,
  FieldStack,
  TextAreaField,
  TextField,
} from "@/components/form/fields";
import DateField from "@/components/form/DateField";
import StatusBanner from "@/components/StatusBanner";
import { getErrorMessage } from "@/lib/error-utils";

export type GoalFormValues = {
  name: string;
  color: string;
  description: string | null;
  deadline: string | null;
  goal_type: "short-term" | "long-term" | null;
};

function asGoalType(value: string | null | undefined): "short-term" | "long-term" | null {
  return value === "long-term" || value === "short-term" ? value : null;
}

/**
 * A goal's details: name, description, deadline, whether it is short or long
 * term, and its colour. The same card edits a goal and creates one, and it
 * is the task card's kind of card (29 Sep 2026), so adding a goal looks like
 * adding a task.
 */
export default function GoalForm({
  category,
  categories,
  onSubmit,
  onClose,
}: {
  /** The goal to edit; absent for a new one. */
  category?: Category;
  /** Every goal, so a new one starts in a colour none of them has. */
  categories: readonly Category[];
  onSubmit: (values: GoalFormValues) => Promise<void>;
  onClose: () => void;
}) {
  const phone = usePhone();
  const [formName, setFormName] = useState(category?.name ?? "");
  const [formColor, setFormColor] = useState(() => category?.color ?? firstFreeGoalColor(categories));
  const [formDesc, setFormDesc] = useState(category?.description ?? "");
  const [formDeadline, setFormDeadline] = useState<string | null>(category?.deadline ?? null);
  /* Null for a goal with no type, which it keeps unless one is picked. */
  const [formType, setFormType] = useState<"short-term" | "long-term" | null>(asGoalType(category?.goal_type));
  const [nameMissing, setNameMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");

  async function submit() {
    if (busy) return;
    if (!formName.trim()) {
      setNameMissing(true);
      return;
    }
    setBusy(true);
    setSaveError("");
    try {
      await onSubmit({
        name: formName.trim(),
        color: formColor,
        description: formDesc.trim() || null,
        deadline: formDeadline || null,
        goal_type: formType,
      });
      onClose();
    } catch (error) {
      // Said in the card: the page's banner is behind the card's scrim.
      setSaveError(getErrorMessage(error, category ? "Could not save this goal. Try again." : "Could not add this goal. Try again."));
    } finally {
      setBusy(false);
    }
  }

  const heading = category ? "Edit goal" : "New goal";

  return (
    <DialogCard
      label={category ? `Edit ${category.name} goal` : "New goal"}
      heading={heading}
      onClose={onClose}
      busy={busy}
      closeLabel="Close goal"
      onKeyDown={(event) => {
        if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
        event.preventDefault();
        void submit();
      }}
      footer={(
        <DialogFooter>
          <DialogButton variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </DialogButton>
          <DialogButton variant="primary" onClick={() => { void submit(); }} busy={busy} disabled={busy}>
            {busy ? "Saving…" : category ? "Save" : "Add goal"}
          </DialogButton>
        </DialogFooter>
      )}
    >
      <FieldStack grow>
        {saveError && <StatusBanner message={saveError} />}
        <FieldGroup label="Name" htmlFor="goal-name">
          <TextField
            id="goal-name"
            large
            autoFocus
            data-autofocus
            placeholder="Goal name"
            value={formName}
            invalid={nameMissing}
            onChange={(e) => {
              setFormName(e.target.value);
              if (e.target.value.trim()) setNameMissing(false);
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
              e.preventDefault();
              void submit();
            }}
          />
        </FieldGroup>

        <FieldRow phone={phone}>
          <FieldGroup label="Deadline">
            <DateField
              ariaLabel="Goal deadline"
              placeholder="No deadline"
              clearable
              clearLabel="No deadline"
              value={formDeadline}
              onChange={setFormDeadline}
            />
          </FieldGroup>
          <FieldGroup label="Term">
            <ChoiceChips
              ariaLabel="Goal term"
              allowNone
              phone={phone}
              value={formType}
              onChange={setFormType}
              options={[
                { value: "short-term", label: "Short-term" },
                { value: "long-term", label: "Long-term" },
              ]}
            />
          </FieldGroup>
        </FieldRow>

        <FieldGroup label="Colour">
          <ColorSwatches ariaLabel="Goal colour" options={GOAL_COLORS} value={formColor} onChange={setFormColor} />
        </FieldGroup>

        <FieldGroup label="Description" htmlFor="goal-description" style={{ display: "flex", flexDirection: "column", flex: "1 1 auto" }}>
          <TextAreaField
            id="goal-description"
            grow
            icon={<TextAlignLeft size={14} />}
            placeholder="Add a description"
            value={formDesc}
            onChange={(e) => setFormDesc(e.target.value)}
            rows={4}
          />
        </FieldGroup>
      </FieldStack>
    </DialogCard>
  );
}
