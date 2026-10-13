import { onTheWeb, readAppConfig } from "@/selfhost/config";
import { fromError, ok } from "@/selfhost/http";
import { projectRef } from "@/selfhost/keys";
import { adminClient, ownerExists, probeProject, schemaState } from "@/selfhost/server";

export const dynamic = "force-dynamic";

/** Where setup stands. Names nothing secret: no key, only the project's reference. */
export async function GET() {
  try {
    const config = await readAppConfig();
    if (!config) return ok({ configured: false, onTheWeb: onTheWeb() });
    const ref = projectRef(config.url);
    const { reach, signupsOpen } = await probeProject(config);
    if (reach !== "ok") return ok({ configured: true, onTheWeb: onTheWeb(), ref, reach });
    const client = adminClient(config);
    const schema = await schemaState(client);
    const owner = schema === "missing" ? null : await ownerExists(client);
    return ok({ configured: true, onTheWeb: onTheWeb(), ref, reach, schema, ownerExists: owner, signupsOpen });
  } catch (error) {
    return fromError(error);
  }
}
