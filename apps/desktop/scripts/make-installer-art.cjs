/**
 * Generates the installer artwork — NSIS sidebars and header, and the DMG background.
 *
 * These are checked in as binaries because the installers need them at build time, but nobody
 * can edit a BMP by hand, so the art is authored here as HTML and rendered by Electron. Change
 * the markup below and re-run `pnpm --filter @nullpoint/desktop run art`.
 *
 * NSIS wants BMP specifically, which Electron cannot write — so the raw BGRA framebuffer is
 * encoded to a 24-bit BMP directly. That also avoids a PNG-decoding dependency.
 *
 * The device: the app's mark is a waveform settling to a flat line — the null point. The
 * installer art continues it. Installing runs the wave down to silence; uninstalling runs it
 * back the other way, in amber rather than blue, because that is what removing it does.
 */
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");
const os = require("os");

const OUT = path.join(__dirname, "..", "build");
const REPO = path.join(__dirname, "..", "..", "..");

const C = {
  ground: "#0b0c0e",
  panel: "#121418",
  line: "#25292f",
  fg: "#e7e9ec",
  fg3: "#838a94",
  accent: "#6ea6ef",
  amber: "#e0a15c",
  lightBg: "#f4f4f2",
  lightFg: "#17191c",
  lightFg3: "#666c75",
};

const fontDir = (family) =>
  path
    .join(REPO, "node_modules", ".pnpm", `@fontsource+${family}@5.3.0`, "node_modules", "@fontsource", family, "files")
    .replace(/\\/g, "/");

const face = (family, name, weight) => `
  @font-face {
    font-family: "${name}";
    font-weight: ${weight};
    src: url("file:///${fontDir(family)}/${family}-latin-${weight}-normal.woff2") format("woff2");
  }`;

const FONTS = [
  face("ibm-plex-sans", "Plex Sans", 400),
  face("ibm-plex-sans", "Plex Sans", 600),
  face("ibm-plex-mono", "Plex Mono", 400),
  face("ibm-plex-mono", "Plex Mono", 500),
  face("ibm-plex-mono", "Plex Mono", 600),
].join("\n");

/**
 * A wave whose amplitude decays to nothing across its length. `vertical` runs it top to bottom
 * for the tall sidebars; `reverse` starts flat and grows, which is the uninstaller.
 */
function wavePath({ length, cross, amplitude, cycles, vertical, reverse }) {
  const steps = 240;
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Ease the decay so most of the movement happens early and the tail is convincingly flat.
    const decay = Math.pow(1 - (reverse ? 1 - t : t), 2.1);
    const offset = Math.sin(t * cycles * Math.PI * 2) * amplitude * decay;
    const along = t * length;
    points.push(vertical ? [cross + offset, along] : [along, cross + offset]);
  }
  return points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
}

const sidebar = ({ accent, reverse, caption }) => `
<style>
  ${FONTS}
  * { margin: 0; box-sizing: border-box; }
  body {
    width: 164px; height: 314px; overflow: hidden;
    background: ${C.ground};
    font-family: "Plex Sans", sans-serif;
    position: relative;
  }
  .wave { position: absolute; inset: 0; }
  .foot { position: absolute; left: 0; right: 0; bottom: 0; padding: 14px 16px 16px; }
  .rule { height: 1px; background: ${C.line}; margin-bottom: 12px; }
  .mark {
    font-family: "Plex Mono", monospace; font-weight: 600;
    font-size: 12px; letter-spacing: 0.22em; color: ${C.fg};
  }
  .cap {
    font-family: "Plex Mono", monospace; font-weight: 400;
    font-size: 7.5px; letter-spacing: 0.1em; color: ${C.fg3};
    margin-top: 6px; line-height: 1.5;
  }
</style>
<svg class="wave" width="164" height="314" viewBox="0 0 164 314" fill="none">
  <path d="${wavePath({ length: 232, cross: 82, amplitude: 34, cycles: 2.4, vertical: true, reverse })}"
        stroke="${accent}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
</svg>
<div class="foot">
  <div class="rule"></div>
  <div class="mark">NULLPOINT</div>
  <div class="cap">${caption}</div>
</div>`;

const header = () => `
<style>
  ${FONTS}
  * { margin: 0; box-sizing: border-box; }
  body {
    width: 150px; height: 57px; overflow: hidden;
    /* Light, because NSIS paints the rest of the header bar white — a dark block here would
       read as a rendering fault rather than a choice. */
    background: ${C.lightBg};
    display: flex; align-items: center; gap: 9px;
    padding: 0 14px 0 12px;
  }
  img { width: 26px; height: 26px; border-radius: 6px; }
  .mark {
    font-family: "Plex Mono", monospace; font-weight: 600;
    font-size: 10.5px; letter-spacing: 0.16em; color: ${C.lightFg};
  }
</style>
<img src="file:///${path.join(OUT, "icon.png").replace(/\\/g, "/")}" />
<div class="mark">NULLPOINT</div>`;

const dmg = (scale) => `
<style>
  ${FONTS}
  * { margin: 0; box-sizing: border-box; }
  body {
    width: ${540 * scale}px; height: ${380 * scale}px; overflow: hidden;
    background: ${C.ground};
    font-family: "Plex Sans", sans-serif;
    zoom: ${scale};
    position: relative;
  }
  .wave { position: absolute; left: 0; top: 150px; }
  .head { position: absolute; top: 26px; left: 0; right: 0; text-align: center; }
  .mark {
    font-family: "Plex Mono", monospace; font-weight: 600;
    font-size: 12px; letter-spacing: 0.24em; color: ${C.fg};
  }
  .sub {
    font-family: "Plex Mono", monospace; font-size: 8.5px; letter-spacing: 0.12em;
    color: ${C.fg3}; margin-top: 7px;
  }
  .foot {
    position: absolute; bottom: 26px; left: 0; right: 0; text-align: center;
    font-size: 12px; color: ${C.fg3};
  }
  /* Sits under where the Finder draws the two icons, so the eye reads one -> the other. */
  .arrow { position: absolute; top: 232px; left: 236px; width: 68px; height: 1px; background: ${C.line}; }
  .arrow::after {
    content: ""; position: absolute; right: 0; top: -3px;
    border-left: 6px solid ${C.line}; border-top: 3.5px solid transparent; border-bottom: 3.5px solid transparent;
  }
</style>
<svg class="wave" width="540" height="80" viewBox="0 0 540 80" fill="none">
  <path d="${wavePath({ length: 540, cross: 40, amplitude: 26, cycles: 2.6, vertical: false })}"
        stroke="${C.accent}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
        opacity="0.5" />
</svg>
<div class="head">
  <div class="mark">NULLPOINT</div>
  <div class="sub">DESKTOP CONTROL FOR SONY HEADPHONES</div>
</div>
<div class="arrow"></div>
<div class="foot">Drag Nullpoint into Applications</div>`;

/** 24-bit BMP from Electron's BGRA framebuffer. Rows are stored bottom-up and 4-byte aligned. */
function bgraToBmp(bgra, width, height) {
  const rowBytes = width * 3;
  const padding = (4 - (rowBytes % 4)) % 4;
  const pixelBytes = (rowBytes + padding) * height;
  const buf = Buffer.alloc(54 + pixelBytes);

  buf.write("BM", 0);
  buf.writeUInt32LE(54 + pixelBytes, 2);
  buf.writeUInt32LE(54, 10); // pixel data offset
  buf.writeUInt32LE(40, 14); // DIB header size
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26); // planes
  buf.writeUInt16LE(24, 28); // bits per pixel
  buf.writeUInt32LE(pixelBytes, 34);

  let out = 54;
  for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      buf[out++] = bgra[i]; // B
      buf[out++] = bgra[i + 1]; // G
      buf[out++] = bgra[i + 2]; // R
    }
    out += padding;
  }
  return buf;
}

/**
 * A fresh offscreen window per render.
 *
 * Offscreen is the only reliable capture here — a hidden or off-desktop window has no compositor
 * producing frames, so capturePage hands back an empty image. Reusing one window and resizing it
 * looked cheaper but silently produced duplicates: the first paint after a resize is the
 * *previous* document repainted at the new size, so every asset after the first was a copy of
 * the one before it. A new window per job means the only document it can ever paint is this one.
 */
let shotCounter = 0;

async function shoot(html, width, height) {
  const win = new BrowserWindow({
    width,
    height,
    useContentSize: true,
    show: false,
    frame: false,
    webPreferences: { offscreen: true },
  });
  // A real file rather than a data: URL — a data: URL is an opaque origin and cannot pull the
  // font files off disk, so the art would silently render in a fallback face.
  const tmp = path.join(os.tmpdir(), `nullpoint-art-${shotCounter++}.html`);
  fs.writeFileSync(tmp, `<!doctype html><meta charset="utf-8">${html}`);
  try {
    await win.loadURL("file:///" + tmp.split(path.sep).join("/"));
    // Web fonts load asynchronously; capturing before they land renders the fallback face.
    await win.webContents.executeJavaScript("document.fonts.ready.then(() => true)");
    return await new Promise((resolve, reject) => {
      const deadline = setTimeout(
        () => reject(new Error(`timed out waiting for a ${width}x${height} frame`)),
        20_000
      );
      const onPaint = (_event, _dirty, painted) => {
        const size = painted.getSize();
        if (painted.isEmpty() || size.width !== width || size.height !== height) {
          // Deferred, not immediate: invalidating from inside the handler recurses.
          setTimeout(() => !win.isDestroyed() && win.webContents.invalidate(), 60);
          return;
        }
        clearTimeout(deadline);
        win.webContents.off("paint", onPaint);
        resolve(painted);
      };
      win.webContents.on("paint", onPaint);
      win.webContents.invalidate();
    });
  } finally {
    win.destroy();
    fs.rmSync(tmp, { force: true });
    // Let the destroyed window's renderer go before standing up the next one.
    await new Promise((r) => setTimeout(r, 120));
  }
}

// Each render destroys its window, which leaves none open — and Electron's default response to
// that is to quit. It was doing so mid-run, before a single file had been written, and still
// reporting success. This script decides when it is finished.
app.on("window-all-closed", () => {});

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(path.join(OUT, "dmg"), { recursive: true });
  const written = [];

  const bmpJobs = [
    {
      name: "installerSidebar.bmp",
      w: 164,
      h: 314,
      html: sidebar({ accent: C.accent, reverse: false, caption: "SETTLING<br/>TO SILENCE" }),
    },
    {
      name: "uninstallerSidebar.bmp",
      w: 164,
      h: 314,
      html: sidebar({ accent: C.amber, reverse: true, caption: "GIVING THE<br/>NOISE BACK" }),
    },
    { name: "installerHeader.bmp", w: 150, h: 57, html: header() },
  ];

  for (const job of bmpJobs) {
    const image = await shoot(job.html, job.w, job.h);
    const { width, height } = image.getSize();
    if (width !== job.w || height !== job.h) {
      throw new Error(`${job.name}: expected ${job.w}x${job.h}, rendered ${width}x${height}`);
    }
    fs.writeFileSync(path.join(OUT, job.name), bgraToBmp(image.toBitmap(), width, height));
    // BMP is not viewable in most tools; ART_PREVIEW_DIR drops a PNG twin for eyeballing.
    if (process.env.ART_PREVIEW_DIR) {
      fs.writeFileSync(path.join(process.env.ART_PREVIEW_DIR, job.name + ".png"), image.toPNG());
    }
    written.push(`${job.name}  ${width}x${height}`);
  }

  for (const [name, scale] of [
    ["background.png", 1],
    ["background@2x.png", 2],
  ]) {
    const image = await shoot(dmg(scale), 540 * scale, 380 * scale);
    const { width, height } = image.getSize();
    fs.writeFileSync(path.join(OUT, "dmg", name), image.toPNG());
    written.push(`dmg/${name}  ${width}x${height}`);
  }

  for (const line of written) console.log("  wrote " + line);
  app.exit(0);
});
