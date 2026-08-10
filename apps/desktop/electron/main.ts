import { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, net, protocol, session } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  applyLoginItemSetting,
  readSettings,
  writeSettings,
  type DesktopSettings,
} from "./settings.js";

// PLAN.md §5.4 — Electron's renderer is Chromium, so the same navigator.serial code the web
// app uses works here unmodified. The desktop-specific wiring is: grant the "serial" permission,
// auto-answer the port picker, and run as a tray app that can start hidden at login.

const DEV_SERVER_URL = process.env.ELECTRON_RENDERER_URL ?? "http://localhost:5173";
const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
/** Distinguishes "user closed the window" (hide to tray) from "app is really quitting". */
let isQuitting = false;

/**
 * The packaged renderer is served over a custom app:// scheme rather than file://, for two
 * reasons: Vite emits absolute asset paths (/assets/…) which file:// would resolve against the
 * filesystem root, and navigator.serial requires a secure context. Registering the scheme as
 * `secure` + `standard` gives us both.
 */
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

function rendererDir(): string {
  // extraResources in electron-builder.yml copies apps/web/dist -> resources/renderer
  return path.join(process.resourcesPath, "renderer");
}

function registerAppProtocol(): void {
  protocol.handle("app", (request) => {
    const { pathname } = new URL(request.url);
    let rel = decodeURIComponent(pathname);
    // SPA fallback: anything without a file extension is a client-side route.
    if (rel === "/" || !path.extname(rel)) rel = "/index.html";

    const target = path.join(rendererDir(), rel);
    // Never serve outside the renderer directory, even if the URL contains traversal segments.
    if (!target.startsWith(rendererDir())) {
      return new Response("Forbidden", { status: 403 });
    }
    return net.fetch(pathToFileURL(target).toString());
  });
}

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

/** True when this launch came from the OS login item (or the user passed --hidden). */
function shouldStartHidden(): boolean {
  if (process.argv.includes("--hidden")) return true;
  // macOS reports this directly rather than through argv.
  return app.getLoginItemSettings().wasOpenedAtLogin === true;
}

function createWindow(show: boolean): BrowserWindow {
  const win = new BrowserWindow({
    width: 900,
    height: 640,
    minWidth: 720,
    minHeight: 560,
    title: "Nullpoint",
    show,
    // Avoid a white flash before the dark UI paints.
    backgroundColor: "#0b0c0e",
    // Windows/Linux read the window icon from here; macOS uses the bundle icon.
    icon: assetPath("icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
    },
  });

  if (isDev) {
    void win.loadURL(DEV_SERVER_URL);
  } else {
    void win.loadURL("app://local/");
  }

  win.on("close", (event) => {
    // Keep running in the tray unless the user actually chose Quit.
    if (!isQuitting && readSettings().closeToTray) {
      event.preventDefault();
      win.hide();
      syncMacDockVisibility();
    }
  });

  win.on("show", syncMacDockVisibility);
  win.on("hide", syncMacDockVisibility);

  win.on("closed", () => {
    mainWindow = null;
    syncMacDockVisibility();
  });

  return win;
}

function showWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createWindow(true);
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function assetPath(name: string): string {
  // assets/ sits next to dist-electron/ both in the repo and inside the packaged asar.
  return path.join(__dirname, "..", "assets", name);
}

/**
 * macOS treats a menu-bar-only app as one with no Dock presence. Hiding the Dock icon while
 * no window is open is what makes Nullpoint feel native there; it comes back when a window does.
 */
function syncMacDockVisibility(): void {
  if (process.platform !== "darwin" || !app.dock) return;
  const anyVisible = BrowserWindow.getAllWindows().some((w) => w.isVisible());
  if (anyVisible) void app.dock.show();
  else app.dock.hide();
}

function buildTray(): void {
  const icon = nativeImage.createFromPath(assetPath("tray.png"));
  // On macOS a template image adapts automatically to light/dark menu bars.
  if (process.platform === "darwin") icon.setTemplateImage(true);
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip("Nullpoint");
  refreshTrayMenu();
  // Windows/Linux: a plain click should open the app; macOS shows the menu instead.
  tray.on("click", () => {
    if (process.platform === "darwin") return;
    showWindow();
  });
}

function refreshTrayMenu(): void {
  if (!tray) return;
  const settings = readSettings();
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open Nullpoint", click: () => showWindow() },
      { type: "separator" },
      {
        label: "Launch at login",
        type: "checkbox",
        checked: settings.launchAtLogin,
        click: (item) => {
          writeSettings({ launchAtLogin: item.checked });
          applyLoginItemSetting(item.checked);
          broadcastSettings();
        },
      },
      { type: "separator" },
      {
        label: "Quit Nullpoint",
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ])
  );
}

function broadcastSettings(): void {
  refreshTrayMenu();
  const settings = readSettings();
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send("nullpoint:settings-changed", settings);
  }
}

// A tray app must be single-instance: a second launch should surface the running window
// rather than adding a second tray icon.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => showWindow());

  app.whenReady().then(() => {
    if (!isDev) registerAppProtocol();

    session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === "serial");

    session.defaultSession.on("select-serial-port", (event, portList, _webContents, callback) => {
      event.preventDefault();
      const chosen = pickSonyPort(portList);
      // No confident match — return "" so the renderer's own picker handles disambiguation
      // rather than us guessing wrong.
      callback(chosen ? chosen.portId : "");
    });

    // Keep the OS login item in sync with the stored setting, in case it was changed elsewhere.
    const settings = readSettings();
    applyLoginItemSetting(settings.launchAtLogin);

    ipcMain.handle("nullpoint:get-settings", () => readSettings());
    ipcMain.handle("nullpoint:set-settings", (_event, patch: Partial<DesktopSettings>) => {
      const next = writeSettings(patch);
      if (patch.launchAtLogin !== undefined) applyLoginItemSetting(patch.launchAtLogin);
      refreshTrayMenu();
      return next;
    });

    buildTray();

    const startHidden = shouldStartHidden() || settings.startMinimized;
    mainWindow = createWindow(!startHidden);
    syncMacDockVisibility();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow(true);
      else showWindow();
    });
  });
}

app.on("before-quit", () => {
  isQuitting = true;
});

// Deliberately no "window-all-closed" quit: Nullpoint keeps running in the tray so it can
// reconnect to the headphones. Quitting happens through the tray menu.
