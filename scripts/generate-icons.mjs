// Generates every icon asset the apps need, from code.
//
// Why hand-rolled: no image tooling (ImageMagick/rsvg/sharp/canvas) is available in this
// project's environment, and the artwork is simple enough — the Nullpoint mark is the design's
// blue dot (design/SoundConnect Desktop.dc.html cover). Encoding PNG/ICO directly with Node's
// built-in zlib keeps the icons reproducible and avoids a heavyweight native dependency.
//
//   node scripts/generate-icons.mjs
//
// Outputs:
//   apps/web/public/icons/icon-{192,512}.png   PWA icons     (rounded dark tile)
//   apps/desktop/build/icon.ico                app icon      (multi-size; electron-builder build resource)
//   apps/desktop/assets/tray{,@2x}.png         tray icon     (transparent dot; packaged at runtime)

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// Design tokens — must match apps/web/src/theme/tokens.css
const BG = [0x0b, 0x0c, 0x0e];
const ACCENT = [0x6e, 0xa6, 0xef];

const SS = 4; // supersampling factor, for anti-aliased edges

/**
 * The mark: a sound wave collapsing into a flat line — the null point. That is literally what
 * active noise cancelling does (a wave meets its inverse and sums to nothing) and what the name
 * means, so the icon states the product's whole idea in one stroke.
 *
 * Sampled as a polyline and stroked by distance field, which gives analytic anti-aliasing and
 * stays legible down to the 16px tray icon (where it reduces to fewer oscillations).
 */
function wavePoints(size, periods, margin, ampRatio) {
  const pts = [];
  const left = size * margin;
  const right = size * (1 - margin);
  const midY = size / 2;
  const amp = size * ampRatio;
  const steps = 240;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps; // 0..1 across the mark
    // Amplitude decays to exactly zero at the right edge: the wave is cancelled.
    const decay = Math.pow(1 - t, 1.65);
    pts.push([left + (right - left) * t, midY + amp * decay * Math.sin(2 * Math.PI * periods * t)]);
  }
  return pts;
}

/** Shortest distance from a point to a polyline. */
function distanceToPolyline(px, py, pts) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i - 1];
    const [x2, y2] = pts[i];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = x1 + t * dx;
    const cy = y1 + t * dy;
    const d = Math.hypot(px - cx, py - cy);
    if (d < best) best = d;
  }
  return best;
}

/**
 * Renders one icon into an RGBA pixel buffer.
 * variant "app"  — rounded dark tile with the accent wave mark
 * variant "tray" — the wave mark alone on transparency, so it sits on any taskbar colour
 */
function render(size, variant) {
  const px = new Uint8Array(size * size * 4);
  const cornerR = size * 0.22;
  const c = size / 2;

  // Small sizes need a simpler, bolder, wider mark or the wave disappears into the taskbar:
  // fewer oscillations, a taller amplitude, less margin, and a heavier minimum stroke.
  const small = size <= 32;
  const periods = size <= 24 ? 1 : size <= 48 ? 1.4 : 1.75;
  const margin = small ? 0.08 : 0.155;
  const ampRatio = small ? 0.27 : 0.2;
  const strokeHalf = Math.max(size * (small ? 0.085 : 0.045), small ? 1.45 : 1.35);
  const pts = wavePoints(size, periods, margin, ampRatio);
  const aa = 0.7; // edge softness in px

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = x + 0.5;
      const fy = y + 0.5;

      // Wave coverage from the distance field.
      const d = distanceToPolyline(fx, fy, pts);
      let waveA = (strokeHalf + aa - d) / (2 * aa);
      waveA = waveA < 0 ? 0 : waveA > 1 ? 1 : waveA;

      // Rounded-tile coverage (app variant only), supersampled since it has hard corners.
      let tileA = 0;
      if (variant === "app") {
        let hits = 0;
        for (let sy = 0; sy < SS; sy++) {
          for (let sx = 0; sx < SS; sx++) {
            const qx = Math.abs(x + (sx + 0.5) / SS - c) - (size / 2 - cornerR);
            const qy = Math.abs(y + (sy + 0.5) / SS - c) - (size / 2 - cornerR);
            const outside =
              qx > 0 && qy > 0 ? Math.hypot(qx, qy) > cornerR : Math.max(qx, qy) > cornerR;
            if (!outside) hits++;
          }
        }
        tileA = hits / (SS * SS);
      }

      const baseA = Math.max(waveA, tileA);
      let r = 0;
      let g = 0;
      let b = 0;
      if (baseA > 0) {
        const mix = tileA > 0 ? waveA : waveA > 0 ? 1 : 0;
        r = ACCENT[0] * mix + BG[0] * (1 - mix);
        g = ACCENT[1] * mix + BG[1] * (1 - mix);
        b = ACCENT[2] * mix + BG[2] * (1 - mix);
      }

      const i = (y * size + x) * 4;
      px[i] = Math.round(r);
      px[i + 1] = Math.round(g);
      px[i + 2] = Math.round(b);
      px[i + 3] = Math.round(baseA * 255);
    }
  }
  return px;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(body) >>> 0, 0);
  return Buffer.concat([len, body, crc]);
}

/** Encodes a square RGBA pixel buffer as a PNG. */
function encodePng(px, size) {
  return encodePngSized(px, size, size);
}

/** Encodes an RGBA pixel buffer as a PNG (color type 6). */
function encodePngSized(px, width, height) {
  const stride = width * 4;
  const raw = Buffer.alloc((1 + stride) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (1 + stride)] = 0; // filter: none
    Buffer.from(px.buffer, y * stride, stride).copy(raw, y * (1 + stride) + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Packs PNGs into a multi-resolution .ico (PNG-compressed entries, Vista+). */
function encodeIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);

  let offset = 6 + entries.length * 16;
  const dir = [];
  for (const { size, png } of entries) {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size; // 0 means 256
    e[1] = size >= 256 ? 0 : size;
    e[2] = 0; // palette size
    e[3] = 0; // reserved
    e.writeUInt16LE(1, 4); // color planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    dir.push(e);
    offset += png.length;
  }
  return Buffer.concat([header, ...dir, ...entries.map((e) => e.png)]);
}

/**
 * Open Graph card: the app-background field with the Nullpoint mark centred, so shared links
 * read as the product rather than as a bare screenshot. 1200x630, RGBA.
 */
function encodeOgCard() {
  const W = 1200;
  const H = 630;
  const px = new Uint8Array(W * H * 4);

  // Same wave mark, laid out wide across the card.
  const left = W * 0.2;
  const right = W * 0.8;
  const midY = H / 2;
  const amp = H * 0.17;
  const pts = [];
  const steps = 600;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const decay = Math.pow(1 - t, 1.65);
    pts.push([left + (right - left) * t, midY + amp * decay * Math.sin(2 * Math.PI * 2.25 * t)]);
  }
  const strokeHalf = 7;
  const aa = 0.8;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = distanceToPolyline(x + 0.5, y + 0.5, pts);
      let a = (strokeHalf + aa - d) / (2 * aa);
      a = a < 0 ? 0 : a > 1 ? 1 : a;
      const i = (y * W + x) * 4;
      px[i] = Math.round(ACCENT[0] * a + BG[0] * (1 - a));
      px[i + 1] = Math.round(ACCENT[1] * a + BG[1] * (1 - a));
      px[i + 2] = Math.round(ACCENT[2] * a + BG[2] * (1 - a));
      px[i + 3] = 255;
    }
  }
  return encodePngSized(px, W, H);
}

function write(relPath, buf) {
  const full = join(repoRoot, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, buf);
  console.log(`${relPath}  (${buf.length} bytes)`);
}

// PWA icons
for (const size of [192, 512]) {
  write(`apps/web/public/icons/icon-${size}.png`, encodePng(render(size, "app"), size));
}

// Browser tab icons. The .ico covers older browsers that ignore <link rel="icon" type=png>.
write("apps/web/public/favicon-32.png", encodePng(render(32, "app"), 32));
write(
  "apps/web/public/favicon.ico",
  encodeIco([16, 32, 48].map((size) => ({ size, png: encodePng(render(size, "app"), size) })))
);
// Social preview card (og:image). 1200x630 is the conventional aspect; we letterbox the mark
// onto the app background rather than stretching it.
write("apps/web/public/og-image.png", encodeOgCard());

// Desktop app icon (.ico wants a range of sizes; 256 is required by electron-builder)
write(
  "apps/desktop/build/icon.ico",
  encodeIco(
    [16, 24, 32, 48, 64, 128, 256].map((size) => ({
      size,
      png: encodePng(render(size, "app"), size),
    }))
  )
);

// electron-builder generates the macOS .icns from this when no .icns is present.
write("apps/desktop/build/icon.png", encodePng(render(1024, "app"), 1024));

// Runtime assets (packaged): tray icon, plus the window icon Windows/Linux draw in the taskbar.
// Transparent background so the tray dot reads on light and dark taskbars.
write("apps/desktop/assets/tray.png", encodePng(render(16, "tray"), 16));
write("apps/desktop/assets/tray@2x.png", encodePng(render(32, "tray"), 32));
write("apps/desktop/assets/icon.png", encodePng(render(256, "app"), 256));
