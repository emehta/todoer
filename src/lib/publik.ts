import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { arch, homedir, hostname, platform } from "node:os";
import path from "node:path";
import { PUBLIK_BASE_URL } from "@/lib/ramble/providers";
import { dataDir } from "@/selfhost/config";
import { readPrivateJson, writePrivateJson } from "@/selfhost/private-file";

/**
 * publik API as one of Ramble's two providers. Server only. Adapted from
 * publik's reference module (https://publikhq.com/sdk/publik.ts.md), whose
 * rules it keeps: the key is minted per computer with the app's public token
 * after the user accepts DISCLOSURE, is stored in publik's own credential
 * file, and never reaches a browser or a log.
 *
 * Where the key comes from, in order: PUBLIK_API_KEY in the environment;
 * then, on someone's computer, the credential file, and on the web (no disk
 * that lasts) the credential saved for the owner by the caller (selfhost
 * secrets). The user's own Groq key is the other choice, in Settings.
 */

export const APP_SLUG = "todoer";

/** Shown, word for word, and agreed to before provision(). publik's text. */
export const DISCLOSURE =
  "This app can use publik API for its AI features: no key to paste, priced per use in dollars from a publik balance that starts at $0.00. " +
  "Linking this computer to a publik account gives $0.05 of free use, once. Your prompts go through publik's servers to the model; you can switch to your own key at any time.";

export interface PublikCredential {
  key: string;
  base_url: string;
  install_id: string;
  claim_url: string | null;
  claim_state: "anonymous" | "claimed";
  add_credit_url: string | null;
  cost_sentence: string | null;
  balance_micros: number | null;
}

function appVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as { version?: unknown };
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/**
 * The app token: public by design (it only mints capped keys for this app),
 * committed as publik-app-token.txt at the repo root and read from where the
 * app runs. PUBLIK_APP_TOKEN in the environment wins.
 */
export function appToken(): string {
  const env = process.env.PUBLIK_APP_TOKEN?.trim();
  if (env) return env;
  for (let dir = process.cwd(); ; dir = path.dirname(dir)) {
    const file = path.join(dir, "publik-app-token.txt");
    if (existsSync(file)) return readFileSync(file, "utf8").trim();
    if (path.dirname(dir) === dir) return "";
  }
}

export function publikAvailable(): boolean {
  return appToken().startsWith("pat_") || Boolean(process.env.PUBLIK_API_KEY?.trim());
}

/**
 * publik's own place for it: ~/Library/Application Support/publik/apps/todoer.json,
 * %LOCALAPPDATA%\publik\apps\todoer.json, ~/.config/publik/apps/todoer.json.
 * A copy given its own data folder (`npm run develop`) keeps its key there instead.
 */
export function credentialPath(): string {
  if (process.env.TODOER_DATA_DIR?.trim()) return path.join(dataDir(), "publik.json");
  const os = platform();
  const base =
    os === "darwin" ? path.join(homedir(), "Library", "Application Support")
    : os === "win32" ? (process.env.LOCALAPPDATA ?? path.join(homedir(), "AppData", "Local"))
    : (process.env.XDG_CONFIG_HOME ?? path.join(homedir(), ".config"));
  return path.join(base, "publik", "apps", `${APP_SLUG}.json`);
}

export function isCredential(value: unknown): value is PublikCredential {
  const c = value as PublikCredential | null;
  return Boolean(c && typeof c.key === "string" && c.key.startsWith("pk_"));
}

export async function readCredentialFile(): Promise<PublikCredential | null> {
  const parsed = await readPrivateJson(credentialPath());
  return isCredential(parsed) ? parsed : null;
}

export function writeCredentialFile(credential: PublikCredential): Promise<void> {
  return writePrivateJson(credentialPath(), credential);
}

/**
 * A key for this computer, minted with the app token. Call only after the
 * user accepted DISCLOSURE. A replay that comes back with no key, or an
 * install its owner revoked, is tried once with a fresh install id.
 */
export async function provision(prior: PublikCredential | null): Promise<PublikCredential> {
  const token = appToken();
  if (!token.startsWith("pat_")) throw new Error("This copy of Todoer has no publik app token. Use your own Groq key instead.");
  let installId = prior?.install_id ?? randomUUID();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(`${PUBLIK_BASE_URL}/installs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          app_token: token,
          app_slug: APP_SLUG,
          app_version: appVersion(),
          os: platform() === "darwin" ? "macos" : platform() === "win32" ? "windows" : "linux",
          arch: arch(),
          device_name: hostname().slice(0, 120),
          install_id: installId,
          disclosure_version: 1,
          dialects: ["chat_completions"],
        }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new Error("Could not reach publik. Check this computer is online.");
    }
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown> & {
      error?: { type?: string; message?: string };
      wallet?: { add_credit_url?: string };
      disclosure?: { cost?: string };
    };
    const key = typeof body.key === "string" ? body.key : response.status === 200 ? prior?.key ?? null : null;
    if ((response.status === 201 || response.status === 200) && key) {
      return {
        key,
        base_url: typeof body.base_url === "string" ? body.base_url : PUBLIK_BASE_URL,
        install_id: typeof body.install_id === "string" ? body.install_id : installId,
        // An install publik already knows (200) may answer without these: keep what was known.
        claim_url: typeof body.claim_url === "string" ? body.claim_url : prior?.claim_url ?? null,
        claim_state: body.claim_state === "claimed" || body.claim_state === "anonymous" ? body.claim_state : prior?.claim_state ?? "anonymous",
        add_credit_url: body.wallet?.add_credit_url ?? prior?.add_credit_url ?? null,
        cost_sentence: body.disclosure?.cost ?? prior?.cost_sentence ?? null,
        balance_micros: typeof body.balance_micros === "number" ? body.balance_micros : prior?.balance_micros ?? null,
      };
    }
    if (response.status === 200 || body.error?.type === "install_revoked") {
      installId = randomUUID();
      continue;
    }
    throw new Error(body.error?.message ?? `publik could not set up this computer (${response.status}). Use your own Groq key for now.`);
  }
  throw new Error("publik could not set up this computer. Use your own Groq key for now.");
}

/** The balance and whether the install is linked, from publik's wallet. */
export async function readWallet(credential: PublikCredential): Promise<{ balanceMicros: number | null; claimState: "anonymous" | "claimed" | null; addCreditUrl: string | null }> {
  try {
    const response = await fetch(`${credential.base_url || PUBLIK_BASE_URL}/wallet`, {
      headers: { Authorization: `Bearer ${credential.key}` },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown> & { add_credit_url?: unknown };
    if (!response.ok) return { balanceMicros: null, claimState: null, addCreditUrl: null };
    const micros = body.balance_micros;
    return {
      balanceMicros: typeof micros === "number" ? micros : null,
      claimState: body.claim_state === "claimed" ? "claimed" : body.claim_state === "anonymous" ? "anonymous" : null,
      addCreditUrl: typeof body.add_credit_url === "string" ? body.add_credit_url : null,
    };
  } catch {
    return { balanceMicros: null, claimState: null, addCreditUrl: null };
  }
}

/**
 * A balance in dollars, never rounded up: $0.047794 is "$0.047", not "$0.05",
 * which would show money that isn't there. Under a dollar it keeps a tenth of
 * a cent, since a ramble costs about that and the free $0.05 is most of what
 * people have; from a dollar up, whole cents.
 */
export function formatBalance(micros: number): string {
  const places = micros < 1_000_000 ? 3 : 2;
  const step = 10 ** (6 - places);
  return `$${(Math.floor(Math.max(0, micros) / step) / 10 ** places).toFixed(places)}`;
}

/** The balance line publik asks for: "$0.00 · link this computer…" until linked. */
export function balanceLine(micros: number | null | undefined, claimState: "anonymous" | "claimed" = "anonymous"): string {
  if (micros == null) return "";
  const dollars = micros === 0 ? "$0.00" : formatBalance(micros);
  return micros === 0 && claimState === "anonymous" ? `${dollars} · link this computer for $0.05 of free use` : `${dollars} of publik balance`;
}

/** Builder check: `PUBLIK_SELF_TEST=1 npm start` prints this line and exits. It provisions for real. */
export async function selfTest(): Promise<string> {
  try {
    const credential = await provision(await readCredentialFile());
    await writeCredentialFile(credential);
    return `publik self-test: ok ${APP_SLUG} ${appVersion()} (install ${credential.install_id.slice(0, 8)})`;
  } catch (error) {
    return `publik self-test: failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}
