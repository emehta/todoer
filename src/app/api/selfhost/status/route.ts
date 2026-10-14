import { environmentProblems, configFromEnvironment, onTheWeb, readAppConfig } from "@/selfhost/config";
import { fromError, ok } from "@/selfhost/http";
import { projectRef } from "@/selfhost/keys";
import { adminClient, ownerExists, probeProject, schemaState } from "@/selfhost/server";

export const dynamic = "force-dynamic";

/**
 * Where setup stands. Names nothing secret: no key, only the project's
 * reference, and, when environment variables set the project, which of them
 * is missing or wrong. `?fresh=1` asks Supabase again rather than reading
 * the answer kept for 30 seconds.
 */
export async function GET(request: Request) {
  try {
    const fresh = new URL(request.url).searchParams.get("fresh") === "1";
    const fromEnvironment = configFromEnvironment() || onTheWeb();
    const config = await readAppConfig();
    if (!config) {
      return ok({
        configured: false,
        onTheWeb: onTheWeb(),
        fromEnvironment,
        problems: fromEnvironment ? environmentProblems() : [],
      });
    }
    const ref = projectRef(config.url);
    const { reach, signupsOpen } = await probeProject(config, { fresh });
    if (reach !== "ok") return ok({ configured: true, onTheWeb: onTheWeb(), fromEnvironment, ref, reach });
    const client = adminClient(config);
    const schema = await schemaState(client);
    const owner = schema === "missing" ? null : await ownerExists(client);
    return ok({ configured: true, onTheWeb: onTheWeb(), fromEnvironment, ref, reach, schema, ownerExists: owner, signupsOpen });
  } catch (error) {
    return fromError(error);
  }
}
