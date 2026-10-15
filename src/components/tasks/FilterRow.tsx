"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  CaretDown,
  CalendarBlank,
  RadioButton,
  SunHorizon,
  Calendar as CalendarRange,
  CalendarDots,
  ClockCounterClockwise,
  ListBullets,
  WarningCircle,
} from "@phosphor-icons/react";
import type { Priority } from "@/types/task";
import { PRIORITY_COLORS } from "@/types/task";
import Popover from "@/components/Popover";
import { searchFieldHeight } from "@/components/SearchField";
import { MENU_PANEL, SELECTED } from "@/lib/styles";
import { useScrollEdge } from "@/lib/use-scroll-edge";
import { usePhone } from "@/lib/use-viewport-width";
import controls from "./TaskControls.module.css";

export type DateFilter =
  | "all"
  | "today"
  | "tomorrow"
  | "week"
  | "next-week"
  | "month"
  | "next-month";
export type PriorityFilter = "all" | Priority;

/**
 * Which slice of the list is on screen. The same kind of question as the two
 * filters beside it ("show me less than everything, along this one axis"),
 * so it is a picker as they are, and the three together take one line.
 */
export type ViewFilter = "all" | "overdue" | "historical";

interface FilterOption<T extends string> {
  value: T;
  label: string;
  /** A leading glyph. Dates use these; the other two filters do not. */
  Icon?: React.ElementType;
  /** A leading dot, in this colour. Priority uses these. */
  dot?: string;
}

const VIEW_OPTIONS: FilterOption<ViewFilter>[] = [
  { value: "all",        label: "Current",    Icon: ListBullets },
  { value: "overdue",    label: "Overdue",    Icon: WarningCircle },
  { value: "historical", label: "Done",       Icon: ClockCounterClockwise },
];

const DATE_OPTIONS: FilterOption<DateFilter>[] = [
  { value: "all",        label: "All dates",   Icon: CalendarBlank },
  { value: "today",      label: "Today",        Icon: RadioButton },
  { value: "tomorrow",   label: "Tomorrow",     Icon: SunHorizon },
  { value: "week",       label: "This week",    Icon: CalendarRange },
  { value: "next-week",  label: "Next week",    Icon: CalendarDots },
  { value: "month",      label: "This month",   Icon: CalendarDots },
  { value: "next-month", label: "Next month",   Icon: CalendarDots },
];

const PRIORITY_OPTIONS: FilterOption<PriorityFilter>[] = [
  { value: "all",      label: "All priorities", dot: "var(--c-text-4)" },
  { value: "critical", label: "Critical",       dot: PRIORITY_COLORS.critical },
  { value: "high",     label: "High",           dot: PRIORITY_COLORS.high },
  { value: "medium",   label: "Medium",         dot: PRIORITY_COLORS.medium },
  { value: "low",      label: "Low",            dot: PRIORITY_COLORS.low },
];

const PILL_STYLE: React.CSSProperties = {
  background: "var(--c-surface)",
  border: "1px solid var(--c-border-sub)",
  borderRadius: "var(--ui-radius-md)",
};

/** An option at rest: the same box as the selected one, so choosing never moves a line. */
const OPTION_AT_REST: React.CSSProperties = {
  background: "transparent",
  border: "1px solid transparent",
  color: "var(--c-text-2)",
  fontWeight: 400,
};

/** The leading glyph or dot, in a slot every option fills the same way. */
function OptionMark({ option, dim }: { option: FilterOption<string>; dim: boolean }) {
  if (option.Icon) {
    return <option.Icon size={11} style={{ flexShrink: 0, opacity: dim ? 0.5 : 0.6 }} />;
  }
  if (option.dot) {
    return (
      <span
        aria-hidden="true"
        style={{ width: 8, height: 8, borderRadius: "var(--ui-radius-round)", background: option.dot, flexShrink: 0 }}
      />
    );
  }
  return null;
}

/**
 * One narrowing filter: a button stating the current answer, which opens the
 * rest. The view, date and priority filters are all this one control, so the
 * three cannot drift apart.
 *
 * The menu is the app's Popover, portalled to the body: the row these sit in
 * scrolls sideways on a phone under a mask, and a mask hides anything drawn
 * inside it, a menu included. The Popover also places it against the window,
 * closes it on a press outside or Escape, and keeps Tab inside it. From the
 * keyboard: Down or Up on the button opens it on the current answer, the
 * arrows, Home and End move, Enter or Space picks, and focus comes back to
 * the button.
 */
function FilterDropdown<T extends string>({
  label,
  value,
  options,
  onChange,
  menuWidth = 168,
}: {
  /** Names the control for assistive tech: "View", "Date", "Priority". */
  label: string;
  value: T;
  options: FilterOption<T>[];
  onChange: (next: T) => void;
  menuWidth?: number;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const phone = usePhone();

  const current = options.find((option) => option.value === value) ?? options[0];

  function choose(next: T) {
    onChange(next);
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  }

  /* Opens on the current answer, focused, so the arrows start from it. The
     menu is hidden for its first frames while it is placed, and a hidden
     option can't take focus, so it is asked again until it has it. */
  useEffect(() => {
    if (!open) return;
    let frame = 0;
    let tries = 0;
    const focusCurrent = () => {
      const selected = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
      selected?.focus({ preventScroll: true });
      if (document.activeElement !== selected && (tries += 1) < 10) frame = requestAnimationFrame(focusCurrent);
    };
    frame = requestAnimationFrame(focusCurrent);
    return () => cancelAnimationFrame(frame);
  }, [open]);

  function onListKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? []);
    const index = items.indexOf(document.activeElement as HTMLElement);
    const move = (to: number) => items[Math.max(0, Math.min(items.length - 1, to))]?.focus({ preventScroll: true });
    if (event.key === "ArrowDown") { event.preventDefault(); move(index + 1); }
    else if (event.key === "ArrowUp") { event.preventDefault(); move(index - 1); }
    else if (event.key === "Home") { event.preventDefault(); move(0); }
    else if (event.key === "End") { event.preventDefault(); move(items.length - 1); }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((was) => !was)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          setOpen(true);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`${label}: ${current.label}`}
        className={controls.tab}
        style={{
          ...PILL_STYLE,
          display: "flex",
          alignItems: "center",
          gap: 6,
          /* The search field's height, which these sit beside on a desktop
             and under on a phone (40 there, for a thumb), so the line reads
             as one row of controls. */
          height: searchFieldHeight(phone),
          padding: "0 10px",
          fontSize: "var(--ui-type-label)",
          whiteSpace: "nowrap",
          cursor: "pointer",
          ...(open ? { background: "var(--c-border)", color: "var(--c-text-1)" } : { color: "var(--c-text-2)" }),
        }}
      >
        <OptionMark option={current} dim={false} />
        {/*
          Every label stacked in one grid cell with only the current one
          visible, so the button is as wide as the longest option and does not
          resize when you pick a different one. These sit at the right-hand end
          of a row whose search field takes the slack, so a trigger that grew
          on selection moved itself *and* the two filters beside it, a control
          that jumps out from under the pointer that just used it.

          The stack takes any room the trigger has past its own width, as it
          does on a phone, so the caret stays at the end like a select's.
        */}
        <span style={{ display: "grid", justifyItems: "start", flex: "1 1 auto" }}>
          {options.map((option) => (
            <span
              key={option.value}
              aria-hidden={option.value === value ? undefined : "true"}
              style={{
                gridArea: "1 / 1",
                visibility: option.value === value ? "visible" : "hidden",
              }}
            >
              {option.label}
            </span>
          ))}
        </span>
        <CaretDown size={10} style={{ opacity: 0.4, flexShrink: 0 }} />
      </button>

      {open && (
        <Popover
          anchorRef={triggerRef}
          onClose={() => setOpen(false)}
          preferredPlacement="bottom"
          align="right"
          ariaLabel={label}
          style={{ ...MENU_PANEL, width: menuWidth, padding: 4 }}
        >
          <div ref={listRef} id={listId} role="listbox" aria-label={label} onKeyDown={onListKeyDown}>
            {options.map((option) => {
              const selected = option.value === value;
              return (
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  key={option.value}
                  onClick={() => choose(option.value)}
                  /* The hover is for the others: the chosen one keeps its look. */
                  className={selected ? undefined : controls.action}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    minHeight: 32,
                    padding: "0 10px",
                    textAlign: "left",
                    borderRadius: "var(--ui-radius-md)",
                    fontSize: "var(--ui-type-label)",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    ...(selected ? SELECTED : OPTION_AT_REST),
                  }}
                >
                  <OptionMark option={option} dim />
                  {option.label}
                </button>
              );
            })}
          </div>
        </Popover>
      )}
    </>
  );
}

/**
 * The three filters that narrow the list, for the line under the page title.
 * They answer one question between them, what is on screen, so they are one
 * group, and the heading keeps a line to itself. What acts on the selected
 * goal sits on the goals row instead, next to the thing it changes.
 */
export function TaskFilters({
  viewFilter,
  dateFilter,
  priorityFilter,
  onViewChange,
  onDateChange,
  onPriorityChange,
}: {
  viewFilter: ViewFilter;
  dateFilter: DateFilter;
  priorityFilter: PriorityFilter;
  onViewChange: (f: ViewFilter) => void;
  onDateChange: (f: DateFilter) => void;
  onPriorityChange: (f: PriorityFilter) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const scrollEdge = useScrollEdge(scrollerRef);

  return (
    <div
      ref={scrollerRef}
      className={`${controls.filterGroup} ${controls.edgeFade}`}
      data-edge={scrollEdge}
      role="group"
      aria-label="Task filters"
    >
      <FilterDropdown label="View" value={viewFilter} options={VIEW_OPTIONS} onChange={onViewChange} />
      <FilterDropdown label="Date" value={dateFilter} options={DATE_OPTIONS} onChange={onDateChange} />
      <FilterDropdown
        label="Priority"
        value={priorityFilter}
        options={PRIORITY_OPTIONS}
        onChange={onPriorityChange}
        menuWidth={176}
      />
    </div>
  );
}
