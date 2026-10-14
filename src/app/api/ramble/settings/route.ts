import { checkGroqKey } from "@/lib/ai";
import { GROQ, looksLikeGroqKey } from "@/lib/ramble/providers";
import { fail, fromError, ok, readObject } from "@/selfhost/http";
import { requireOwner } from "@/selfhost/owner";
import { rambleStatus, saveGroqKey, saveProvider } from "@/selfhost/ramble-settings";

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

/**
 * Changes the choice, or the Groq key: `{ provider: "groq" | "publik" | null }`,
 * `{ groqKey: "gsk_…" }` to save one (checked with Groq first, without using
 * any of its limit), `{ groqKey: null }` to remove it.
 */
export async function PUT(request: Request) {
  try {
    const owner = await requireOwner(request);
    const body = await readObject(request);
    if (!body) return fail("Send the change as JSON.");

    if ("groqKey" in body) {
      const key = typeof body.groqKey === "string" ? body.groqKey.trim() : null;
      if (key !== null) {
        if (!looksLikeGroqKey(key)) return fail("That isn't a Groq key. Groq's keys start with gsk_.");
        const check = await checkGroqKey(GROQ.baseUrl, key);
        if (check === "refused") return fail("Groq didn't accept that key. Copy it again from Groq's API Keys page.", 400);
        if (check === "unreachable") return fail("Couldn't reach Groq to check the key. Check that this computer is online.", 502);
      }
      await saveGroqKey(owner, key);
    }
    if ("provider" in body) {
      const provider = body.provider;
      if (provider !== null && provider !== "groq" && provider !== "publik") return fail("Choose groq or publik.");
      await saveProvider(owner, provider);
    }
    return ok({ ...(await rambleStatus(owner)) });
  } catch (error) {
    return fromError(error);
  }
}
