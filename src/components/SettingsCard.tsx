"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CalendarBlank, Clock, type Icon } from "@phosphor-icons/react";
import StatusBanner from "@/components/StatusBanner";
import ThemePicker from "@/components/ThemePicker";
import { DialogButton, DialogCard, DialogFooter } from "@/components/form/Dialog";
import { supabase } from "@/lib/supabase";
import { readStoredTheme, setTheme as persistTheme, type ThemeValue } from "@/lib/theme";
import { useTimeFormat } from "@/lib/time-format";
import { setWeekStart, useWeekStart } from "@/lib/week-start";
import { usePhone } from "@/lib/use-viewport-width";
import { dashboardLinks } from "@/selfhost/keys";

const TOGGLE_SEGMENT_WIDTH = 56;

function SectionHeader({ label }: { label: string }) {
  return (
    <p
      style={{
        fontSize: "var(--ui-type-label)",
        fontWeight: 650,
        color: "var(--c-text-4)",
        textTransform: "uppercase",
        letterSpacing: "var(--tracking-label)",
        marginBottom: 6,
        marginTop: 4,
      }}
    >
      {label}
    </p>
  );
}

function SettingsRow({ icon: RowIcon, label, children }: { icon: Icon; label: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <RowIcon size={18} weight="duotone" style={{ color: "var(--c-text-3)", flexShrink: 0 }} />
        <span style={{ fontSize: "var(--ui-type-body)", color: "var(--c-text-2)", fontWeight: 500 }}>{label}</span>
      </div>
      {children}
    </div>
  );
}

/** Two or three fixed-width segments, so the rows' right edges line up and a tap never resizes them. */
function TogglePill({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} style={{ display: "inline-flex", borderRadius: "var(--ui-radius-md)", border: "1px solid var(--c-border)", overflow: "hidden" }}>
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            type="button"
            key={option.value}
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            style={{
              minWidth: TOGGLE_SEGMENT_WIDTH,
              padding: "6px 4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "var(--ui-type-body-sm)",
              fontWeight: active ? 600 : 400,
              fontVariantNumeric: "tabular-nums",
              color: active ? "var(--c-accent)" : "var(--c-text-3)",
              background: active ? "color-mix(in srgb, var(--c-accent) 10%, transparent)" : "transparent",
              border: "none",
              cursor: "pointer",
              transition: "var(--transition-ui)",
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

const Divider = () => <div style={{ height: 1, background: "var(--c-border-sub)", margin: "8px 0" }} />;

export default function SettingsCard({
  onClose,
  signupsOpen,
  projectRefValue,
}: {
  onClose: () => void;
  /** Whether the user's Supabase project still lets anyone sign up. */
  signupsOpen: boolean | null;
  projectRefValue: string | null;
}) {
  const phone = usePhone();
  const [theme, setTheme] = useState<ThemeValue>(() => readStoredTheme());
  const weekStart = useWeekStart();
  const timeFormat = useTimeFormat();
  const [email, setEmail] = useState("");
  const links = projectRefValue ? dashboardLinks(projectRefValue) : null;

  useEffect(() => {
    let active = true;
    // The saved session already holds the email: no round trip, no blank first frame.
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setEmail(data.session?.user.email ?? "");
    });
    return () => {
      active = false;
    };
  }, []);

  function handleTimeFormat(value: string) {
    if (value !== "12h" && value !== "24h") return;
    try {
      localStorage.setItem("vitae_time_format", value);
    } catch {
      // The event below still updates every mounted consumer for this session.
    }
    window.dispatchEvent(new CustomEvent("vitae-preference", { detail: { timeFormat: value } }));
  }

  return (
    <DialogCard
      label="Settings"
      heading="Settings"
      onClose={onClose}
      fit
      footer={
        <DialogFooter
          start={
            <DialogButton variant="ghost" onClick={() => { void supabase.auth.signOut({ scope: "local" }); }}>
              Sign out
            </DialogButton>
          }
        >
          <DialogButton variant="primary" onClick={onClose}>Done</DialogButton>
        </DialogFooter>
      }
    >
      <SectionHeader label="Appearance" />
      <ThemePicker value={theme} onChange={(next) => { setTheme(next); persistTheme(next); }} bleed={phone ? 18 : 28} />
      <Divider />
      <SectionHeader label="Preferences" />
      <SettingsRow icon={CalendarBlank} label="Week starts on">
        <TogglePill
          options={[{ value: "sunday", label: "Sun" }, { value: "monday", label: "Mon" }]}
          value={weekStart}
          onChange={(value) => { if (value === "sunday" || value === "monday") setWeekStart(value); }}
          ariaLabel="Week starts on"
        />
      </SettingsRow>
      <SettingsRow icon={Clock} label="Time format">
        <TogglePill
          options={[{ value: "12h", label: "12h" }, { value: "24h", label: "24h" }]}
          value={timeFormat}
          onChange={handleTimeFormat}
          ariaLabel="Time format"
        />
      </SettingsRow>
      <Divider />
      <SectionHeader label="Account" />
      <p style={{ color: "var(--c-text-2)", padding: "4px 0 8px" }}>{email ? `Signed in as ${email}` : "Signed in"}</p>
      {signupsOpen && (
        <StatusBanner
          tone="info"
          message={`Your Supabase project still lets anyone sign up. They would see nothing of yours, but turn it off: in Supabase, Authentication, Sign In / Providers, switch off "Allow new users to sign up".${links ? " Your project's page is linked below." : ""}`}
        />
      )}
      {signupsOpen && links && (
        <p style={{ paddingTop: 8 }}>
          <a href={links.authProviders} target="_blank" rel="noreferrer" style={{ color: "var(--c-accent)", fontWeight: 600 }}>
            Open Sign In / Providers
          </a>
        </p>
      )}
    </DialogCard>
  );
}
