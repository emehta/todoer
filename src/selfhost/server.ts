import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AppConfig } from "@/selfhost/config";
import { APP, OWNER_FLAG, SCHEMA_VERSION } from "@/selfhost/constants";
import type { Reach, SchemaState } from "@/selfhost/steps";

/**
 * The server's side of setup, against the user's own Supabase project. Server
 * only: everything here holds the secret key.
 */

/** Two goals to start from, so a first task always has one to belong to. */
const STARTER_GOALS = [
  { name: "Personal", color: "#3b82f6" },
  { name: "Work", color: "#6366f1" },
] as const;

/** A claim older than this with no account behind it was a create that failed part way. */
const STALE_CLAIM_MS = 10 * 60 * 1000;

export class SetupError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

let admin: { key: string; client: SupabaseClient } | null = null;

export function adminClient(config: AppConfig): SupabaseClient {
  const key = `${config.url}|${config.secretKey}`;
  if (admin?.key !== key) {
    admin = {
      key,
      client: createClient(config.url, config.secretKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      }),
    };
  }
  return admin.client;
}

export interface Probe {
  reach: Reach;
  signupsOpen: boolean | null;
}

/** A good answer is kept this long, so a page load does not ask Supabase every time. */
const PROBE_FRESH_MS = 30_000;
let lastGood: { key: string; at: number; probe: Probe } | null = null;

/**
 * Whether the project answers, accepts both keys, and still lets anyone sign
 * up. A failure is asked again once, a second later, before it is believed:
 * one dropped request on a load showed "Supabase isn't answering" (13 Oct).
 */
export async function probeProject(config: AppConfig): Promise<Probe> {
  const key = `${config.url}|${config.publishableKey}|${config.secretKey}`;
  if (lastGood?.key === key && Date.now() - lastGood.at < PROBE_FRESH_MS) return lastGood.probe;
  let probe = await probeOnce(config);
  if (probe.reach === "unreachable") {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    probe = await probeOnce(config);
  }
  lastGood = probe.reach === "ok" ? { key, at: Date.now(), probe } : null;
  return probe;
}

async function probeOnce(config: AppConfig): Promise<Probe> {
  let response: Response;
  try {
    response = await fetch(`${config.url}/auth/v1/settings`, {
      headers: { apikey: config.publishableKey },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
  } catch {
    return { reach: "unreachable", signupsOpen: null };
  }
  if (response.status === 540) return { reach: "paused", signupsOpen: null };
  if (response.status === 401 || response.status === 403) return { reach: "rejected", signupsOpen: null };
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return { reach: /paused/i.test(text) ? "paused" : "unreachable", signupsOpen: null };
  }
  const settings = (await response.json().catch(() => ({}))) as { disable_signup?: unknown };
  const { error } = await adminClient(config).auth.admin.listUsers({ page: 1, perPage: 1 });
  if (error) return { reach: error.status === 401 || error.status === 403 ? "rejected" : "unreachable", signupsOpen: null };
  return { reach: "ok", signupsOpen: settings.disable_signup === false };
}

const MISSING_TABLE = new Set(["PGRST205", "42P01"]);

export async function schemaState(client: SupabaseClient): Promise<SchemaState> {
  const { data, error } = await client.from("schema_versions").select("version").eq("app", APP).maybeSingle();
  if (error) {
    if (MISSING_TABLE.has(error.code)) return "missing";
    throw new SetupError(`Could not read the database: ${error.message}`, 502);
  }
  if (!data) return "missing";
  return data.version >= SCHEMA_VERSION ? "ready" : "outdated";
}

export async function ownerExists(client: SupabaseClient): Promise<boolean> {
  const { data, error } = await client.from("app_owner").select("user_id").maybeSingle();
  if (error) throw new SetupError(`Could not read the database: ${error.message}`, 502);
  return Boolean(data?.user_id);
}

/** Takes the one owner row, so two tabs can never both make an account. */
async function claimOwner(client: SupabaseClient): Promise<void> {
  const { error } = await client.from("app_owner").insert({ id: true });
  if (!error) return;
  if (error.code !== "23505") throw new SetupError(`Could not read the database: ${error.message}`, 502);
  const { data } = await client.from("app_owner").select("user_id, claimed_at").maybeSingle();
  if (data?.user_id) throw new SetupError("This project already has its account. Sign in instead.", 409);
  const staleBefore = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
  const { data: retaken } = await client
    .from("app_owner")
    .update({ claimed_at: new Date().toISOString() })
    .is("user_id", null)
    .lt("claimed_at", staleBefore)
    .select("id");
  if (!retaken?.length) throw new SetupError("The account is being made in another tab. Wait a moment, then reload.", 409);
}

async function releaseClaim(client: SupabaseClient): Promise<void> {
  await client.from("app_owner").delete().is("user_id", null);
}

async function seedGoals(client: SupabaseClient, userId: string): Promise<void> {
  const { count, error } = await client.from("categories").select("id", { count: "exact", head: true }).eq("user_id", userId);
  if (error) throw new SetupError(`Could not add the first goals: ${error.message}`, 502);
  if ((count ?? 0) > 0) return;
  const rows = STARTER_GOALS.map((goal, index) => ({ user_id: userId, name: goal.name, color: goal.color, display_order: index }));
  const { error: insertError } = await client.from("categories").insert(rows);
  if (insertError) throw new SetupError(`Could not add the first goals: ${insertError.message}`, 502);
}

/** Sets the owner's password, for a forgotten one: the caller has proved who it is first. */
export async function resetOwnerPassword(config: AppConfig, password: string): Promise<string> {
  const client = adminClient(config);
  const { data, error } = await client.from("app_owner").select("user_id").maybeSingle();
  if (error) throw new SetupError(`Could not read the database: ${error.message}`, 502);
  if (!data?.user_id) throw new SetupError("This project has no account yet. Make one instead.", 409);
  const { data: updated, error: updateError } = await client.auth.admin.updateUserById(data.user_id, { password });
  if (updateError || !updated.user?.email) {
    throw new SetupError(`Supabase did not change the password: ${updateError?.message ?? "no reason given"}`, 502);
  }
  return updated.user.email;
}

/** Makes the project's one account, already confirmed, with Personal and Work. */
export async function createOwner(config: AppConfig, email: string, password: string): Promise<void> {
  const client = adminClient(config);
  await claimOwner(client);
  const { data, error } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { [OWNER_FLAG]: true },
  });
  if (error || !data.user) {
    await releaseClaim(client);
    const taken = error?.code === "email_exists" || /already/i.test(error?.message ?? "");
    throw new SetupError(
      taken ? "That email already has an account in this project. Use another email." : `Supabase did not make the account: ${error?.message ?? "no reason given"}`,
      taken ? 409 : 502,
    );
  }
  const { error: ownerError } = await client.from("app_owner").update({ user_id: data.user.id }).eq("id", true);
  if (ownerError) throw new SetupError(`The account was made but not recorded: ${ownerError.message}`, 502);
  await seedGoals(client, data.user.id);
}
