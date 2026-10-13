"use client";

import type { RefObject } from "react";
import { useState } from "react";
import {
  ArrowLineRight,
  CalendarBlank,
  CalendarDots,
  CaretLeft,
  CaretRight,
  Clock,
  Prohibit,
  SunHorizon,
} from "@phosphor-icons/react";
import Popover from "@/components/Popover";
import { TimeList } from "@/components/form/TimeField";
import controls from "./TaskControls.module.css";
import { MONTH_NAMES, MONTHS_SHORT, toDateStr } from "@/lib/date-utils";
import { orderWeekdays, useWeekStart, type WeekStartPreference } from "@/lib/week-start";

const SHORT_DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getCalendarDays(year: number, month: number, weekStart: WeekStartPreference) {
  const firstDow = new Date(year, month, 1).getDay();
  const preferredStart = weekStart === "monday" ? 1 : 0;
  const startOffset = (firstDow - preferredStart + 7) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();

  const days: { date: Date; current: boolean }[] = [];

  for (let i = startOffset - 1; i >= 0; i--)
    days.push({ date: new Date(year, month - 1, daysInPrev - i), current: false });

  for (let i = 1; i <= daysInMonth; i++)
    days.push({ date: new Date(year, month, i), current: true });

  let next = 1;
  while (days.length % 7 !== 0)
    days.push({ date: new Date(year, month + 1, next++), current: false });

  return days;
}

interface Props {
  anchorRef: RefObject<HTMLElement | null>;
  value: string | null;
  timeValue: string | null;
  onChange: (date: string | null, time?: string | null) => void;
  onClose: () => void;
  preferredPlacement?: "top" | "bottom";
}

export default function DatePicker({
  anchorRef,
  value,
  timeValue,
  onChange,
  onClose,
  preferredPlacement = "top",
}: Props) {
  const weekStart = useWeekStart();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [showTime, setShowTime] = useState(!!timeValue);
  const [time, setTime] = useState(timeValue ?? "");

  const dow = today.getDay();

  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const nextWeek = new Date(today);
  const preferredStart = weekStart === "monday" ? 1 : 0;
  const daysToNextWeek = (preferredStart - dow + 7) % 7 || 7;
  nextWeek.setDate(today.getDate() + daysToNextWeek);

  const nextWeekend = new Date(today);
  const daysToSat = dow === 6 ? 7 : (6 - dow + 7) % 7 || 7;
  nextWeekend.setDate(today.getDate() + daysToSat);

  const quickOptions = [
    {
      label: "Today",
      date: today,
      right: SHORT_DAY[today.getDay()],
      icon: <CalendarBlank size={14} weight="regular" />,
    },
    {
      label: "Tomorrow",
      date: tomorrow,
      right: SHORT_DAY[tomorrow.getDay()],
      icon: <SunHorizon size={14} weight="regular" />,
    },
    {
      label: "Next week",
      date: nextWeek,
      right: `${SHORT_DAY[nextWeek.getDay()]} ${nextWeek.getDate()} ${MONTHS_SHORT[nextWeek.getMonth()]}`,
      icon: <ArrowLineRight size={14} weight="regular" />,
    },
    {
      label: "Next weekend",
      date: nextWeekend,
      right: `${SHORT_DAY[nextWeekend.getDay()]} ${nextWeekend.getDate()} ${MONTHS_SHORT[nextWeekend.getMonth()]}`,
      icon: <CalendarDots size={14} weight="regular" />,
    },
  ];

  function selectDate(date: Date) {
    onChange(toDateStr(date), time || undefined);
    onClose();
  }

  /* Clearing drops the time with the date: a time on no day is not a due time. */
  function clearDate() {
    onChange(null, null);
    onClose();
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  }
  function nextMonthFn() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  }

  const days = getCalendarDays(viewYear, viewMonth, weekStart);
  const weekdayHeaders = orderWeekdays(
    [
      { short: "S", full: "Sunday" },
      { short: "M", full: "Monday" },
      { short: "T", full: "Tuesday" },
      { short: "W", full: "Wednesday" },
      { short: "T", full: "Thursday" },
      { short: "F", full: "Friday" },
      { short: "S", full: "Saturday" },
    ],
    weekStart,
  );

  return (
    <Popover
      anchorRef={anchorRef}
      onClose={onClose}
      preferredPlacement={preferredPlacement}
      ariaLabel="Choose task date and time"
      style={{
        background: "var(--page-bg)",
        border: "1px solid var(--c-border)",
        borderRadius: "var(--ui-radius-lg)",
        boxShadow: "var(--shadow-pop)",
        width: 288,
      }}
    >
      <div className="py-3">
      {/* Quick options */}
      <div className="px-1 mb-2">
        {quickOptions.map((opt) => (
            <button
              type="button"
              key={opt.label}
              onClick={() => selectDate(opt.date)}
              className={`${controls.action} flex w-full items-center justify-between px-2 py-1.5 text-sm`}
              style={{ background: "transparent", borderRadius: "var(--ui-radius-md)" }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    color: "var(--c-text-4)",
                    flexShrink: 0,
                  }}
                >
                  {opt.icon}
                </span>
                <span style={{ color: "var(--c-text-2)", fontWeight: 500 }}>
                  {opt.label}
                </span>
              </span>
              <span style={{ color: "var(--c-text-4)" }}>{opt.right}</span>
            </button>
        ))}

        {value && (
          <button
            type="button"
            onClick={clearDate}
            className={`${controls.action} flex w-full items-center justify-between px-2 py-1.5 text-sm`}
            style={{ background: "transparent", borderRadius: "var(--ui-radius-md)" }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ display: "flex", alignItems: "center", color: "var(--c-text-4)", flexShrink: 0 }}>
                <Prohibit size={14} weight="regular" />
              </span>
              <span style={{ color: "var(--c-text-2)", fontWeight: 500 }}>No date</span>
            </span>
          </button>
        )}
      </div>

      <div className="mx-3 mb-3" style={{ borderTop: "1px solid var(--c-border-sub)" }} />

      {/* Calendar */}
      <div className="px-3">
        <div className="flex items-center justify-between mb-2">
          <button
            type="button"
            onClick={prevMonth}
            aria-label="Previous month"
            className={`${controls.iconButton} p-1`}
            style={{
              color: "var(--c-text-3)",
              background: "transparent",
              borderRadius: "var(--ui-radius-md)",
            }}
          >
            <CaretLeft size={14} />
          </button>
          <span className="text-sm font-medium" style={{ color: "var(--c-text-1)" }}>
            {MONTH_NAMES[viewMonth]} {viewYear}
          </span>
          <button
            type="button"
            onClick={nextMonthFn}
            aria-label="Next month"
            className={`${controls.iconButton} p-1`}
            style={{
              color: "var(--c-text-3)",
              background: "transparent",
              borderRadius: "var(--ui-radius-md)",
            }}
          >
            <CaretRight size={14} />
          </button>
        </div>

        <div className="grid grid-cols-7 mb-1">
          {weekdayHeaders.map((day) => (
            <div key={day.full} aria-label={day.full} className="py-1 text-center text-xs" style={{ color: "var(--c-text-4)" }}>{day.short}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-y-0.5">
          {days.map((d, i) => {
            const dateKey = toDateStr(d.date);
            const isToday = d.date.getTime() === today.getTime();
            const isSelected = value ? dateKey === value : false;
            return (
              <button
                type="button"
                key={i}
                onClick={() => selectDate(d.date)}
                aria-label={d.date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                aria-pressed={isSelected}
                className={`${controls.rangeButton} ${isSelected ? controls.active : ""} py-1 text-center text-xs`}
                style={
                  isSelected
                    ? { background: "var(--c-accent-strong)", color: "var(--c-on-accent)", borderRadius: "var(--ui-radius-md)", fontWeight: 600 }
                    : isToday
                    ? { background: "var(--c-tag-bg)", color: "var(--c-text-1)", borderRadius: "var(--ui-radius-md)" }
                    : d.current
                    ? { color: "var(--c-text-1)" }
                    : { color: "var(--c-text-4)" }
                }
              >
                {d.date.getDate()}
              </button>
            );
          })}
        </div>
      </div>

      {/* Time */}
      <div className="mx-3 mt-3 pt-2.5" style={{ borderTop: "1px solid var(--c-border-sub)" }}>
        {!showTime ? (
          <button
            type="button"
            onClick={() => setShowTime(true)}
            aria-expanded={showTime}
            className={`${controls.action} flex items-center gap-1.5 text-sm`}
            style={{
              color: "var(--c-text-3)",
              background: "transparent",
              borderRadius: "var(--ui-radius-md)",
              padding: "4px 6px",
              marginLeft: -6,
            }}
          >
            <Clock size={13} />
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
