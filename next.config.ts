import type { NextConfig } from "next";

/*
 * Every response says it is not to be indexed or framed, and the page may
 * use no camera, microphone or location. (Ramble, in 1.1, will allow the
 * microphone here.)
 */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The setup SQL is read at request time, so a copy on the web must ship it.
  outputFileTracingIncludes: {
    "/api/selfhost/schema": ["./supabase/schema.sql"],
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
