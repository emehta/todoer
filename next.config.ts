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

const nextConfig: NextConfig = {
  poweredByHeader: false,
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
