import type { Owner } from "@/selfhost/owner";
import { onTheWeb } from "@/selfhost/config";
import { readSecret, writeSecret } from "@/selfhost/secrets";
import {
  DISCLOSURE,
  balanceLine,
  isCredential,
  publikAvailable,
  readCredentialFile,
  readWallet,
  writeCredentialFile,
  type PublikCredential,
} from "@/lib/publik";
import { keyHint, type ProviderName, type RambleChoice } from "@/lib/ramble/providers";

/** Where Ramble's choice and keys are kept for the owner. Server only. */

const PROVIDER = "todoer.ramble.provider";
const GROQ_KEY = "todoer.ramble.groq_key";
const PUBLIK_CREDENTIAL = "todoer.publik.credential";

function envValue(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export async function readPublikCredential(owner: Owner): Promise<PublikCredential | null> {
  const envKey = envValue("PUBLIK_API_KEY");
  if (envKey) {
    return {
      key: envKey,
      base_url: envValue("PUBLIK_API_BASE_URL") ?? "",
      install_id: "env",
      claim_url: null,
      claim_state: "claimed",
      add_credit_url: null,
      cost_sentence: null,
      balance_micros: null,
    };
  }
  if (!onTheWeb()) return readCredentialFile();
  const saved = await readSecret<unknown>(owner, PUBLIK_CREDENTIAL);
  return isCredential(saved) ? saved : null;
}

export async function savePublikCredential(owner: Owner, credential: PublikCredential): Promise<void> {
  if (!onTheWeb()) await writeCredentialFile(credential);
  else await writeSecret(owner, PUBLIK_CREDENTIAL, credential);
}

async function readProvider(owner: Owner): Promise<ProviderName | null> {
  const value = await readSecret<unknown>(owner, PROVIDER);
  return value === "groq" || value === "publik" ? value : null;
}

/** What the Ramble route needs: the choice and the key for it. */
export async function readChoice(owner: Owner): Promise<RambleChoice> {
  const [provider, savedGroqKey, credential] = await Promise.all([
    readProvider(owner),
    readSecret<string>(owner, GROQ_KEY),
    readPublikCredential(owner),
  ]);
  return {
    provider,
    groqKey: (typeof savedGroqKey === "string" && savedGroqKey) || envValue("GROQ_API_KEY"),
    publikKey: credential?.key ?? null,
    publikBaseUrl: credential?.base_url || null,
  };
}

export async function saveProvider(owner: Owner, provider: ProviderName | null): Promise<void> {
  await writeSecret(owner, PROVIDER, provider);
}

export async function saveGroqKey(owner: Owner, key: string | null): Promise<void> {
  await writeSecret(owner, GROQ_KEY, key);
}

/** What Settings shows. Never a key: only whether one is saved, and its last four characters. */
export interface RambleStatus {
  provider: ProviderName | null;
  groq: { saved: boolean; hint: string | null; fromEnv: boolean };
  publik: {
    available: boolean;
    setUp: boolean;
    balanceLine: string;
    costSentence: string | null;
    claimState: "anonymous" | "claimed" | null;
    claimUrl: string | null;
    addCreditUrl: string | null;
  };
  disclosure: string;
}

export async function rambleStatus(owner: Owner): Promise<RambleStatus> {
  const [provider, savedGroqKey, credential] = await Promise.all([
    readProvider(owner),
    readSecret<string>(owner, GROQ_KEY),
    readPublikCredential(owner),
  ]);
  const groqKey = (typeof savedGroqKey === "string" && savedGroqKey) || null;
  const wallet = credential ? await readWallet(credential) : null;
  const claimState = wallet?.claimState ?? credential?.claim_state ?? null;
  const micros = wallet?.balanceMicros ?? credential?.balance_micros ?? null;
  return {
    provider,
    groq: { saved: Boolean(groqKey || envValue("GROQ_API_KEY")), hint: keyHint(groqKey), fromEnv: !groqKey && Boolean(envValue("GROQ_API_KEY")) },
    publik: {
      available: publikAvailable(),
      setUp: Boolean(credential),
      balanceLine: credential ? balanceLine(micros, claimState ?? "anonymous") : "",
      costSentence: credential?.cost_sentence ?? null,
      claimState,
      claimUrl: credential?.claim_url ?? null,
      addCreditUrl: wallet?.addCreditUrl ?? credential?.add_credit_url ?? null,
    },
    disclosure: DISCLOSURE,
  };
}
