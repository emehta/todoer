/**
 * Opens the Settings card from anywhere in the app, at a section: Ramble's
 * card sends people there when Ramble is not set up. The frame
 * (components/AppShell) listens.
 */

export const OPEN_SETTINGS_EVENT = "todoer:open-settings";

export type SettingsSection = "ramble";

/** Said by Settings when Ramble's choice or key changes, so Ramble's button asks again whether it can listen. */
export const RAMBLE_CHANGED_EVENT = "todoer:ramble-changed";

export function openSettings(section?: SettingsSection): void {
  window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT, { detail: { section } }));
}
