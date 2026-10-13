"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import { searchFieldHeight } from "@/components/SearchField";
import { MENU_PANEL } from "@/lib/styles";
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
 * Which slice of the list is on screen.
 *
 * Was three buttons in a row beside the page title — `tasks/ViewTabs`, now
 * deleted. It is the same kind of question as the two filters beside it ("show
 * me less than everything, along this one axis"), and it was the only one of
 * the three answering it in a different shape, so it reads as a picker like
 * they do. The three together cost one line instead of a title row that had
 * run out of room.
 */
export type ViewFilter = "all" | "overdue" | "historical";

/** How close an open menu may come to the edge of the window. */
const MENU_VIEWPORT_MARGIN = 8;

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
  { value: "historical", label: "Historical", Icon: ClockCounterClockwise },
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

/** Where an open menu sits, in viewport coordinates. */
interface MenuPosition {
  top: number;
  left: number;
}

/**
 * One narrowing filter: a button stating the current answer, which opens the
 * rest.
 *
 * Three of these on `/tasks` and, until this replaced them, two hand-written
 * copies differing only in what they put before the label. Adding the view
 * filter as a third copy is how a page ends up with three controls that drift.
 *
 * `components/FilterSelect` is the same idea and is what Finance uses. This
 * one is separate for one reason: dates carry a per-option *icon* and that one
 * does not, only a colour dot. Worth merging when someone can add icons there
 * without a third page's filters riding on the change.
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
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const phone = usePhone();
  const open = position !== null;

  const current = options.find((option) => option.value === value) ?? options[0];

  /*
   * Placed against the viewport and portalled to the body, not absolutely
   * positioned inside the row.
   *
   * The row these triggers sit in scrolls sideways on a phone and carries a
   * mask to show it — and a mask applies to everything the element paints,
   * including an absolutely positioned child outside its box. The menu was
   * laid out at its full height and drew nothing at all: present to the
   * measuring code, invisible on screen, which is the worst version of broken.
   *
   * Right edge against the trigger's, then clamped into the viewport, so the
   * one at the end of the row cannot hang off the page.
   */
  function place() {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const bounds = trigger.getBoundingClientRect();
    const left = Math.min(
      Math.max(MENU_VIEWPORT_MARGIN, bounds.right - menuWidth),
      window.innerWidth - menuWidth - MENU_VIEWPORT_MARGIN,
    );
    setPosition({ top: bounds.bottom + 6, left });
  }

  /*
   * Flip above the trigger when there is not room below it. Measured after the
   * menu is in the DOM rather than estimated from the option count, because
   * the estimate is wrong the moment someone adds a longer list or the reader
   * scales their text up.
   */
  useLayoutEffect(() => {
    const menu = menuRef.current;
    const trigger = triggerRef.current;
    if (!menu || !trigger || !position) return;

    const height = menu.getBoundingClientRect().height;
    if (position.top + height <= window.innerHeight - MENU_VIEWPORT_MARGIN) return;

    const above = trigger.getBoundingClientRect().top - height - 6;
    if (above < MENU_VIEWPORT_MARGIN) return;
    setPosition((previous) => (previous ? { ...previous, top: above } : previous));
  }, [position]);

  /*
   * Close on a click outside, on Escape, and on anything that moves the
   * trigger out from under the menu. A fixed menu does not travel with the
   * page, and a picker left floating over a scrolled list is worse than one
   * that closes.
   */
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      /* The menu is portalled, so it is not inside the trigger's wrapper —
         without this, choosing an option counts as an outside click and
         unmounts the button before its own handler can run. */
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setPosition(null);
    }
    /* Tab on to the next filter and open it, and this one used to stay open
       beside it: only a press closed it, never the keyboard leaving. */
    function onFocusIn(event: FocusEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setPosition(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setPosition(null);
      triggerRef.current?.focus();
    }
    function dismiss() {
      setPosition(null);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("keydown", onKeyDown);
    /* Capture: the list scrolls in its own container, not on the window. */
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [open]);

  const menu = open && position && (
    <div
      ref={menuRef}
      id={listId}
      role="listbox"
      aria-label={label}
      style={{
        ...MENU_PANEL,
        position: "fixed",
        top: position.top,
        left: position.left,
        zIndex: 60,
        width: menuWidth,
        overflow: "hidden",
        padding: "4px 0",
      }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            type="button"
            role="option"
            aria-selected={selected}
            key={option.value}
            onClick={() => {
              onChange(option.value);
              setPosition(null);
            }}
            className={controls.action}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
              padding: "6px 12px",
              textAlign: "left",
              background: selected ? "var(--c-hover)" : "transparent",
              border: "none",
              color: selected ? "var(--c-text-1)" : "var(--c-text-2)",
              fontSize: "var(--ui-type-label)",
              fontWeight: selected ? 600 : 400,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            <OptionMark option={option} dim />
            {option.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? setPosition(null) : place())}
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
          on selection moved itself *and* the two filters beside it — a control
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
      {menu && createPortal(menu, document.body)}
    </>
  );
}

/*
 * The two halves used to be one row sitting to the right of the goals.
 *
 * They answer different questions, though. Date and priority narrow what the
 * list shows, which is the same job the All / Overdue / Historical tabs do, so
 * they belong beside those. The three-dot menu acts on whichever goal is
 * selected, so it belongs on the goals row. Splitting them puts every control
 * next to the thing it changes.
 */

/**
 * The three filters that narrow the list, for the line under the page title.
 *
 * All three, not two: the view used to be a separate row of tabs beside the
 * heading. They answer one question between them — what is on screen — so they
 * are one group, and the heading keeps a line to itself.
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
