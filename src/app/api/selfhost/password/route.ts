import { onTheWeb, readAppConfig } from "@/selfhost/config";
import { fail, fromError, ok, readObject, secretsMatch, text } from "@/selfhost/http";
import { resetOwnerPassword } from "@/selfhost/server";

export const dynamic = "force-dynamic";

const MIN_PASSWORD = 8;

/**
 * A forgotten password, set again without email (Supabase's own email only
 * reaches the project's team, and slowly). Proof of being the owner is
 * something only the owner can get: on this computer, the project's secret
 * key, pasted again from Supabase; on the web, the setup code chosen at
 * deploy. Answers with the account's email, to sign in with.
 */
export async function POST(request: Request) {
  try {
    const config = await readAppConfig();
    if (!config) return fail("Connect a Supabase project first.", 409);
    const body = await readObject(request);
    if (!body) return fail("Send the proof and the new password as JSON.");

    if (onTheWeb()) {
      const expected = process.env.SETUP_CODE?.trim() ?? "";
      if (expected.length < 8 || !secretsMatch(text(body, "setupCode"), expected)) return fail("That setup code is not the one you chose.", 403);
    } else if (!secretsMatch(text(body, "secretKey"), config.secretKey)) {
      return fail("That is not this project's secret key. Copy it again from the API Keys page.", 403);
    }

    const password = typeof body.password === "string" ? body.password : "";
    if (password.length < MIN_PASSWORD) return fail(`Choose a password of ${MIN_PASSWORD} characters or more.`);
    const email = await resetOwnerPassword(config, password);
    return ok({ ok: true, email });
  } catch (error) {
    return fromError(error);
  }
}
