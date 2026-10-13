export type HabitSchedulePattern = "weekdays" | "weekends";

export type HabitScheduleMode = "daily" | "weekdays" | "weekends" | "interval";

export type HabitCategory = "wellness" | "strength" | "mobility" | "wealth" | "creativity" | "learning" | "reform";

/**
 * When in the day Home shows a habit, as set on its form. Unset, Home reads
 * the time from the habit's title and the calendar.
 */
export type HabitTimeOfDay = "morning" | "afternoon" | "evening" | "night";

export const HABIT_TIMES_OF_DAY: { value: HabitTimeOfDay; label: string }[] = [
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
  { value: "night", label: "Night" },
];

/*
 * One hue per category, and none of them red. Reform was #EF5350 and
 * Strength #E07A5F, which are the danger colour and a hair off it, so a
 * finished "No sugar" looked like an error everywhere a habit is drawn.
 * Reform is blue and Strength teal now. The list is derived from the map, so
 * the two cannot disagree again.
 */
export const CATEGORY_COLORS: Record<HabitCategory, string> = {
  wellness:   "#9C6ADE",
  strength:   "#2E9E8F",
  mobility:   "#26C6DA",
  wealth:     "#4CAF50",
  creativity: "#FF9800",
  learning:   "#FDD835",
  reform:     "#4F8FE8",
};

const CATEGORY_LABELS: Record<HabitCategory, string> = {
  wellness: "Wellness",
  strength: "Strength",
  mobility: "Mobility",
  wealth: "Wealth",
  creativity: "Creativity",
  learning: "Learning",
  reform: "Reform",
};

export const HABIT_CATEGORIES: { value: HabitCategory; label: string; color: string }[] =
  (Object.keys(CATEGORY_COLORS) as HabitCategory[]).map((value) => ({
    value,
    label: CATEGORY_LABELS[value],
    color: CATEGORY_COLORS[value],
  }));

export interface Habit {
  id: string;
  title: string;
  description: string | null;
  triggers: string | null;
  coping_strategies: string | null;
  frequency_days: number;
  color: string;
  display_order: number;
  start_date: string; // "YYYY-MM-DD"
  created_at: string;
  category: HabitCategory;
  schedule_pattern?: HabitSchedulePattern | null;
  time_of_day?: HabitTimeOfDay | null;
  /** The routine this habit sits inside (lib/habit-routines), or null. */
  parent_id?: string | null;
}

export interface HabitLog {
  id: string;
  habit_id: string;
  log_date: string; // "YYYY-MM-DD"
  completed: boolean;
  created_at: string;
}
