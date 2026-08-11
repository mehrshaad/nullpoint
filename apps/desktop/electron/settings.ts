import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

export interface DesktopSettings {
  /** Start Nullpoint when you log in, with no window (it just appears in the tray). */
  launchAtLogin: boolean;
  /** On a normal launch, go straight to the tray instead of opening the window. */
  startMinimized: boolean;
  /** Closing the window hides it to the tray instead of quitting. */
  closeToTray: boolean;
  reconnectAutomatically: boolean;
  showSoundPressure: boolean;
  theme: "system" | "dark" | "light";
  /** User equalizer curves, keyed by model and band layout. Mirrors AppSettings in the web app. */
  customEq: Record<string, number[]>;
}

export const DEFAULT_SETTINGS: DesktopSettings = {
  launchAtLogin: false,
  startMinimized: false,
  closeToTray: true,
  reconnectAutomatically: true,
  showSoundPressure: false,
  theme: "system",
  customEq: {},
};

function settingsPath(): string {
  return path.join(app.getPath("userData"), "settings.json");
}

let cache: DesktopSettings | null = null;

export function readSettings(): DesktopSettings {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(settingsPath(), "utf-8");
    // Merge over defaults so a settings file written by an older version keeps working.
    cache = { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<DesktopSettings>) };
  } catch {
    cache = { ...DEFAULT_SETTINGS };
  }
  return cache;
}

export function writeSettings(patch: Partial<DesktopSettings>): DesktopSettings {
  const next = { ...readSettings(), ...patch };
  cache = next;
  try {
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
    fs.writeFileSync(settingsPath(), JSON.stringify(next, null, 2), "utf-8");
  } catch (err) {
    console.error("[nullpoint] failed to persist settings:", err);
  }
  return next;
}

/**
 * Mirrors the launchAtLogin setting into the real OS login-items list.
 *
 * `openAsHidden` is macOS-only, so on Windows we pass our own --hidden flag and check for it at
 * startup (see main.ts shouldStartHidden) — that is what makes the login launch window-less.
 */
export function applyLoginItemSetting(enabled: boolean): void {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: true,
    args: ["--hidden"],
  });
}
