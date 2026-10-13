import { supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/supabase-paging";
import { toDateStr } from "@/lib/date-utils";
import type { Category } from "@/types/category";
import type { Task } from "@/types/task";

/**
 * Every goal and task, as one JSON file the browser saves. Supabase's free
 * plan keeps no daily backups, so this is the user's own copy. Paged, with a
 * unique last ordering column, so a list past 1,000 rows comes out whole.
 */
export async function downloadMyData(): Promise<{ goals: number; tasks: number }> {
  const [goals, tasks] = await Promise.all([
    fetchAllRows<Category>(() => supabase.from("categories").select("*").order("display_order").order("id")),
    fetchAllRows<Task>(() => supabase.from("tasks").select("*").order("created_at").order("id")),
  ]);
  const body = { app: "todoer", version: 1, exported_at: new Date().toISOString(), goals, tasks };
  const url = URL.createObjectURL(new Blob([`${JSON.stringify(body, null, 2)}\n`], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `todoer-${toDateStr(new Date())}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { goals: goals.length, tasks: tasks.length };
}
