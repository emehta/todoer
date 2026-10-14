"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { ArrowSquareOut, Check, Copy } from "@phosphor-icons/react";
import StatusBanner from "@/components/StatusBanner";
import { DialogButton } from "@/components/form/Dialog";
import { FieldGroup, FieldStack, TextField } from "@/components/form/fields";
import { getErrorMessage } from "@/lib/error-utils";
import { supabase } from "@/lib/supabase";
import { APP_NAME } from "@/selfhost/constants";
import { dashboardLinks, projectRef } from "@/selfhost/keys";

/**
 * The screens between a fresh copy and the task list: connect a Supabase
 * project, give it the tables, make the one account, sign in. Each says what
 * to do in a sentence or two and links to the exact page of the user's own
 * project where it is done.
 */

async function postJson(url: string, body: Record<string, unknown>): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const answer = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(answer.error ?? `The request failed (${response.status}).`);
}

function Frame({ title, intro, children }: { title: string; intro: ReactNode; children: ReactNode }) {
  return (
    <div style={{ flex: "1 1 auto", display: "flex", justifyContent: "center", overflowY: "auto" }}>
      <div style={{ width: "100%", maxWidth: 520, padding: "72px 20px 48px", display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h1 className="text-2xl font-bold">{title}</h1>
          <div style={{ color: "var(--c-text-2)", lineHeight: 1.55, display: "flex", flexDirection: "column", gap: 8 }}>{intro}</div>
        </div>
        {children}
      </div>
    </div>
  );
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--c-accent)", fontWeight: 600 }}
    >
      {children}
      <ArrowSquareOut size={15} weight="bold" aria-hidden="true" />
    </a>
  );
}

function Steps({ children }: { children: ReactNode }) {
  return <ol style={{ display: "flex", flexDirection: "column", gap: 10, paddingLeft: 20, listStyle: "decimal", lineHeight: 1.55 }}>{children}</ol>;
}

function Actions({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{children}</div>;
}

export function LoadingScreen() {
  return (
    <div style={{ flex: "1 1 auto", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--c-text-3)" }}>
      Loading…
    </div>
  );
}

export function ConnectScreen({ again, onConnected }: { again: boolean; onConnected: () => void }) {
  const [url, setUrl] = useState("");
  const [publishableKey, setPublishableKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = projectRef(url.trim());
  const links = ref ? dashboardLinks(ref) : null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await postJson("/api/selfhost/connect", { url, publishableKey, secretKey });
      onConnected();
    } catch (failure) {
      setError(getErrorMessage(failure, "That did not work. Try again."));
      setBusy(false);
    }
  }

  return (
    <Frame
      title={again ? "Connect your project again" : `Set up ${APP_NAME}`}
      intro={
        again ? (
          <p>Supabase no longer accepts the keys this copy saved, which happens when they are reset. Paste the project&apos;s current keys.</p>
        ) : (
          <>
            <p>{APP_NAME} keeps your tasks in your own free Supabase project. Nothing is sent anywhere else.</p>
            <p>This takes about five minutes, once.</p>
          </>
        )
      }
    >
      <Steps>
        <li>
          Make a free project on Supabase, or use one you have. <ExternalLink href="https://supabase.com/dashboard/projects">Open Supabase</ExternalLink>
        </li>
        <li>On the project&apos;s home page, press Copy beside its address, and paste it below.</li>
        <li>
          Copy its publishable key and its secret key from the API Keys page{links ? ": " : "."}
          {links && <ExternalLink href={links.apiKeys}>Open your API Keys page</ExternalLink>}
        </li>
      </Steps>
      <form onSubmit={submit}>
        <FieldStack>
          <FieldGroup label="Project URL" htmlFor="setup-url">
            <TextField id="setup-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://abcdefghijklmnopqrst.supabase.co" autoComplete="off" spellCheck={false} />
          </FieldGroup>
          <FieldGroup label="Publishable key" htmlFor="setup-publishable">
            <TextField id="setup-publishable" value={publishableKey} onChange={(e) => setPublishableKey(e.target.value)} placeholder="sb_publishable_…" autoComplete="off" spellCheck={false} />
          </FieldGroup>
          <FieldGroup label="Secret key" htmlFor="setup-secret">
            <TextField id="setup-secret" type="password" value={secretKey} onChange={(e) => setSecretKey(e.target.value)} placeholder="sb_secret_…" autoComplete="off" spellCheck={false} />
          </FieldGroup>
          {error && <StatusBanner message={error} />}
          <Actions>
            <DialogButton type="submit" variant="primary" busy={busy} disabled={busy}>
              {busy ? "Checking…" : "Connect"}
            </DialogButton>
          </Actions>
          <p style={{ color: "var(--c-text-3)", fontSize: "var(--ui-type-label)", lineHeight: 1.5 }}>
            The secret key stays on this computer, in a file only your account can read. It is never sent to the page.
          </p>
        </FieldStack>
      </form>
    </Frame>
  );
}

export function DatabaseScreen({
  projectRefValue,
  update,
  stillMissing,
  onCheck,
}: {
  projectRefValue: string | null;
  update: boolean;
  /** Checked at least once and the tables were still not there. */
  stillMissing: boolean;
  onCheck: () => Promise<void>;
}) {
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const links = projectRefValue ? dashboardLinks(projectRefValue) : null;

  async function copy() {
    setError(null);
    try {
      const sql = await fetch("/api/selfhost/schema", { cache: "no-store" }).then((response) => {
        if (!response.ok) throw new Error("Could not read the setup.");
        return response.text();
      });
      await navigator.clipboard.writeText(sql);
      setCopied(true);
    } catch (failure) {
      setError(getErrorMessage(failure, "That did not work. Try again."));
    }
  }

  async function check() {
    setChecking(true);
    setError(null);
    try {
      await onCheck();
    } catch (failure) {
      setError(getErrorMessage(failure, "That did not work. Try again."));
    } finally {
      setChecking(false);
    }
  }

  return (
    <Frame
      title={update ? "Update your database" : "Give the project its tables"}
      intro={
        update ? (
          <p>This version of {APP_NAME} needs a change to its tables. Running the setup again keeps everything you have.</p>
        ) : (
          <p>Your project is connected. It needs {APP_NAME}&apos;s tables, which one paste in Supabase makes.</p>
        )
      }
    >
      <Steps>
        <li>Copy the setup.</li>
        <li>
          Open your project&apos;s SQL Editor{links ? ": " : "."}
          {links && <ExternalLink href={links.sqlEditor}>Open the SQL Editor</ExternalLink>}
        </li>
        <li>Paste it there and press Run.</li>
        <li>Come back here and press Check again.</li>
      </Steps>
      {error && <StatusBanner message={error} />}
      {!error && stillMissing && !checking && (
        <StatusBanner tone="info" message="The tables aren't there yet. Check that Run finished without an error, then press Check again." />
      )}
      <Actions>
        <DialogButton variant="secondary" onClick={() => { void copy(); }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            {copied ? <Check size={15} weight="bold" aria-hidden="true" /> : <Copy size={15} weight="bold" aria-hidden="true" />}
            {copied ? "Copied" : "Copy the setup"}
          </span>
        </DialogButton>
        <DialogButton variant="primary" busy={checking} disabled={checking} onClick={() => { void check(); }}>
          {checking ? "Checking…" : "Check again"}
        </DialogButton>
      </Actions>
    </Frame>
  );
}

export function CreateAccountScreen({ onTheWeb, onCreated }: { onTheWeb: boolean; onCreated: () => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [setupCode, setSetupCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await postJson("/api/selfhost/account", { email, password, setupCode });
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (signInError) throw new Error(`The account was made, but signing in failed: ${signInError.message}`);
      await onCreated();
    } catch (failure) {
      setError(getErrorMessage(failure, "That did not work. Try again."));
      setBusy(false);
    }
  }

  return (
    <Frame
      title="Make your account"
      intro={<p>This is the one account for your project. You sign in with it from now on.</p>}
    >
      <form onSubmit={submit}>
        <FieldStack>
          <FieldGroup label="Email" htmlFor="account-email">
            <TextField id="account-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </FieldGroup>
          <FieldGroup label="Password" htmlFor="account-password">
            <TextField id="account-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder="8 characters or more" />
          </FieldGroup>
          {onTheWeb && (
            <FieldGroup label="Setup code" htmlFor="account-code">
              <TextField id="account-code" type="password" value={setupCode} onChange={(e) => setSetupCode(e.target.value)} autoComplete="off" placeholder="The one you chose when you deployed" />
            </FieldGroup>
          )}
          {error && <StatusBanner message={error} />}
          <Actions>
            <DialogButton type="submit" variant="primary" busy={busy} disabled={busy}>
              {busy ? "Making it…" : "Make my account"}
            </DialogButton>
          </Actions>
        </FieldStack>
      </form>
    </Frame>
  );
}

export function SignInScreen({ projectRefValue, onTheWeb }: { projectRefValue: string | null; onTheWeb: boolean }) {
  const [mode, setMode] = useState<"sign-in" | "reset">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [proof, setProof] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const links = projectRefValue ? dashboardLinks(projectRefValue) : null;

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (signInError) {
      setError(signInError.status === 400 ? "That email and password don't match." : signInError.message);
      setBusy(false);
    }
  }

  async function reset(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/selfhost/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(onTheWeb ? { setupCode: proof, password } : { secretKey: proof, password }),
      });
      const answer = (await response.json().catch(() => ({}))) as { error?: string; email?: string };
      if (!response.ok || !answer.email) throw new Error(answer.error ?? `The request failed (${response.status}).`);
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: answer.email, password });
      if (signInError) throw new Error(`The password was changed, but signing in failed: ${signInError.message}`);
    } catch (failure) {
      setError(getErrorMessage(failure, "That did not work. Try again."));
      setBusy(false);
    }
  }

  if (mode === "reset") {
    return (
      <Frame
        title="Choose a new password"
        intro={
          onTheWeb ? (
            <p>Enter the setup code you chose when you deployed, and a new password.</p>
          ) : (
            <p>
              To show it&apos;s you, paste your project&apos;s secret key from Supabase{links ? ": " : "."}
              {links && <ExternalLink href={links.apiKeys}>Open your API Keys page</ExternalLink>}
            </p>
          )
        }
      >
        <form onSubmit={reset}>
          <FieldStack>
            <FieldGroup label={onTheWeb ? "Setup code" : "Secret key"} htmlFor="reset-proof">
              <TextField id="reset-proof" type="password" value={proof} onChange={(e) => setProof(e.target.value)} autoComplete="off" placeholder={onTheWeb ? "" : "sb_secret_…"} spellCheck={false} />
            </FieldGroup>
            <FieldGroup label="New password" htmlFor="reset-password">
              <TextField id="reset-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder="8 characters or more" />
            </FieldGroup>
            {error && <StatusBanner message={error} />}
            <Actions>
              <DialogButton type="submit" variant="primary" busy={busy} disabled={busy}>
                {busy ? "Saving…" : "Save and sign in"}
              </DialogButton>
              <DialogButton variant="ghost" onClick={() => { setMode("sign-in"); setError(null); setPassword(""); }} disabled={busy}>
                Back to sign in
              </DialogButton>
            </Actions>
          </FieldStack>
        </form>
      </Frame>
    );
  }

  return (
    <Frame title={`Sign in to ${APP_NAME}`} intro={<p>Use the account you made when you set it up.</p>}>
      <form onSubmit={signIn}>
        <FieldStack>
          <FieldGroup label="Email" htmlFor="signin-email">
            <TextField id="signin-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </FieldGroup>
          <FieldGroup label="Password" htmlFor="signin-password">
            <TextField id="signin-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </FieldGroup>
          {error && <StatusBanner message={error} />}
          <Actions>
            <DialogButton type="submit" variant="primary" busy={busy} disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </DialogButton>
            <DialogButton variant="ghost" onClick={() => { setMode("reset"); setError(null); setPassword(""); }} disabled={busy}>
              Forgot password?
            </DialogButton>
          </Actions>
        </FieldStack>
      </form>
    </Frame>
  );
}

export function ProblemScreen({
  kind,
  projectRefValue,
  onRetry,
}: {
  kind: "paused" | "unreachable" | "not-owner" | "error";
  projectRefValue: string | null;
  onRetry: () => void;
}) {
  const links = projectRefValue ? dashboardLinks(projectRefValue) : null;
  if (kind === "not-owner") {
    return (
      <Frame title="This isn't the owner's account" intro={<p>Only the account made during setup can use this {APP_NAME}.</p>}>
        <Actions>
          <DialogButton variant="primary" onClick={() => { void supabase.auth.signOut({ scope: "local" }); }}>Sign out</DialogButton>
        </Actions>
      </Frame>
    );
  }
  const copy = {
    paused: {
      title: "Your Supabase project is paused",
      intro: "Free projects pause after a week without use. Open it on Supabase and press Restore project, then come back here.",
    },
    unreachable: {
      title: "Supabase isn't answering",
      intro: "Check that this computer is online, then try again.",
    },
    error: {
      title: `${APP_NAME} couldn't check its setup`,
      intro: "Something went wrong on this computer's side. Try again.",
    },
  }[kind];
  return (
    <Frame title={copy.title} intro={<p>{copy.intro}</p>}>
      <Actions>
        {kind === "paused" && links && <ExternalLink href={links.project}>Open your project</ExternalLink>}
      </Actions>
      <Actions>
        <DialogButton variant="primary" onClick={onRetry}>Try again</DialogButton>
      </Actions>
    </Frame>
  );
}
