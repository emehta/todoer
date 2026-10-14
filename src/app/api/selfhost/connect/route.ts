import { onTheWeb, readAppConfig, writeAppConfig } from "@/selfhost/config";
import { fail, fromError, ok, readObject, text } from "@/selfhost/http";
import { keyKind, sortPasted } from "@/selfhost/keys";
import { probeProject } from "@/selfhost/server";

export const dynamic = "force-dynamic";

/**
 * Saves the project a copy on this computer uses, after Supabase has
 * accepted both keys. Only while none is saved, or while Supabase refuses
 * the saved keys (they were reset): otherwise changing it is not a page
 * anyone can reach. Never on the web, where the project is set in the
 * hosting's variables.
 */
export async function POST(request: Request) {
  try {
    if (onTheWeb()) return fail("This copy is set up through its hosting, not here.", 404);
    const existing = await readAppConfig();
    if (existing && (await probeProject(existing)).reach !== "rejected") {
      return fail("This copy is already connected to a project.", 409);
    }
    const body = await readObject(request);
    if (!body) return fail("Send the project URL and keys as JSON.");

    const pasted = sortPasted(["url", "publishableKey", "secretKey", "pasted"].map((key) => text(body, key)).join("\n"));
    if (!pasted.url) return fail("Paste your Project URL. It looks like https://abcdefghijklmnopqrst.supabase.co.");
    if (!pasted.publishableKey && !pasted.secretKey) return fail("Paste both keys from your project's API Keys page.");
    if (!pasted.publishableKey) return fail("The publishable key is missing. It starts with sb_publishable_.");
    if (!pasted.secretKey) return fail("The secret key is missing. It starts with sb_secret_: press the eye beside it on the API Keys page to show it, then copy it.");
    if (keyKind(pasted.secretKey) !== "secret") return fail("The secret key box has the publishable key in it.");

    const config = { url: pasted.url, publishableKey: pasted.publishableKey, secretKey: pasted.secretKey };
    const { reach } = await probeProject(config);
    if (reach === "paused") return fail("This project is paused. Open it on supabase.com, press Restore project, and try again.", 409);
    if (reach === "unreachable") return fail("Could not reach that project. Check the Project URL, and that this computer is online.", 502);
    if (reach === "rejected") return fail("Supabase did not accept those keys. Copy both again from the API Keys page.", 401);

    await writeAppConfig(config);
    return ok();
  } catch (error) {
    return fromError(error);
  }
}
