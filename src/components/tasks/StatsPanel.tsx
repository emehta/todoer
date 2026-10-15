"use client";

import { useState, useSyncExternalStore } from "react";
import {
  BarChart,
  Bar,
  LabelList,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Task, PRIORITIES, PRIORITY_COLORS, PRIORITY_LABELS } from "@/types/task";
import { GLASS_CARD_INSET, SELECTED } from "@/lib/styles";
import { usePhone } from "@/lib/use-viewport-width";
import { Category } from "@/types/category";
import controls from "./TaskControls.module.css";
import { MONTHS_SHORT, toDateStr } from "@/lib/date-utils";
import { contentColor } from "@/lib/content-palette";


const emptySubscribe = () => () => {};

/*
 * The ranges on the chart, coarsest bucket first where the span is long.
 * `short` is the phone's label: at full length the six did not fit the
 * dialog, and "1 year" broke onto two lines inside its own button.
 */
const RANGES = [
  { id: "week", label: "Week", short: "Week" },
  { id: "month", label: "Month", short: "Month" },
  { id: "ytd", label: "This year", short: "This year" },
  { id: "1y", label: "1 year", short: "1Y" },
  { id: "3y", label: "3 years", short: "3Y" },
  { id: "5y", label: "5 years", short: "5Y" },
] as const;

type RangeId = (typeof RANGES)[number]["id"];

/** Tasks with no goal still happened, so they get a bucket of their own. */
const UNCATEGORISED = "__none__";
const UNCATEGORISED_COLOR = "#8B93A1";


type Bucket = { label: string; total: number } & Record<string, string | number>;

/**
 * One bar per period, split by goal.
 *
 * Buckets get coarser as the span grows: a day each for a week or a month, a
 * month each up to a year, a quarter beyond that. Thirty-six monthly bars over
 * three years is a picket fence, not a chart.
 */
function getChartData(tasks: Task[], categories: Category[], range: RangeId): Bucket[] {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const keyOf = new Map<string, string>();
  for (const category of categories) keyOf.set(category.id, category.id);

  function emptyBucket(label: string): Bucket {
    const bucket: Bucket = { label, total: 0 };
    for (const category of categories) bucket[category.id] = 0;
    bucket[UNCATEGORISED] = 0;
    return bucket;
  }

  /* created_at is an ISO timestamp; a local Date is what the buckets are in. */
  function createdOn(task: Task): Date | null {
    const created = new Date(task.created_at);
    return Number.isNaN(created.getTime()) ? null : created;
  }

  function add(bucket: Bucket, task: Task) {
    const key = (task.category_id && keyOf.get(task.category_id)) || UNCATEGORISED;
    bucket[key] = (bucket[key] as number) + 1;
    bucket.total += 1;
  }

  if (range === "week" || range === "month") {
    const days = range === "week" ? 7 : 30;
    const buckets = new Map<string, Bucket>();
    const order: string[] = [];

    for (let i = days - 1; i >= 0; i -= 1) {
      const day = new Date(now);
      day.setDate(now.getDate() - i);
      const key = toDateStr(day);
      order.push(key);
      buckets.set(
        key,
        emptyBucket(range === "week" ? `${day.getDate()} ${MONTHS_SHORT[day.getMonth()]}` : `${day.getDate()}`),
      );
    }

    for (const task of tasks) {
      const created = createdOn(task);
      if (!created) continue;
      const bucket = buckets.get(toDateStr(created));
      if (bucket) add(bucket, task);
    }

    return order.map((key) => buckets.get(key)!);
  }

  const monthly = range === "ytd" || range === "1y";
  const buckets = new Map<string, Bucket>();
  const order: string[] = [];

  if (monthly) {
    const months = range === "ytd" ? now.getMonth() + 1 : 12;
    for (let i = months - 1; i >= 0; i -= 1) {
      const month = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${month.getFullYear()}-${month.getMonth()}`;
      order.push(key);
      /* January carries its year, "Jan '26", where a new year starts on the axis. */
      const label = month.getMonth() === 0
        ? `${MONTHS_SHORT[month.getMonth()]} '${String(month.getFullYear()).slice(2)}`
        : MONTHS_SHORT[month.getMonth()];
      buckets.set(key, emptyBucket(label));
    }
  } else {
    const quarters = range === "3y" ? 12 : 20;
    for (let i = quarters - 1; i >= 0; i -= 1) {
      const start = new Date(now.getFullYear(), now.getMonth() - i * 3, 1);
      const quarter = Math.floor(start.getMonth() / 3);
      const key = `${start.getFullYear()}-Q${quarter}`;
      order.push(key);
      buckets.set(key, emptyBucket(`Q${quarter + 1} '${String(start.getFullYear()).slice(2)}`));
    }
  }

  for (const task of tasks) {
    const created = createdOn(task);
    if (!created) continue;
    const key = monthly
      ? `${created.getFullYear()}-${created.getMonth()}`
      : `${created.getFullYear()}-Q${Math.floor(created.getMonth() / 3)}`;
    const bucket = buckets.get(key);
    if (bucket) add(bucket, task);
  }

  return order.map((key) => buckets.get(key)!);
}

type Series = { key: string; label: string; color: string };

/**
 * The stacked bar, drawn from one rectangle's worth of geometry.
 *
 * Recharts hands a custom shape the box it would have drawn for the total;
 * this divides that box between the goals in proportion, bottom up. Doing the
 * division here rather than letting recharts stack means the bar has one top
 * edge and one label, which is the whole point.
 */
function StackShape(props: {
  series?: Series[];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: Bucket;
}) {
  const { series = [], x = 0, y = 0, width = 0, height = 0, payload } = props;
  if (!payload || payload.total <= 0 || height <= 0) return null;

  /*
   * Each segment's offset is the sum of the ones below it, worked out from the
   * list rather than by carrying a running total. A running total means
   * reassigning a variable while rendering, which the compiler rejects, and
   * the lists here are at most seven long.
   */
  /* Largest at the bottom, then the next largest, up to the smallest on top,
     bar by bar: the owner reads a stack from its base, so the goal that
     dominates a period is the one the bar stands on. */
  const filled = series
    .map((entry) => ({ entry, value: (payload[entry.key] as number) ?? 0 }))
    .filter((part) => part.value > 0)
    .sort((a, b) => b.value - a.value);

  return (
    <g>
      {filled.map((part, index) => {
        const below = filled.slice(0, index).reduce((sum, other) => sum + other.value, 0);
        const segment = (part.value / payload.total) * height;
        const top = y + height - ((below + part.value) / payload.total) * height;
        return (
          <rect
            key={part.entry.key}
            x={x}
            y={top}
            width={width}
            height={segment}
            fill={contentColor(part.entry.color)}
          />
        );
      })}
    </g>
  );
}

/**
 * The tooltip has to be ours now, because the chart has one series called
 * "total" and the interesting part is the breakdown underneath it.
 */
function StackTooltip({
  active,
  payload,
  label,
  series = [],
}: {
  active?: boolean;
  payload?: { payload?: Bucket }[];
  label?: string;
  series?: Series[];
}) {
  const bucket = active ? payload?.[0]?.payload : undefined;
  if (!bucket || bucket.total <= 0) return null;

  return (
    <div
      style={{
        background: "var(--c-card-bg)",
        border: "1px solid var(--c-border)",
        borderRadius: "var(--ui-radius-tooltip)",
        boxShadow: "var(--shadow-pop)",
        padding: "8px 10px",
        fontSize: "var(--ui-type-label)",
        color: "var(--c-text-1)",
      }}
    >
      <p style={{ fontWeight: 600, marginBottom: 6 }}>{label}</p>
      {[...series].sort((a, b) => ((bucket[b.key] as number) ?? 0) - ((bucket[a.key] as number) ?? 0)).map((entry) => {
        const value = (bucket[entry.key] as number) ?? 0;
        if (value <= 0) return null;
        return (
          <p key={entry.key} style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--c-text-2)" }}>
            <span style={{ width: 8, height: 8, borderRadius: "var(--ui-radius-round)", background: contentColor(entry.color), flexShrink: 0 }} />
            {entry.label}
            <span style={{ marginLeft: "auto", paddingLeft: 12, fontWeight: 600, color: "var(--c-text-1)" }}>{value}</span>
          </p>
        );
      })}
      <p style={{ display: "flex", marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--c-border-sub)", color: "var(--c-text-3)" }}>
        Total
        <span style={{ marginLeft: "auto", paddingLeft: 12, fontWeight: 700, color: "var(--c-text-1)" }}>{bucket.total}</span>
      </p>
    </div>
  );
}

interface Props {
  tasks: Task[];
  categories: Category[];
}

export default function StatsPanel({ tasks, categories }: Props) {
  const [range, setRange] = useState<RangeId>("week");
  const phone = usePhone();
  const chartReady = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  /* The goals picked in the legend; none picked means all of them. */
  const [picked, setPicked] = useState<string[]>([]);

  const incomplete = tasks.filter((t) => !t.completed);
  const chartData = getChartData(tasks, categories, range);

  /*
   * Only the goals that actually appear in the window get a band and a legend
   * entry. Charting every goal you have ever made would put six zero-height
   * series and six legend swatches under a chart about last week.
   */
  const inWindow = (key: string) => chartData.reduce((sum, bucket) => sum + ((bucket[key] as number) ?? 0), 0);
  const allSeries = [
    ...categories.map((category) => ({ key: category.id, label: category.name, color: category.color })),
    { key: UNCATEGORISED, label: "No goal", color: UNCATEGORISED_COLOR },
  ]
    .filter((entry) => chartData.some((bucket) => (bucket[entry.key] as number) > 0))
    /* The legend in the same order as the stacks: most tasks first. */
    .sort((a, b) => inWindow(b.key) - inWindow(a.key));

  /*
   * Clicking legend keys filters the chart to those goals. A pick that no
   * longer appears in the range (after switching Week to Year, say) is
   * ignored rather than leaving an empty chart, and picking every key is the
   * same as picking none.
   */
  const activePicks = picked.filter((key) => allSeries.some((entry) => entry.key === key));
  const filtering = activePicks.length > 0 && activePicks.length < allSeries.length;
  const series = filtering ? allSeries.filter((entry) => activePicks.includes(entry.key)) : allSeries;
  const viewData = chartData.map((bucket) => ({
    ...bucket,
    total: series.reduce((sum, entry) => sum + ((bucket[entry.key] as number) ?? 0), 0),
  }));

  function togglePick(key: string) {
    setPicked((current) => {
      const live = current.filter((k) => allSeries.some((entry) => entry.key === k));
      return live.includes(key) ? live.filter((k) => k !== key) : [...live, key];
    });
  }

  const busiest = Math.max(...viewData.map((bucket) => bucket.total), 0);
  const barSize = chartData.length <= 7 ? 30 : chartData.length <= 14 ? 20 : chartData.length <= 24 ? 12 : 8;
  /* Enough ticks to orient by, never so many that they overlap. */
  const tickInterval = chartData.length <= 12 ? 0 : Math.ceil(chartData.length / 12);

  return (
    <div>
      {/* Chart card */}
      <div className="mb-4 rounded-xl p-4" style={GLASS_CARD_INSET}>
        <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs" style={{ color: "var(--c-text-3)" }}>Tasks added, by goal</span>
          <div
            className="flex gap-0.5 rounded-lg p-0.5"
            style={{ background: "var(--c-tag-bg)", border: "1px solid var(--c-border-sub)" }}
          >
            {RANGES.map((option) => (
              <button
                type="button"
                key={option.id}
                onClick={() => setRange(option.id)}
                aria-pressed={range === option.id}
                aria-label={phone ? option.label : undefined}
                className={`${controls.rangeButton} ${range === option.id ? controls.active : ""} rounded-md px-2 text-xs font-medium whitespace-nowrap`}
                style={{
                  minHeight: 32,
                  ...(range === option.id
                    ? SELECTED
                    : { background: "transparent", border: "1px solid transparent", color: "var(--c-text-3)" }),
                }}
              >
                {phone ? option.short : option.label}
              </button>
            ))}
          </div>
        </div>

        {chartReady ? (
          <div role="img" aria-label={`Tasks added by goal, ${RANGES.find((option) => option.id === range)?.label.toLowerCase()}`}>
            <ResponsiveContainer width="100%" height={220} minWidth={0} minHeight={220}>
              <BarChart
                data={viewData}
                barSize={barSize}
                /* Head room above the tallest bar so its total is not clipped. */
                margin={{ top: 18, right: 4, left: -16, bottom: 0 }}
              >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border-sub)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: "var(--c-text-4)", fontSize: "var(--ui-type-micro)" }}
                axisLine={false}
                tickLine={false}
                interval={tickInterval}
              />
              <YAxis
                tick={{ fill: "var(--c-text-4)", fontSize: "var(--ui-type-micro)" }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                width={22}
                domain={[0, () => Math.max(busiest, 5)]}
              />
              <Tooltip cursor={{ fill: "var(--c-hover)" }} content={<StackTooltip series={series} />} />

              {/*
                One bar per period, drawn by hand, rather than one Bar per goal
                stacked on top of each other.
                //
                Stacking meant the label and the corner had to hang off a
                particular goal's series, and in a stack that is wherever that
                goal happens to sit, not the top of the bar. Two attempts at
                anchoring it failed for that reason: the total printed itself
                across a band halfway up, and which band depended on the data.
                //
                With a single Bar whose value is the total, the bar is the
                stack. Its top is the top, so a label positioned above it is
                above the whole thing on every bar in every range, and the
                shape below divides that same height between the goals.
              */}
              <Bar dataKey="total" isAnimationActive={false} shape={<StackShape series={series} />}>
                <LabelList
                  dataKey="total"
                  position="top"
                  offset={6}
                  fill="var(--c-text-3)"
                  fontSize={10}
                  /* An empty period says nothing rather than "0". */
                  formatter={(value) => (typeof value === "number" && value > 0 ? String(value) : "")}
                />
              </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div style={{ height: 220 }} />
        )}

        {/*
          The legend is the filter: click a goal to show only it, click more
          to add them, click a picked one to take it out. The ones not shown
          dim, and Show all clears the pick.
        */}
        <div className="mt-3 flex items-center justify-center gap-2 flex-wrap" role="group" aria-label="Show goals in the chart">
          {allSeries.length === 0 ? (
            <span className="text-xs" style={{ color: "var(--c-text-4)" }}>Nothing added in this range.</span>
          ) : (
            <>
              {allSeries.map((entry) => {
                const on = !filtering || activePicks.includes(entry.key);
                return (
                  <button
                    type="button"
                    key={entry.key}
                    onClick={() => togglePick(entry.key)}
                    aria-pressed={filtering && activePicks.includes(entry.key)}
                    className="ui-choice flex items-center gap-2 text-xs font-medium"
                    style={{
                      minHeight: 32,
                      padding: "0 8px",
                      borderRadius: "var(--ui-radius-sm)",
                      cursor: "pointer",
                      transition: "opacity var(--motion-fast) var(--ease-out), color var(--motion-fast) var(--ease-out)",
                      ...(filtering && activePicks.includes(entry.key)
                        ? SELECTED
                        : {
                            background: "transparent",
                            border: "1px solid transparent",
                            color: on ? "var(--c-text-2)" : "var(--c-text-4)",
                            opacity: on ? 1 : 0.55,
                          }),
                    }}
                  >
                    <span className="rounded-full" style={{ width: 10, height: 10, background: contentColor(entry.color), display: "inline-block", flexShrink: 0 }} />
                    {entry.label}
                    <span style={{ color: "var(--c-text-4)", fontVariantNumeric: "tabular-nums" }}>{inWindow(entry.key)}</span>
                  </button>
                );
              })}
              {filtering && (
                <button
                  type="button"
                  onClick={() => setPicked([])}
                  className="ui-hover-control text-xs font-medium"
                  style={{ minHeight: 32, padding: "0 8px", border: "1px solid var(--c-border-sub)", borderRadius: "var(--ui-radius-sm)", background: "transparent", color: "var(--c-text-3)", cursor: "pointer" }}
                >
                  Show all
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Priority breakdown */}
      <div className="mb-4 rounded-xl p-4" style={GLASS_CARD_INSET}>
        {/* Named as the chart's card is: a quiet line, in words. */}
        <p className="mb-3 text-xs" style={{ color: "var(--c-text-3)" }}>By priority</p>
        {/*
          Four across rather than four rows. A 120px minimum lands all four on
          one line at the panel's full width and folds to two by two on a
          phone; min(…, 100%) keeps the track from outgrowing a narrow card.
        */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(120px, 100%), 1fr))",
            gap: 10,
          }}
        >
          {PRIORITIES.map((p) => {
            const count = incomplete.filter((t) => t.priority === p).length;
            return (
              <div
                key={p}
                className="flex items-center justify-between gap-2"
                style={{
                  padding: "10px 12px",
                  borderRadius: "var(--ui-radius-item)",
                  border: "1px solid var(--c-border-sub)",
                  background: "var(--c-surface)",
                  minWidth: 0,
                }}
              >
                <span className="flex items-center gap-2 text-xs" style={{ color: "var(--c-text-2)", minWidth: 0 }}>
                  <span
                    className="h-2 w-2 flex-shrink-0 rounded-full"
                    style={{ background: PRIORITY_COLORS[p] }}
                  />
                  <span className="truncate">{PRIORITY_LABELS[p]}</span>
                </span>
                <span className="text-sm font-semibold flex-shrink-0" style={{ color: "var(--c-text-1)" }}>{count}</span>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
