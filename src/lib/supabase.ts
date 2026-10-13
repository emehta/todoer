import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { BrowserConfig } from "@/selfhost/config";

/*
 * The browser's Supabase client, made when the config arrives rather than
 * when this module loads: a copy on someone's computer is built before it is
 * connected to a project, so there is nothing to read at build time. The root
 * layout passes the config to `ConfigProvider`, which calls
 * `configureSupabase` before anything below it renders.
 *
 * `supabase` stays an object every caller imports as before; it forwards to
 * the real client, and throws only if something uses it before setup.
 */

const browserLocalStorage =
  typeof window === "undefined"
    ? undefined
    : {
        getItem(key: string) {
          try {
            return window.localStorage.getItem(key);
          } catch {
            return null;
          }
        },
        setItem(key: string, value: string) {
          try {
            window.localStorage.setItem(key, value);
          } catch {
            // Authentication can continue for this tab when persistence is blocked.
          }
        },
        removeItem(key: string) {
          try {
            window.localStorage.removeItem(key);
          } catch {
            // There is no persisted session to clear when storage is unavailable.
          }
        },
      };

let client: SupabaseClient | null = null;
let clientKey = "";

export function configureSupabase(config: BrowserConfig | null): void {
  if (!config) return;
  const key = `${config.url}|${config.publishableKey}`;
  if (key === clientKey) return;
  clientKey = key;
  client = createClient(config.url, config.publishableKey, {
    auth: {
      persistSession: typeof window !== "undefined",
      autoRefreshToken: typeof window !== "undefined",
      detectSessionInUrl: false,
      flowType: "pkce",
      storage: browserLocalStorage,
      storageKey: "todoer-auth",
    },
  });
}

export function getSupabase(): SupabaseClient {
  if (!client) throw new Error("Todoer is not connected to a Supabase project yet.");
  return client;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, property) {
    const real = getSupabase();
    const value = Reflect.get(real, property, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
