import { app, BrowserWindow, session } from "electron";
import path from "node:path";

// PLAN.md §5.4 — Electron's renderer is Chromium, so the same navigator.serial code the web
// app uses works here unmodified. The only desktop-specific wiring is: (1) grant the "serial"
// permission, and (2) auto-answer the port picker instead of showing Chrome's chooser UI.

const DEV_SERVER_URL = process.env.ELECTRON_RENDERER_URL ?? "http://localhost:5173";
const isDev = !app.isPackaged;

/**
 * Heuristic auto-select for the Sony RFCOMM port. Unlike the web app's `requestPort({filters})`
 * (PLAN.md §4.1), Electron's `select-serial-port` event does not expose the Bluetooth service
 * class UUID — ports are Bluetooth Classic devices with no vendor/product ID, so we can only
 * match on display name. Falls back to the sole port if there's exactly one, which covers the
 * common case of a single paired headset.
 */
function pickSonyPort(ports: Electron.SerialPort[]): Electron.SerialPort | undefined {
  const byName = ports.find((p) => /wh-1000x|wf-1000x|sony/i.test(p.displayName ?? ""));
  if (byName) return byName;
  return ports.length === 1 ? ports[0] : undefined;
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 900,
    height: 640,
    minWidth: 720,
    minHeight: 560,
    title: "Nullpoint",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
    },
  });

  if (isDev) {
    void win.loadURL(DEV_SERVER_URL);
  } else {
    void win.loadFile(path.join(__dirname, "../../web/dist/index.html"));
  }

  return win;
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === "serial");

  session.defaultSession.on("select-serial-port", (event, portList, _webContents, callback) => {
    event.preventDefault();
    const chosen = pickSonyPort(portList);
    if (chosen) {
      callback(chosen.portId);
    } else {
      // No confident match — let the renderer's own requestPort() UI (Chrome's picker still
      // renders inside Electron) handle disambiguation rather than guessing wrong.
      callback("");
    }
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
