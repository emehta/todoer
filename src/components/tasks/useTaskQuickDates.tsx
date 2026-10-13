"use client";

import { useMemo } from "react";
import { ArrowLineRight, CalendarBlank, CalendarDots, SunHorizon } from "@phosphor-icons/react";
import type { QuickDate } from "@/components/form/DateField";
import { DAYS_SHORT, addDays, fromDateStr, toDateStr, todayStr } from "@/lib/date-utils";
import { useWeekStart } from "@/lib/week-start";

/** A task's date picker shortcuts, in the week order the owner set: the task card's and Ramble's. */
export function useTaskQuickDates(): QuickDate[] {
  const weekStart = useWeekStart();
  return useMemo<QuickDate[]>(() => {
    const today = fromDateStr(todayStr());
    const dow = today.getDay();
    const preferredStart = weekStart === "monday" ? 1 : 0;
    const nextWeek = addDays(today, (preferredStart - dow + 7) % 7 || 7);
    const nextWeekend = addDays(today, dow === 6 ? 7 : (6 - dow + 7) % 7 || 7);
    const tomorrow = addDays(today, 1);
    const short = (date: Date) => `${DAYS_SHORT[date.getDay()]} ${date.getDate()}`;
    return [
      { label: "Today", value: toDateStr(today), hint: DAYS_SHORT[today.getDay()], icon: <CalendarBlank size={14} /> },
      { label: "Tomorrow", value: toDateStr(tomorrow), hint: DAYS_SHORT[tomorrow.getDay()], icon: <SunHorizon size={14} /> },
      { label: "Next week", value: toDateStr(nextWeek), hint: short(nextWeek), icon: <ArrowLineRight size={14} /> },
      { label: "Next weekend", value: toDateStr(nextWeekend), hint: short(nextWeekend), icon: <CalendarDots size={14} /> },
    ];
  }, [weekStart]);
}
