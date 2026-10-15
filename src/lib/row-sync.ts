/**
 * The order of a task row's saves on the tasks page, and which of their
 * answers still speaks for the row.
 *
 * Every change shows at once and is saved in the background, so a row can
 * have more than one save out: ticked while its insert is still on the way,
 * edited and ticked before the edit's answer is back. Two rules keep the
 * screen right:
 *
 * - A row's saves go one after another, each once the one before it has
 *   answered, its insert first. An update sent before its row exists
 *   matches nothing, and two sent together can land in either order.
 * - Each change to a row on screen moves its version on, and a save's answer
 *   is shown only while the version is the one the save started from.
 *   Otherwise the answer, which is the row as that save left it, would put
 *   back what was there before the newer change.
 *
 * Pure (no React, no Supabase), and tested in `scripts/row-sync.test.mjs`.
 */

export interface RowSync {
  /** The row was changed on screen: its new version, for the save of that change. */
  touch(id: string): number;
  /** Whether nothing has changed the row since `version`. */
  current(id: string, version: number): boolean;
  /**
   * Inserts rows: `save` runs once their earlier saves are done, and
   * `savedId` reads from its answer the id each row has in the database
   * (its own id, unless the insert gave it another). A failed insert leaves
   * the rows with none, and later saves of them are given null.
   */
  insert<T>(ids: readonly string[], save: () => PromiseLike<T>, savedId: (answer: T, id: string) => string): Promise<T>;
  /**
   * A save of rows already shown, run once their earlier saves are done,
   * with the id each has in the database, or null for one whose insert failed.
   */
  queue<T>(ids: readonly string[], save: (savedIds: (string | null)[]) => PromiseLike<T>): Promise<T>;
}

export function createRowSync(): RowSync {
  const versions = new Map<string, number>();
  /* The end of each row's line of saves, while it has one out. */
  const tails = new Map<string, Promise<void>>();
  /* A row's id in the database where it is not its id on screen: another
     its insert was given, or null for an insert that failed. */
  const savedAs = new Map<string, string | null>();

  function inLine<T>(ids: readonly string[], run: () => PromiseLike<T>): Promise<T> {
    const before = Promise.all(ids.map((id) => tails.get(id)));
    const result = before.then(run);
    const tail = result.then(() => undefined, () => undefined);
    for (const id of ids) tails.set(id, tail);
    void tail.then(() => {
      for (const id of ids) if (tails.get(id) === tail) tails.delete(id);
    });
    return result;
  }

  return {
    touch(id) {
      const next = (versions.get(id) ?? 0) + 1;
      versions.set(id, next);
      return next;
    },
    current(id, version) {
      return (versions.get(id) ?? 0) === version;
    },
    insert(ids, save, savedId) {
      return inLine(ids, async () => {
        try {
          const answer = await save();
          for (const id of ids) {
            const saved = savedId(answer, id);
            if (saved !== id) savedAs.set(id, saved);
          }
          return answer;
        } catch (error) {
          for (const id of ids) savedAs.set(id, null);
          throw error;
        }
      });
    },
    queue(ids, save) {
      return inLine(ids, () => save(ids.map((id) => (savedAs.has(id) ? savedAs.get(id) ?? null : id))));
    },
  };
}

/** Said when a save finds its task gone: deleted on another device since this tab loaded it. */
export const DELETED_ELSEWHERE = "This task was deleted elsewhere.";

/**
 * What an update that asked for its row back (`.select()`) says: saved;
 * gone, when no row matched (PostgREST's PGRST116 from `.single()`, or no
 * rows back), which is a task deleted elsewhere; or failed.
 */
export function updateOutcome(data: readonly unknown[] | null | undefined, error: { code?: string } | null | undefined): "saved" | "gone" | "failed" {
  if (error) return error.code === "PGRST116" ? "gone" : "failed";
  return data && data.length > 0 ? "saved" : "gone";
}

/**
 * A row after a failed save: each field the save wrote goes back to what it
 * was, where the row still holds what was written. A field changed again
 * since keeps its newer value, which a save of its own is carrying.
 */
export function putBack<T extends object>(row: T, wrote: Partial<T>, before: Partial<T>): T {
  const next = { ...row };
  for (const key of Object.keys(wrote) as (keyof T)[]) {
    if (Object.is(row[key], wrote[key]) && key in before) next[key] = before[key] as T[keyof T];
  }
  return next;
}
