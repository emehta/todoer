import type { NextConfig } from "next";

/*
 * Every response says it is not to be indexed or framed. The page may use
 * the microphone (Ramble, which the browser still asks about) and no camera
 * or location.
 */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

/* Set by scripts/package.mjs: the release download, a server with only the files it runs on. */
const BUNDLE = process.env.TODOER_BUNDLE === "1";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // AGENTS.md is written by hand; `next dev` would otherwise add its own block to it.
  agentRules: false,
  /* `npm start` builds on the user's computer, where checking the types again
     proves nothing (CI checks them on every commit) and was half the build:
     24 s of it, 13 s without. `npm run build` still checks. */
  typescript: { ignoreBuildErrors: process.env.TODOER_SKIP_TYPECHECK === "1" },
  output: BUNDLE ? "standalone" : undefined,
  /* Next's image optimiser (sharp) is native, so the download would only run
     on the system it was built on, and Todoer never asks it for an image. */
  outputFileTracingExcludes: BUNDLE ? { "*": ["node_modules/sharp/**", "node_modules/@img/**", "./extract.config.json", "./tsconfig.json"] } : undefined,
  // The setup SQL is read at request time, so a copy on the web must ship it.
  outputFileTracingIncludes: {
    "/api/selfhost/schema": ["./supabase/schema.sql"],
    // publik's app token is read where the app runs (lib/publik).
    "/api/ramble/publik": ["./publik-app-token.txt"],
    "/api/ramble/settings": ["./publik-app-token.txt"],
  },
  // The task list is the app: "/" goes straight there, as a real redirect.
  async redirects() {
    return [{ source: "/", destination: "/tasks", permanent: false }];
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
