/**
 * Generates every app icon from one vector source.
 *
 * The mark is a zero with sound breaking up as it runs into it — the name, drawn. Geometry was
 * measured off the chosen concept rather than guessed: a 512 grid, the zero occupying 34.6% of
 * the width and 57.4% of the height, set right of centre so the streaks have somewhere to go.
 *
 * Drawn rather than traced out of the reference image, because the reference is a ~250px tile in
 * a contact sheet and the largest icon needed here is 1024px. Vector re-authoring is the only
 * route to a crisp 1024 — and it means the small sizes can differ from the large ones, which
 * they must: the streak field turns to mush below about 64px, so those sizes get the glyph alone.
 *
 * Run with `pnpm run icons`.
 */
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");
const os = require("os");

app.on("window-all-closed", () => {});

const REPO = path.join(__dirname, "..");
const WEB = path.join(REPO, "apps", "web", "public");
const DESKTOP = path.join(REPO, "apps", "desktop");
const FRAMES = path.join(os.tmpdir(), "nullpoint-icon-frames");

const C = {
  ground: "#121418",
  blue: "#2d47e1",
  white: "#ffffff",
  tray: "#6ea6ef",
  ogBg: "#0b0c0e",
  ogFg: "#e7e9ec",
  ogDim: "#838a94",
};

/** A rounded rectangle as a path, so outer and counter can share one even-odd fill. */
function roundRect(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  return [
    `M${x + rr},${y}`,
    `H${x + w - rr}`,
    `A${rr},${rr} 0 0 1 ${x + w},${y + rr}`,
    `V${y + h - rr}`,
    `A${rr},${rr} 0 0 1 ${x + w - rr},${y + h}`,
    `H${x + rr}`,
    `A${rr},${rr} 0 0 1 ${x},${y + h - rr}`,
    `V${y + rr}`,
    `A${rr},${rr} 0 0 1 ${x + rr},${y}`,
    "Z",
  ].join(" ");
}

/**
 * The zero. A stadium with a stadium counter, filled even-odd so the hole is real transparency
 * rather than a background-coloured patch — the tray icon has no background to match.
 */
function zeroPath(x, y, w, h) {
  const inset = w * 0.375; // leaves a counter a quarter of the width, as measured
  const cw = w - inset * 2;
  const ch = h * 0.6;
  return (
    roundRect(x, y, w, h, w / 2) +
    " " +
    roundRect(x + inset, y + (h - ch) / 2, cw, ch, cw / 2)
  );
}

/**
 * Sound arriving at the zero and being taken apart. Rows are widest and brightest through the
 * middle and shorten outwards, so the field reads as a burst rather than a list.
 */
const STREAKS = [
  { y: 150, segs: [[173, 12, "w", 0.85], [196, 32, "g", 0.5]] },
  { y: 196, segs: [[104, 12, "w", 0.95], [140, 68, "g", 0.78]] },
  { y: 242, segs: [[75, 11, "b", 0.9], [98, 86, "g", 1], [196, 12, "b", 0.78]] },
  { y: 288, segs: [[46, 13, "w", 1], [70, 86, "w", 1], [172, 13, "b", 1], [196, 12, "b", 0.9]] },
  { y: 334, segs: [[98, 11, "w", 0.9], [122, 66, "g", 0.85], [196, 12, "b", 0.7]] },
  { y: 380, segs: [[173, 12, "w", 0.8], [196, 32, "g", 0.45]] },
];

const BAR_H = 12;

function streakField() {
  const paint = { w: C.white, b: C.blue, g: "url(#np-streak)" };
  return STREAKS.flatMap(({ y, segs }) =>
    segs.map(
      ([x, w, kind, o]) =>
        `<rect x="${x}" y="${y - BAR_H / 2}" width="${w}" height="${BAR_H}" rx="${BAR_H / 2}" fill="${paint[kind]}" fill-opacity="${o}" />`
    )
  ).join("\n    ");
}

/** The full mark: ground, streaks, zero. Used from 64px upward. */
function fullIcon() {
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <!-- Cools from white to blue as it approaches the zero: the sound losing itself. -->
    <linearGradient id="np-streak" gradientUnits="userSpaceOnUse" x1="40" y1="0" x2="215" y2="0">
      <stop offset="0" stop-color="${C.white}" />
      <stop offset="1" stop-color="${C.blue}" />
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="113" fill="${C.ground}" />
  <g>
    ${streakField()}
  </g>
  <path d="${zeroPath(225, 121, 177, 294)}" fill-rule="evenodd" fill="${C.blue}" />
</svg>`;
}

/**
 * Small sizes get the glyph alone, enlarged. Six rows of 12-unit bars cannot survive a 16px
 * favicon; shipping them anyway would just add grey noise around the only readable shape.
 */
function compactIcon() {
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="113" fill="${C.ground}" />
  <path d="${zeroPath(166, 92, 180, 328)}" fill-rule="evenodd" fill="${C.blue}" />
</svg>`;
}

/** Tray: glyph only on transparency. macOS uses the alpha and ignores the colour entirely. */
function trayIcon() {
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <path d="${zeroPath(146, 56, 220, 400)}" fill-rule="evenodd" fill="${C.tray}" />
</svg>`;
}

const fontDir = (family) =>
  path
    .join(REPO, "node_modules", ".pnpm", `@fontsource+${family}@5.3.0`, "node_modules", "@fontsource", family, "files")
    .replace(/\\/g, "/");

/** The social card. Same mark, given room and a name. */
function ogImage() {
  return `
<style>
  @font-face { font-family: "Plex Mono"; font-weight: 600;
    src: url("file:///${fontDir("ibm-plex-mono")}/ibm-plex-mono-latin-600-normal.woff2") format("woff2"); }
  @font-face { font-family: "Plex Sans"; font-weight: 400;
    src: url("file:///${fontDir("ibm-plex-sans")}/ibm-plex-sans-latin-400-normal.woff2") format("woff2"); }
  * { margin: 0; box-sizing: border-box; }
  body { width: 1200px; height: 630px; background: ${C.ogBg}; overflow: hidden;
         display: flex; flex-direction: column; justify-content: center; padding: 0 96px;
         font-family: "Plex Sans", sans-serif; }
  .row { display: flex; align-items: center; gap: 28px; }
  .mark { width: 104px; height: 104px; }
  .name { font-family: "Plex Mono", monospace; font-weight: 600; font-size: 34px;
          letter-spacing: 0.26em; color: ${C.ogFg}; }
  .line { margin-top: 40px; font-size: 40px; line-height: 1.28; color: ${C.ogFg}; max-width: 880px; }
  .foot { margin-top: 34px; font-family: "Plex Mono", monospace; font-size: 15px;
          letter-spacing: 0.14em; color: ${C.ogDim}; }
</style>
<div class="row">
  <svg class="mark" viewBox="0 0 512 512">
    <defs>
      <linearGradient id="np-streak" gradientUnits="userSpaceOnUse" x1="40" y1="0" x2="215" y2="0">
        <stop offset="0" stop-color="${C.white}" />
        <stop offset="1" stop-color="${C.blue}" />
      </linearGradient>
    </defs>
    <rect width="512" height="512" rx="113" fill="${C.ground}" />
    ${streakField()}
    <path d="${zeroPath(225, 121, 177, 294)}" fill-rule="evenodd" fill="${C.blue}" />
  </svg>
  <div class="name">NULLPOINT</div>
</div>
<div class="line">Sony never made a desktop app for your headphones.</div>
<div class="foot">UNOFFICIAL CLIENT &nbsp;·&nbsp; APACHE-2.0 &nbsp;·&nbsp; NOT AFFILIATED WITH SONY</div>`;
}

let counter = 0;

/**
 * Offscreen rendering, one window per render. A hidden or off-desktop window has no compositor
 * producing frames, so capturePage hands back an empty image; reusing a window across renders
 * produces the *previous* document repainted at the new size, which silently yields duplicates.
 */
async function render(markup, width, height, { transparent = false } = {}) {
  const win = new BrowserWindow({
    width,
    height,
    useContentSize: true,
    show: false,
    frame: false,
    transparent,
    backgroundColor: transparent ? "#00000000" : undefined,
    webPreferences: { offscreen: true },
  });
  const tmp = path.join(os.tmpdir(), `nullpoint-icon-${counter++}.html`);
  const isSvg = markup.trim().startsWith("<svg");
  const body = isSvg
    ? `<style>*{margin:0}html,body{width:${width}px;height:${height}px;overflow:hidden;background:transparent}svg{display:block;width:${width}px;height:${height}px}</style>${markup}`
    : markup;
  fs.writeFileSync(tmp, `<!doctype html><meta charset="utf-8">${body}`);
  try {
    await win.loadURL("file:///" + tmp.split(path.sep).join("/"));
    await win.webContents.executeJavaScript("document.fonts.ready.then(() => true)");
    return await new Promise((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error(`timed out at ${width}x${height}`)), 20000);
      const onPaint = (_e, _dirty, painted) => {
        const size = painted.getSize();
        if (painted.isEmpty() || size.width !== width || size.height !== height) {
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
    await new Promise((r) => setTimeout(r, 110));
  }
}

async function write(file, markup, size, opts) {
  note(`start ${path.basename(file)} ${size}`);
  const image = await render(markup, size, size, opts);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, image.toPNG());
  note(`  done ${path.basename(file)} ${size}`);
  return `${path.relative(REPO, file)}  ${size}x${size}`;
}

const OUT_DIR = path.join(os.tmpdir(), "nullpoint-icon-masters");

/**
 * Only masters are rendered here, and all of them large.
 *
 * Windows will not create a window below roughly 100x39, so asking for a 32x32 offscreen window
 * gets a bigger one — the frame never matches the requested size and the wait-for-the-right-frame
 * loop spins forever. Rendering big and downsampling avoids the floor entirely, and for vector
 * art a filtered downscale of a 512px master beats a native 16px raster anyway.
 */
app.whenReady().then(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const masters = [
    ["full.png", fullIcon(), 1024, 1024, {}],
    ["compact.png", compactIcon(), 512, 512, {}],
    ["tray.png", trayIcon(), 512, 512, { transparent: true }],
    ["og.png", ogImage(), 1200, 630, {}],
  ];
  for (const [name, markup, w, h, opts] of masters) {
    const image = await render(markup, w, h, opts);
    fs.writeFileSync(path.join(OUT_DIR, name), image.toPNG());
    console.log(`  master ${name} ${w}x${h}`);
  }
  console.log("  masters in " + OUT_DIR);
  app.exit(0);
});
