import { checkGroqKey } from "@/lib/ai";
import { OFFLINE_MESSAGE } from "@/lib/error-utils";
import { GROQ, looksLikeGroqKey, type ProviderName } from "@/lib/ramble/providers";
import { fail, fromError, ok, readObject } from "@/selfhost/http";
import { requireOwner } from "@/selfhost/owner";
import { rambleStatus, saveRambleChange } from "@/selfhost/ramble-settings";

export const dynamic = "force-dynamic";

/** Ramble's settings as Settings shows them: the choice, and whether each is ready. No key is ever sent back. */
export async function GET(request: Request) {
  try {
    const owner = await requireOwner(request);
    return ok({ ...(await rambleStatus(owner)) });
  } catch (error) {
    return fromError(error);
  }
}

/* Why Groq's check of a key did not say yes, and the status the page is answered with. */
const CHECK_FAILED = {
  refused: { message: "Groq didn't accept that key. Copy it again from Groq's API Keys page.", status: 400 },
  busy: { message: "Groq is busy right now. Try again in a minute.", status: 503 },
  down: { message: "Groq isn't answering properly right now. Try again later.", status: 502 },
  unreachable: { message: `Could not reach Groq. ${OFFLINE_MESSAGE}`, status: 502 },
} as const;

/**
 * Changes the choice, or the Groq key, or both: `{ provider: "groq" |
 * "publik" | null }`, `{ groqKey: "gsk_…" }` to save one (checked with Groq
 * first, without using any of its limit), `{ groqKey: null }` to remove it.
 * Every value is checked before anything is saved, and the two are saved
 * together, so a change is never half made.
 */
export async function PUT(request: Request) {
  try {
    const owner = await requireOwner(request);
    const body = await readObject(request);
    if (!body) return fail("Send the change as JSON.");
    const hasKey = "groqKey" in body;
    const hasProvider = "provider" in body;
    if (!hasKey && !hasProvider) return fail("Send a groqKey or a provider.");

    const change: { groqKey?: string | null; provider?: ProviderName | null } = {};
    if (hasKey) {
      const raw = body.groqKey;
      if (raw !== null && typeof raw !== "string") return fail("groqKey must be a key or null.");
      change.groqKey = raw === null ? null : raw.trim();
    }
    if (hasProvider) {
      const provider = body.provider;
      if (provider !== null && provider !== "groq" && provider !== "publik") return fail("Choose groq or publik.");
      change.provider = provider;
    }

    if (typeof change.groqKey === "string") {
      if (!looksLikeGroqKey(change.groqKey)) return fail("That isn't a Groq key. Groq's keys start with gsk_.");
      const check = await checkGroqKey(GROQ.baseUrl, change.groqKey);
      if (check !== "ok") return fail(CHECK_FAILED[check].message, CHECK_FAILED[check].status);
    }

    await saveRambleChange(owner, change);
    return ok({ ...(await rambleStatus(owner)) });
  } catch (error) {
    return fromError(error);
  }
}
