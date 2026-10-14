"use client";

import { Suspense, lazy, useEffect, useRef, useState, type CSSProperties } from "react";
import { Tag, TextAlignLeft, X } from "@phosphor-icons/react";
import type { Category } from "@/types/category";
import type { NewTask, Priority } from "@/types/task";
import { PRIORITIES, PRIORITY_COLORS, PRIORITY_LABELS } from "@/types/task";
import { DIALOG_MAX_WIDTH, DialogButton, DialogCard, DialogFooter } from "@/components/form/Dialog";
import { ChoiceChips, FieldGroup, TextField } from "@/components/form/fields";
import DateField, { formatFieldDate } from "@/components/form/DateField";
import TimeField, { formatFieldTime } from "@/components/form/TimeField";
import SelectField from "@/components/form/SelectField";
import { DescriptionFieldLoading, DescriptionTextarea } from "@/components/form/DescriptionField";
import BackButton from "@/components/BackButton";
import Tooltip from "@/components/Tooltip";
import formStyles from "@/components/form/form.module.css";
import controls from "./TaskControls.module.css";
import styles from "./Ramble.module.css";
import RambleIcon from "./RambleIcon";
import RambleWaveform, { type WaveMode } from "./RambleWaveform";
import { MORPH, morph } from "./ramble-morph";
import { useTaskQuickDates } from "./useTaskQuickDates";
import { usePhone } from "@/lib/use-viewport-width";
import { useTimeFormat } from "@/lib/time-format";
import type { RambleSource } from "@/lib/ramble/context";
import { rambleDrafts, type RambleDraft } from "@/lib/ramble/drafts";
import { transcriptSentences } from "@/lib/ramble/prompt";
import { startRecorder, type Recorder } from "@/lib/ramble/recorder";
import {
  ASK_BEFORE_DISCARD_MS,
  MAX_RECORDING_MS,
  formatRecordingTime,
  microphoneProblem,
  monotonicNow,
  pauseClock,
  readClock,
  resumeClock,
  startClock,
  type TakeClock,
} from "@/lib/ramble/recording";
import { requestRamble, type RambleAction } from "@/lib/ramble/request";
import { openSettings } from "@/lib/open-settings";

/*
 * The description's list editor, as the task card has it: real bullets, not
 * "- " typed out in a box. Its own chunk, fetched once the Tasks page is
 * idle; the plain box if it will not load.
 */
const DescriptionEditor = lazy(() =>
  import("@/components/form/DescriptionEditor").catch(() => ({ default: DescriptionTextarea })),
);

type Phase =
  | { kind: "starting" }
  | { kind: "recording" }
  | { kind: "paused" }
  | { kind: "reading" }
  | { kind: "review" }
  | { kind: "failed"; message: string; canRetry: boolean; action?: RambleAction };

/* Long enough to read as a nudge, as on the task card. */
const NUDGE_MS = 320;

/* Listening needs no more room than its waveform: the full card around it
   was "too large for no reason" (the owner, 7 Oct 2026). */
const LISTENING_WIDTH = 400;

/* The last stretch of the three minutes, when the card says how much is left. */
const ENDING_MS = 20_000;

interface Props {
  /** Started by the button's own click, which Safari needs for the waveform. */
  recorder: Recorder;
  source: RambleSource;
  categories: Category[];
  /** The goal the page is showing, for a task the model filed nowhere. */
  fallbackGoalId: string | null;
  onAdd: (tasks: NewTask[]) => void;
  onClose: () => void;
}

/**
 * Ramble: say what needs doing, check what was heard, add it.
 *
 * A small card listens from the moment it opens, the take drawn as a
 * waveform running right to left (RambleWaveform). Under it Cancel, Pause
 * (Resume) and Send, the kit's own buttons; Space pauses, Enter sends,
 * three minutes sends anyway. A take of more than a few seconds is not
 * thrown away without asking, and while it is read nothing but Cancel can
 * close the card. Then the card grows into the review: each task with the
 * task card's own fields, nothing added until Add. A time it could not tell
 * am from pm is asked there, a task already in the list is left out with
 * Add anyway, a task with no goal asks for one. View transcript turns the
 * card to what was heard, a sentence a line, the way back on its title line.
 */
export default function RambleCard({ recorder: firstRecorder, source, categories, fallbackGoalId, onAdd, onClose }: Props) {
  const phone = usePhone();
  const timeFormat = useTimeFormat();
  const quickDates = useTaskQuickDates();
  const [recorder, setRecorder] = useState<Recorder>(firstRecorder);
  const [phase, setPhase] = useState<Phase>({ kind: "starting" });
  /* Asked before a take is thrown away; what it was doing, to go back to. */
  const [askingDiscard, setAskingDiscard] = useState<null | "recording" | "paused">(null);
  const [elapsed, setElapsed] = useState(0);
  const [drafts, setDrafts] = useState<RambleDraft[]>([]);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [view, setView] = useState<"tasks" | "transcript">("tasks");
  const [attempted, setAttempted] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [nudging, setNudging] = useState(false);
  const audio = useRef<Blob | null>(null);
  const clock = useRef<TakeClock>({ banked: 0, since: null });
  const sendRef = useRef<HTMLButtonElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const finishing = useRef(false);
  /* Closed while a ramble was being read: its answer, when it comes, is dropped. */
  const closed = useRef(false);
  const cancelTimer = useRef<{ recorder: Recorder; timer: number } | null>(null);
  const nudgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* The latest send, for the timer's own at three minutes. */
  const sendLatest = useRef<() => void>(() => {});
  useEffect(() => {
    sendLatest.current = () => { void send(); };
  });

  /* Recording once the microphone says yes, or why it would not. */
  useEffect(() => {
    let live = true;
    recorder.ready.then(
      () => {
        if (!live) return;
        clock.current = startClock(monotonicNow());
        setElapsed(0);
        setPhase({ kind: "recording" });
      },
      (error: unknown) => {
        if (live) setPhase({ kind: "failed", message: microphoneProblem(error), canRetry: false });
      },
    );
    return () => { live = false; };
  }, [recorder]);

  /*
   * The microphone is let go when the card goes, by any route. A tick late,
   * so React's development double mount (which unmounts and mounts again at
   * once) does not stop a take that is still wanted.
   */
  useEffect(() => {
    if (cancelTimer.current?.recorder === recorder) window.clearTimeout(cancelTimer.current.timer);
    return () => {
      cancelTimer.current = { recorder, timer: window.setTimeout(() => recorder.cancel(), 0) };
    };
  }, [recorder]);

  useEffect(() => () => {
    if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
  }, []);

  const recording = phase.kind === "recording";
  const paused = phase.kind === "paused";
  const taking = recording || paused;
  const reviewing = phase.kind === "review";

  /* The timer, from the take's own clock (pauses left out), and the send at
     three minutes. */
  useEffect(() => {
    if (!taking) return;
    const tick = () => {
      const ms = readClock(clock.current, monotonicNow());
      setElapsed(ms);
      if (ms >= MAX_RECORDING_MS) sendLatest.current();
    };
    tick();
    const interval = window.setInterval(tick, 200);
    return () => window.clearInterval(interval);
  }, [taking]);

  /*
   * Where focus goes as the card changes: Send while recording, so Enter
   * sends; Keep while it asks, so Enter is the safe answer; otherwise the
   * control the new view marks (Add, Back, Try again). The button that had
   * it is often gone, and focus outside the card would leave its keys dead.
   */
  useEffect(() => {
    if (askingDiscard) {
      keepRef.current?.focus({ preventScroll: true });
      return;
    }
    if (recording) {
      sendRef.current?.focus({ preventScroll: true });
      return;
    }
    if (taking || phase.kind === "starting" || phase.kind === "reading") return;
    const card = document.querySelector<HTMLElement>(`[role="dialog"][aria-label="Ramble"]`);
    card?.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true });
  }, [phase.kind, view, recording, taking, askingDiscard]);

  function nudge() {
    if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
    setNudging(true);
    nudgeTimer.current = setTimeout(() => setNudging(false), NUDGE_MS);
  }

  function pause() {
    if (!recording) return;
    recorder.pause();
    clock.current = pauseClock(clock.current, monotonicNow());
    setElapsed(readClock(clock.current, monotonicNow()));
    setPhase({ kind: "paused" });
  }

  function resume() {
    if (!paused) return;
    recorder.resume();
    clock.current = resumeClock(clock.current, monotonicNow());
    setPhase({ kind: "recording" });
  }

  async function read(input: { audio: Blob } | { text: string }) {
    setPhase({ kind: "reading" });
    const result = await requestRamble(input, source.context);
    if (closed.current) return;
    if (!result.ok) {
      if (result.transcript) setTranscript(result.transcript);
      setPhase({ kind: "failed", message: result.message, canRetry: !result.action, action: result.action });
      return;
    }
    const found = rambleDrafts(result.tasks, source, fallbackGoalId);
    if (found.length === 0) {
      setTranscript(result.transcript);
      setPhase({ kind: "failed", message: "No tasks were heard in that. Try saying what needs doing.", canRetry: false });
      return;
    }
    morph(() => {
      setTranscript(result.transcript);
      setDrafts(found);
      setView("tasks");
      setAttempted(false);
      setPhase({ kind: "review" });
    });
  }

  async function send() {
    if (finishing.current || !taking) return;
    finishing.current = true;
    setAskingDiscard(null);
    /* Reading from the press, not from when the recorder answers, so
       nothing in between can ask about discarding a take already sent. */
    clock.current = pauseClock(clock.current, monotonicNow());
    setElapsed(readClock(clock.current, monotonicNow()));
    setPhase({ kind: "reading" });
    try {
      const blob = await recorder.stop();
      audio.current = blob;
      await read({ audio: blob });
    } catch {
      setPhase({ kind: "failed", message: "Nothing was recorded.", canRetry: false });
    } finally {
      finishing.current = false;
    }
  }

  function retry() {
    if (transcript) void read({ text: transcript });
    else if (audio.current) void read({ audio: audio.current });
  }

  /* A new take, from this click, so Safari lets its waveform run too. */
  function recordAgain() {
    recorder.cancel();
    const next = startRecorder();
    morph(() => {
      audio.current = null;
      clock.current = { banked: 0, since: null };
      setTranscript(null);
      setDrafts([]);
      setView("tasks");
      setAskingDiscard(null);
      setConfirmingDiscard(false);
      setElapsed(0);
      setPhase({ kind: "starting" });
      setRecorder(next);
    });
  }

  function close() {
    closed.current = true;
    recorder.cancel();
    onClose();
  }

  /*
   * Cancel, Escape, the X and a press outside. A take of more than a few
   * seconds is held and asked about first, in the card, so a stray Escape
   * never loses a minute of talking; in review, with tasks not yet added,
   * it asks in the footer, as the task card does. While a take is being
   * read the card is busy, and only its own Cancel closes it.
   */
  function requestClose() {
    if (taking) {
      if (askingDiscard) {
        keepTaking();
        return;
      }
      if (readClock(clock.current, monotonicNow()) < ASK_BEFORE_DISCARD_MS) {
        close();
        return;
      }
      const was = recording ? "recording" : "paused";
      pause();
      setAskingDiscard(was);
      return;
    }
    if (reviewing && drafts.length > 0) {
      setConfirmingDiscard((asking) => !asking);
      return;
    }
    close();
  }

  function keepTaking() {
    if (askingDiscard === "recording") resume();
    setAskingDiscard(null);
  }

  const included = drafts.filter((draft) => draft.include);

  function add() {
    if (included.length === 0) {
      nudge();
      return;
    }
    const incomplete = included.some((draft) => !draft.title.trim() || !draft.category_id || draft.timeQuestion);
    if (incomplete) {
      setAttempted(true);
      if (view !== "tasks") morph(() => setView("tasks"));
      nudge();
      return;
    }
    onAdd(included.map((draft) => ({
      title: draft.title.trim(),
      description: draft.description?.trim() || null,
      due_date: draft.due_date,
      due_time: draft.due_time,
      priority: draft.priority,
      category_id: draft.category_id,
    })));
    close();
  }

  function update(key: string, patch: Partial<RambleDraft>) {
    setDrafts((current) => current.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)));
  }

  function remove(key: string) {
    setDrafts((current) => current.filter((draft) => draft.key !== key));
  }

  const readingTranscript = reviewing && view === "transcript";
  const addLabel = included.length === 1 ? "Add task" : included.length > 1 ? `Add ${included.length} tasks` : "Add tasks";
  const left = MAX_RECORDING_MS - elapsed;

  /* Ramble again, with Ramble's own mark: a new take in place of this one. */
  const againButton = (
    <Tooltip label="Record again">
      <button type="button" onClick={recordAgain} aria-label="Record again" className={`${styles.trigger} ${styles.again} ui-hover-fill`}>
        <RambleIcon size={18} />
      </button>
    </Tooltip>
  );

  let footer;
  if (reviewing && confirmingDiscard) {
    footer = (
      <DialogFooter
        start={(
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <DialogButton variant="danger" armed onClick={close}>Discard tasks</DialogButton>
            <DialogButton variant="ghost" onClick={() => setConfirmingDiscard(false)} autoFocus>Keep editing</DialogButton>
          </div>
        )}
      >
        <DialogButton variant="primary" onClick={add}>{addLabel}</DialogButton>
      </DialogFooter>
    );
  } else if (reviewing) {
    footer = (
      <DialogFooter
        start={(
          /* Pulled out to the content's edge, so the mark sits on the line the fields start on. */
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: -8 }}>
            {againButton}
            {!readingTranscript && transcript && (
              <DialogButton variant="ghost" onClick={() => morph(() => setView("transcript"))}>View transcript</DialogButton>
            )}
          </div>
        )}
      >
        {/* On a phone the X is Cancel, and the footer keeps to one row. */}
        {!phone && <DialogButton variant="secondary" onClick={requestClose}>Cancel</DialogButton>}
        <DialogButton variant="primary" onClick={add} data-autofocus>{addLabel}</DialogButton>
      </DialogFooter>
    );
  }

  const wave: WaveMode = recording ? "live" : paused ? "paused" : phase.kind === "reading" ? "reading" : "waiting";

  let status;
  if (askingDiscard) {
    status = <span className={styles.question}>Discard this recording?</span>;
  } else if (phase.kind === "reading") {
    status = "Reading";
  } else if (paused) {
    status = "Paused";
  } else if (recording) {
    status = (
      <>
        <span className={styles.dot} aria-hidden="true" />
        {left <= ENDING_MS ? `Listening, ${Math.ceil(left / 1000)}s left` : "Listening"}
      </>
    );
  } else {
    status = <><span className={styles.dotIdle} aria-hidden="true" />Waiting for the microphone</>;
  }

  /*
   * On a phone the card sits at the foot of the screen, under the thumb that
   * presses Send, 16px in from each side, and grows up from there into the
   * review.
   */
  const placement: CSSProperties = phone
    ? { width: "calc(100% - 12px)", margin: "auto 0 calc(6px + env(safe-area-inset-bottom))" }
    : {};

  const heading = readingTranscript
    ? (
      <>
        <BackButton label="tasks" onBack={() => morph(() => setView("tasks"))} />
        <span>Transcript</span>
      </>
    )
    : "Ramble";

  return (
    <DialogCard
      label="Ramble"
      heading={heading}
      onClose={requestClose}
      busy={phase.kind === "reading"}
      cardClassName={nudging ? controls.nudge : undefined}
      footer={footer}
      closeLabel="Close Ramble"
      maxWidth={reviewing ? DIALOG_MAX_WIDTH : LISTENING_WIDTH}
      fit
      fadeEdges={reviewing}
      cardStyle={{ viewTransitionName: MORPH, ...placement }}
      onKeyDown={(event) => {
        if (event.defaultPrevented || event.nativeEvent.isComposing) return;
        const plain = !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey;
        if (taking && !askingDiscard && plain && (event.key === "Enter" || event.key === " ")) {
          /* A held key repeats; one press is one pause or one send. */
          if (event.repeat) {
            event.preventDefault();
            return;
          }
          /* Tabbed to Cancel or the X, the key is that button's. */
          if (event.target instanceof HTMLButtonElement && !event.target.hasAttribute("aria-keyshortcuts")) return;
          event.preventDefault();
          if (event.key === "Enter") void send();
          else if (recording) pause();
          else resume();
        } else if (reviewing && event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          add();
        }
      }}
    >
      {!reviewing && phase.kind !== "failed" && (
        <div className={styles.stage}>
          <RambleWaveform recorder={recorder} mode={wave} />
          <div className={styles.readout} role="status" aria-live="polite">
            <span className={askingDiscard ? styles.timerAsking : paused ? styles.timerPaused : styles.timer}>
              {formatRecordingTime(elapsed)}
            </span>
            <span className={styles.status}>{status}</span>
          </div>
          <div className={styles.controls}>
            {askingDiscard ? (
              /* Destroying on the left, away from where Send was; keeping
                 where Send was, so a reach for Send keeps the take. */
              <>
                <DialogButton variant="danger" className={styles.tall} onClick={close}>Discard</DialogButton>
                <span aria-hidden="true" />
                <DialogButton ref={keepRef} variant="primary" className={styles.tall} onClick={keepTaking}>
                  {askingDiscard === "recording" ? "Keep recording" : "Keep"}
                </DialogButton>
              </>
            ) : (
              <>
                <DialogButton variant="secondary" className={styles.tall} onClick={phase.kind === "reading" ? close : requestClose}>
                  Cancel
                </DialogButton>
                <DialogButton
                  variant="secondary"
                  className={styles.tall}
                  onClick={paused ? resume : pause}
                  disabled={!taking}
                  aria-keyshortcuts="Space"
                >
                  {paused ? "Resume" : "Pause"}
                </DialogButton>
                <DialogButton
                  ref={sendRef}
                  variant="primary"
                  className={styles.tall}
                  onClick={() => { void send(); }}
                  disabled={!taking}
                  busy={phase.kind === "reading"}
                  aria-keyshortcuts="Enter"
                >
                  {phase.kind === "reading" ? "Sending" : "Send"}
                </DialogButton>
              </>
            )}
          </div>
        </div>
      )}

      {phase.kind === "failed" && (
        <div className={styles.stage}>
          <RambleWaveform recorder={recorder} mode="waiting" />
          <p className={styles.problem} role="alert">{phase.message}</p>
          <div className={styles.controlsTwo}>
            {phase.action ? (
              <>
                <DialogButton variant="secondary" className={styles.tall} onClick={close}>Close</DialogButton>
                {phase.action.kind === "settings" ? (
                  <DialogButton variant="primary" className={styles.tall} data-autofocus onClick={() => { close(); openSettings("ramble"); }}>
                    Open Settings
                  </DialogButton>
                ) : (
                  <DialogButton variant="primary" className={styles.tall} data-autofocus onClick={() => { window.open((phase.action as Extract<RambleAction, { kind: "link" }>).href, "_blank", "noopener"); }}>
                    {phase.action.label}
                  </DialogButton>
                )}
              </>
            ) : phase.canRetry && (transcript || audio.current) ? (
              <>
                <DialogButton variant="secondary" className={styles.tall} onClick={recordAgain}>Record again</DialogButton>
                <DialogButton variant="primary" className={styles.tall} onClick={retry} data-autofocus>Try again</DialogButton>
              </>
            ) : (
              <>
                <DialogButton variant="secondary" className={styles.tall} onClick={close}>Close</DialogButton>
                <DialogButton variant="primary" className={styles.tall} onClick={recordAgain} data-autofocus>Record again</DialogButton>
              </>
            )}
          </div>
        </div>
      )}

      {readingTranscript && transcript && (
        <div className={styles.transcript}>
          {transcriptSentences(transcript).map((sentence, index) => (
            <p key={index} className={styles.sentence}>{sentence}</p>
          ))}
        </div>
      )}

      {reviewing && !readingTranscript && (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {drafts.length === 0 && (
            <p style={{ fontSize: "var(--ui-type-body-sm)", color: "var(--c-text-3)", padding: "16px 0" }}>
              Nothing left to add.
            </p>
          )}
          {drafts.map((draft, index) => (
            <div
              key={draft.key}
              className={styles.row}
              style={{
                ["--i" as string]: index,
                padding: index === 0 ? "2px 0 16px" : "16px 0",
                borderTop: index === 0 ? "none" : "1px solid var(--c-border-sub)",
              }}
            >
              {draft.include ? (
                <DraftRow
                  draft={draft}
                  categories={categories}
                  quickDates={quickDates}
                  phone={phone}
                  labelled={index === 0}
                  attempted={attempted}
                  formatClock={(value) => formatFieldTime(value, timeFormat)}
                  onChange={(patch) => update(draft.key, patch)}
                  onRemove={() => remove(draft.key)}
                  onSubmit={add}
                  onEscape={requestClose}
                />
              ) : (
                <DuplicateRow
                  draft={draft}
                  onAddAnyway={() => update(draft.key, { include: true })}
                  onRemove={() => remove(draft.key)}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </DialogCard>
  );
}

function RemoveButton({ title, onRemove }: { title: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Remove ${title || "this task"}`}
      className={`${formStyles.button} ${formStyles.ghost} ${formStyles.iconButton}`}
      style={{ flexShrink: 0 }}
    >
      <X size={15} />
    </button>
  );
}

function DraftRow({
  draft,
  categories,
  quickDates,
  phone,
  labelled,
  attempted,
  formatClock,
  onChange,
  onRemove,
  onSubmit,
  onEscape,
}: {
  draft: RambleDraft;
  categories: Category[];
  quickDates: ReturnType<typeof useTaskQuickDates>;
  phone: boolean;
  /** The first row names its fields; the rows under it line up with those names. */
  labelled: boolean;
  attempted: boolean;
  formatClock: (value: string) => string;
  onChange: (patch: Partial<RambleDraft>) => void;
  onRemove: () => void;
  onSubmit: () => void;
  onEscape: () => void;
}) {
  const goal = categories.find((category) => category.id === draft.category_id) ?? null;
  const question = draft.timeQuestion;
  /* On a phone the fields sit two by two and no longer line up under the
     first row's names, so every row names its own. */
  const label = (text: string) => (labelled || phone ? text : undefined);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className={styles.titleField}>
        <TextField
          aria-label="Title"
          placeholder="Task title"
          value={draft.title}
          invalid={attempted && !draft.title.trim()}
          onChange={(event) => onChange({ title: event.target.value })}
        />
        <span className={styles.titleRemove}>
          <RemoveButton title={draft.title} onRemove={onRemove} />
        </span>
      </div>

      {draft.description !== null && (
        <div className={styles.description}>
        <Suspense
          fallback={(
            <DescriptionFieldLoading
              id={`ramble-description-${draft.key}`}
              value={draft.description}
              onChange={(value) => onChange({ description: value })}
              placeholder="Add a description"
              icon={<TextAlignLeft size={14} />}
            />
          )}
        >
          <DescriptionEditor
            id={`ramble-description-${draft.key}`}
            value={draft.description}
            onChange={(value) => onChange({ description: value })}
            onSubmit={onSubmit}
            onEscape={onEscape}
            placeholder="Add a description"
            icon={<TextAlignLeft size={14} />}
          />
        </Suspense>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: phone
            ? "repeat(2, minmax(0, 1fr))"
            : "minmax(0, 1.1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.05fr)",
          gap: phone ? 12 : 8,
        }}
      >
        <FieldGroup label={label("Date")}>
          <DateField
            ariaLabel="Due date"
            value={draft.due_date}
            quickDates={quickDates}
            onChange={(next) => {
              if (next) onChange({ due_date: next });
            }}
          />
        </FieldGroup>
        <FieldGroup label={label("Time")}>
          {question ? (
            <div
              style={{
                padding: 4,
                borderRadius: "var(--ui-radius-md)",
                border: `1px solid ${attempted ? "var(--c-danger)" : "var(--c-field-border)"}`,
              }}
            >
              <ChoiceChips
                ariaLabel="Morning or evening"
                options={[
                  { value: question.am, label: formatClock(question.am) },
                  { value: question.pm, label: formatClock(question.pm) },
                ]}
                value={null}
                phone={phone}
                onChange={(next) => {
                  if (next) onChange({ due_time: next, timeQuestion: null });
                }}
              />
            </div>
          ) : (
            <TimeField
              ariaLabel="Due time"
              placeholder="No time"
              value={draft.due_time}
              clearable
              onChange={(next) => onChange({ due_time: next })}
            />
          )}
        </FieldGroup>
        <FieldGroup label={label("Priority")}>
          <SelectField<Priority>
            ariaLabel="Priority"
            value={draft.priority}
            options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p], color: PRIORITY_COLORS[p] }))}
            onChange={(next) => onChange({ priority: next })}
          />
        </FieldGroup>
        <FieldGroup label={label("Goal")}>
          <SelectField
            ariaLabel="Goal"
            icon={goal ? undefined : <Tag size={14} />}
            placeholder={categories.length ? "Goal" : "No goals yet"}
            value={draft.category_id}
            invalid={attempted && !draft.category_id}
            options={categories.map((c) => ({ value: c.id, label: c.name, color: c.color }))}
            onChange={(next) => onChange({ category_id: next })}
          />
        </FieldGroup>
      </div>
    </div>
  );
}

/** A task already open in the list: left out unless Add anyway. */
function DuplicateRow({ draft, onAddAnyway, onRemove }: { draft: RambleDraft; onAddAnyway: () => void; onRemove: () => void }) {
  const existing = draft.duplicateOf;
  /* Its own title is named only when it differs from what was heard. */
  const named = existing && existing.title.trim().toLowerCase() !== draft.title.trim().toLowerCase() ? `: ${existing.title}` : "";
  const day = existing?.due_date ? `, ${formatFieldDate(existing.due_date)}` : "";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ flex: "1 1 auto", minWidth: 0 }}>
        <p style={{ fontSize: "var(--ui-type-body-sm)", fontWeight: 600, color: "var(--c-text-2)", overflowWrap: "anywhere" }}>
          {draft.title}
        </p>
        <p style={{ marginTop: 2, fontSize: "var(--ui-type-micro)", color: "var(--c-text-3)", overflowWrap: "anywhere" }}>
          Already in your list{named}{day}
        </p>
      </div>
      <DialogButton variant="secondary" onClick={onAddAnyway} style={{ flexShrink: 0 }}>Add anyway</DialogButton>
      <span style={{ marginRight: -8 }}>
        <RemoveButton title={draft.title} onRemove={onRemove} />
      </span>
    </div>
  );
}
