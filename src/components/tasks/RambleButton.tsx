"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Category } from "@/types/category";
import type { NewTask, Task } from "@/types/task";
import Tooltip from "@/components/Tooltip";
import { RAMBLE_CHANGED_EVENT } from "@/lib/open-settings";
import { buildRambleSource, localClock, type RambleSource } from "@/lib/ramble/context";
import { startRecorder, type Recorder } from "@/lib/ramble/recorder";
import { rambleSetup } from "@/lib/ramble/request";
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
  onCreateGoal: (name: string) => Promise<Category>;
  /** Where the button sits in the header: its margin, set by the page. */
  style?: CSSProperties;
}

type Opened = {
  recorder: Recorder | null;
  setupMessage: string | null;
  setupCheck?: Promise<string | null | undefined>;
  source: RambleSource;
};

/**
 * Ramble, left of Add task: its mark alone (RambleIcon), which flows and
 * takes the hover fill when pointed at. The take starts on this click, so
 * the browser's microphone prompt comes with it and Safari lets the card's
 * waveform run.
 *
 * It knows beforehand whether Ramble is set up, asked when the page opens,
 * when the window comes back, and when Settings changes Ramble. Not set up,
 * the click opens the card on what to do in Settings and records nothing, so
 * no one talks for a minute into a take that could not be sent. Pressed
 * while the answer is still on its way, the take starts (Safari needs the
 * click for it) but the card waits for the answer before it says Listening.
 */
export default function RambleButton({ tasks, categories, activeCategoryId, onAdd, onCreateGoal, style }: Props) {
  const weekStart = useWeekStart();
  const [open, setOpen] = useState<Opened | null>(null);
  /* What to set up before Ramble can listen, or null when nothing is (or
     Todoer could not be asked, when a take is tried as usual). */
  const [setupMessage, setSetupMessage] = useState<string | null>(null);
  /* The question while it is out, for a press that comes before its answer. */
  const asking = useRef<Promise<string | null | undefined> | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let live = true;
    const check = () => {
      /* Focus and visibility arrive together: one question for the two. */
      if (asking.current || document.visibilityState !== "visible") return;
      const question = rambleSetup();
      asking.current = question;
      void question.then((answer) => {
        if (asking.current === question) asking.current = null;
        if (live && answer !== undefined) setSetupMessage(answer);
      });
    };
    check();
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    window.addEventListener(RAMBLE_CHANGED_EVENT, check);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
      window.removeEventListener(RAMBLE_CHANGED_EVENT, check);
    };
  }, []);

  /*
   * The card opens out of the button and folds back into it: for the one
   * frame either side of the change the button carries the card's
   * transition name, so the browser draws one box going between the two.
   * The names never overlap, which a transition refuses.
   */
  function openCard(next: Opened) {
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
        <Tooltip label="Add tasks by speaking">
          <button
            ref={triggerRef}
            type="button"
            className={`${styles.trigger} ui-hover-fill`}
            aria-haspopup="dialog"
            aria-label="Ramble: add tasks by speaking"
            onClick={() => {
              const recorder = setupMessage === null ? startRecorder() : null;
              const source = buildRambleSource(tasks, categories, { ...localClock(), weekStart });
              openCard({ recorder, setupMessage, setupCheck: recorder ? asking.current ?? undefined : undefined, source });
            }}
          >
            <RambleIcon />
          </button>
        </Tooltip>
      </span>

      {open && (
        <RambleCard
          recorder={open.recorder}
          setupMessage={open.setupMessage}
          setupCheck={open.setupCheck}
          source={open.source}
          categories={categories}
          fallbackGoalId={activeCategoryId && categories.some((c) => c.id === activeCategoryId) ? activeCategoryId : null}
          onAdd={onAdd}
          onCreateGoal={onCreateGoal}
          onClose={closeCard}
        />
      )}
    </>
  );
}
