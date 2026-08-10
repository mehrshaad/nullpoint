# Nullpoint

**[nullpoint.ali-dadashzadeh.ir](https://nullpoint.ali-dadashzadeh.ir)** — an unofficial desktop and web client for Sony headphones. The Windows / macOS / web app Sony never shipped.

> **Not affiliated with, endorsed by, or connected to Sony Group Corporation.** Model names (e.g. "WH-1000XM6") are used solely to identify compatible hardware. Protocol support is derived from public reverse-engineering work; features may break after firmware updates.

[**Download for Windows**](https://github.com/mehrshaad/nullpoint/releases/latest) · [**Open the web app**](https://nullpoint.ali-dadashzadeh.ir/app) · [Landing page](https://nullpoint.ali-dadashzadeh.ir)

## What this is

Sony's official "Sound Connect" app (Android/iOS only) talks to the headphones over a proprietary Bluetooth Classic RFCOMM channel to control ANC, ambient sound, EQ, and battery — audio itself is plain A2DP handled by the OS. Nullpoint reimplements that control channel for desktop and the web, using [Web Serial](https://developer.chrome.com/docs/capabilities/serial) to reach Bluetooth Classic RFCOMM (Web Bluetooth is BLE-only and can't do this).

**Features:** device detection, live battery, noise-canceling / ambient-sound mode with a continuous ambient level slider and focus-on-voice, and the 5-band + Clear Bass equalizer (Heavy / Clear / Hard / Soft / Custom presets). The desktop app lives in the tray, can start at login without opening a window, and reconnects on its own. Verified against the WH-1000XM6.

## Screenshots

| Connect | Dashboard |
|---|---|
| ![No headphones connected — Connect screen](docs/screenshots/connect-idle.png) | ![Connected dashboard — noise control and equalizer](docs/screenshots/dashboard.png) |

## Install

| | |
|---|---|
| **Windows** | [Download the installer](https://github.com/mehrshaad/nullpoint/releases/latest) (NSIS, 64-bit). Unsigned, so SmartScreen will warn on first run. |
| **macOS** | Runs and lives in the menu bar, but there is no signed build yet — [build from source](#getting-started). |
| **Browser** | [Open the web app](https://nullpoint.ali-dadashzadeh.ir/app). Chrome, Edge, Opera or Arc on desktop; Safari and Firefox don't implement Web Serial. |

Either way, **pair the headphones in your OS Bluetooth settings first** — Nullpoint can't pair for you.

## Getting started

Requires Node 22+ (pnpm 11 needs it) and pnpm.

```bash
pnpm install

pnpm run dev:web       # web app at http://localhost:5173 (landing at /, app at /app)
pnpm run dev:desktop   # Electron shell against a running dev:web

pnpm run build         # build all packages
pnpm run test          # protocol test suite
pnpm run typecheck

pnpm --filter @ssc/desktop run package:win   # build the Windows installer
node scripts/generate-icons.mjs              # regenerate app/tray/PWA icons
```

## Architecture

A pnpm monorepo. The protocol implementation is transport-agnostic and framework-agnostic — it has no idea it's running in a browser.

```
packages/
  core/                   protocol only: framing, checksums, payload encode/decode,
                           the connect handshake, and the Headphones state machine.
                           Zero I/O — fully unit-tested without any hardware.
  transport-webserial/    the one real transport: Bluetooth Classic RFCOMM over the
                           Web Serial API. Works identically in a browser tab and in
                           Electron's Chromium renderer.
apps/
  web/                    React PWA — landing page, the app, and its screens.
  desktop/                Electron shell wrapping apps/web: tray, launch-at-login,
                           automatic serial-port selection, packaging.
scripts/                  icon generation (PNG/ICO encoded directly, no image tooling)
```

Two details worth knowing if you work on this:

- **The desktop renderer is served over a custom `app://` scheme, not `file://`.** Vite emits absolute asset paths, and `navigator.serial` requires a secure context; registering the scheme as `secure` + `standard` solves both.
- **Packages consume each other through built `.d.ts` files**, so `pnpm -r run build` must run before `typecheck` on a clean checkout.

The wire protocol (frame markers, escaping, checksum, the MDR V2 command set) was ported from the reverse-engineering work in [`mos9527/SonyHeadphonesClient`](https://github.com/mos9527/SonyHeadphonesClient) and [`Plutoberth/SonyHeadphonesClient`](https://github.com/Plutoberth/SonyHeadphonesClient) (both MIT) — see [`NOTICE`](./NOTICE) for attribution and [`PLAN.md`](./PLAN.md) for byte-level protocol documentation.

## Design

The UI implements the Nullpoint design system checked into [`design/`](./design) — open `design/SoundConnect Desktop.dc.html` in a browser (with `design/support.js` alongside it) for the full token, component, and state spec.

## Known limitations

- No signed builds. Windows SmartScreen warns on the installer; macOS has no downloadable build at all.
- "Auto ambient level" is visibly disabled — it needs a protocol variant that isn't implemented yet.
- Only the single-battery reading is wired up, so earbuds won't show per-bud or case levels.
- Tested against one model (WH-1000XM6). Other Sony models use the same protocol and should work, but are unverified — [reports welcome](https://github.com/mehrshaad/nullpoint/issues).

## License

Apache-2.0 — see [`LICENSE`](./LICENSE). Protocol-port attribution in [`NOTICE`](./NOTICE).
