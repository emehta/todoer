"use client";

import { useState } from "react";
import type { Category } from "@/types/category";
import Modal from "@/components/Modal";
import StatusBanner from "@/components/StatusBanner";
import { DialogButton } from "@/components/form/Dialog";
import { getErrorMessage } from "@/lib/error-utils";

/**
 * "Delete this goal?", from a goal tab's ⋯ menu or a right-click on it. A
 * failure is said here, with its reason, and the dialog stays open.
 */
export default function DeleteGoalDialog({
  category,
  onDelete,
  onClose,
}: {
  category: Category;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    if (deleting) return;
    setDeleting(true);
    setError("");
    try {
      await onDelete(category.id);
      onClose();
    } catch (failure) {
      setError(getErrorMessage(failure, "Could not delete this goal."));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal onClose={() => { if (!deleting) onClose(); }} maxWidth={420} label="Delete goal">
      <div style={{ padding: 24 }}>
        <h2 style={{ margin: 0, color: "var(--c-text-1)", fontSize: "var(--ui-type-title-sm)", fontWeight: 700 }}>
          Delete “{category.name}”?
        </h2>
        <p style={{ margin: "10px 0 20px", color: "var(--c-text-3)", fontSize: "var(--ui-type-body)", lineHeight: 1.55 }}>
          Its tasks stay, without a goal.
        </p>
        {error && <StatusBanner message={error} onDismiss={() => setError("")} style={{ marginBottom: 16 }} />}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <DialogButton variant="secondary" onClick={onClose} disabled={deleting} data-autofocus>
            Keep
          </DialogButton>
          <DialogButton variant="danger" armed onClick={() => { void confirm(); }} busy={deleting} disabled={deleting}>
            {deleting ? "Deleting…" : "Delete goal"}
          </DialogButton>
        </div>
      </div>
    </Modal>
  );
}
