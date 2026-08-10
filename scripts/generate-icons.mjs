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
 * Renders one icon into an RGBA pixel buffer.
 * variant "app"  — rounded dark tile with a centered accent dot (opaque tile, alpha outside radius)
 * variant "tray" — accent dot only on full transparency, so it sits on any taskbar color
 */
function render(size, variant) {
  const px = new Uint8Array(size * size * 4);
  const dotR = variant === "tray" ? size * 0.42 : size * 0.32;
  const cornerR = size * 0.22;
  const c = size / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Supersample this pixel to get smooth edges.
      let dotHits = 0;
      let tileHits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = x + (sx + 0.5) / SS;
          const fy = y + (sy + 0.5) / SS;
          const dx = fx - c;
          const dy = fy - c;
          if (dx * dx + dy * dy <= dotR * dotR) dotHits++;

          // Rounded-rect coverage (only needed for the app tile).
          const qx = Math.abs(dx) - (size / 2 - cornerR);
          const qy = Math.abs(dy) - (size / 2 - cornerR);
          const outside =
            qx > 0 && qy > 0 ? Math.hypot(qx, qy) > cornerR : Math.max(qx, qy) > cornerR;
          if (!outside) tileHits++;
        }
      }
      const total = SS * SS;
      const dotA = dotHits / total;
      const tileA = variant === "tray" ? 0 : tileHits / total;

      // Composite: accent dot over (tile background), over transparency.
      const baseA = Math.max(dotA, tileA);
      let r = 0;
      let g = 0;
      let b = 0;
      if (baseA > 0) {
        // dot color mixed over tile color by the dot's own coverage
        const mix = tileA > 0 ? dotA : dotA > 0 ? 1 : 0;
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

/** Encodes an RGBA pixel buffer as a PNG (color type 6). */
function encodePng(px, size) {
  const stride = size * 4;
  const raw = Buffer.alloc((1 + stride) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (1 + stride)] = 0; // filter: none
    Buffer.from(px.buffer, y * stride, stride).copy(raw, y * (1 + stride) + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
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
