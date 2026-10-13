"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { DotsThreeVertical, Plus, PencilSimple, Tag, Trash } from "@phosphor-icons/react";
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Category } from "@/types/category";
import GoalForm, { type GoalFormValues } from "./GoalForm";
import DeleteGoalDialog from "./DeleteGoalDialog";
import Tooltip from "@/components/Tooltip";
import { useScrollEdge } from "@/lib/use-scroll-edge";
import { SELECTED } from "@/lib/styles";
import controls from "./TaskControls.module.css";
import { contentColor } from "@/lib/content-palette";

interface ContextMenu {
  x: number;
  y: number;
  category: Category;
}

interface Props {
  categories: Category[];
  active: string | null;
  onChange: (id: string | null) => void;
  /*
   * The full goal form's values, from + and from a tab's ⋯ Edit goal. Both
   * used to open a small form of their own with only a name and a colour, so
   * a goal's type, deadline and description could not be set from here.
   */
  onCreate: (values: GoalFormValues) => Promise<void>;
  onEdit: (id: string, values: GoalFormValues) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  /** The categories' ids in their new order, after a drag or Alt+arrow. */
  onReorder: (orderedIds: string[]) => void;
  /** Drawn at the end of the row, before the +: the selected goal's actions. */
  trailing?: ReactNode;
}

/* The tabs are one row, so a drag only ever moves along it. */
const alongTheRow: Modifier = ({ transform }) => ({ ...transform, y: 0 });

/**
 * One tab that can be dragged along the row.
 *
 * The whole chip is the handle: a grip icon on every tab would be seven more
 * marks in a row that is already full. That is safe because a drag only
 * starts after the pointer has moved (mouse) or been held (touch), so a click
 * still selects the tab and a swipe still scrolls the row.
 */
function SortableChip({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    position: "relative",
    zIndex: isDragging ? 2 : undefined,
    opacity: isDragging ? 0.85 : undefined,
    cursor: isDragging ? "grabbing" : undefined,
    /* A long press starts the drag on a phone; without these it also selects
       the label or opens the system callout. */
    userSelect: "none",
    WebkitUserSelect: "none",
    WebkitTouchCallout: "none",
  };
  return (
    /* The chip is a group, not a control, so it does not keep dnd-kit's
       role="button" and tab stop: the tab inside it is the control. */
    <div
      ref={setNodeRef}
      className={controls.categoryChip}
      style={style}
      {...attributes}
      {...listeners}
      role={undefined}
      tabIndex={undefined}
      /* dnd-kit's own hint says "press space to pick up", which is its
         keyboard sensor, and that is not in use here. */
      aria-roledescription={undefined}
      aria-describedby={undefined}
    >
      {children}
    </div>
  );
}

export default function CategoryTabs({
  categories,
  active,
  onChange,
  onCreate,
  onEdit,
  onDelete,
  onReorder,
  trailing,
}: Props) {
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  /* Which goal form is open: a new goal from +, or one goal from its ⋯. */
  const [goalForm, setGoalForm] = useState<{ mode: "new" } | { mode: "edit"; category: Category } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Category | null>(null);

  const plusRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  /* Shared with the filter group above this row — see lib/use-scroll-edge. */
  const scrollEdge = useScrollEdge(scrollerRef, [categories]);

  /*
   * Mouse and touch separately, because they want different triggers: a mouse
   * drag starts after 6px of travel, a touch after a 250ms hold, so a quick
   * swipe across the row still scrolls it. No keyboard sensor: it claims Enter
   * and Space to pick a tab up, and those select the tab. Alt+arrow moves the
   * focused tab instead (handleCategoryKeyDown).
   */
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );
  /* A drag ends with a mouseup on the tab, which the browser follows with a
     click. That click would select the tab just moved, so it is swallowed. */
  const justDragged = useRef(false);
  /* Android fires contextmenu on a long press, which is also how a drag
     starts on a phone, and this row answers contextmenu with the category
     menu. While a tab is being dragged, that menu is not what was asked for. */
  const dragInProgress = useRef(false);

  function handleDragEnd(event: DragEndEvent) {
    dragInProgress.current = false;
    justDragged.current = true;
    setTimeout(() => { justDragged.current = false; }, 0);
    const { active: dragged, over } = event;
    if (!over || dragged.id === over.id) return;
    const ids = categories.map((c) => c.id);
    const from = ids.indexOf(String(dragged.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(ids, from, to));
  }

  /*
   * Bring the chosen filter into view.
   *
   * A row that scrolls can hold the active pill off screen, and then the page
   * is filtered by something the header does not show — the one state a
   * filter row must never be in. `block: "nearest"` so this can only ever
   * move the row sideways; without it the page itself scrolls.
   *
   * Instantly, not smoothly. `behavior: "smooth"` is a JS request that Chrome
   * honours regardless of `prefers-reduced-motion` — the global reduce block
   * in globals.css cannot reach it, because it is not a transition — so it
   * would be the one animation in the app that ignores the setting. It would
   * also be the only smooth scroll here at all: the two other call sites both
   * take the default. And this app has already had a horizontal row that
   * glided on its own reported as a bug, on the calendar's week strip. A
   * correction should land, not travel.
   */
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const selected = el.querySelector('[aria-pressed="true"]');
    selected?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);

  // Close context menu on any click
  useEffect(() => {
    if (!contextMenu) return;
    function close() { setContextMenu(null); }
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [contextMenu]);

  /* GoalForm closes itself on Escape; this is the tab menu's. */
  useEffect(() => {
    if (!contextMenu) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setContextMenu(null);
    }

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [contextMenu]);

  function openEdit(cat: Category) {
    setGoalForm({ mode: "edit", category: cat });
    setContextMenu(null);
  }

  /* Deleting the goal the page is showing puts the page back on All. */
  async function deleteGoal(id: string) {
    await onDelete(id);
    if (active === id) onChange(null);
  }

  function handleContextMenu(e: React.MouseEvent, category: Category) {
    e.preventDefault();
    if (dragInProgress.current) return;
    setContextMenu({ x: e.clientX, y: e.clientY, category });
  }

  function handleCategoryKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, category: Category) {
    if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      const ids = categories.map((c) => c.id);
      const from = ids.indexOf(category.id);
      const to = from + (e.key === "ArrowLeft" ? -1 : 1);
      if (from < 0 || to < 0 || to >= ids.length) return;
      onReorder(arrayMove(ids, from, to));
      /*
       * Put focus back on the tab that moved. React re-inserts a node that
       * moves right, and a node taken out of the page loses focus, so after
       * one Alt+Right focus was on <body> and a second press did nothing.
       */
      const movedId = category.id;
      requestAnimationFrame(() => {
        scrollerRef.current
          ?.querySelector<HTMLButtonElement>(`[data-category-id="${movedId}"]`)
          ?.focus({ preventScroll: true });
      });
      return;
    }
    if (e.key !== "ContextMenu" && !(e.shiftKey && e.key === "F10")) return;
    e.preventDefault();
    const bounds = e.currentTarget.getBoundingClientRect();
    setContextMenu({ x: bounds.left, y: bounds.bottom + 4, category });
  }

  return (
    <>
      <div className={controls.categoryBar} role="toolbar" aria-label="Task goals">
        <div
          ref={scrollerRef}
          className={`${controls.categoryScroller} ${controls.edgeFade}`}
          data-edge={scrollEdge}
        >
        {/* All tab */}
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-pressed={active === null}
          className={`${controls.tab} ${active === null ? controls.active : ""} rounded-lg px-3.5 py-1.5 text-xs font-medium`}
          style={active === null
            ? SELECTED
            : { background: "transparent", color: "var(--c-text-3)", border: "1px solid var(--c-border-sub)" }}
        >
          All
        </button>

        {/* Category tabs, in the order they were last dragged to */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[alongTheRow]}
          onDragStart={() => { dragInProgress.current = true; }}
          onDragEnd={handleDragEnd}
          onDragCancel={() => { dragInProgress.current = false; justDragged.current = false; }}
        >
        <SortableContext items={categories.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
        {categories.map((cat) => (
          <SortableChip key={cat.id} id={cat.id}>
            <button
              type="button"
              aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
              data-category-id={cat.id}
              onClick={() => { if (!justDragged.current) onChange(cat.id); }}
              aria-pressed={active === cat.id}
              onContextMenu={(e) => handleContextMenu(e, cat)}
              onKeyDown={(e) => handleCategoryKeyDown(e, cat)}
              className={`${controls.tab} ${controls.categoryChipLabel} ${active === cat.id ? controls.active : ""} flex items-center gap-1.5 rounded-lg text-xs font-medium`}
              style={{
                ...(active === cat.id
                  ? SELECTED
                  : { background: "transparent", color: "var(--c-text-3)", border: "1px solid var(--c-border-sub)" }),
                /* Padding is in categoryChipLabel, not here: it is what opens
                   the gutter for the menu button on hover, and an inline
                   declaration would beat the rule that animates it. */
              }}
            >
              {/*
                Duotone, which is the middle of a correction that overshot.
                This was Tag at fill weight and read as a solid block of
                colour, so it became TagSimple at the default weight, which is
                a hollow outline with nothing inside it and no punch hole to
                say it is a tag at all. Duotone keeps the outline in the
                category's colour and washes the body with the same colour at
                low opacity: it has weight at 14px without being a block.
              */}
              <Tag size={14} weight="duotone" style={{ color: contentColor(cat.color), flexShrink: 0 }} aria-hidden="true" />
              {cat.name}
            </button>
            <button
              type="button"
              aria-label={`Manage the ${cat.name} goal`}
              aria-haspopup="menu"
              aria-expanded={contextMenu?.category.id === cat.id}
              onClick={(event) => {
                event.stopPropagation();
                /* A drag can start on these dots too; its mouseup is not a
                   request for the menu. */
                if (justDragged.current) return;
                const bounds = event.currentTarget.getBoundingClientRect();
                setContextMenu({ x: bounds.left, y: bounds.bottom + 8, category: cat });
              }}
              className={`${controls.categoryChipMenu} flex items-center justify-center`}
              /*
               * text-2, not the text-4 it was. At 13px regular in the faintest
               * ink the dots were close to invisible on the pill they sit on,
               * which made a control that only appears on hover look like a
               * rendering artefact. Bold at 15px in text-2 reads as three
               * dots; the direct-hover rule takes it to text-1.
               */
              style={{ width: 22, height: 22, color: "var(--c-text-2)", borderRadius: "var(--ui-radius-sm)" }}
            >
              <DotsThreeVertical size={15} weight="bold" />
            </button>
          </SortableChip>
        ))}
        </SortableContext>
        </DndContext>

        </div>

        {/*
          Outside the scroller on purpose — see the note on .categoryScroller.
          It is not one of the choices, so it must not scroll away, and its
          popover would be clipped by an overflow ancestor.
        */}
        {trailing}
        <div ref={plusRef} className={controls.categoryPlus}>
          <Tooltip label="Add a goal">
          <button
            type="button"
            onClick={() => setGoalForm((open) => (open?.mode === "new" ? null : { mode: "new" }))}
            aria-label={goalForm?.mode === "new" ? "Close the new goal form" : "Add a goal"}
            aria-haspopup="dialog"
            aria-expanded={goalForm?.mode === "new"}
            className={`${controls.iconButton} flex items-center justify-center`}
            style={{
              width: 30,
              height: 30,
              color: "var(--c-text-4)",
              borderRadius: "var(--ui-radius-md)",
              border: "1px solid var(--c-border-sub)",
            }}
          >
            <Plus size={13} />
          </button>
          </Tooltip>
        </div>
      </div>

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          role="menu"
          aria-label={`${contextMenu.category.name} goal actions`}
          style={{
            position: "fixed",
            left: Math.max(8, Math.min(contextMenu.x, window.innerWidth - 168)),
            top: Math.max(8, Math.min(contextMenu.y, window.innerHeight - 96)),
            background: "var(--page-bg)",
            border: "1px solid var(--c-border)",
          }}
          className="z-[200] w-40 rounded-lg py-1 shadow-xl"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => openEdit(contextMenu.category)}
            className={`${controls.action} flex w-full items-center gap-2 px-3 py-2 text-left text-sm`}
            style={{ color: "var(--c-text-2)" }}
          >
            <PencilSimple size={13} />
            Edit goal
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setPendingDelete(contextMenu.category);
              setContextMenu(null);
            }}
            className={`${controls.action} ${controls.danger} flex w-full items-center gap-2 px-3 py-2 text-left text-sm`}
            style={{ color: "var(--c-danger)" }}
          >
            <Trash size={13} />
            Delete goal
          </button>
        </div>
      )}

      {pendingDelete && (
        <DeleteGoalDialog category={pendingDelete} onDelete={deleteGoal} onClose={() => setPendingDelete(null)} />
      )}

      {goalForm?.mode === "new" && (
        <GoalForm onSubmit={onCreate} onClose={() => setGoalForm(null)} />
      )}
      {goalForm?.mode === "edit" && (
        <GoalForm
          key={goalForm.category.id}
          category={goalForm.category}
          onSubmit={(values) => onEdit(goalForm.category.id, values)}
          onClose={() => setGoalForm(null)}
        />
      )}
    </>
  );
}
