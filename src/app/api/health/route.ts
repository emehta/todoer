import { NextResponse } from "next/server";

/** Says which app answers on this port, so `npm start` can tell Todoer already running from another program. */
export function GET() {
  return NextResponse.json({ app: "todoer" }, { headers: { "cache-control": "no-store" } });
}
