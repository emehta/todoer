import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Where this copy finds its Supabase project. Server only.
 *
 * A copy on the web (Vercel) is given it as environment variables. A copy on
 * someone's own computer gets it from the setup screen, which saves it to a
 * file in the computer's app-data folder: outside this folder, because
 * Publik's installer checks out a clean copy of the repo and an update must
 * not lose it. It is read on every request (cached by the file's time), so a
 * project connected after the build works with no restart.
 *
 * Environment variables are read by a computed name: Next writes a literal
 * `process.env.NEXT_PUBLIC_…` into the build, and the build has none.
 */

export interface AppConfig {
  url: string;
  publishableKey: string;
  secretKey: string;
}

/** What the browser is given: never the secret key. */
export interface BrowserConfig {
  url: string;
  publishableKey: string;
}

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

/** True on Vercel, where the config comes from the project's variables. */
export function onTheWeb(): boolean {
  return Boolean(env("VERCEL"));
}

export function dataDir(): string {
  const override = env("TODOER_DATA_DIR");
  if (override) return override;
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "Todoer");
  if (process.platform === "win32") {
    return path.join(env("LOCALAPPDATA") ?? path.join(os.homedir(), "AppData", "Local"), "Todoer");
  }
  return path.join(env("XDG_CONFIG_HOME") ?? path.join(os.homedir(), ".config"), "todoer");
}

function configFile(): string {
  return path.join(dataDir(), "config.json");
}

function fromEnv(): AppConfig | null {
  const url = env("NEXT_PUBLIC_SUPABASE_URL") ?? env("SUPABASE_URL");
  const publishableKey =
    env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ?? env("SUPABASE_PUBLISHABLE_KEY") ?? env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const secretKey = env("SUPABASE_SECRET_KEY") ?? env("SUPABASE_SERVICE_ROLE_KEY");
  return url && publishableKey && secretKey ? { url, publishableKey, secretKey } : null;
}

function parse(text: string): AppConfig | null {
  try {
    const value = JSON.parse(text) as Partial<AppConfig>;
    if (typeof value.url === "string" && typeof value.publishableKey === "string" && typeof value.secretKey === "string") {
      return { url: value.url, publishableKey: value.publishableKey, secretKey: value.secretKey };
    }
  } catch {
    // A file that does not parse means "connect again", never a crash.
  }
  return null;
}

let cached: { mtimeMs: number; config: AppConfig | null } | null = null;

export async function readAppConfig(): Promise<AppConfig | null> {
  const fromVariables = fromEnv();
  if (fromVariables || onTheWeb()) return fromVariables;
  let mtimeMs: number;
  try {
    mtimeMs = (await fs.stat(configFile())).mtimeMs;
  } catch {
    cached = null;
    return null;
  }
  if (cached?.mtimeMs === mtimeMs) return cached.config;
  const config = parse(await fs.readFile(configFile(), "utf8"));
  cached = { mtimeMs, config };
  return config;
}

/** Saves the config for a copy on this computer, readable by its owner only. */
export async function writeAppConfig(config: AppConfig): Promise<void> {
  await fs.mkdir(dataDir(), { recursive: true });
  const file = configFile();
  const temp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  try {
    await fs.rename(temp, file);
  } catch {
    // Windows can refuse to rename over a file another process has open.
    await fs.copyFile(temp, file);
    await fs.rm(temp, { force: true });
  }
  if (process.platform !== "win32") await fs.chmod(file, 0o600);
  cached = null;
}

export function browserHalf(config: AppConfig | null): BrowserConfig | null {
  return config ? { url: config.url, publishableKey: config.publishableKey } : null;
}
