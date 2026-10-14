"use client";

import { Suspense, useEffect, useRef, useState, useCallback, useMemo, type ReactNode, type RefObject } from "react";
import dynamic from "next/dynamic";
import { CaretDown, CaretRight, Lightbulb, Plus, X } from "@phosphor-icons/react";
import { supabase } from "@/lib/supabase";
import { Task, NewTask, Priority } from "@/types/task";
import type { TaskDraft } from "@/components/tasks/TaskEditModal";
import { Category, DEFAULT_GOAL_COLOR, GOAL_COLORS } from "@/types/category";
import CategoryTabs from "@/components/tasks/CategoryTabs";
import TaskList, { type TaskMoveRequest } from "@/components/tasks/TaskList";
import {
  TaskFilters,
  type DateFilter,
  type ViewFilter,
} from "@/components/tasks/FilterRow";
import GoalActions from "@/components/tasks/GoalActions";
import RambleButton from "@/components/tasks/RambleButton";
import type { GoalFormValues } from "@/components/tasks/GoalForm";
import TaskEditModal from "@/components/tasks/TaskEditModal";
import StatusBanner from "@/components/StatusBanner";
import SearchField from "@/components/SearchField";
import { HighlightScope } from "@/components/Highlight";
import { matchesWords, searchWords } from "@/lib/text-match";
import Modal from "@/components/Modal";
import { TasksSkeleton } from "@/components/skeletons/PageSkeletons";
import controls from "@/components/tasks/TaskControls.module.css";
import type { TaskPatch, TaskRowActionHandlers } from "@/components/tasks/TaskRowActions";
import { dayCopyTasks, formatDayForClipboard, formatTaskForClipboard } from "@/lib/task-clipboard";
import { useTimeFormat } from "@/lib/time-format";
import { getErrorMessage } from "@/lib/error-utils";
import { getWeekRange, useWeekStart, type WeekStartPreference } from "@/lib/week-start";
import { startOfMonth, toDateStr, todayStr } from "@/lib/date-utils";
import { useTodayKey } from "@/lib/use-today";
import { DOCK_ROOM, HEADER_ROOM, LIST_COLUMN_WIDTH, UNDER_DOCK_MARGIN } from "@/lib/styles";
import { usePhone } from "@/lib/use-viewport-width";
import { PAGE_CACHE_KEYS, readPageCache, writePageCache } from "@/lib/page-cache";
import { fetchAllRows } from "@/lib/supabase-paging";
import { assertDeleted } from "@/lib/supabase-delete";
import { DISPLAY_ORDER_STEP, placeByPriority, placeManyByPriority, sortTasksForDisplay } from "@/lib/task-order";
import { useUrlTarget } from "@/lib/use-url-target";
import LoadingState from "@/components/LoadingState";
import { preloadDescriptionEditor } from "@/components/form/DescriptionField";

/*
 * Insights is a dialog, and its chart is the page's only use of recharts
 * (about 85KB gzipped), so it loads when the dialog is first opened rather
 * than with every visit to the list.
 */
const StatsPanel = dynamic(() => import("@/components/tasks/StatsPanel"), {
  loading: () => <LoadingState label="Loading insights…" minHeight={320} />,
});

/* ─── helpers ─── */

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

function applyTaskUpdates(
  taskList: Task[],
  updates: Array<{ id: string; due_date?: string | null; display_order?: number }>,
) {
  const updatesById = new Map(updates.map((update) => [update.id, update]));

  return taskList.map((task) => {
    const update = updatesById.get(task.id);
    if (!update) return task;

    return {
      ...task,
      due_date: update.due_date !== undefined ? update.due_date : task.due_date,
      display_order: update.display_order ?? task.display_order,
    };
  });
}

/*
 * What the page's writes are doing, for its reloads. `epoch` moves whenever a
 * write starts or ends. A reload whose query was out while it moved may have
 * read the rows from before that write, and showing them would undo on screen
 * what was just done: a tick put back, a new task gone. Such a reload is set
 * aside and run again once nothing is in flight (`reload`).
 */
type WriteSync = {
  pending: number;
  epoch: number;
  /** A reload was set aside and waits for the writes in flight to end. */
  waiting: boolean;
  reload: (() => void) | null;
};

/** A write to Supabase, counted for the reloads (WriteSync). */
function tracked<T>(sync: RefObject<WriteSync>, work: PromiseLike<T>): Promise<T> {
  const writes = sync.current;
  writes.pending += 1;
  writes.epoch += 1;
  return Promise.resolve(work).finally(() => {
    writes.pending -= 1;
    writes.epoch += 1;
    if (writes.pending === 0 && writes.waiting) {
      writes.waiting = false;
      writes.reload?.();
    }
  });
}

/*
 * Tasks a placement had to move to make room: shown at once, written in the
 * background, and a failure only reported, because the order on screen is
 * still right.
 */
function saveRenumber(
  sync: RefObject<WriteSync>,
  setTasks: (update: (prev: Task[]) => Task[]) => void,
  setPersistenceError: (message: string) => void,
  renumber: Array<{ id: string; display_order: number }>,
) {
  if (renumber.length === 0) return;
  const moved = new Map(renumber.map((r) => [r.id, r.display_order]));
  setTasks((prev) => prev.map((t) => {
    const order = moved.get(t.id);
    return order === undefined ? t : { ...t, display_order: order };
  }));
  void Promise.all(
    renumber.map((r) => tracked(sync, supabase.from("tasks").update({ display_order: r.display_order }).eq("id", r.id))),
  ).then((results) => {
    const failed = results.find((result) => result.error);
    if (failed?.error) setPersistenceError(getErrorMessage(failed.error, "Could not save the order of that day."));
  });
}

/*
 * The least time between two reloads on coming back to the tab. Focus and
 * visibility arrive together, and flicking between windows should not ask
 * Supabase for the list every time.
 */
const RELOAD_GAP_MS = 5000;

/** Ids per request in Mark all done: 100 uuids is about 3.7 KB of address. */
const MARK_DONE_BATCH = 100;

/** A save that failed in the background, with what was typed, to retry. */
type FailedSave =
  | { id: string; kind: "create"; draft: TaskDraft; error: string }
  | { id: string; kind: "edit"; task: Task; draft: TaskDraft; error: string };

function matchesDateFilter(
  task: Task,
  filter: DateFilter,
  weekStart: WeekStartPreference,
): boolean {
  if (filter === "all") return true;
  if (!task.due_date) return false;

  const taskDate = new Date(task.due_date + "T00:00:00");
  const today = startOfToday();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  switch (filter) {
    case "today":
      return toDateStr(taskDate) === toDateStr(today);
    case "tomorrow":
      return toDateStr(taskDate) === toDateStr(tomorrow);
    case "week": {
      const range = getWeekRange(today, weekStart);
      return taskDate >= range.start && taskDate <= range.end;
    }
    case "next-week": {
      const nw = new Date(today);
      nw.setDate(nw.getDate() + 7);
      const range = getWeekRange(nw, weekStart);
      return taskDate >= range.start && taskDate <= range.end;
    }
    case "month": {
      const ms = startOfMonth(today);
      const me = endOfMonth(today);
      return taskDate >= ms && taskDate <= me;
    }
    case "next-month": {
      const nm = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      const nms = startOfMonth(nm);
      const nme = endOfMonth(nm);
      return taskDate >= nms && taskDate <= nme;
    }
    default:
      return true;
  }
}

/*
 * The goal, search and priority the list is narrowed to, which every view
 * shares. The view and the date filter go on top of it in filteredTasks; a
 * day's Copy holds the day's completed tasks to this alone, since they are on
 * the same day as the open ones beside them.
 */
interface ListNarrowing {
  categoryId: string | null;
  /** The search's words, already folded (lib/text-match). */
  words: readonly string[];
  priority: Priority | "all";
}

function matchesNarrowing(task: Task, { categoryId, words, priority }: ListNarrowing): boolean {
  if (categoryId !== null && task.category_id !== categoryId) return false;

  /* The description as well as the title, because a task is often filed
     under a terse title and the thing you remember about it is in the note
     underneath. Every word somewhere in one of them, in any order. */
  if (!matchesWords(words, [task.title, task.description])) return false;

  return priority === "all" || task.priority === priority;
}

/* ─── separator ─── */

/*
 * How far apart the page's rows stand on a phone: the title row, the search
 * and its filters (one unit, 8px inside), the goals between their two rules,
 * Overdue, then the days. A desktop keeps 12 and 16; on a phone the same
 * read as cramped (the owner, 8 Oct 2026).
 */
const PHONE_ROW_GAP = 20;
const PHONE_RULE_GAP = 18;
const PHONE_OVERDUE_GAP = 24;

function Separator({ phone }: { phone: boolean }) {
  return (
    <div
      style={{
        // Full width: at 85% it stopped short of the right edge of the task
        // cards below it, which read as a misalignment rather than a choice.
        width: "100%",
        height: 1,
        background: "var(--c-border)",
        margin: `${phone ? PHONE_RULE_GAP : 12}px 0`,
      }}
    />
  );
}

/* ─── page ─── */

function TasksPageInner() {
  const weekStart = useWeekStart();
  const phone = usePhone();
  /*
   * Seeded from whatever this page last showed, so coming back to it paints
   * immediately instead of on a spinner. The fetch below still runs on every
   * mount; the cache only decides the first frame.
   */
  const [tasks, setTasks] = useState<Task[]>(() => readPageCache<Task[]>(PAGE_CACHE_KEYS.tasks) ?? []);
  const [categories, setCategories] = useState<Category[]>(
    () => readPageCache<Category[]>(PAGE_CACHE_KEYS.taskCategories) ?? [],
  );
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ViewFilter>("all");
  /*
   * Not debounced, unlike Finance's. That one re-queries Supabase on every
   * change, so a pause is the difference between one request and twelve; this
   * filters an array already in memory, where a pause is only latency between
   * a keystroke and the list reacting to it.
   */
  const [taskQuery, setTaskQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "all">("all");
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  /* The pencil opens the dialog already editing; clicking the row shows it. */
  const [editingStartsInEdit, setEditingStartsInEdit] = useState(false);
  const timeFormat = useTimeFormat();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createInitialDueDate, setCreateInitialDueDate] = useState<string | null>(null);
  /*
   * Saves that failed, oldest first, each with what was typed. A card closes
   * before its write lands, so without this a failure threw the draft away and
   * left only a banner. One slot used to hold it, and the failure took over
   * whichever card was open to show it: the card being typed in became the
   * failed one, and a second failure was lost. Each now waits its turn and
   * comes back as its own card once no other is open (below).
   */
  const [failedSaves, setFailedSaves] = useState<FailedSave[]>([]);
  /* The failed save on screen. It stays there until closed, even if another
     card opens over it from a link. */
  const [shownFailedId, setShownFailedId] = useState<string | null>(null);
  const sync = useRef<WriteSync>({ pending: 0, epoch: 0, waiting: false, reload: null });
  const [loading, setLoading] = useState(() => readPageCache<Task[]>(PAGE_CACHE_KEYS.tasks) === undefined);
  const [initialLoadComplete, setInitialLoadComplete] = useState(
    () => readPageCache<Task[]>(PAGE_CACHE_KEYS.tasks) !== undefined,
  );
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [overdueOpen, setOverdueOpen] = useState(false);
  /* Open while searching: the box starts collapsed, so a match inside it
     was counted in its badge and shown nowhere. */
  const overdueShown = overdueOpen || taskQuery.trim() !== "";
  const [persistenceError, setPersistenceError] = useState("");

  /*
   * The task card's description editor, fetched once the page is idle, so a
   * card opened a moment later already has it. A second after load where
   * the browser has no idle callback (Safari before 18.4).
   */
  useEffect(() => {
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(preloadDescriptionEditor, { timeout: 4000 });
      return () => window.cancelIdleCallback(handle);
    }
    const timer = window.setTimeout(preloadDescriptionEditor, 1000);
    return () => window.clearTimeout(timer);
  }, []);

  /* ─── data loading ─── */

  /*
   * On arriving, and again whenever the tab comes back into view or its
   * window takes focus. The list used to load once, so a tab left open showed
   * nothing done on the phone since, and wrote its old copy of a task back
   * over the phone's on the next save. The reload on return is quiet: no
   * spinner, the list on screen stays put if it fails, and a save's error in
   * the banner is left alone.
   */
  useEffect(() => {
    const writes = sync.current;
    let alive = true;
    let inFlight = false;
    let lastStarted = 0;
    /* Whether a reload set aside for the writes is the first load, which
       still owes the page its spinner's end. */
    let retryFirst = false;
    /* The banner this effect put up, so a later reload that lands clears
       that and nothing else. */
    let loadError: string | null = null;

    async function load(first: boolean) {
      inFlight = true;
      lastStarted = Date.now();
      const startEpoch = writes.epoch;
      let setAside = false;
      try {
        if (first) setPersistenceError("");
        /*
         * Paged, not a bare select. PostgREST stops at 1000 rows without
         * saying so, and a task list that has been running for a few years
         * reaches that — at which point the oldest completed tasks quietly
         * vanish from Historical.
         */
        const [taskRows, catRes] = await Promise.all([
          fetchAllRows<Task>(() =>
            supabase
              .from("tasks")
              .select("*")
              .order("display_order", { ascending: true })
              .order("created_at", { ascending: true })
              // Neither column above is unique, so paging needs a tiebreaker.
              .order("id", { ascending: true }),
          ),
          /* id as the tiebreak, so two tabs that ever share an order still
             come back in the same order on every load. */
          supabase.from("categories").select("*").order("display_order", { ascending: true }).order("id", { ascending: true }),
        ]);

        if (catRes.error) throw catRes.error;
        if (!alive) return;
        if (writes.epoch !== startEpoch || writes.pending > 0) {
          setAside = true;
          return;
        }

        setTasks(taskRows);
        setCategories(catRes.data ?? []);
        setInitialLoadComplete(true);
        if (loadError !== null) {
          const shown = loadError;
          setPersistenceError((current) => (current === shown ? "" : current));
          loadError = null;
        }
      } catch (error) {
        if (alive && first) {
          loadError = getErrorMessage(error, "Could not load your tasks from Supabase.");
          setPersistenceError(loadError);
        }
      } finally {
        inFlight = false;
        if (alive && setAside) {
          /* Again once nothing is in flight: now, or when the last write ends. */
          retryFirst = first;
          if (writes.pending > 0) writes.waiting = true;
          else void load(first);
        } else if (alive && first) {
          setLoading(false);
        }
      }
    }

    function onReturn() {
      if (document.visibilityState !== "visible" || inFlight) return;
      if (Date.now() - lastStarted < RELOAD_GAP_MS) return;
      void load(false);
    }

    writes.reload = () => {
      if (alive && !inFlight) void load(retryFirst);
    };
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    void load(true);
    return () => {
      alive = false;
      writes.reload = null;
      writes.waiting = false;
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
    };
  }, [loadAttempt]);

  useEffect(() => {
    if (!initialLoadComplete) return;
    writePageCache(PAGE_CACHE_KEYS.tasks, tasks);
    writePageCache(PAGE_CACHE_KEYS.taskCategories, categories);
  }, [initialLoadComplete, tasks, categories]);

  /* ─── task CRUD ─── */

  const handleToggle = useCallback(
    /*
     * The confetti is the row's now: TaskItem fires it on the click, pops the
     * circle and draws the tick, and calls this about half a second later to
     * save. It used to fire here once the write came back, which was the
     * delay the owner noticed. A failed save still puts the task back and
     * says so; the burst it already had is the price of answering at once.
     */
    async (id: string, completed: boolean) => {
      setPersistenceError("");
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, completed } : t)));
      try {
        const { error } = await tracked(sync, supabase.from("tasks").update({ completed }).eq("id", id));
        if (error) throw error;
      } catch (error) {
        setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, completed: !completed } : t)));
        setPersistenceError(getErrorMessage(error, "Could not save that task update."));
      }
    },
    [],
  );

  /**
   * Add a task without waiting for the database to agree.
   *
   * The project lives in us-east-1 and the person using it does not, so an
   * insert that returns the row is a quarter of a second of round trip before
   * anything appears. The dialog used to hold you there for all of it.
   *
   * The id is generated here rather than by the default, which is what makes
   * this safe: the row rendered optimistically carries the id it will really
   * have, so completing or dragging it in the meantime addresses the right
   * row instead of one that does not exist yet.
   */
  /**
   * Where a task lands in its day: below the last open task as important as
   * it, so a new Critical goes to the top and a High never sits under a
   * Medium (lib/task-order). Used for a new task, a duplicate, and a task
   * whose priority or day changes; a drag is placed exactly where it was
   * dropped instead, by handleMoveTask, and nothing re-sorts it afterwards.
   *
   * When the two neighbours have no integer left between them, the day is
   * renumbered in its own order: shown at once, written in the background,
   * and a failure only reported, because the order on screen is still right.
   */
  const placeTask = useCallback(
    (dueDate: string | null, priority: Priority, excludeId?: string) => {
      const { displayOrder, renumber } = placeByPriority(tasks, { dueDate, priority, excludeId });
      saveRenumber(sync, setTasks, setPersistenceError, renumber);
      return displayOrder;
    },
    [tasks],
  );

  const handleAdd = useCallback(
    async (task: NewTask) => {
      setPersistenceError("");
      const optimistic: Task = {
        ...task,
        id: crypto.randomUUID(),
        completed: false,
        created_at: new Date().toISOString(),
        display_order: placeTask(task.due_date, task.priority),
      };

      setTasks((prev) => [...prev, optimistic]);

      void (async () => {
        const { data, error } = await tracked(sync, supabase
          .from("tasks")
          .insert([optimistic])
          .select()
          .single());

        if (error) {
          setTasks((prev) => prev.filter((t) => t.id !== optimistic.id));
          /* Comes back as its own card once no other is open, never in place
             of the one being typed in. */
          setFailedSaves((prev) => [...prev, {
            id: crypto.randomUUID(),
            kind: "create",
            draft: task,
            error: getErrorMessage(error, "Could not create that task."),
          }]);
          return;
        }
        // Take the server's row, which carries the columns it filled in.
        if (data) setTasks((prev) => prev.map((t) => (t.id === optimistic.id ? data : t)));
      })();
    },
    [placeTask],
  );

  /**
   * Several new tasks at once, from Ramble's Add: placed together, so each
   * lands below the ones said before it rather than all on one number
   * (placeManyByPriority), shown at once, and written in one insert. A
   * failure takes them off again and brings each back as its own card, as a
   * failed Add task does.
   */
  const handleAddMany = useCallback(
    (newTasks: NewTask[]) => {
      if (newTasks.length === 0) return;
      setPersistenceError("");
      const createdAt = new Date().toISOString();
      const withIds = newTasks.map((task) => ({ task, id: crypto.randomUUID() }));
      const { displayOrders, renumber } = placeManyByPriority(
        tasks,
        withIds.map(({ task, id }) => ({ id, dueDate: task.due_date, priority: task.priority })),
      );
      saveRenumber(sync, setTasks, setPersistenceError, renumber);
      const rows: Task[] = withIds.map(({ task, id }) => ({
        ...task,
        id,
        completed: false,
        created_at: createdAt,
        display_order: displayOrders.get(id) ?? DISPLAY_ORDER_STEP,
      }));
      const ids = new Set(rows.map((row) => row.id));

      setTasks((prev) => [...prev, ...rows]);

      void (async () => {
        const { data, error } = await tracked(sync, supabase.from("tasks").insert(rows).select());
        if (error) {
          setTasks((prev) => prev.filter((t) => !ids.has(t.id)));
          const message = getErrorMessage(error, "Could not add those tasks.");
          setFailedSaves((prev) => [
            ...prev,
            ...newTasks.map((draft) => ({ id: crypto.randomUUID(), kind: "create" as const, draft, error: message })),
          ]);
          return;
        }
        /* The server's rows, which carry the columns it filled in. */
        const saved = new Map(((data ?? []) as Task[]).map((row) => [row.id, row]));
        setTasks((prev) => prev.map((t) => saved.get(t.id) ?? t));
      })();
    },
    [tasks],
  );

  const handleEditSave = useCallback(
    /*
     * `base` is the task as its card opened it, and `changes` only what the
     * card changed from that, so this writes those fields and no others: a
     * description changed on the phone since the card opened stays as the
     * phone left it. `draft` is everything on the card, for a failure.
     */
    async (base: Task, changes: Partial<TaskDraft>, draft: TaskDraft) => {
      setPersistenceError("");
      const taskId = base.id;
      const existingTask = tasks.find((task) => task.id === taskId) ?? null;
      /* Gone since the card opened, deleted on another device and taken off
         by a reload: said in the card, which stays open, rather than closed
         as if saved. */
      if (!existingTask) throw new Error("This task was deleted, so the change could not be saved.");

      /* A new day or a new priority is a new place in the list. Any other
         edit leaves the task where it is, including where it was dragged. */
      const dueDateChanged = changes.due_date !== undefined && changes.due_date !== existingTask.due_date;
      const priorityChanged = changes.priority !== undefined && changes.priority !== existingTask.priority;
      const payload: Partial<Task> = dueDateChanged || priorityChanged
        ? {
            ...changes,
            display_order: placeTask(
              changes.due_date !== undefined ? changes.due_date : existingTask.due_date,
              changes.priority ?? existingTask.priority,
              taskId,
            ),
          }
        : changes;
      /* What those fields held, to put back if the write fails. */
      const undo = Object.fromEntries(
        Object.keys(payload).map((key) => [key, existingTask[key as keyof Task]]),
      ) as Partial<Task>;

      /*
       * Show the edit and close the dialog now, write in the background.
       * Waiting for us-east-1 meant the card sat on "Saving…" for the whole
       * round trip for a change that was never going to be rejected. A failure
       * puts those fields back as they were and brings the card back with the
       * edit in it, once no other card is open.
       */
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...payload } : t)));
      setEditingTask(null);

      void (async () => {
        const { data, error } = await tracked(sync, supabase
          .from("tasks")
          .update(payload)
          .eq("id", taskId)
          .select()
          .single());

        if (error) {
          setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...undo } : t)));
          setFailedSaves((prev) => [...prev, {
            id: crypto.randomUUID(),
            kind: "edit",
            task: base,
            draft,
            error: getErrorMessage(error, "Could not save that task."),
          }]);
          return;
        }
        if (data) setTasks((prev) => prev.map((t) => (t.id === taskId ? data : t)));
      })();
    },
    [tasks, placeTask],
  );

  const handleDelete = useCallback(async (id: string) => {
    setPersistenceError("");
    const { data, error } = await tracked(sync, supabase.from("tasks").delete().eq("id", id).select("id"));
    try {
      /* A delete RLS refused matches no rows and reports success; without
         this the row vanished and came back on the next load. */
      assertDeleted(data, error, "task");
    } catch (failure) {
      setPersistenceError(getErrorMessage(failure, "Could not delete that task."));
      throw failure;
    }
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  /**
   * A change made from the row rather than from the dialog.
   *
   * Optimistic, because setting a date or a priority should feel instant and
   * there is nothing to review. Moving a task to a different day also moves it
   * to the end of that day's group, the same rule handleEditSave follows, or it
   * would land wherever its old order happened to put it.
   */
  const handlePatchTask = useCallback(
    async (taskId: string, patch: TaskPatch) => {
      setPersistenceError("");
      const previous = tasks.find((task) => task.id === taskId);
      if (!previous) return;

      const movingDay = patch.due_date !== undefined && patch.due_date !== previous.due_date;
      const newPriority = patch.priority !== undefined && patch.priority !== previous.priority;
      const payload = movingDay || newPriority
        ? {
            ...patch,
            display_order: placeTask(
              patch.due_date !== undefined ? patch.due_date : previous.due_date,
              patch.priority ?? previous.priority,
              taskId,
            ),
          }
        : patch;

      setTasks((prev) => prev.map((task) => (task.id === taskId ? { ...task, ...payload } : task)));

      const { data, error } = await tracked(sync, supabase
        .from("tasks")
        .update(payload)
        .eq("id", taskId)
        .select()
        .single());

      if (error) {
        setTasks((prev) => prev.map((task) => (task.id === taskId ? previous : task)));
        setPersistenceError(getErrorMessage(error, "Could not save that task."));
        return;
      }

      if (data) setTasks((prev) => prev.map((task) => (task.id === taskId ? data : task)));
    },
    [tasks, placeTask],
  );

  /** A verbatim copy, placed at the end of the same day so it is easy to find. */
  const handleDuplicateTask = useCallback(
    async (task: Task) => {
      setPersistenceError("");
      const { data, error } = await tracked(sync, supabase
        .from("tasks")
        .insert([{
          title: task.title,
          description: task.description,
          due_date: task.due_date,
          due_time: task.due_time,
          priority: task.priority,
          category_id: task.category_id,
          completed: false,
          display_order: placeTask(task.due_date, task.priority),
        }])
        .select()
        .single());

      if (error) {
        setPersistenceError(getErrorMessage(error, "Could not duplicate that task."));
        return;
      }

      if (data) setTasks((prev) => [...prev, data]);
    },
    [placeTask],
  );

  /*
   * Plain text on the clipboard, for pasting into a message.
   *
   * writeText needs a secure context and a user gesture; it has both here, but
   * a denied clipboard permission still rejects, and saying nothing would look
   * exactly like a successful copy.
   */
  const handleCopyTask = useCallback(
    async (task: Task) => {
      setPersistenceError("");
      try {
        await navigator.clipboard.writeText(formatTaskForClipboard(task, timeFormat));
      } catch {
        setPersistenceError("Could not copy that task to the clipboard.");
      }
    },
    [timeFormat],
  );

  /*
   * A day on the clipboard, from the Copy on its heading: the tasks the list
   * hands over, then the day's completed ones under Completed. Current and
   * Overdue never hold a done task, so those come from every task, narrowed
   * the same way as the list; Historical's list is the done tasks, so a day
   * there copies as Completed alone (dayCopyTasks). Plain text for WhatsApp
   * or Messages, and the same lines as HTML for an app that pastes that
   * instead.
   *
   * The ClipboardItem is built and written inside the click, with nothing
   * awaited first, because Safari refuses a clipboard write that is not. A
   * browser with no ClipboardItem, or one that refuses the pair, gets the
   * plain text alone; one that refuses that too is told so in the banner
   * rather than shown "Copied".
   */
  const handleCopyDay = useCallback(
    async (dateKey: string | null, listed: Task[]): Promise<boolean> => {
      setPersistenceError("");
      const narrowing = { categoryId: activeCategoryId, words: searchWords(taskQuery), priority: priorityFilter };
      const dayTasks = dayCopyTasks(listed, tasks, dateKey, (task) => matchesNarrowing(task, narrowing));
      const { text, html } = formatDayForClipboard(dateKey, dayTasks, categories, timeFormat, startOfToday());
      try {
        if (typeof ClipboardItem === "undefined") throw new Error("No ClipboardItem");
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/plain": new Blob([text], { type: "text/plain" }),
            "text/html": new Blob([html], { type: "text/html" }),
          }),
        ]);
        return true;
      } catch {
        try {
          await navigator.clipboard.writeText(text);
          return true;
        } catch {
          setPersistenceError("Could not copy that day's tasks to the clipboard.");
          return false;
        }
      }
    },
    [tasks, activeCategoryId, taskQuery, priorityFilter, categories, timeFormat],
  );

  const rowActions = useMemo<TaskRowActionHandlers>(() => ({
    onEdit: (task) => { setEditingStartsInEdit(true); setEditingTask(task); },
    onPatch: handlePatchTask,
    onDuplicate: handleDuplicateTask,
    onCopy: handleCopyTask,
    /*
     * handleDelete rethrows so the dialog can stay open on a failure. The row
     * menu has nothing to keep open, and a bare `void` on a rejecting promise
     * is an unhandled rejection. The banner is already set by the time it
     * throws, so there is nothing left to say here.
     */
    onDelete: async (id) => {
      try {
        await handleDelete(id);
      } catch {
        // Reported by handleDelete through the page's error banner.
      }
    },
  }), [handlePatchTask, handleDuplicateTask, handleCopyTask, handleDelete]);

  const handleMoveTask = useCallback(
    async ({ taskId, dueDate, prevTaskId, nextTaskId }: TaskMoveRequest) => {
      const snapshot = tasks;
      const movingTask = snapshot.find((task) => task.id === taskId);

      if (!movingTask) {
        return;
      }

      setPersistenceError("");

      const targetGroupWithoutMoving = sortTasksForDisplay(
        snapshot.filter((task) => task.due_date === dueDate && task.id !== taskId),
      );

      const prevTask = prevTaskId ? snapshot.find((task) => task.id === prevTaskId) ?? null : null;
      const nextTask = nextTaskId ? snapshot.find((task) => task.id === nextTaskId) ?? null : null;

      const persistSingleMove = async (displayOrder: number) => {
        const optimistic = applyTaskUpdates(snapshot, [
          {
            id: taskId,
            due_date: dueDate,
            display_order: displayOrder,
          },
        ]);

        setTasks(optimistic);

        const { error } = await tracked(sync, supabase
          .from("tasks")
          .update({
            due_date: dueDate,
            display_order: displayOrder,
          })
          .eq("id", taskId));

        if (error) {
          setTasks(snapshot);
          setPersistenceError(getErrorMessage(error, "Could not move that task."));
          return;
        }
      };

      if (prevTask && nextTask) {
        const midpoint = Math.floor((prevTask.display_order + nextTask.display_order) / 2);
        if (midpoint > prevTask.display_order && midpoint < nextTask.display_order) {
          await persistSingleMove(midpoint);
          return;
        }
      } else if (prevTask && !nextTask) {
        await persistSingleMove(prevTask.display_order + DISPLAY_ORDER_STEP);
        return;
      } else if (!prevTask && nextTask) {
        await persistSingleMove(nextTask.display_order - DISPLAY_ORDER_STEP);
        return;
      } else if (targetGroupWithoutMoving.length > 0) {
        await persistSingleMove(
          targetGroupWithoutMoving[targetGroupWithoutMoving.length - 1].display_order + DISPLAY_ORDER_STEP,
        );
        return;
      } else {
        await persistSingleMove(DISPLAY_ORDER_STEP);
        return;
      }

      let insertionIndex = targetGroupWithoutMoving.length;
      if (nextTaskId) {
        const nextIndex = targetGroupWithoutMoving.findIndex((task) => task.id === nextTaskId);
        insertionIndex = nextIndex >= 0 ? nextIndex : targetGroupWithoutMoving.length;
      } else if (prevTaskId) {
        const prevIndex = targetGroupWithoutMoving.findIndex((task) => task.id === prevTaskId);
        insertionIndex = prevIndex >= 0 ? prevIndex + 1 : targetGroupWithoutMoving.length;
      }

      const reorderedTargetGroup = [...targetGroupWithoutMoving];
      reorderedTargetGroup.splice(insertionIndex, 0, {
        ...movingTask,
        due_date: dueDate,
      });

      const normalizedUpdates = reorderedTargetGroup.map((task, index) => ({
        id: task.id,
        due_date: task.id === taskId ? dueDate : task.due_date,
        display_order: (index + 1) * DISPLAY_ORDER_STEP,
      }));

      const optimistic = applyTaskUpdates(snapshot, normalizedUpdates);
      setTasks(optimistic);

      const results = await Promise.all(
        normalizedUpdates.map((update) =>
          tracked(sync, supabase
            .from("tasks")
            .update({
              due_date: update.due_date,
              display_order: update.display_order,
            })
            .eq("id", update.id)),
        ),
      );

      const failed = results.find((result) => result.error);
      if (failed?.error) {
        setTasks(snapshot);
        setPersistenceError(getErrorMessage(failed.error, "Could not move that task."));
      }
    },
    [tasks],
  );

  /* ─── category CRUD ─── */

  /*
   * A new goal: from the tab row's + (a name and a colour) or from New goal on
   * the action bar, whose form also sets the description, deadline and type.
   */
  const handleCreateCategory = useCallback(
    async (
      name: string,
      color: string,
      details?: Pick<GoalFormValues, "description" | "deadline" | "goal_type">,
    ) => {
      setPersistenceError("");
      /* After the largest, not at the count: once tabs have been dragged or
         deleted the two differ, and the count can land on a taken value. */
      const nextOrder = categories.reduce((max, c) => Math.max(max, c.display_order ?? 0), -1) + 1;
      const { data, error } = await tracked(sync, supabase
        .from("categories")
        .insert([{ name, color, display_order: nextOrder, ...(details ?? {}) }])
        .select()
        .single());
      // The card that asked shows the error (GoalForm, the task card's New goal), so the page does not repeat it.
      if (error) throw error;
      if (data) setCategories((prev) => [...prev, data]);
      return data as Category;
    },
    [categories],
  );

  const handleEditCategory = useCallback(
    async (
      id: string,
      name: string,
      color: string,
      description?: string | null,
      deadline?: string | null,
      goal_type?: string | null,
    ) => {
      const updates: Record<string, unknown> = { name, color };
      if (description !== undefined) updates.description = description;
      if (deadline !== undefined) updates.deadline = deadline;
      if (goal_type !== undefined) updates.goal_type = goal_type;

      setPersistenceError("");
      const { data, error } = await tracked(sync, supabase
        .from("categories")
        .update(updates)
        .eq("id", id)
        .select()
        .single());
      // Shown in the goal's own card (GoalForm), not repeated behind it.
      if (error) throw error;
      if (data) setCategories((prev) => prev.map((c) => (c.id === id ? data : c)));
    },
    [],
  );

  const handleDeleteCategory = useCallback(
    async (id: string) => {
      setPersistenceError("");
      const taskReset = await tracked(sync, supabase.from("tasks").update({ category_id: null }).eq("category_id", id));
      if (taskReset.error) {
        setPersistenceError(getErrorMessage(taskReset.error, "Could not take the tasks out of that goal."));
        throw taskReset.error;
      }
      /* Shown as soon as it is true in the database. If the delete below then
         fails, the screen still matches what was saved: the category stays,
         and its tasks are no longer in it. */
      setTasks((prev) =>
        prev.map((t) => (t.category_id === id ? { ...t, category_id: null } : t)),
      );

      const categoryDelete = await tracked(sync, supabase.from("categories").delete().eq("id", id).select("id"));
      try {
        assertDeleted(categoryDelete.data, categoryDelete.error, "goal");
      } catch (failure) {
        setPersistenceError(getErrorMessage(failure, "Could not delete that goal."));
        throw failure;
      }

      setCategories((prev) => prev.filter((c) => c.id !== id));
      if (activeCategoryId === id) setActiveCategoryId(null);
    },
    [activeCategoryId],
  );

  /*
   * Mark all done, from the action bar: the open tasks of the goal that the
   * list is showing, by id. It used to complete every open task filed under
   * the goal, including ones a filter was hiding, which is not what the count
   * on the button or the list on screen said.
   */
  const handleMarkDone = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      setPersistenceError("");
      /* The ids travel in the request's address, which Supabase's gateway caps
         at a few kilobytes: a goal with a few hundred open tasks would be
         refused whole. So a hundred at a time, and whatever was written
         before a failure still shows as done. */
      const changed = new Set<string>();
      let failure: unknown = null;
      for (let start = 0; start < ids.length; start += MARK_DONE_BATCH) {
        const { data, error } = await tracked(sync, supabase
          .from("tasks")
          .update({ completed: true })
          .in("id", ids.slice(start, start + MARK_DONE_BATCH))
          .eq("completed", false)
          .select("id"));
        if (error) {
          failure = error;
          break;
        }
        /* Only the rows the database says it changed, so a write RLS refused
           does not show as done. */
        for (const row of (data ?? []) as { id: string }[]) changed.add(row.id);
      }

      if (changed.size > 0) setTasks((prev) => prev.map((t) => (changed.has(t.id) ? { ...t, completed: true } : t)));
      if (failure) {
        setPersistenceError(getErrorMessage(failure, "Could not mark those tasks as done."));
        throw failure;
      }
      if (changed.size < ids.length) {
        setPersistenceError("Some of those tasks could not be marked done. Reload and try again.");
      }
    },
    [],
  );

  /**
   * The tabs in the order they were dragged to.
   *
   * Every category is renumbered 0..n rather than slotted between its new
   * neighbours: there are a handful of them, the order was stored as
   * 0, 1, 2 with no gaps to slot into, and a full renumbering cannot leave two
   * tabs on the same value. Only the rows whose number changed are written.
   * Shown at once and put back if a write fails, the way a task move is.
   */
  const handleReorderCategories = useCallback(
    async (orderedIds: string[]) => {
      const snapshot = categories;
      const byId = new Map(snapshot.map((c) => [c.id, c]));
      const next = orderedIds
        .map((id, index) => {
          const category = byId.get(id);
          return category ? { ...category, display_order: index } : null;
        })
        .filter((c): c is Category => c !== null);
      if (next.length !== snapshot.length) return;

      const changed = next.filter((c) => byId.get(c.id)?.display_order !== c.display_order);
      if (changed.length === 0) return;

      setPersistenceError("");
      setCategories(next);

      const results = await Promise.all(
        changed.map((c) =>
          tracked(sync, supabase.from("categories").update({ display_order: c.display_order }).eq("id", c.id).select("id")),
        ),
      );
      /* An update RLS refused matches no rows and reports success, so a
         missing row counts as a failure too. */
      const failed = results.find((result) => result.error || !result.data || result.data.length === 0);
      if (failed) {
        /*
         * Reloaded, not rolled back. Some of the writes may have landed, so
         * putting the old order back on screen could show an order the
         * database no longer has; what is stored is the truth to show.
         */
        const { data: stored } = await supabase
          .from("categories")
          .select("*")
          .order("display_order", { ascending: true })
          .order("id", { ascending: true });
        setCategories(stored ?? snapshot);
        setPersistenceError(getErrorMessage(failed.error, "Could not save the new order of your goals."));
      }
    },
    [categories],
  );

  /* ─── filtering ─── */

  /* Today's key, which moves on at midnight and when the tab comes back
     (lib/use-today), so the day-sensitive memos below recompute then, and
     only then. */
  const todayKey = useTodayKey();

  const filteredTasks = useMemo(() => {
    const today = new Date(todayKey + "T00:00:00");
    /* Case-folded once, not once per task. */
    const narrowing = { categoryId: activeCategoryId, words: searchWords(taskQuery), priority: priorityFilter };

    return tasks.filter((t) => {
      if (!matchesNarrowing(t, narrowing)) return false;

      switch (activeView) {
        case "all":
          if (t.completed) return false;
          break;
        case "overdue": {
          if (t.completed) return false;
          if (!t.due_date) return false;
          const d = new Date(t.due_date + "T00:00:00");
          if (d >= today) return false;
          break;
        }
        case "historical":
          if (!t.completed) return false;
          break;
      }

      if (activeView === "all" && !matchesDateFilter(t, dateFilter, weekStart)) return false;

      return true;
    });
  }, [tasks, activeCategoryId, activeView, dateFilter, priorityFilter, taskQuery, todayKey, weekStart]);

  /* Overdue tasks (shown in "all" view only, above the main list) */
  const overdueTasks = useMemo(() => {
    if (activeView !== "all") return [];
    const today = new Date(todayKey + "T00:00:00");
    return filteredTasks.filter((t) => {
      if (!t.due_date || t.completed) return false;
      const d = new Date(t.due_date + "T00:00:00");
      return d < today;
    });
  }, [filteredTasks, activeView, todayKey]);

  /* Non-overdue tasks for the main list */
  const mainTasks = useMemo(() => {
    if (activeView !== "all") return filteredTasks;
    const today = new Date(todayKey + "T00:00:00");
    return filteredTasks.filter((t) => {
      if (!t.due_date) return true;
      const d = new Date(t.due_date + "T00:00:00");
      return d >= today;
    });
  }, [filteredTasks, activeView, todayKey]);

  /*
   * Why the list is empty, in words. It always said "No tasks yet. Add one
   * below", including when a search or filter was hiding everything, when
   * every open task was in the Overdue box above it, and in views with no Add
   * button below.
   */
  const narrowed = taskQuery.trim() !== "" || priorityFilter !== "all" || (activeView === "all" && dateFilter !== "all");
  const emptyListMessage = narrowed
    ? "No tasks match that search or filter."
    : activeView === "historical"
      ? "No completed tasks yet."
      : activeView === "overdue"
        ? "Nothing is overdue."
        : overdueTasks.length > 0
          ? "Nothing else is due. The rest is in Overdue above."
          : undefined;

  /*
   * The Overdue box, around the days the list hands it. Red all through, the
   * list included, as the header is: an open box on the plain surface read as
   * grey. The rows are opaque and bordered in their priority's colour, so
   * they stay distinct on the wash.
   */
  const overdueBox = (days: ReactNode) => (
    <div
      style={{
        border: "1px solid var(--c-danger-line)",
        borderRadius: "var(--ui-radius-item)",
        marginBottom: phone ? PHONE_OVERDUE_GAP : 16,
        background: "var(--c-danger-wash)",
        /* No overflow clip: a row dragged out of the box stays in view
           until it reaches a day below. */
      }}
    >
      <button
        type="button"
        onClick={() => setOverdueOpen((v) => !v)}
        aria-expanded={overdueShown}
        aria-controls="overdue-task-list"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          // The box's padding lives here so the entire collapsed row is
          // the hit target, not just the caret and the word.
          padding: "12px 14px",
        }}
      >
        {overdueShown
          ? <CaretDown size={14} style={{ color: "var(--c-danger)" }} />
          : <CaretRight size={14} style={{ color: "var(--c-danger)" }} />
        }
        <span className="text-xs font-semibold" style={{ color: "var(--c-danger)" }}>
          Overdue
        </span>
        {/* The count as plain figures beside the word, not in a box. */}
        <span
          className="text-xs font-semibold"
          style={{ color: "var(--c-danger)", fontVariantNumeric: "tabular-nums", marginLeft: 2 }}
        >
          {overdueTasks.length}
        </span>
      </button>

      {overdueShown && (
        <div
          id="overdue-task-list"
          /* Less than 14 at the foot: every task card carries a trailing
             gap of its own (TaskList's --task-card-gap), so this puts the
             space below the last card on the same 14px as the sides. */
          style={{ padding: "0 14px calc(14px - var(--task-card-gap, 6px))" }}
        >
          {days}
        </div>
      )}
    </div>
  );

  /* The open category, for its header */
  const activeCategory = useMemo(
    () => categories.find((c) => c.id === activeCategoryId) ?? null,
    [categories, activeCategoryId],
  );

  /* ─── insights panel ─── */

  /*
   * Closed until asked for. It used to be a resizable column pinned open on
   * the right, which spent a third of the page on a chart whether or not
   * anyone was reading it — and left no room for the priority breakdown to run
   * across. It now drops in above the list at the full column width, so the
   * drag-to-resize handle it replaced has nothing left to size.
   */
  const [insightsOpen, setInsightsOpen] = useState(false);

  /* ─── deep links from universal search ─── */

  /*
   * `initialLoadComplete` gates the record link. A `?task=` arriving before
   * the fetch has landed would find nothing in `tasks` and open no dialog at
   * all — the URL consumed and the row silently not shown, which is the one
   * failure a deep link must not have. The two that open an empty form need
   * no data and so need no gate.
   */
  useUrlTarget("task", initialLoadComplete, (id) => {
    const target = tasks.find((task) => task.id === id);
    if (!target) return;
    setEditingStartsInEdit(false);
    setEditingTask(target);
  });

  useUrlTarget("new", true, () => {
    setCreateInitialDueDate(todayStr());
    setCreateModalOpen(true);
  });

  useUrlTarget("insights", true, () => setInsightsOpen(true));

  /*
   * The oldest failed save comes back once no card is open, so it never
   * replaces the one being typed in, and the next waits for it to close.
   */
  const nextFailed = failedSaves[0] ?? null;
  const cardOpen = editingTask !== null || createModalOpen || insightsOpen;
  useEffect(() => {
    if (nextFailed && !cardOpen && shownFailedId !== nextFailed.id) setShownFailedId(nextFailed.id);
  }, [nextFailed, cardOpen, shownFailedId]);
  const failedOnScreen = nextFailed && nextFailed.id === shownFailedId ? nextFailed : null;

  /* The goal form's values, for the tab row's + and ⋯ Edit goal and for the
     goal's own Edit icon: one shape everywhere a goal is created or edited. */
  const createGoal = async (values: GoalFormValues) => {
    await handleCreateCategory(values.name, values.color, {
      description: values.description,
      deadline: values.deadline,
      goal_type: values.goal_type,
    });
  };
  /* The task card's New goal: a name only, in the first colour no goal has yet. */
  const createGoalNamed = (name: string) => {
    const taken = new Set(categories.map((c) => c.color.toLowerCase()));
    const color = GOAL_COLORS.find((option) => !taken.has(option.value.toLowerCase()))?.value ?? DEFAULT_GOAL_COLOR;
    return handleCreateCategory(name, color);
  };
  const editGoal = (id: string, values: GoalFormValues) =>
    handleEditCategory(id, values.name, values.color, values.description, values.deadline, values.goal_type);

  /* ─── render ─── */

  if (loading) {
    return <TasksSkeleton phone={phone} columnWidth={LIST_COLUMN_WIDTH} />;
  }

  if (!initialLoadComplete) {
    return (
      <div style={{ maxWidth: 560, margin: "64px auto", width: "100%" }}>
        <StatusBanner
          message={persistenceError || "Could not load your tasks."}
          style={{ marginBottom: 12 }}
        />
        <button
          type="button"
          className="ui-hover-control"
          onClick={() => {
            setLoading(true);
            setLoadAttempt((attempt) => attempt + 1);
          }}
          style={{
            width: "100%",
            padding: "10px 14px",
            borderRadius: "var(--ui-radius-md)",
            border: "1px solid var(--c-border)",
            cursor: "pointer",
            fontSize: "var(--ui-type-body-sm)",
            fontWeight: 600,
          }}
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        /*
         * Reaches back over the app shell's gutters so the scroller runs to the
         * edge of the screen, and with it the scrollbar — which used to sit
         * 32px in with task rows still to the right of it.
         *
         * `flex: 1` rather than `height: 100%`: the negative top margin is part
         * of the item's margin box, so the flex container works out the height
         * that fills the shell exactly. `height: 100%` measures the content box
         * and would leave the page one gutter short at the bottom.
         */
        flex: 1,
        minHeight: 0,
        /* The top and bottom edges too: the list runs under the header to
           the top of the screen and under the dock to its foot, starting
           below the one and ending clear of the other. */
        margin: phone
          ? `calc(-16px - ${HEADER_ROOM}) -16px ${UNDER_DOCK_MARGIN}`
          : `calc(-24px - ${HEADER_ROOM}) -32px ${UNDER_DOCK_MARGIN}`,
        overflow: "hidden",
      }}
    >
      {/* ── Scrollable task list ── */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          overflowY: "auto",
          /* Gutters belong inside the scroller, so the scrollbar stays outside
             them and against the screen. */
          padding: phone
            ? `calc(16px + ${HEADER_ROOM}) 16px calc(24px + ${DOCK_ROOM})`
            : `calc(24px + ${HEADER_ROOM}) 32px calc(24px + ${DOCK_ROOM})`,
          scrollPaddingTop: HEADER_ROOM,
          scrollPaddingBottom: DOCK_ROOM,
        }}
      >
        <div style={{ maxWidth: LIST_COLUMN_WIDTH, margin: "0 auto" }}>
        {/*
          ── Row 1: the heading, and the one thing that is not a filter ──

          The title used to share this line with three view tabs, two filter
          pills, a hairline and Insights — six controls and a heading, which
          wrapped as soon as the column narrowed and put the filters on a
          ragged second line under the word "Tasks". The filters have a line of
          their own below now; what is left here is the name of the page and a
          button that opens a different view of it.
        */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginBottom: phone ? PHONE_ROW_GAP : 12,
          }}
        >
          <h1
            className="text-2xl font-bold"
            style={{ color: "var(--c-text-1)", flexShrink: 0, fontFamily: "var(--font-display)", letterSpacing: "-0.025em" }}
          >
            Tasks
          </h1>

          {/* Ramble: the same tasks, said rather than typed. Left of Add
              task, as an icon, the owner's call (7 Oct 2026). It takes the
              slack that pushes the header's buttons to the right. */}
          <RambleButton
            tasks={tasks}
            categories={categories}
            activeCategoryId={activeCategoryId}
            onAdd={handleAddMany}
            style={{ marginLeft: "auto" }}
          />

          {/*
            Add task acts on the whole list, so it sits with the page's other
            page-wide action rather than beside the goals. It opens the dialog
            on today and in the goal being shown. Same height and shape as
            Insights, so the two read as one pair.
          */}
          <button
            type="button"
            onClick={() => {
              setCreateInitialDueDate(todayStr());
              setCreateModalOpen(true);
            }}
            className={`${controls.primary} flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold`}
            style={{
              marginLeft: -8,
              flexShrink: 0,
              borderRadius: "var(--ui-radius-item)",
              border: "1px solid transparent",
              background: "var(--c-accent-strong)",
              color: "var(--c-on-accent)",
              cursor: "pointer",
            }}
          >
            <Plus size={14} weight="bold" aria-hidden="true" />
            Add task
          </button>

          <button
            type="button"
            onClick={() => setInsightsOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={insightsOpen}
            className="insights-frost flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold"
            style={{
              marginLeft: -8,
              flexShrink: 0,
              borderRadius: "var(--ui-radius-item)",
              cursor: "pointer",
              transition: "background var(--motion-base) var(--ease-out), border-color var(--motion-base) var(--ease-out)",
            }}
          >
            <Lightbulb size={14} weight="fill" style={{ color: "var(--c-electric)" }} />
            Insights
          </button>
        </div>

        {/*
          ── Row 2: the filter line ──

          Search takes the slack on the left, the three pickers hold the right,
          the same shape Finance's transaction list uses. Everything on this
          line narrows what is below it and nothing else does, so the line is
          readable as one job.
        */}
        <div className={controls.filterLine}>
          <SearchField
            value={taskQuery}
            onChange={setTaskQuery}
            label="Search tasks"
            placeholder="Search tasks"
          />

          <TaskFilters
            viewFilter={activeView}
            dateFilter={dateFilter}
            priorityFilter={priorityFilter}
            onViewChange={setActiveView}
            onDateChange={setDateFilter}
            onPriorityChange={setPriorityFilter}
          />
        </div>

        {persistenceError && (
          <StatusBanner
            message={persistenceError}
            onDismiss={() => setPersistenceError("")}
            style={{ marginBottom: 16 }}
          />
        )}

        <Separator phone={phone} />

        {/*
          The goals, and at the end of the row, beside +, the selected goal's
          own actions: they act on the goal, so they sit with the goals, while
          Add task, which acts on the list, is in the page header. The owner
          chose this layout from four built and compared on 29 Sep 2026. It
          replaced a bar of buttons between this row and the list.
        */}
        <div style={{ minWidth: 0, marginBottom: 4 }}>
          <CategoryTabs
            categories={categories}
            active={activeCategoryId}
            onChange={setActiveCategoryId}
            onCreate={createGoal}
            onEdit={editGoal}
            onDelete={handleDeleteCategory}
            onReorder={handleReorderCategories}
            trailing={activeCategory ? (
              <GoalActions
                category={activeCategory}
                shownOpenIds={filteredTasks.filter((t) => !t.completed).map((t) => t.id)}
                onMarkDone={handleMarkDone}
              />
            ) : undefined}
          />
        </div>

        <Separator phone={phone} />

        {/* Date-grouped task list, with the collapsible Overdue box at its
            head in the "all" view. The box is drawn by the list, inside its
            drag, so a task can be pulled out of it onto a day below. */}
        {/* The rows mark what the search matched. */}
        <HighlightScope query={taskQuery}>
        <TaskList
          tasks={mainTasks}
          categories={categories}
          todayKey={todayKey}
          onToggle={handleToggle}
          onEdit={(task) => { setEditingStartsInEdit(false); setEditingTask(task); }}
          onMoveTask={handleMoveTask}
          rowActions={rowActions}
          /*
           * A day's own Add task passes that day. The button under the list
           * passes nothing, and that means today: a new task with no date
           * lands in "No date" at the bottom, which is never where it was
           * meant to go.
           */
          onOpenCreate={(dueDate) => {
            setCreateInitialDueDate(dueDate ?? todayStr());
            setCreateModalOpen(true);
          }}
          hideAddTask={activeView === "historical" || activeView === "overdue"}
          /* The owner's call, 5 Oct 2026: done tasks read from the latest day
             down. Overdue stays oldest first, so its box runs into today. */
          newestFirst={activeView === "historical"}
          showEmptyUpcomingDays={activeView === "all" && dateFilter === "all"}
          emptyMessage={emptyListMessage}
          overdue={activeView === "all" && overdueTasks.length > 0 ? { tasks: overdueTasks, frame: overdueBox } : undefined}
          onCopyDay={handleCopyDay}
        />
        </HighlightScope>
        </div>
      </div>

      {/* ── Modal overlays ── */}

      {editingTask && (
        <TaskEditModal
          key={editingTask.id}
          task={editingTask}
          categories={categories}
          onSave={handleEditSave}
          onDelete={handleDelete}
          onCreateGoal={createGoalNamed}
          startInEdit={editingStartsInEdit}
          onClose={() => setEditingTask(null)}
        />
      )}

      {createModalOpen && (
        <TaskEditModal
          key={`create-${createInitialDueDate ?? "none"}-${activeCategoryId ?? "all"}`}
          categories={categories}
          initialCategoryId={activeCategoryId}
          onCreate={handleAdd}
          onCreateGoal={createGoalNamed}
          onClose={() => {
            setCreateModalOpen(false);
            setCreateInitialDueDate(null);
          }}
          initialDueDate={createInitialDueDate}
        />
      )}

      {/* A save that failed, back with what was typed and why it failed. */}
      {failedOnScreen && (
        <TaskEditModal
          key={failedOnScreen.id}
          task={failedOnScreen.kind === "edit" ? failedOnScreen.task : undefined}
          categories={categories}
          onCreate={handleAdd}
          onSave={handleEditSave}
          onCreateGoal={createGoalNamed}
          onDelete={failedOnScreen.kind === "edit" ? handleDelete : undefined}
          startInEdit
          draft={failedOnScreen.draft}
          initialError={failedOnScreen.error}
          onClose={() => setFailedSaves((prev) => prev.filter((failed) => failed.id !== failedOnScreen.id))}
        />
      )}

      {/*
        Insights as a card over the page, the way Settings opens.
        It used to expand in place above the list, which pushed the goals, the
        overdue box and every task down the page to read a chart, and left the
        thing you were looking at somewhere below the fold. A modal centres it,
        dims what is behind it, and gives the page back untouched on Escape.
      */}
      {insightsOpen && (
        <Modal onClose={() => setInsightsOpen(false)} maxWidth={760} label="Task insights">
          <div style={{ padding: "18px 20px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
              <h2 style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--ui-type-title-sm)", fontWeight: 700, color: "var(--c-text-1)" }}>
                <Lightbulb size={17} weight="fill" style={{ color: "var(--c-electric)" }} />
                Insights
              </h2>
              <button
                type="button"
                className="ui-hover-tag"
                onClick={() => setInsightsOpen(false)}
                aria-label="Close insights"
                data-autofocus
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 28, height: 28, background: "transparent", border: "none",
                  cursor: "pointer", color: "var(--c-text-3)",
                  transition: "background var(--motion-base) var(--ease-out)",
                }}
              >
                <X size={15} />
              </button>
            </div>
            <StatsPanel tasks={tasks} categories={categories} />
          </div>
        </Modal>
      )}

    </div>
  );
}

/**
 * `useUrlTarget` reads the query string, and Next needs a boundary around any
 * client component that does — the same wrapper `/tools` and `/journal` use.
 */
export default function TasksPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading tasks…" minHeight="60vh" />}>
      <TasksPageInner />
    </Suspense>
  );
}
