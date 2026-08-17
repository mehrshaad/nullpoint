import { useCallback, useEffect, useState } from "react";

/**
 * Settings shape. Must stay in sync with `DesktopSettings` in
 * apps/desktop/electron/settings.ts — the desktop shell owns the persisted copy and is the one
 * that can act on the OS-level options.
 */
/**
 * Accent choices. Each carries a light and a dark value because a hue that reads well on near
 * black is too pale on white — one shared colour would fail one theme or the other.
 */
export const ACCENTS = {
  blue: { label: "Blue", dark: "#6ea6ef", light: "#2c6bc9" },
  violet: { label: "Violet", dark: "#a78bfa", light: "#6d3fd4" },
  teal: { label: "Teal", dark: "#5ec8c0", light: "#177f79" },
  green: { label: "Green", dark: "#7fc29b", light: "#2f7d53" },
  amber: { label: "Amber", dark: "#e0a15c", light: "#a9701f" },
  rose: { label: "Rose", dark: "#f08fa4", light: "#bd3a58" },
} as const;

export type AccentName = keyof typeof ACCENTS;

export interface EqProfile {
  /** Stable across renames so a profile can be replaced or removed unambiguously. */
  id: string;
  name: string;
  /** Which band layout the curve was captured on; a 6-band curve can't be applied to 10 bands. */
  layout: string;
  values: number[];
}

export interface AppSettings {
  launchAtLogin: boolean;
  startMinimized: boolean;
  closeToTray: boolean;
  reconnectAutomatically: boolean;
  showSoundPressure: boolean;
  theme: "system" | "dark" | "light";
  accent: AccentName;
  /** Global noise-mode shortcuts, working from any application. Desktop only. */
  hotkeys: boolean;
  /**
   * Settings the app holds in place. Speak-to-Chat in particular is reported turning itself
   * back on — during meetings, which is exactly when it hurts — so when a lock is set and the
   * headset announces a different value, the app writes the intended one back.
   */
  lockedSettings: { speakToChat?: boolean };
  /**
   * The user's own equalizer curve, kept here rather than on the headset.
   *
   * The device has no memory of "the curve you had before you tried Clear" — selecting a named
   * preset overwrites the band values outright. Storing it means switching to a preset and back
   * to Custom restores what the user built instead of whatever the last preset left behind.
   *
   * Keyed by model and layout, since a 10-band graphic curve is meaningless on a Clear-Bass
   * device and vice versa.
   */
  customEq: Record<string, number[]>;
  /**
   * Named equalizer curves, kept here rather than on the headphones — the headset has a handful
   * of slots and forgets a curve the moment a named preset is chosen, so there is no limit on
   * how many can live in the app.
   */
  eqProfiles: EqProfile[];
  /**
   * Model names of headphones connected before, most recent first. Granted serial ports carry
   * no identity of their own, so this is the only way to put a name on the reconnect button.
   */
  knownDevices: string[];
}

export const DEFAULT_SETTINGS: AppSettings = {
  launchAtLogin: false,
  startMinimized: false,
  closeToTray: true,
  reconnectAutomatically: true,
  showSoundPressure: false,
  theme: "system",
  accent: "blue",
  hotkeys: true,
  lockedSettings: {},
  customEq: {},
  eqProfiles: [],
  knownDevices: [],
};

/** Stable key for a saved curve: the same model can report different band layouts. */
export function customEqKey(model: string | null | undefined, layout: string): string {
  return `${model ?? "unknown"}:${layout}`;
}

interface NullpointBridge {
  isDesktop: true;
  getSettings(): Promise<AppSettings>;
  setSettings(patch: Partial<AppSettings>): Promise<AppSettings>;
  onSettingsChanged(cb: (settings: AppSettings) => void): () => void;
  /** Global shortcut presses. Only the renderer holds the connection, so it does the work. */
  onHotkey(cb: (action: string) => void): () => void;
  /** Mirrors connection state so the tray menu can show and change the mode. */
  reportDeviceState(state: { model: string | null; battery: number | null; mode: string | null }): void;
}

declare global {
  interface Window {
    nullpoint?: NullpointBridge;
  }
  /** Substituted at build time from package.json — see vite.config.ts. */
  const __APP_VERSION__: string;
}

const STORAGE_KEY = "nullpoint.settings";

function loadLocal(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * What "system" actually means right now. Resolved here rather than in CSS because the
 * stylesheet's light palette hangs off `[data-theme="light"]` — leaving the attribute off, as
 * "system" used to, fell straight through to the dark values and never followed the OS at all.
 */
function resolveTheme(theme: AppSettings["theme"]): "dark" | "light" {
  if (theme !== "system") return theme;
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

/** Applies the theme choice to the document, which is what tokens.css keys off. */
function applyTheme(theme: AppSettings["theme"]): void {
  document.documentElement.setAttribute("data-theme", resolveTheme(theme));
}

/**
 * Paints the chosen accent over the stylesheet's own. Set on the root element rather than in
 * the stylesheet so it survives the theme switching above — the light and dark blocks each
 * define their own --accent, and an inline custom property beats both.
 */
function applyAccent(accent: AccentName, theme: AppSettings["theme"]): void {
  const root = document.documentElement;
  const pick = ACCENTS[accent] ?? ACCENTS.blue;
  const value = resolveTheme(theme) === "dark" ? pick.dark : pick.light;
  root.style.setProperty("--accent", value);
  // The soft variant is the same hue at low alpha, so it can be derived rather than listed.
  root.style.setProperty("--accent-soft", `color-mix(in srgb, ${value} 14%, transparent)`);
}

/**
 * Reads and writes app settings, persisting to the desktop shell over IPC when running in
 * Electron and to localStorage in the browser. `isDesktop` gates the rows that only mean
 * something in the desktop app (launch at login, tray behaviour).
 */
export function useSettings() {
  const bridge = typeof window !== "undefined" ? window.nullpoint : undefined;
  const isDesktop = Boolean(bridge);
  const [settings, setSettings] = useState<AppSettings>(() =>
    bridge ? { ...DEFAULT_SETTINGS } : loadLocal()
  );

  useEffect(() => {
    if (!bridge) return;
    void bridge.getSettings().then(setSettings);
    return bridge.onSettingsChanged(setSettings);
  }, [bridge]);

  useEffect(() => {
    const apply = () => {
      applyTheme(settings.theme);
      applyAccent(settings.accent, settings.theme);
    };
    apply();
    // On "system", follow the OS switching underneath us rather than only at startup.
    if (settings.theme !== "system") return;
    const query = window.matchMedia(DARK_QUERY);
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, [settings.theme, settings.accent]);

  const update = useCallback(
    async (patch: Partial<AppSettings>) => {
      if (bridge) {
        setSettings(await bridge.setSettings(patch));
        return;
      }
      setSettings((current) => {
        const next = { ...current, ...patch };
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // Storage can be unavailable (private mode, blocked cookies) — keep the in-memory
          // value rather than failing the interaction.
        }
        return next;
      });
    },
    [bridge]
  );

  return { settings, update, isDesktop };
}
