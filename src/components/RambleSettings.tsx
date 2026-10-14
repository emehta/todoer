"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ArrowSquareOut, Microphone } from "@phosphor-icons/react";
import { SettingsRow, TogglePill, settingsNote } from "@/components/SettingsControls";
import StatusBanner from "@/components/StatusBanner";
import { DialogButton } from "@/components/form/Dialog";
import { TextField } from "@/components/form/fields";
import { authedFetch } from "@/lib/authed-fetch";
import { getErrorMessage } from "@/lib/error-utils";

/**
 * Ramble's part of Settings: which AI listens, and what that one needs.
 *
 * - Groq: the user's own free key, checked with Groq before it is saved and
 *   kept on this computer (never sent back to the page; only its last four
 *   characters are shown).
 * - publik: no key to paste. publik's disclosure is shown word for word and
 *   agreed to with the button under it; then the balance and its one button,
 *   Sign in with publik until this computer is linked, Add a plan or pack
 *   after, with publik's cost sentence folded under it.
 */

interface Status {
  provider: "groq" | "publik" | null;
  groq: { saved: boolean; hint: string | null; fromEnv: boolean };
  publik: {
    available: boolean;
    setUp: boolean;
    balanceLine: string;
    costSentence: string | null;
    claimState: "anonymous" | "claimed" | null;
    claimUrl: string | null;
    addCreditUrl: string | null;
  };
  disclosure: string;
}

async function call(method: "GET" | "PUT" | "POST", path: string, body?: unknown): Promise<Status> {
  const response = await authedFetch(path, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const answer = (await response.json().catch(() => null)) as (Status & { error?: string }) | null;
  if (!response.ok || !answer) throw new Error(answer?.error ?? `Ramble's settings did not load (${response.status}).`);
  return answer;
}

function Link({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--c-accent)", fontWeight: 600, fontSize: "var(--ui-type-label)" }}>
      {children}
      <ArrowSquareOut size={13} weight="bold" aria-hidden="true" />
    </a>
  );
}

const row = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 } as const;

const OPTIONS = [
  { value: "groq", label: "Groq" },
  { value: "publik", label: "publik" },
];

export default function RambleSettings() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groqKey, setGroqKey] = useState("");

  const run = useCallback(async (task: () => Promise<Status>) => {
    setBusy(true);
    setError(null);
    try {
      setStatus(await task());
      return true;
    } catch (failure) {
      setError(getErrorMessage(failure, "That did not work. Try again."));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void run(() => call("GET", "/api/ramble/settings"));
  }, [run]);

  if (!status) {
    return (
      <>
        <SettingsRow icon={Microphone} label="Listens with">
          <TogglePill options={OPTIONS} value={null} onChange={() => {}} ariaLabel="Ramble's AI" disabled />
        </SettingsRow>
        {error && <StatusBanner message={error} style={{ marginBottom: 8 }} />}
      </>
    );
  }

  const choose = (provider: string) => {
    if (provider !== "groq" && provider !== "publik") return;
    // Shown at once; the answer that comes back (a second or two, as it asks publik for the balance) settles it.
    const before = status;
    setStatus({ ...status, provider });
    void run(() => call("PUT", "/api/ramble/settings", { provider })).then((saved) => {
      if (!saved) setStatus(before);
    });
  };
  const open = (url: string | null) => {
    if (url) window.open(url, "_blank", "noopener");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 8 }}>
      <SettingsRow icon={Microphone} label="Listens with">
        <TogglePill options={OPTIONS} value={status.provider} onChange={choose} ariaLabel="Ramble's AI" disabled={busy} />
      </SettingsRow>

      {status.provider === null && <p style={settingsNote}>Groq is free with your own key. publik needs no key and charges per use.</p>}

      {status.provider === "groq" && (
        status.groq.saved ? (
          <div style={row}>
            <span style={settingsNote}>{status.groq.fromEnv ? "Using GROQ_API_KEY" : `Key saved${status.groq.hint ? ` (${status.groq.hint})` : ""}`}</span>
            {!status.groq.fromEnv && (
              <DialogButton variant="ghost" disabled={busy} onClick={() => void run(() => call("PUT", "/api/ramble/settings", { groqKey: null }))}>
                Remove
              </DialogButton>
            )}
          </div>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void run(() => call("PUT", "/api/ramble/settings", { groqKey })).then((saved) => {
                if (saved) setGroqKey("");
              });
            }}
            style={{ display: "flex", flexDirection: "column", gap: 6 }}
          >
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                <TextField aria-label="Groq key" type="password" value={groqKey} onChange={(event) => { setGroqKey(event.target.value); setError(null); }} placeholder="Paste your Groq key" autoComplete="off" spellCheck={false} />
              </div>
              <DialogButton type="submit" variant="primary" busy={busy} disabled={busy || !groqKey.trim()}>
                {busy ? "Checking…" : "Save"}
              </DialogButton>
            </div>
            <div><Link href="https://console.groq.com/keys">Get a free key</Link></div>
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
              <DialogButton variant="primary" busy={busy} disabled={busy} onClick={() => void run(() => call("POST", "/api/ramble/publik", { accept: true }))}>
                {busy ? "Setting up…" : "Accept and use publik"}
              </DialogButton>
            </div>
          </>
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
