import { provision } from "@/lib/publik";
import { fail, fromError, ok, readObject } from "@/selfhost/http";
import { requireOwner } from "@/selfhost/owner";
import { rambleStatus, readPublikCredential, savePublikCredential, saveProvider } from "@/selfhost/ramble-settings";

export const dynamic = "force-dynamic";

/**
 * Sets publik up for this computer, after the owner accepted its disclosure
 * in Settings (`{ accept: true }`, sent by the button under the text): mints
 * this computer's key with the app's public token, keeps it in publik's own
 * credential file, and makes publik Ramble's choice.
 */
export async function POST(request: Request) {
  try {
    const owner = await requireOwner(request);
    const body = await readObject(request);
    if (body?.accept !== true) return fail("Accept publik's terms first.");
    let credential;
    try {
      credential = await provision(await readPublikCredential(owner));
    } catch (error) {
      return fail(error instanceof Error ? error.message : "publik could not set up this computer.", 502);
    }
    await savePublikCredential(owner, credential);
    await saveProvider(owner, "publik");
    return ok({ ...(await rambleStatus(owner)) });
  } catch (error) {
    return fromError(error);
  }
}
