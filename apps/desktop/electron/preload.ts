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
  onSettingsChanged: (cb: (settings: unknown) => void) => {
    const listener = (_event: unknown, settings: unknown) => cb(settings);
    ipcRenderer.on("nullpoint:settings-changed", listener);
    return () => ipcRenderer.removeListener("nullpoint:settings-changed", listener);
  },
});
