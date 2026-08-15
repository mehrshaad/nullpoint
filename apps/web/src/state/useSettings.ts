import { useCallback, useEffect, useState } from "react";

/**
 * Settings shape. Must stay in sync with `DesktopSettings` in
 * apps/desktop/electron/settings.ts — the desktop shell owns the persisted copy and is the one
 * that can act on the OS-level options.
 */
export interface AppSettings {
  launchAtLogin: boolean;
  startMinimized: boolean;
  closeToTray: boolean;
  reconnectAutomatically: boolean;
  showSoundPressure: boolean;
  theme: "system" | "dark" | "light";
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
}

export const DEFAULT_SETTINGS: AppSettings = {
  launchAtLogin: false,
  startMinimized: false,
  closeToTray: true,
  reconnectAutomatically: true,
  showSoundPressure: false,
  theme: "system",
  customEq: {},
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

/** Applies the theme choice to the document, which is what tokens.css keys off. */
function applyTheme(theme: AppSettings["theme"]): void {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
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
    applyTheme(settings.theme);
  }, [settings.theme]);

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
