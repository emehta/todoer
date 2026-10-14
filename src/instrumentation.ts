/**
 * Runs once as the server starts. Only for publik's builder check, which is
 * Node only (src/instrumentation-node.ts), so it is loaded only there.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./instrumentation-node");
}
