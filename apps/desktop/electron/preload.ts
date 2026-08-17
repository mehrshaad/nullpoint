import { contextBridge, ipcRenderer } from "electron";

/**
 * The renderer is the same bundle the web app ships, so it must run without this API too —
 * apps/web treats `window.nullpoint` being undefined as "running in a browser" and falls back
 * to localStorage for settings.
 */
contextBridge.exposeInMainWorld("nullpoint", {
  isDesktop: true,
  getSettings: () => ipcRenderer.invoke("nullpoint:get-settings"),
  setSettings: (patch: unknown) => ipcRenderer.invoke("nullpoint:set-settings", patch),
  /** Mirrors connection state to the main process so the tray can show and change the mode. */
  reportDeviceState: (state: unknown) => ipcRenderer.send("nullpoint:device-state", state),
  /** Global shortcut presses, forwarded from the main process which owns the keys. */
  onHotkey: (cb: (action: string) => void) => {
    const listener = (_event: unknown, action: string) => cb(action);
    ipcRenderer.on("nullpoint:hotkey", listener);
    return () => ipcRenderer.removeListener("nullpoint:hotkey", listener);
  },
  onSettingsChanged: (cb: (settings: unknown) => void) => {
    const listener = (_event: unknown, settings: unknown) => cb(settings);
    ipcRenderer.on("nullpoint:settings-changed", listener);
    return () => ipcRenderer.removeListener("nullpoint:settings-changed", listener);
  },
});
