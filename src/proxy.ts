import { NextResponse, type NextRequest } from "next/server";

/**
 * A copy on someone's computer answers this computer only.
 *
 * - A request whose Host is not this computer's loopback address is a page
 *   elsewhere pointing a name of its own at it (DNS rebinding): refused.
 * - localhost and [::1] are sent to 127.0.0.1, so the app has one origin
 *   (one sign-in, one set of cookies, one Google redirect).
 * - A write must come from the app's own pages: its Origin is the app's,
 *   the browser says it is same-origin, and it is JSON or a form upload. A
 *   page on another site can post to 127.0.0.1, and this is what stops it.
 *
 * A copy on the web (Vercel) has its own domain and HTTPS, and is left alone.
 */

const LOOPBACK = "127.0.0.1";

function splitHost(host: string): { name: string; port: string } {
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    return { name: host.slice(0, end + 1), port: host.slice(end + 2) };
  }
  const [name, port = ""] = host.split(":");
  return { name, port };
}

export function proxy(request: NextRequest) {
  if (process.env.VERCEL) return NextResponse.next();

  const host = request.headers.get("host") ?? "";
  const { name, port } = splitHost(host);

  if (name === "localhost" || name === "[::1]") {
    const url = request.nextUrl.clone();
    url.hostname = LOOPBACK;
    url.port = port;
    return NextResponse.redirect(url, 307);
  }
  if (name !== LOOPBACK) return new NextResponse("This app only answers this computer.", { status: 421 });

  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return NextResponse.next();

  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (origin !== `http://${host}` || (site !== null && site !== "same-origin")) {
    return NextResponse.json({ error: "Requests from other sites are refused." }, { status: 403 });
  }
  const type = request.headers.get("content-type") ?? "";
  if (!type.startsWith("application/json") && !type.startsWith("multipart/form-data")) {
    return NextResponse.json({ error: "Send JSON." }, { status: 415 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/:path*",
};
