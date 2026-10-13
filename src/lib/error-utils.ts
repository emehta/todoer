type ErrorShape = {
  message?: unknown;
  details?: unknown;
  hint?: unknown;
  code?: unknown;
};

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Whether an error is a cancelled fetch rather than a real failure.
 *
 * Aborts arrive in more than one shape depending on where they are caught — a
 * DOMException from fetch, a plain Error from Supabase's client — so all of
 * them are checked here instead of in each caller.
 */
export function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error instanceof Error && error.name === "AbortError") return true;
  if (error && typeof error === "object") {
    const value = error as { name?: unknown; message?: unknown };
    return (
      value.name === "AbortError" ||
      (typeof value.message === "string" && value.message.toLowerCase().includes("abort"))
    );
  }
  return false;
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (error && typeof error === "object") {
    const shaped = error as ErrorShape;
    const parts = [
      asText(shaped.message),
      asText(shaped.details),
      asText(shaped.hint),
      asText(shaped.code) ? `Code: ${String(shaped.code)}` : null,
    ].filter(Boolean) as string[];

    if (parts.length > 0) {
      return parts.join(" ");
    }
  }

  return fallback;
}

/**
 * Whether an error is the browser failing to reach the server at all: a
 * dropped connection, offline, a blocked request. Chrome says "Failed to
 * fetch", Firefox "NetworkError" and Safari "Load failed"; Supabase's client
 * passes the words on with a stack trace attached, which is no use to anyone.
 */
export function isNetworkError(error: unknown): boolean {
  return /failed to fetch|networkerror|load failed/i.test(getErrorMessage(error, ""));
}
