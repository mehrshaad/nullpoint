# Nullpoint

An unofficial desktop and web client for Sony headphones — the Windows / macOS / web app Sony never shipped.

> **Not affiliated with, endorsed by, or connected to Sony Group Corporation.** Model names (e.g. "WH-1000XM6") are used solely to identify compatible hardware. Protocol support is derived from public reverse-engineering work; features may break after firmware updates.

## What this is

Sony's official "Sound Connect" app (Android/iOS only) talks to the headphones over a proprietary Bluetooth Classic RFCOMM channel to control ANC, ambient sound, EQ, and battery — audio itself is plain A2DP handled by the OS. Nullpoint reimplements that control channel for desktop and the web, using [Web Serial](https://developer.chrome.com/docs/capabilities/serial) to reach Bluetooth Classic RFCOMM (Web Bluetooth is BLE-only and can't do this).

**Current feature scope:** device detection, live battery, noise-canceling / ambient-sound mode with a continuous ambient level slider and focus-on-voice, and the 5-band + Clear Bass equalizer (Heavy / Clear / Hard / Soft / Custom presets). Verified against the WH-1000XM6.

## Requirements

- Headphones already paired in your OS Bluetooth settings — Nullpoint cannot pair for you.
- **Web app:** Chrome, Edge, Opera, or Arc on desktop (Web Serial isn't implemented in Safari or Firefox).
- **Desktop app:** Windows or macOS, via the bundled Electron shell (same web codebase, no browser required).

## Getting started

```bash
pnpm install

pnpm run dev:web       # web app at http://localhost:5173
pnpm run dev:desktop   # Electron shell (point ELECTRON_RENDERER_URL at a running dev:web if needed)

pnpm run build         # build all packages
pnpm run test          # run the protocol test suite
pnpm run typecheck
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
  web/                    React PWA — the Connect flow, dashboard, and settings screens.
  desktop/                Electron shell wrapping apps/web, with automatic serial-port
                           selection and native window chrome.
```

The wire protocol (frame markers, escaping, checksum, the MDR V2 command set) was ported from the reverse-engineering work in [`mos9527/SonyHeadphonesClient`](https://github.com/mos9527/SonyHeadphonesClient) and [`Plutoberth/SonyHeadphonesClient`](https://github.com/Plutoberth/SonyHeadphonesClient) (both MIT) — see [`NOTICE`](./NOTICE) for full attribution, and [`PLAN.md`](./PLAN.md) for the byte-level protocol documentation and the design decisions behind this implementation.

## Design

The UI implements the approved Nullpoint design system checked into [`design/`](./design) — open `design/SoundConnect Desktop.dc.html` in a browser (with `design/support.js` alongside it) for the full token, component, and state spec.

## Known limitations

- Settings (reconnect-on-startup, theme, etc.) are UI-only right now — not yet persisted to disk.
- No system tray icon / popover window yet on desktop.
- No signed, distributable installer — `apps/desktop` runs from source; packaging (electron-builder, code signing) isn't wired up.
- "Auto ambient level" is visibly disabled — it needs a protocol variant not yet implemented.

## License

Apache-2.0 — see [`LICENSE`](./LICENSE). Protocol-port attribution in [`NOTICE`](./NOTICE).
