export interface Category {
  id: string;
  name: string;
  color: string;
  display_order: number;
  created_at: string;
  description: string | null;
  deadline: string | null;
  goal_type: string | null;
}

/*
 * A goal's colours, around the spectrum and then grey, each named. Eight in a
 * row with no order before, and a "+" that opened the operating system's own
 * colour window. The eight are all still here, so no goal loses its colour.
 */
export const GOAL_COLORS = [
  { value: "#ef4444", label: "Red" },
  { value: "#f97316", label: "Orange" },
  { value: "#f59e0b", label: "Amber" },
  { value: "#eab308", label: "Yellow" },
  { value: "#84cc16", label: "Lime" },
  { value: "#22c55e", label: "Green" },
  { value: "#14b8a6", label: "Teal" },
  { value: "#06b6d4", label: "Cyan" },
  { value: "#3b82f6", label: "Blue" },
  { value: "#6366f1", label: "Indigo" },
  { value: "#8b5cf6", label: "Purple" },
  { value: "#ec4899", label: "Pink" },
  { value: "#808080", label: "Grey" },
] as const;

export const DEFAULT_GOAL_COLOR = "#22c55e";
