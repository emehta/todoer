"use client";

import { ButtonHTMLAttributes, CSSProperties, ReactNode, useEffect, useMemo, useState } from "react";
import { Check, Copy, Plus } from "@phosphor-icons/react";
import {
  type DraggableAttributes,
  closestCenter,
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  KeyboardSensor,
  type Modifier,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Task } from "@/types/task";
import { Category } from "@/types/category";
import TaskItem from "./TaskItem";
import { collapseEmptyDays, dragDayEntries, gapLabel, type DayEntry } from "@/lib/day-gaps";
import type { TaskRowActionHandlers } from "./TaskRowActions";
import controls from "./TaskControls.module.css";
import { DAY_NAMES, MONTHS_SHORT, toDateStr } from "@/lib/date-utils";
const NO_DATE_GROUP_KEY = "__no_date__";

function sortByDisplayOrder(tasks: Task[]) {
  return [...tasks].sort((a, b) => {
    const orderDelta = (a.display_order ?? 0) - (b.display_order ?? 0);
    if (orderDelta !== 0) return orderDelta;
    return a.created_at.localeCompare(b.created_at);
  });
}

function groupDateLabel(dateStr: string, today: Date, tomorrow: Date): string {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDate();
  const month = MONTHS_SHORT[d.getMonth()];
  const dayName = DAY_NAMES[d.getDay()];
  if (d.getTime() === today.getTime()) return `${day} ${month} · Today · ${dayName}`;
  if (d.getTime() === tomorrow.getTime()) return `${day} ${month} · Tomorrow · ${dayName}`;
  return `${day} ${month} · ${dayName}`;
}

function buildContinuousUpcomingDates(sortedDates: string[], today: Date): string[] {
  const todayKey = toDateStr(today);
  const upcomingDates = sortedDates.filter((date) => date >= todayKey);

  if (upcomingDates.length === 0) {
    return sortedDates;
  }

  const cursor = new Date(today);
  const end = new Date(upcomingDates[upcomingDates.length - 1] + "T00:00:00");
  const dateKeys = new Set<string>();

  while (cursor <= end) {
    dateKeys.add(toDateStr(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  for (const date of sortedDates) {
    dateKeys.add(date);
  }

  return [...dateKeys].sort();
}

/*
 * The days as the list draws them: earliest first, or latest first for a
 * list of days gone by. A gap keeps its own label ("2 to 4 Oct"), which
 * names its days in the calendar's order whichever way the list runs.
 */
function inDayOrder(entries: DayEntry[], newestFirst: boolean): DayEntry[] {
  return newestFirst ? [...entries].reverse() : entries;
}

function getContainerId(groupKey: string) {
  return `container:${groupKey}`;
}

/*
 * The Overdue box's days are groups of their own, apart from the list's
 * days below, so the two can never be mistaken for each other.
 */
const OVERDUE_PREFIX = "overdue:";

function overdueGroupKey(date: string) {
  return `${OVERDUE_PREFIX}${date}`;
}

function isOverdueGroup(groupKey: string) {
  return groupKey.startsWith(OVERDUE_PREFIX);
}

function groupKeyToDueDate(groupKey: string): string | null {
  if (groupKey === NO_DATE_GROUP_KEY) return null;
  return isOverdueGroup(groupKey) ? groupKey.slice(OVERDUE_PREFIX.length) : groupKey;
}

type TaskMoveRequest = {
  taskId: string;
  dueDate: string | null;
  prevTaskId: string | null;
  nextTaskId: string | null;
};

function EmptyDayRow({
  date,
  label,
  onOpenCreate,
  dragging,
}: {
  date: string;
  label: string;
  onOpenCreate?: (dueDate?: string) => void;
  dragging: boolean;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: getContainerId(date),
  });

  const active = dragging && isOver;

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={() => onOpenCreate?.(date)}
      disabled={!onOpenCreate}
      aria-label={dragging ? `Drop a task on ${label}` : `Add task for ${label}`}
      className={controls.emptyDayAction}
      style={{
        width: "100%",
        minHeight: 42,
        border: active ? "1px solid var(--c-accent)" : "1px dashed var(--c-border)",
        borderRadius: "var(--ui-radius-md)",
        padding: "10px 16px",
        color: active ? "var(--c-accent)" : "var(--c-text-3)",
        fontSize: "var(--ui-type-body-sm)",
        fontWeight: active ? 600 : 500,
        background: active
          ? "color-mix(in srgb, var(--c-accent) 15%, transparent)"
          : "var(--c-surface)",
        cursor: onOpenCreate ? "pointer" : "default",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        transition: "background var(--motion-base) var(--ease-out), border-color var(--motion-base) var(--ease-out), color var(--motion-base) var(--ease-out)",
      }}
    >
      {!dragging && <Plus size={15} weight="bold" />}
      {/* These rows only appear on their own while a task is being dragged
          now; the rest of the time an empty day is part of a gap. */}
      {active ? "Drop task here" : dragging ? "Drop here" : "Add task"}
    </button>
  );
}

/**
 * Where the list skips days: a dot, a dotted line and a dot, with the dates
 * beside it, instead of a heading and an "Add task" row for every empty day.
 * Not a control. To add a task on one of those days use Add task at the top
 * and pick the date. To move one there, drag it: the days of the next two
 * weeks open up while it is held, and a day further out is set with the
 * row's date picker.
 */
function DayGap({ from, to, days }: { from: string; to: string; days: number }) {
  const label = gapLabel(from, to);
  return (
    <div
      role="note"
      aria-label={`${label}: nothing due`}
      className="mb-6"
      /* Up by the last card's own gap, so the note sits where a day would. */
      style={{ display: "flex", alignItems: "center", gap: 12, marginTop: "calc(-1 * var(--task-card-gap, 6px))", paddingLeft: 3 }}
    >
      <span aria-hidden="true" style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
        <span style={GAP_DOT} />
        <span style={{ width: 0, height: 20, borderLeft: "1.5px dotted var(--c-text-4)", margin: "3px 0" }} />
        <span style={GAP_DOT} />
      </span>
      <span style={{ fontSize: "var(--ui-type-label)", color: "var(--c-text-3)", fontWeight: 500 }}>
        {label}
        <span style={{ color: "var(--c-text-4)", fontWeight: 400 }}>
          {" · "}nothing due{days > 1 ? ` for ${days} days` : ""}
        </span>
      </span>
    </div>
  );
}

const GAP_DOT: CSSProperties = {
  width: 7,
  height: 7,
  borderRadius: "var(--ui-radius-round)",
  border: "1.5px solid var(--c-text-4)",
  background: "transparent",
};

function DroppableTaskGroup({
  groupKey,
  children,
}: {
  groupKey: string;
  children: ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: getContainerId(groupKey),
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 0,
        borderRadius: "var(--ui-radius-lg)",
        background: isOver ? "color-mix(in srgb, var(--c-surface) 90%, var(--c-accent) 10%)" : "transparent",
        transition: "background var(--motion-base) var(--ease-out)",
      }}
    >
      {children}
    </div>
  );
}

/*
 * A task moves up and down its list and nowhere else. Without this the row
 * followed the pointer sideways too, so it could be pulled off the column
 * though no drop there means anything: the lists are stacked, never side by
 * side. The goal tabs have the same rule the other way round (alongTheRow).
 */
const upAndDown: Modifier = ({ transform }) => ({ ...transform, x: 0 });

function SortableTask({
  task,
  renderTask,
}: {
  task: Task;
  renderTask: (task: Task, options: {
    setNodeRef: (node: HTMLDivElement | null) => void;
    setActivatorNodeRef: (node: HTMLElement | null) => void;
    attributes: DraggableAttributes;
    listeners: Record<string, unknown> | undefined;
    transform: string | undefined;
    transition: string | undefined;
    isDragging: boolean;
  }) => React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
  });

  return (
    <>
      {renderTask(task, {
        setNodeRef,
        setActivatorNodeRef,
        attributes,
        listeners,
        /*
         * Translate, not Transform: Transform also writes dnd-kit's scaleX and
         * scaleY, which size the dragged row to whichever row it is over. A
         * task with a description is taller than one without, so crossing one
         * squashed the row and the text inside it.
         */
        transform: CSS.Translate.toString(transform),
        transition,
        isDragging,
      })}
    </>
  );
}

/*
 * "29 Sep · Today · Tuesday" above each day. The owner asked for them bigger
 * twice: 14px to 16px on 29 Sep 2026, then 16px to 18px on 1 Oct. 18 is the
 * scale's title-sm step, between the 14px task titles and the 24px page
 * heading, so a day still reads as a section of the page and not a second
 * page title. A real heading, so a screen reader can move from day to day.
 * The same for every day, the Overdue box's days and No date.
 */
const DAY_HEADING: CSSProperties = {
  margin: "0 0 var(--day-heading-gap, 10px)",
  fontSize: "var(--ui-type-title-sm, 18px)",
  fontWeight: 650,
  lineHeight: 1.3,
  letterSpacing: "-0.01em",
  color: "var(--c-text-1)",
};

/* A day heading with Copy at its end: the heading keeps the row's margin. */
const DAY_HEADING_ROW: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  margin: DAY_HEADING.margin,
};

const COPIED_FOR_MS = 1600;

/**
 * A day's heading, with Copy at its end when the page can copy the day.
 * "Copied" stays a moment and goes; the page reports a copy that failed in
 * its own banner, so a failure never shows "Copied".
 */
function DayHeading({ label, onCopy }: { label: string; onCopy?: () => Promise<boolean> }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), COPIED_FOR_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  if (!onCopy) return <h2 style={DAY_HEADING}>{label}</h2>;

  return (
    <div style={DAY_HEADING_ROW}>
      {/* The heading keeps its width; the button gives way (TaskControls.module.css). */}
      <h2 style={{ ...DAY_HEADING, margin: 0, flex: "0 0 auto", maxWidth: "calc(100% - 44px)" }}>{label}</h2>
      <button
        type="button"
        className={controls.copyDay}
        data-copied={copied ? "true" : undefined}
        aria-label={`Copy the tasks for ${label}`}
        onClick={() => {
          /*
           * Called straight from the click, with nothing awaited first:
           * Safari only lets a page write the clipboard inside the gesture.
           */
          void onCopy().then((done) => { if (done) setCopied(true); });
        }}
      >
        {copied ? <Check size={14} weight="bold" aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
        <span className={controls.copyDayLabel} aria-hidden="true">{copied ? "Copied" : "Copy"}</span>
      </button>
      <span role="status" className="sr-only">{copied ? `Copied the tasks for ${label}` : ""}</span>
    </div>
  );
}

interface Props {
  tasks: Task[];
  categories: Category[];
  /**
   * Today's `YYYY-MM-DD` key, from the page (lib/use-today), so the list
   * moves on at midnight: "Today" on the right day, and yesterday's tasks
   * out of it.
   */
  todayKey: string;
  onToggle: (id: string, completed: boolean, cx?: number, cy?: number) => void;
  onEdit?: (task: Task) => void;
  onOpenCreate?: (dueDate?: string) => void;
  onMoveTask?: (move: TaskMoveRequest) => Promise<void>;
  hideAddTask?: boolean;
  showEmptyUpcomingDays?: boolean;
  /**
   * The latest day at the top and the earliest at the bottom, for a list of
   * days already past (Historical). No date stays last, and the Overdue box
   * keeps its own oldest first order.
   */
  newestFirst?: boolean;
  rowActions?: TaskRowActionHandlers;
  /** What an empty list says; the page knows why it is empty and this does not. */
  emptyMessage?: string;
  /**
   * The overdue tasks, drawn above the list inside a frame the page gives
   * (the red Overdue box). In the list's own drag, not a list of their own:
   * two lists are two drags, and a task could not be pulled out of the box
   * onto a day below it. `frame` is handed the box's days and decides
   * whether to show them, since the box can be shut.
   */
  overdue?: { tasks: Task[]; frame: (days: ReactNode) => ReactNode };
  /**
   * Copies one day: handed the tasks the list shows for it, in the list's
   * order (open ones on Current and Overdue, done ones on Historical; the
   * page adds the rest), it resolves true once they are on the clipboard.
   * `null` is No date. Offered on every day that lists a task, never on the
   * Overdue box's days: overdue tasks are not part of what is on today.
   */
  onCopyDay?: (dateKey: string | null, tasks: Task[]) => Promise<boolean>;
}

export default function TaskList({
  tasks,
  categories,
  todayKey,
  onToggle,
  onEdit,
  onOpenCreate,
  onMoveTask,
  hideAddTask,
  showEmptyUpcomingDays = false,
  newestFirst = false,
  rowActions,
  emptyMessage,
  overdue,
  onCopyDay,
}: Props) {
  const overdueTasks = overdue?.tasks;
  const today = new Date(todayKey + "T00:00:00");
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 4,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const taskMap = useMemo(() => {
    return new Map([...tasks, ...(overdueTasks ?? [])].map((task) => [task.id, task]));
  }, [tasks, overdueTasks]);

  const overdueIds = useMemo(() => new Set((overdueTasks ?? []).map((task) => task.id)), [overdueTasks]);

  const baseState = useMemo(() => {
    const byDate: Record<string, Task[]> = {};
    const noDate: Task[] = [];

    for (const task of tasks) {
      if (!task.due_date) {
        noDate.push(task);
        continue;
      }
      (byDate[task.due_date] ??= []).push(task);
    }

    const sortedDates = Object.keys(byDate).sort();
    const displayDates = showEmptyUpcomingDays
      ? buildContinuousUpcomingDates(sortedDates, new Date(todayKey + "T00:00:00"))
      : sortedDates;

    const groups: Record<string, string[]> = {};

    for (const date of displayDates) {
      groups[date] = sortByDisplayOrder(byDate[date] ?? []).map((task) => task.id);
    }

    const sortedNoDate = sortByDisplayOrder(noDate);
    const hasNoDateGroup = sortedNoDate.length > 0;

    if (hasNoDateGroup) {
      groups[NO_DATE_GROUP_KEY] = sortedNoDate.map((task) => task.id);
    }

    const byOverdueDate: Record<string, Task[]> = {};
    for (const task of overdueTasks ?? []) {
      if (task.due_date) (byOverdueDate[task.due_date] ??= []).push(task);
    }
    const overdueDates = Object.keys(byOverdueDate).sort();
    for (const date of overdueDates) {
      groups[overdueGroupKey(date)] = sortByDisplayOrder(byOverdueDate[date]).map((task) => task.id);
    }

    return {
      groups,
      displayDates,
      overdueDates,
      hasNoDateGroup,
      hasContent: sortedDates.length > 0 || sortedNoDate.length > 0,
    };
  }, [showEmptyUpcomingDays, tasks, overdueTasks, todayKey]);

  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [dragGroups, setDragGroups] = useState<Record<string, string[]> | null>(null);

  useEffect(() => {
    if (!activeTaskId) {
      setDragGroups(null);
    }
  }, [activeTaskId, baseState.groups]);

  const renderedGroups = dragGroups ?? baseState.groups;
  const dragging = activeTaskId !== null;
  const draggingOverdue = activeTaskId !== null && overdueIds.has(activeTaskId);

  /*
   * A task already in the list is never dropped into the Overdue box: that
   * would give it a date in the past. The box's own tasks move freely, out
   * onto any day below or between the box's days.
   */
  const mayEnter = (taskId: string, groupKey: string) => !isOverdueGroup(groupKey) || overdueIds.has(taskId);

  /*
   * The days the list opens up while a task is dragged. Today is always one
   * of them for a task from the Overdue box, even when nothing else is due
   * and the list would not otherwise show it: that is where an overdue task
   * is most often taken.
   */
  const dragDates =
    draggingOverdue && !baseState.displayDates.includes(todayKey)
      ? [...baseState.displayDates, todayKey].sort()
      : baseState.displayDates;

  function findGroupForTask(taskId: string, groups: Record<string, string[]>) {
    for (const [groupKey, taskIds] of Object.entries(groups)) {
      if (taskIds.includes(taskId)) {
        return groupKey;
      }
    }
    return null;
  }

  function getOverGroupKey(overId: string, groups: Record<string, string[]>) {
    if (overId.startsWith("container:")) {
      return overId.slice("container:".length);
    }
    return findGroupForTask(overId, groups);
  }

  function handleDragStart(event: DragStartEvent) {
    const taskId = String(event.active.id);
    setActiveTaskId(taskId);
    setDragGroups(baseState.groups);
  }

  function handleDragOver(event: DragOverEvent) {
    const over = event.over;

    if (!over || !activeTaskId) {
      return;
    }

    const overId = String(over.id);

    setDragGroups((current) => {
      const groups = current ?? baseState.groups;
      const activeGroupKey = findGroupForTask(activeTaskId, groups);
      const overGroupKey = getOverGroupKey(overId, groups);

      if (!activeGroupKey || !overGroupKey) {
        return groups;
      }

      if (activeGroupKey === overGroupKey || !mayEnter(activeTaskId, overGroupKey)) {
        return groups;
      }

      const activeItems = groups[activeGroupKey] ?? [];
      const overItems = groups[overGroupKey] ?? [];
      const activeIndex = activeItems.indexOf(activeTaskId);
      const overIndex = overItems.indexOf(overId);

      if (activeIndex === -1) {
        return groups;
      }

      const isBelowOverItem =
        overIndex >= 0 &&
        event.active.rect.current.translated &&
        event.active.rect.current.translated.top >
          over.rect.top + over.rect.height / 2;

      const insertIndex =
        overId.startsWith("container:")
          ? overItems.length
          : overIndex >= 0
          ? overIndex + (isBelowOverItem ? 1 : 0)
          : overItems.length;

      return {
        ...groups,
        [activeGroupKey]: activeItems.filter((taskId) => taskId !== activeTaskId),
        [overGroupKey]: [
          ...overItems.slice(0, insertIndex),
          activeTaskId,
          ...overItems.slice(insertIndex),
        ],
      };
    });
  }

  async function handleDragEnd(event: DragEndEvent) {
    const over = event.over;
    const activeId = String(event.active.id);
    const startGroups = dragGroups ?? baseState.groups;

    setActiveTaskId(null);
    setDragGroups(null);

    if (!over || !onMoveTask) {
      return;
    }

    const overId = String(over.id);
    const activeGroupKey = findGroupForTask(activeId, startGroups);
    const overGroupKey = getOverGroupKey(overId, startGroups);

    if (!activeGroupKey || !overGroupKey) {
      return;
    }

    let finalGroups = startGroups;

    if (activeGroupKey === overGroupKey && !overId.startsWith("container:")) {
      const groupItems = finalGroups[activeGroupKey] ?? [];
      const activeIndex = groupItems.indexOf(activeId);
      const overIndex = groupItems.indexOf(overId);

      if (activeIndex === -1 || overIndex === -1) {
        return;
      }

      if (activeIndex !== overIndex) {
        finalGroups = {
          ...finalGroups,
          [activeGroupKey]: arrayMove(groupItems, activeIndex, overIndex),
        };
      }
    }

    const targetGroupKey = findGroupForTask(activeId, finalGroups);
    if (!targetGroupKey || !mayEnter(activeId, targetGroupKey)) {
      return;
    }

    const targetIds = finalGroups[targetGroupKey] ?? [];
    const targetIndex = targetIds.indexOf(activeId);

    if (targetIndex === -1) {
      return;
    }

    const prevTaskId = targetIndex > 0 ? targetIds[targetIndex - 1] : null;
    const nextTaskId = targetIndex < targetIds.length - 1 ? targetIds[targetIndex + 1] : null;
    const nextDueDate = groupKeyToDueDate(targetGroupKey);

    /* Where it started, read from the groups rather than from its date: an
       overdue task's day is one of the box's, not the list's. */
    const originalGroupKey = findGroupForTask(activeId, baseState.groups);
    const originalGroupItems = originalGroupKey ? baseState.groups[originalGroupKey] ?? [] : [];
    const originalIndex = originalGroupItems.indexOf(activeId);
    const unchanged =
      originalGroupKey === targetGroupKey &&
      originalIndex === targetIndex;

    if (unchanged) {
      return;
    }

    await onMoveTask({
      taskId: activeId,
      dueDate: nextDueDate,
      prevTaskId,
      nextTaskId,
    });
  }

  function renderTaskCard(taskId: string, groupKey: string) {
    const sourceTask = taskMap.get(taskId);
    if (!sourceTask) return null;

    const renderTask = sourceTask.due_date === groupKeyToDueDate(groupKey)
      ? sourceTask
      : { ...sourceTask, due_date: groupKeyToDueDate(groupKey) };

    return (
      <SortableTask
        key={taskId}
        task={renderTask}
        renderTask={(task, sortable) => (
          <TaskItem
            task={task}
            categories={categories}
            todayKey={todayKey}
            onUpdate={onToggle}
            onEdit={onEdit}
            rowActions={rowActions}
            containerRef={sortable.setNodeRef}
            containerStyle={{
              transform: sortable.transform,
              transition: sortable.transition,
              zIndex: sortable.isDragging ? 30 : "auto",
              position: "relative",
              willChange: dragging ? "transform" : "auto",
            }}
            dragAttributes={sortable.attributes as ButtonHTMLAttributes<HTMLButtonElement>}
            dragListeners={sortable.listeners as ButtonHTMLAttributes<HTMLButtonElement> | undefined}
            dragHandleRef={(node) => sortable.setActivatorNodeRef(node)}
            isDragging={sortable.isDragging}
          />
        )}
      />
    );
  }

  const noDateIds = renderedGroups[NO_DATE_GROUP_KEY] ?? [];

  /* Emptiness at rest, never the drag's own groups (see the days below). */
  function emptyAtRest(date: string): boolean {
    return (baseState.groups[date]?.length ?? 0) === 0;
  }

  /*
   * What a day's Copy copies: its tasks as the list holds them at rest, not
   * mid-drag, which are the open ones on Current and the done ones on
   * Historical, so every day of either has a Copy. No Copy on a day with
   * nothing listed.
   */
  function copyFor(groupKey: string): (() => Promise<boolean>) | undefined {
    if (!onCopyDay) return undefined;
    const listed = (baseState.groups[groupKey] ?? [])
      .map((id) => taskMap.get(id))
      .filter((task): task is Task => task !== undefined);
    if (listed.length === 0) return undefined;
    return () => onCopyDay(groupKeyToDueDate(groupKey), listed);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[upAndDown]}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={(event) => {
        void handleDragEnd(event).catch(() => undefined);
      }}
      onDragCancel={() => {
        setActiveTaskId(null);
        setDragGroups(null);
      }}
    >
      <div className={controls.list}>
        {overdue?.frame(
          baseState.overdueDates.map((date) => {
            const groupKey = overdueGroupKey(date);
            const dateLabel = groupDateLabel(date, today, tomorrow);
            const dateTaskIds = renderedGroups[groupKey] ?? [];
            return (
              <div key={groupKey} className="mb-6 last:mb-0">
                <h2 style={DAY_HEADING}>{dateLabel}</h2>
                {dateTaskIds.length > 0 ? (
                  <DroppableTaskGroup groupKey={groupKey}>
                    <SortableContext items={dateTaskIds} strategy={verticalListSortingStrategy}>
                      {dateTaskIds.map((taskId) => renderTaskCard(taskId, groupKey))}
                    </SortableContext>
                  </DroppableTaskGroup>
                ) : (
                  <EmptyDayRow date={groupKey} label={dateLabel} dragging={dragging} />
                )}
              </div>
            );
          }),
        )}

        {!baseState.hasContent && (
          <p className="py-8 text-center text-sm" style={{ color: "var(--c-text-4)" }}>
            {emptyMessage ?? (hideAddTask ? "Nothing here." : "No tasks yet. Add one below.")}
          </p>
        )}

        {/*
          Runs of empty days fold into one connector. While a task is being
          dragged, the empty days of the next two weeks open back into a drop
          row each, so there is still somewhere to drop it onto a day with
          nothing on it, and emptier stretches further out stay folded
          (lib/day-gaps). Emptiness is read from the list at rest, not from
          the drag's own groups, so a day does not fold under a task being
          dragged out of it. Turned newest first after folding, mid-drag too,
          so the days never swap ends under a task being dragged.
        */}
        {inDayOrder(dragging
          ? dragDayEntries(dragDates, emptyAtRest, todayKey)
          : collapseEmptyDays(baseState.displayDates, emptyAtRest),
        newestFirst).map((entry) => {
          if (entry.kind === "gap") {
            return <DayGap key={`gap-${entry.from}`} from={entry.from} to={entry.to} days={entry.days} />;
          }
          const date = entry.date;
          const dateLabel = groupDateLabel(date, today, tomorrow);
          const dateTaskIds = renderedGroups[date] ?? [];

          return (
            <div key={date} className="mb-6 last:mb-0">
              <DayHeading label={dateLabel} onCopy={copyFor(date)} />
              {dateTaskIds.length > 0 ? (
                <DroppableTaskGroup groupKey={date}>
                  <SortableContext items={dateTaskIds} strategy={verticalListSortingStrategy}>
                    {dateTaskIds.map((taskId) => renderTaskCard(taskId, date))}
                  </SortableContext>
                </DroppableTaskGroup>
              ) : (
                <EmptyDayRow
                  date={date}
                  label={dateLabel}
                  onOpenCreate={hideAddTask ? undefined : onOpenCreate}
                  dragging={dragging}
                />
              )}
            </div>
          );
        })}

        {baseState.hasNoDateGroup && (
          <div className="mb-6 last:mb-0">
            <DayHeading label="No date" onCopy={copyFor(NO_DATE_GROUP_KEY)} />
            <DroppableTaskGroup groupKey={NO_DATE_GROUP_KEY}>
              <SortableContext items={noDateIds} strategy={verticalListSortingStrategy}>
                {noDateIds.map((taskId) => renderTaskCard(taskId, NO_DATE_GROUP_KEY))}
              </SortableContext>
            </DroppableTaskGroup>
          </div>
        )}

        {!hideAddTask && onOpenCreate && (
          <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
            <button
              type="button"
              onClick={() => onOpenCreate()}
              className={controls.primary}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                border: "1px solid transparent",
                borderRadius: "var(--ui-radius-md)",
                padding: "10px 48px",
                fontSize: "var(--ui-type-body-sm)",
                fontWeight: 650,
                color: "var(--c-on-accent)",
                background: "var(--c-accent-strong)",
                cursor: "pointer",
                transition: "var(--transition-ui)",
                minWidth: 200,
              }}
            >
              <Plus size={15} weight="bold" />
              Add task
            </button>
          </div>
        )}
      </div>
    </DndContext>
  );
}

export type { TaskMoveRequest };
