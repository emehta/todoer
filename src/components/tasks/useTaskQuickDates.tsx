"use client";

import { useMemo } from "react";
import { ArrowLineRight, CalendarBlank, CalendarDots, SunHorizon } from "@phosphor-icons/react";
import type { QuickDate } from "@/components/form/DateField";
import { DAYS_SHORT, addDays, fromDateStr, toDateStr } from "@/lib/date-utils";
import { useTodayKey } from "@/lib/use-today";
import { useWeekStart } from "@/lib/week-start";

/**
 * A task's date shortcuts, in the week order the owner set: the task card's,
 * the row's date picker's and Ramble's. Worked out from today's key
 * (lib/use-today), so a card or picker left open past midnight moves its
 * Today and Tomorrow on with the clock.
 */
export function useTaskQuickDates(): QuickDate[] {
  const weekStart = useWeekStart();
  const todayKey = useTodayKey();
  return useMemo<QuickDate[]>(() => {
    const today = fromDateStr(todayKey);
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
  }, [weekStart, todayKey]);
}
