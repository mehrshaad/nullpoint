# Design Prompt — Sony Sound Connect (Unofficial Desktop/Web Client)

Design the UI for an **unofficial desktop + web client for Sony headphones** (a community-built
"Sound Connect for Windows/macOS/Web" that Sony never shipped). It controls headphones like the
**WH-1000XM6** over Bluetooth: noise canceling, ambient sound, equalizer, and battery.

## Product context

- Runs as an **Electron desktop app (Windows + macOS)** and a **Chrome-only web app (PWA)** from one
  shared React codebase — so design ONE responsive UI that works as a compact desktop window
  (~900×640 default, resizable) and in a browser tab. Also design a small **system-tray popover**
  variant (~320×420) showing battery + ANC quick toggle + now playing.
- Audio itself plays through the OS; this app is a **remote control / settings panel** only.
- It is NOT a Sony product: do **not** imitate Sony branding, logos, or the official app's exact look.
  It should feel like a polished, independent, audio-enthusiast tool. Working name: **"SoundConnect
  Desktop (unofficial)"** — feel free to propose a better product name and wordmark.

## Screens to design

1. **Connect / empty state** — no device connected. A single prominent "Connect headphones" action.
   Must gracefully explain the constraints: device must already be paired in OS Bluetooth settings;
   web version requires Chrome/Edge desktop (show a friendly unsupported-browser state). Include a
   "connecting…" state and a connection-failed state with retry.
2. **Main dashboard (device connected)** — the core screen:
   - Device header: model name (e.g. WH-1000XM6), firmware, battery % with charging indicator.
   - **Noise control**: a 3-way control (Noise Canceling / Ambient Sound / Off) + when Ambient is
     active, an ambient level slider (0–20) and an "auto ambient level" toggle + "focus on voice" toggle.
   - **Equalizer**: preset picker (Heavy, Clear, Hard, Soft, Custom) + when Custom: 5-band slider EQ
     with a Clear Bass slider. Show band values; make it satisfying to drag.
   - Optional secondary info: now playing (track/artist), volume slider, sound pressure readout.
3. **Tray popover** (compact variant of the dashboard, described above).
4. **Settings/about** — reconnect behavior, launch on startup, theme, license/attribution note
   ("unofficial, not affiliated with Sony").

## States to cover

Connected / disconnected / reconnecting; battery low; feature unsupported by this model (grayed with
tooltip); device changed externally (e.g. user toggles ANC on the phone app — UI must reflect it, so
controls need a subtle "updated from device" affordance).

## Direction & constraints

- Feel: precise, calm, hardware-adjacent — think high-end audio gear, not a consumer toy. Dark theme
  first, with a proper light theme (both fully specified, not an afterthought).
- Keyboard accessible; all controls reachable and labeled; slider values readable, not color-only.
- Deliver: overall visual direction (type, color tokens, spacing), the 4 screens with all listed
  states, and component specs for the noise-control segmented control, ambient slider, and EQ —
  detailed enough for a React developer to implement without guessing.
