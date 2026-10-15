"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Microphone } from "@phosphor-icons/react";
import ExternalLink from "@/components/ExternalLink";
import { SettingsRow, TogglePill, settingsNote } from "@/components/SettingsControls";
import StatusBanner from "@/components/StatusBanner";
import { DialogButton } from "@/components/form/Dialog";
import { TextField } from "@/components/form/fields";
import { authedFetch } from "@/lib/authed-fetch";
import { getErrorMessage, isNetworkError } from "@/lib/error-utils";
import { RAMBLE_CHANGED_EVENT } from "@/lib/open-settings";
import { UNREACHABLE } from "@/lib/ramble/request";
import type { RambleStatus } from "@/selfhost/ramble-settings";

/**
 * Ramble's part of Settings: which AI listens, and what that one needs.
 *
 * - Groq: the user's own free key, checked with Groq before it is saved and
 *   kept on this computer (never sent back to the page; only its last four
 *   characters are shown).
 * - publik: no key to paste. publik's disclosure is shown word for word and
 *   agreed to with the button under it; then the balance and its one button,
 *   Sign in with publik until this computer is linked, Add a plan or pack
 *   after, with publik's cost sentence folded under it. A key publik has
 *   refused since is said so, with Set up again.
 *
 * A copy without publik offers Groq alone: no choice to make, just the key.
 */

type Status = RambleStatus;

/** What is under way, so only the button pressed says so. */
type Action = "load" | "provider" | "key" | "remove" | "publik";

async function call(method: "GET" | "PUT" | "POST", path: string, body?: unknown): Promise<Status> {
  let response: Response;
  try {
    response = await authedFetch(path, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    /* Todoer's own server, not Supabase, is what did not answer. */
    if (isNetworkError(error)) throw new Error(UNREACHABLE);
    throw error;
  }
  const answer = (await response.json().catch(() => null)) as (Status & { error?: string }) | null;
  if (!response.ok || !answer) {
    throw new Error(answer?.error ?? (method === "GET" ? `Could not load Ramble's settings (${response.status}).` : `Could not save that (${response.status}).`));
  }
  return answer;
}

const row = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 } as const;

const OPTIONS = [
  { value: "groq", label: "Groq" },
  { value: "publik", label: "publik" },
];

export default function RambleSettings() {
  const [status, setStatus] = useState<Status | null>(null);
  const [pending, setPending] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [groqKey, setGroqKey] = useState("");
  /* Remove takes two presses: the first arms it. */
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const busyRef = useRef(false);
  /* Every button waits while anything is under way. */
  const busy = pending !== null;

  const run = useCallback(async (action: Action, task: () => Promise<Status>) => {
    busyRef.current = true;
    setPending(action);
    /* A load's error stays up while it is tried again, its button saying so. */
    if (action !== "load") setError(null);
    try {
      setStatus(await task());
      setError(null);
      /* Ramble's button, on the page behind, asks again whether it can listen. */
      if (action !== "load") window.dispatchEvent(new Event(RAMBLE_CHANGED_EVENT));
      return true;
    } catch (failure) {
      setError(getErrorMessage(failure, "That didn't work. Try again."));
      return false;
    } finally {
      busyRef.current = false;
      setPending(null);
    }
  }, []);

  const load = useCallback(() => run("load", () => call("GET", "/api/ramble/settings")), [run]);

  useEffect(() => {
    void load();
    /* Back from publik's page (signed in, or credit added): the balance and
       its button are read again, quietly, unless a save is under way. */
    const refresh = () => {
      if (document.visibilityState !== "visible" || busyRef.current) return;
      call("GET", "/api/ramble/settings").then(
        (next) => { if (!busyRef.current) setStatus(next); },
        () => undefined,
      );
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [load]);

  if (!status) {
    return (
      <>
        <SettingsRow icon={Microphone} label="Runs on">
          <TogglePill options={OPTIONS} value={null} onChange={() => {}} ariaLabel="Ramble's AI" disabled />
        </SettingsRow>
        {error && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
            <StatusBanner message={error} style={{ alignSelf: "stretch" }} />
            <DialogButton variant="secondary" busy={pending === "load"} disabled={busy} onClick={() => { void load(); }}>
              {pending === "load" ? "Checking…" : "Try again"}
            </DialogButton>
          </div>
        )}
      </>
    );
  }

  const choose = (provider: string) => {
    if (provider !== "groq" && provider !== "publik") return;
    // Shown at once; the answer that comes back (a second or two, as it asks publik for the balance) settles it.
    const before = status;
    setStatus({ ...status, provider });
    void run("provider", () => call("PUT", "/api/ramble/settings", { provider })).then((saved) => {
      if (!saved) setStatus(before);
    });
  };
  /* A copy with no publik app token can't use publik, so Groq is all there
     is: no choice to make, and Save chooses it with the key. (publik stays
     offered when already chosen, to switch away from it.) */
  const groqOnly = !status.publik.available && status.provider !== "publik";
  const showsGroq = groqOnly || status.provider === "groq";
  const open = (url: string | null) => {
    if (url) window.open(url, "_blank", "noopener");
  };
  const keyLine = status.groq.fromEnv ? "Using GROQ_API_KEY" : `Key saved${status.groq.hint ? ` (${status.groq.hint})` : ""}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 8 }}>
      <SettingsRow icon={Microphone} label="Runs on">
        {groqOnly
          ? <span style={{ color: "var(--c-text-2)", fontSize: "var(--ui-type-body-sm)" }}>Groq</span>
          : <TogglePill options={OPTIONS} value={status.provider} onChange={choose} ariaLabel="Ramble's AI" disabled={busy} />}
      </SettingsRow>

      {status.provider === null && !groqOnly && <p style={settingsNote}>Groq is free with your own key. publik needs no key and charges per use.</p>}

      {showsGroq && (
        status.groq.saved && status.provider === "groq" ? (
          <div style={row}>
            <span style={settingsNote}>{keyLine}</span>
            {!status.groq.fromEnv && (
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <DialogButton
                  variant="danger"
                  armed={confirmingRemove}
                  busy={pending === "remove"}
                  disabled={busy}
                  onClick={() => {
                    if (!confirmingRemove) {
                      setConfirmingRemove(true);
                      return;
                    }
                    void run("remove", () => call("PUT", "/api/ramble/settings", { groqKey: null })).then(() => setConfirmingRemove(false));
                  }}
                >
                  {pending === "remove" ? "Removing…" : confirmingRemove ? "Confirm remove" : "Remove"}
                </DialogButton>
                {confirmingRemove && pending !== "remove" && (
                  <DialogButton variant="ghost" onClick={() => setConfirmingRemove(false)}>Keep</DialogButton>
                )}
              </div>
            )}
          </div>
        ) : status.groq.saved ? (
          /* Groq alone, with a key from GROQ_API_KEY and nothing chosen yet. */
          <div style={row}>
            <span style={settingsNote}>{keyLine}</span>
            <DialogButton variant="primary" busy={pending === "provider"} disabled={busy} onClick={() => void run("provider", () => call("PUT", "/api/ramble/settings", { provider: "groq" }))}>
              {pending === "provider" ? "Saving…" : "Use Groq"}
            </DialogButton>
          </div>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const change = groqOnly ? { provider: "groq", groqKey } : { groqKey };
              void run("key", () => call("PUT", "/api/ramble/settings", change)).then((saved) => {
                if (saved) setGroqKey("");
              });
            }}
            style={{ display: "flex", flexDirection: "column", gap: 6 }}
          >
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                <TextField aria-label="Groq key" type="password" value={groqKey} onChange={(event) => { setGroqKey(event.target.value); setError(null); }} placeholder="Paste your Groq key" autoComplete="off" spellCheck={false} />
              </div>
              <DialogButton type="submit" variant="primary" busy={pending === "key"} disabled={busy || !groqKey.trim()}>
                {pending === "key" ? "Checking…" : "Save"}
              </DialogButton>
            </div>
            <div style={{ fontSize: "var(--ui-type-label)" }}><ExternalLink href="https://console.groq.com/keys">Get a free key</ExternalLink></div>
          </form>
        )
      )}

      {status.provider === "publik" && (
        !status.publik.available ? (
          <p style={settingsNote}>publik isn&apos;t available in this copy. Use a Groq key.</p>
        ) : !status.publik.setUp ? (
          <>
            <p style={settingsNote}>{status.disclosure}</p>
            <div>
              <DialogButton variant="primary" busy={pending === "publik"} disabled={busy} onClick={() => void run("publik", () => call("POST", "/api/ramble/publik", { accept: true }))}>
                {pending === "publik" ? "Setting up…" : "Accept and use publik"}
              </DialogButton>
            </div>
          </>
        ) : status.publik.refused ? (
          /* publik no longer takes this computer's key: a new one, from the same install. */
          <div style={row}>
            <span style={settingsNote}>publik refused this computer&apos;s key.</span>
            <DialogButton variant="primary" busy={pending === "publik"} disabled={busy} onClick={() => void run("publik", () => call("POST", "/api/ramble/publik", { accept: true, again: true }))}>
              {pending === "publik" ? "Setting up…" : "Set up again"}
            </DialogButton>
          </div>
        ) : (
          <>
            <div style={row}>
              <span style={{ color: "var(--c-text-2)", fontSize: "var(--ui-type-body-sm)" }}>{status.publik.balanceLine}</span>
              {status.publik.claimState === "claimed"
                ? status.publik.addCreditUrl && <DialogButton variant="secondary" onClick={() => open(status.publik.addCreditUrl)}>Add a plan or pack</DialogButton>
                : status.publik.claimUrl && <DialogButton variant="primary" onClick={() => open(status.publik.claimUrl)}>Sign in with publik</DialogButton>}
            </div>
            {/* publik's own words, shown as it gives them (its rule), folded away until asked for. */}
            {status.publik.costSentence && (
              <details>
                <summary style={{ ...settingsNote, cursor: "pointer", width: "fit-content" }}>How publik charges</summary>
                <p style={{ ...settingsNote, marginTop: 6 }}>{status.publik.costSentence}</p>
              </details>
            )}
          </>
        )
      )}

      {error && <StatusBanner message={error} />}
    </div>
  );
}
