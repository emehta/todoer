"use client";

import { useRef, useState, type CSSProperties } from "react";
import type { Category } from "@/types/category";
import type { NewTask, Task } from "@/types/task";
import Tooltip from "@/components/Tooltip";
import { buildRambleSource, localClock, type RambleSource } from "@/lib/ramble/context";
import { startRecorder, type Recorder } from "@/lib/ramble/recorder";
import { useWeekStart } from "@/lib/week-start";
import styles from "./Ramble.module.css";
import RambleCard from "./RambleCard";
import RambleIcon from "./RambleIcon";
import { MORPH, MORPH_CSS, canMorph, morph } from "./ramble-morph";

interface Props {
  tasks: Task[];
  categories: Category[];
  /** The goal the page is showing, for a task the model filed nowhere. */
  activeCategoryId: string | null;
  onAdd: (tasks: NewTask[]) => void;
  /** Where the button sits in the header: its margin, set by the page. */
  style?: CSSProperties;
}

/**
 * Ramble, left of Add task: its mark alone (RambleIcon), which flows and
 * takes the hover fill when pointed at. The take starts on this click, so
 * the browser's microphone prompt comes with it and Safari lets the card's
 * waveform run.
 */
export default function RambleButton({ tasks, categories, activeCategoryId, onAdd, style }: Props) {
  const weekStart = useWeekStart();
  const [open, setOpen] = useState<{ recorder: Recorder; source: RambleSource } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  /*
   * The card opens out of the button and folds back into it: for the one
   * frame either side of the change the button carries the card's
   * transition name, so the browser draws one box going between the two.
   * The names never overlap, which a transition refuses.
   */
  function openCard(next: { recorder: Recorder; source: RambleSource }) {
    const trigger = triggerRef.current;
    if (!trigger || !canMorph()) {
      setOpen(next);
      return;
    }
    trigger.style.viewTransitionName = MORPH;
    morph(() => {
      setOpen(next);
      trigger.style.viewTransitionName = "";
    });
  }

  function closeCard() {
    const trigger = triggerRef.current;
    if (!trigger || !canMorph()) {
      setOpen(null);
      return;
    }
    const transition = morph(() => {
      setOpen(null);
      trigger.style.viewTransitionName = MORPH;
    });
    void transition?.finished.finally(() => { trigger.style.viewTransitionName = ""; });
  }

  return (
    <>
      <style>{MORPH_CSS}</style>
      <span style={{ display: "inline-flex", flexShrink: 0, ...style }}>
        <Tooltip label="Ramble">
          <button
            ref={triggerRef}
            type="button"
            className={`${styles.trigger} ui-hover-fill`}
            aria-haspopup="dialog"
            aria-label="Ramble: add tasks by speaking"
            onClick={() => {
              const recorder = startRecorder();
              const source = buildRambleSource(tasks, categories, { ...localClock(), weekStart });
              openCard({ recorder, source });
            }}
          >
            <RambleIcon />
          </button>
        </Tooltip>
      </span>

      {open && (
        <RambleCard
          recorder={open.recorder}
          source={open.source}
          categories={categories}
          fallbackGoalId={activeCategoryId && categories.some((c) => c.id === activeCategoryId) ? activeCategoryId : null}
          onAdd={onAdd}
          onClose={closeCard}
        />
      )}
    </>
  );
}
