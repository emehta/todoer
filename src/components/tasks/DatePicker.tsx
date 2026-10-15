"use client";

import type { RefObject } from "react";
import { useState } from "react";
import { Clock, Prohibit } from "@phosphor-icons/react";
import Popover from "@/components/Popover";
import MonthCalendar from "@/components/form/MonthCalendar";
import { TimeList } from "@/components/form/TimeField";
import styles from "@/components/form/form.module.css";
import { useTaskQuickDates } from "./useTaskQuickDates";

interface Props {
  anchorRef: RefObject<HTMLElement | null>;
  value: string | null;
  timeValue: string | null;
  onChange: (date: string | null, time?: string | null) => void;
  onClose: () => void;
  preferredPlacement?: "top" | "bottom";
}

/**
 * A row's date and time, from its calendar button: the task card's own
 * shortcuts (useTaskQuickDates) and month (MonthCalendar), so the two never
 * disagree, opening on the task's month. Picking a day closes it and hands
 * focus back to the button; the time stays open to be changed, and is saved
 * by the row once it has settled.
 */
export default function DatePicker({
  anchorRef,
  value,
  timeValue,
  onChange,
  onClose,
  preferredPlacement = "top",
}: Props) {
  const quickDates = useTaskQuickDates();
  const [showTime, setShowTime] = useState(!!timeValue);
  const [time, setTime] = useState(timeValue ?? "");

  function done() {
    onClose();
    anchorRef.current?.focus({ preventScroll: true });
  }

  function selectDate(date: string) {
    onChange(date, time || undefined);
    done();
  }

  /* Clearing drops the time with the date: a time on no day is not a due time. */
  function clearDate() {
    onChange(null, null);
    done();
  }

  return (
    <Popover
      anchorRef={anchorRef}
      onClose={onClose}
      preferredPlacement={preferredPlacement}
      ariaLabel="Choose task date and time"
      className={styles.menu}
      /* The month calendar's own width, inside the menu's border. */
      style={{ padding: 0, width: 282 }}
    >
      <div style={{ padding: 6, borderBottom: "1px solid var(--c-border-sub)" }}>
        {quickDates.map((quick) => (
          <button key={quick.label} type="button" className={styles.option} onClick={() => selectDate(quick.value)}>
            {quick.icon && <span style={{ display: "flex", color: "var(--c-text-4)" }}>{quick.icon}</span>}
            {quick.label}
            {quick.hint && (
              <span style={{ marginLeft: "auto", color: "var(--c-text-4)", fontSize: "var(--ui-type-caption)", fontWeight: 400 }}>
                {quick.hint}
              </span>
            )}
          </button>
        ))}
        {value && (
          <button type="button" className={styles.option} onClick={clearDate}>
            <span style={{ display: "flex", color: "var(--c-text-4)" }}><Prohibit size={14} /></span>
            No date
          </button>
        )}
      </div>

      <MonthCalendar value={value} onSelect={selectDate} />

      <div style={{ padding: "0 12px 12px" }}>
        <div style={{ paddingTop: 10, borderTop: "1px solid var(--c-border-sub)" }}>
          {!showTime ? (
            <button
              type="button"
              onClick={() => setShowTime(true)}
              aria-expanded={showTime}
              className={styles.option}
              style={{ width: "auto", color: "var(--c-text-3)", marginLeft: -6 }}
            >
              <Clock size={13} aria-hidden="true" />
              Time
            </button>
          ) : (
            /* The shared time list, inline: a second popover here would count
               as a click outside this one and close it. */
            <TimeList
              value={time || null}
              listHeight={160}
              onChoose={(next) => {
                setTime(next);
                if (value) onChange(value, next);
              }}
            />
          )}
        </div>
      </div>
    </Popover>
  );
}
