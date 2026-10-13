"use client";

import { ButtonHTMLAttributes, CSSProperties, MouseEvent, useEffect, useRef, useState } from "react";
import { DotsSixVertical } from "@phosphor-icons/react";
import { useTimeFormat, formatTime } from "@/lib/time-format";
import { priorityFill, priorityLine } from "@/lib/styles";
import { Task, PRIORITY_COLORS } from "@/types/task";
import { Category } from "@/types/category";
import controls from "./TaskControls.module.css";
import wash from "./PriorityWash.module.css";
import Tooltip from "@/components/Tooltip";
import TaskRowActions, { type TaskRowActionHandlers } from "./TaskRowActions";
import CategoryIcon from "./CategoryIcon";
import { celebrate } from "@/lib/celebrate";
import { descriptionPreview } from "@/lib/description-lists";
import { Highlight, useSearchWords } from "@/components/Highlight";
import { matchesWords } from "@/lib/text-match";

/*
 * How long a ticked task stays on screen before it is saved and leaves the
 * list: long enough to see the circle pop and the tick draw (about 320ms),
 * then the row fades. With reduced motion there is nothing to watch, so it
 * goes almost at once.
 */
const COMPLETE_MS = 520;
const COMPLETE_MS_REDUCED = 120;

function formatDueDate(date: string | null, time: string | null, timeFmt: "12h" | "24h"): string | null {
  if (!date) return null;
  const d = new Date(date + "T00:00:00");
  const day = d.getDate();
  const month = d.toLocaleString("en-US", { month: "short" });
  if (time) {
    const parts = time.split(":");
    const timeDate = new Date(date + "T00:00:00");
    timeDate.setHours(parseInt(parts[0], 10), parseInt(parts[1], 10), 0, 0);
    return `${day} ${month} ${formatTime(timeDate, timeFmt)}`;
  }
  return `${day} ${month}`;
}

/*
 * Overdue is red, because it is a problem. Today is the page's own text at
 * full strength rather than green: green is "done" and, in two themes, the
 * accent that means "selected", and a task due today is neither. Against the
 * page's day rather than the clock's, so the colour moves on at midnight with
 * the headings instead of waiting for the row to be drawn again.
 */
function getDueDateStyle(date: string | null, todayKey: string): CSSProperties {
  if (!date) return { color: "var(--c-text-3)" };
  if (date < todayKey) return { color: "var(--c-danger)", fontWeight: 600 };
  if (date === todayKey) return { color: "var(--c-text-1)", fontWeight: 600 };
  return { color: "var(--c-text-3)" };
}

interface Props {
  task: Task;
  categories: Category[];
  /** Today's `YYYY-MM-DD` key, from the page (lib/use-today). */
  todayKey: string;
  onUpdate: (id: string, completed: boolean, cx?: number, cy?: number) => void;
  onEdit?: (task: Task) => void;
  containerRef?: (node: HTMLDivElement | null) => void;
  containerStyle?: CSSProperties;
  dragAttributes?: ButtonHTMLAttributes<HTMLButtonElement>;
  dragListeners?: ButtonHTMLAttributes<HTMLButtonElement>;
  dragHandleRef?: (node: HTMLButtonElement | null) => void;
  isDragging?: boolean;
  /** Omitted where a row is read-only, which is what hides the hover cluster. */
  rowActions?: TaskRowActionHandlers;
}

export default function TaskItem({
  task,
  categories,
  todayKey,
  onUpdate,
  onEdit,
  containerRef,
  containerStyle,
  dragAttributes,
  dragListeners,
  dragHandleRef,
  isDragging = false,
  rowActions,
}: Props) {
  const timeFmt = useTimeFormat();
  const completed = task.completed;
  const color = PRIORITY_COLORS[task.priority];
  const formattedDate = formatDueDate(task.due_date, task.due_time, timeFmt);
  const dateStyle = getDueDateStyle(task.due_date, todayKey);
  const category = categories.find((c) => c.id === task.category_id) ?? null;

  /*
   * The whole row is tinted with its priority: red, orange, blue or grey. It
   * was a plain surface with a bar down the left for two days, and the owner
   * wanted the colour back across the row. How much hue each theme takes, and
   * what it is mixed into, are the --priority-wash* variables in
   * PriorityWash.module.css, which is where Light's pink and Nature's khaki
   * were fixed; priorityFill and priorityLine carry Midnight's values as
   * fallbacks, so a stylesheet that arrives late leaves the row tinted, never
   * transparent. The calendar's task pills are drawn from the same three.
   *
   * A done row is plain, the same rule its ring follows: done is done,
   * whatever its priority was. The row actions sit on the same colour.
   */
  const hue = completed ? null : color;
  const restTint = hue ? priorityFill(hue) : "var(--c-surface)";
  /*
   * Under the cursor the row takes a little more of its own hue, so it
   * brightens in its colour rather than just gaining a darker border. A done
   * row has no hue and lifts towards the text colour instead.
   */
  const hoverTint = hue
    ? priorityFill(hue, true)
    : "color-mix(in srgb, var(--c-text-1) 5%, var(--c-surface))";
  /*
   * The fill is a variable, not a value: the hover rule swaps --task-row-bg
   * for --task-row-bg-hover (an inline background could not be changed from a
   * stylesheet at all), and the row actions' fade reads the same variable, so
   * it brightens with the row instead of leaving a seam under the icons.
   */
  const backgroundTint = "var(--task-row-bg)";
  const borderColor = hue ? priorityLine(hue) : "var(--c-border-sub)";

  /*
   * Ticking a task off: the confetti and the circle answer the click at once,
   * and the save follows once the tick has been seen.
   *
   * It used to wait on the database for everything: the confetti fired only
   * after the write came back (a quarter of a second or more from here), and
   * the row left the list the instant it was marked done, so there was never
   * a tick to see. Now the circle pops and fills, the tick draws, the row
   * fades, and then onUpdate saves it and the list drops it. If the save
   * fails the page puts the task back and says so.
   *
   * Unticking a done task (in Historical) is immediate: there is nothing to
   * celebrate and nothing to watch.
   */
  const [completing, setCompleting] = useState(false);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveCompletion = useRef<() => void>(() => {});
  useEffect(() => {
    saveCompletion.current = () => onUpdate(task.id, true);
  });

  /* Leaving the page mid-animation still saves the tick it showed. */
  useEffect(() => () => {
    if (pending.current) {
      clearTimeout(pending.current);
      pending.current = null;
      saveCompletion.current();
    }
  }, []);

  function toggleComplete(e: MouseEvent) {
    e.stopPropagation();
    if (completing) return;
    if (task.completed) {
      onUpdate(task.id, false);
      return;
    }
    setCompleting(true);
    celebrate({ x: e.clientX, y: e.clientY });
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    pending.current = setTimeout(() => {
      pending.current = null;
      saveCompletion.current();
    }, reduced ? COMPLETE_MS_REDUCED : COMPLETE_MS);
  }

  /* Drawn as done from the click on, before the save has happened. */
  const shownDone = completed || completing;

  /* The preview is one line, so while a search's words are not all in the
     title it starts at what the description matched. */
  const words = useSearchWords();
  const excerpt = words.length > 0 && !matchesWords(words, [task.title]);

  const taskContent = (
    <>
      <p
        className="text-sm leading-snug"
        style={{
          color: completed ? "var(--c-text-4)" : "var(--c-text-1)",
          textDecoration: completed ? "line-through" : "none",
        }}
      >
        <Highlight text={task.title} />
      </p>
      {task.description && (
        /* On one line, its bullets as dots rather than the dashes they are stored as. */
        <p className="mt-0.5 truncate text-xs" style={{ color: "var(--c-text-4)" }}>
          <Highlight text={descriptionPreview(task.description)} excerpt={excerpt} />
        </p>
      )}
      {/*
        One line whatever the width. On a phone a long goal name used to wrap
        onto a second line, squeeze the date into "29 / Sep" and run under the
        row's action icons. The date never shrinks; the goal ends in an
        ellipsis instead.
      */}
      <div className="mt-1 flex items-center gap-2.5" style={{ minWidth: 0 }}>
        {formattedDate && (
          <span className="text-xs" style={{ ...dateStyle, flexShrink: 0, whiteSpace: "nowrap" }}>
            {formattedDate}
          </span>
        )}
        {category && (
          <span className="flex items-center gap-1 text-xs" style={{ color: "var(--c-text-4)", minWidth: 0 }}>
            <CategoryIcon color={category.color} size={12} />
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {category.name}
            </span>
          </span>
        )}
      </div>
    </>
  );

  return (
    <div
      ref={containerRef}
      style={containerStyle}
    >
      {/* Task card */}
      <div
        style={{
          ["--task-row-bg" as string]: restTint,
          ["--task-row-bg-hover" as string]: hoverTint,
          background: backgroundTint,
          border: `1px solid ${borderColor}`,
          borderRadius: "var(--ui-radius-item)",
          boxShadow: "var(--task-shadow)",
          /* Read by the hover rule, so the border darkens in its own hue. */
          ["--task-hue" as string]: hue ?? "var(--c-border)",
          padding: "8px 16px",
          marginBottom: 0,
          cursor: "default",
          position: "relative",
          transition: "background var(--motion-base) var(--ease-out), border-color var(--motion-base) var(--ease-out), box-shadow var(--motion-base) var(--ease-out)",
          opacity: isDragging ? 0.42 : 1,
          userSelect: "none",
        }}
        className={`${controls.taskCard} ${wash.wash} ${completing ? controls.completingOut : ""} group flex items-center gap-3`}
      >
        {(dragAttributes || dragListeners) && (
          <Tooltip label="Drag to reorder">
            <button
              ref={dragHandleRef}
              type="button"
              {...dragAttributes}
              {...dragListeners}
              aria-label={`Reorder ${task.title}`}
              style={{
                width: 24,
                height: 32,
                marginLeft: -8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                border: "none",
                background: "transparent",
                color: "var(--c-text-4)",
                cursor: isDragging ? "grabbing" : "grab",
                touchAction: "none",
              }}
            >
              <DotsSixVertical size={15} weight="bold" />
            </button>
          </Tooltip>
        )}

        {/*
          Priority circle checkbox. The button is 38px square and pulled back
          to the circle's 18px footprint by its margin, so the row lays out
          exactly as before while a thumb gets a target it can hit: the bare
          circle was an 18px target, the smallest control on a phone.
        */}
        <button
          type="button"
          onClick={toggleComplete}
          aria-label={completed ? `Mark ${task.title} incomplete` : `Mark ${task.title} complete`}
          aria-pressed={shownDone}
          className={`${controls.checkButton} flex-shrink-0 flex items-center justify-center`}
          style={{ width: 38, height: 38, margin: -10, padding: 0, border: "none", background: "transparent" }}
        >
          <span
            aria-hidden="true"
            className={`${completing ? controls.checkPop : ""} flex items-center justify-center rounded-full border-2 transition-colors duration-150`}
            style={{
              width: 18,
              height: 18,
              /* Done is done, whatever its priority was: the tick sits on the
                 accent, where white holds 4.5:1 in every theme. A white tick
                 on Light's orange was 2.5:1. */
              borderColor: shownDone ? "var(--c-accent-strong)" : color,
              background: shownDone ? "var(--c-accent-strong)" : "transparent",
              /* The ring that spreads from the circle as it pops is the
                 priority's colour, the one the task had until now. */
              ["--pop-color" as string]: color,
            }}
          >
            {/*
              A preview of the tick, in the priority's colour: faint while the
              row is hovered, firmer on the circle itself, so the circle says
              what clicking it will do. Hidden otherwise; see .hoverTick.
            */}
            {!shownDone && (
              <svg className={controls.hoverTick} width="9" height="7" viewBox="0 0 9 7" fill="none" aria-hidden="true">
                <path
                  d="M1 3.5L3.2 5.5L8 1"
                  stroke={color}
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
            {shownDone && (
              <svg width="9" height="7" viewBox="0 0 9 7" fill="none" aria-hidden="true">
                <path
                  /* Drawn in, not just shown, when it has just been ticked. */
                  className={completing ? controls.tickDraw : undefined}
                  d="M1 3.5L3.2 5.5L8 1"
                  stroke="var(--c-on-accent)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </span>
        </button>

        {/* Content is its own action, so the draggable card never wraps nested buttons. */}
        {onEdit ? (
          <button
            type="button"
            onClick={() => onEdit(task)}
            className="flex-1 min-w-0"
            style={{
              padding: 0,
              border: "none",
              background: "transparent",
              color: "inherit",
              fontFamily: "inherit",
              textAlign: "left",
              cursor: "pointer",
            }}
          >
            {taskContent}
          </button>
        ) : (
          <div className="flex-1 min-w-0">{taskContent}</div>
        )}

        {/* Hidden until the row is hovered or focused; see .rowActions. */}
        {rowActions && (
          <TaskRowActions task={task} actions={rowActions} backgroundTint={backgroundTint} />
        )}
      </div>

      <div aria-hidden="true" style={{ height: "var(--task-card-gap, 6px)" }} />
    </div>
  );
}
