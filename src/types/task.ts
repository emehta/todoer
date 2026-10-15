export type Priority = "critical" | "high" | "medium" | "low";

/** Every priority, most urgent first. */
export const PRIORITIES: Priority[] = ["critical", "high", "medium", "low"];

export interface Task {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  due_time: string | null;
  priority: Priority;
  completed: boolean;
  created_at: string;
  category_id: string | null;
  display_order: number;
}

export type NewTask = {
  title: string;
  description: string | null;
  due_date: string | null;
  due_time: string | null;
  priority: Priority;
  category_id: string | null;
};

/**
 * Priority colours, as CSS variables so they follow every theme: a themed
 * surface never hardcodes a colour.
 */
export const PRIORITY_COLORS: Record<Priority, string> = {
  critical: "var(--c-danger)",
  // Per theme in globals.css; the fallbacks are the dark themes' values.
  high: "var(--priority-high, #eb8909)",
  medium: "var(--c-info)",
  low: "var(--priority-low, #808080)",
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const PRIORITY_ORDER: Record<Priority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};
