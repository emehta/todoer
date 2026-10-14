import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { SetupError } from "@/selfhost/server";

/** Small helpers for the setup routes. Server only. */

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
}

export function ok(body: Record<string, unknown> = { ok: true }) {
  return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
}

/** A body that is not a JSON object is the caller's mistake, never a 500. */
export async function readObject(request: Request): Promise<Record<string, unknown> | null> {
  const body = await request.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}

export function text(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === "string" ? value.trim() : "";
}

/** Compares two secrets in constant time, whatever their lengths. */
export function secretsMatch(given: string, expected: string): boolean {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b) && given.length === expected.length;
}

export function fromError(error: unknown) {
  if (error instanceof SetupError) {
    const code = (error as { code?: unknown }).code;
    return NextResponse.json(
      typeof code === "string" ? { error: error.message, code } : { error: error.message },
      { status: error.status, headers: { "cache-control": "no-store" } },
    );
  }
  console.error(error);
  return fail("Something went wrong on this computer's side. Try again.", 500);
}
