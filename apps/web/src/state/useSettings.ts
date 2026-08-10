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
}

export const DEFAULT_SETTINGS: AppSettings = {
  launchAtLogin: false,
  startMinimized: false,
  closeToTray: true,
  reconnectAutomatically: true,
  showSoundPressure: false,
  theme: "system",
};

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
