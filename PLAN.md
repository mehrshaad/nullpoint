# Sony Sound Connect — Windows / Web / macOS Client — Implementation Plan

> **Purpose of this document.** A complete, self-contained build plan for an unofficial cross-platform
> reimplementation of Sony's *Sound Connect* headphone-control app. It is written to be handed to another
> model (Opus/Sonnet) or engineer for execution **without needing to re-do the research below**. Every
> protocol constant, file reference, and architectural decision here has been verified against the upstream
> source. Follow the milestones in order; each has explicit success criteria.

---

## 0. TL;DR / Feasibility verdict

- **Is it possible to detect and control a connected WH-1000XM6 from Windows/web/macOS?** **Yes.**
- The control protocol is **proprietary, runs over Bluetooth *Classic* RFCOMM/SPP** (not BLE), and has been
  fully reverse-engineered by the community. WH-1000XM6 is **comprehensively supported** in the reference
  implementation (`mos9527/SonyHeadphonesClient`): ANC + ambient (incl. new *auto ambient level*), battery,
  EQ, volume, multipoint, speak-to-chat, touch-sensor toggle, power-off, etc.
- **Transport choice is the whole game:**
  - **Web Bluetooth API = BLE only → cannot be used.**
  - **Web Serial API (Chrome/Chromium ≥ 117 desktop) = can open Bluetooth Classic RFCOMM to an already-paired
    device.** This is the transport we use.
  - **Electron's renderer is Chromium**, so the *same* Web Serial transport works for the desktop app
    (Windows + macOS + Linux). **One transport implementation covers all four targets.**
- **The headphones must already be paired at the OS level.** We do not implement pairing. "Detection" on web
  = the user picks the device from Chrome's serial chooser; on desktop (Electron) we can auto-select it.
- **Licensing:** upstream is **MIT** (both Plutoberth original and mos9527 fork). Our repo is **Apache-2.0**.
  MIT → Apache-2.0 is compatible for porting **with attribution** (keep upstream copyright + license notice).

---

## 1. Decisions locked with the user

| Question | Decision |
|---|---|
| Platform target | **Both** — shared core, Windows + Chrome web now, **macOS later** (all from one Electron codebase) |
| Hardware to test against | **WH-1000XM6** (owned) |
| v1 feature scope | **Core parity: ANC levels, EQ, ambient** (+ detection + battery as prerequisites) |
| Protocol approach | **Port/adapt an existing open-source client** (`mos9527`, MIT) |
| UI design | **Approved — "Nullpoint" design system**, checked into `design/` (see §5.3). Implement it, don't invent UI |

---

## 2. What "Sound Connect" is (context for the executor)

- Sony's official companion app (Android/iOS; internally `com.sony.songpal.mdr`). **Audio is plain A2DP handled
  by the OS** — the app only sends *control* messages (ANC/ambient, EQ, DSEE, Adaptive Sound Control, touch
  remap, multipoint, battery, speak-to-chat).
- Those control messages travel over a **Sony-proprietary SPP (Serial Port Profile) RFCOMM channel**.
- Sony never shipped a desktop/web version — that is the gap this project fills.

---

## 3. Reference implementations (verified)

| Repo | License | State | Use |
|---|---|---|---|
| [`Plutoberth/SonyHeadphonesClient`](https://github.com/Plutoberth/SonyHeadphonesClient) | MIT | **Archived** 2025-07-19; XM3/XM4/XB950 | Clean, readable **V1 protocol** reference |
| [`mos9527/SonyHeadphonesClient`](https://github.com/mos9527/SonyHeadphonesClient) | MIT | **Active** (306★, C++20). Default branch `rewrite`; classic layout on `master`. Web (Emscripten+WebSerial) + Win/mac/Linux | **Primary source to port.** XM5/**XM6** support, WebSerial proof-of-architecture |

> **Note on branches.** `mos9527` has a `master` branch with the classic, readable file layout (referenced
> throughout this plan) and a `rewrite` (default) branch with a newer architecture + the `docs/device-support/`
> files and XM6 work (PR #48). **Port framing/constants from `master` for readability; cross-check XM6-specific
> payloads (EQ presets, auto-ambient) against `rewrite` and [PR #48](https://github.com/mos9527/SonyHeadphonesClient/pull/48).**

### WH-1000XM6 support matrix (from `mos9527` `docs/device-support/WH-1000XM6.md`)

All ✅ unless noted: Current Playing, Sound Pressure, **Battery**, Volume, **NC/AMB (incl. new auto ambient
level)**, Voice Guidance Volume, Track Controls, Multipoint, Speak-to-Chat, Listening Mode, **Equalizer**,
Touch Sensor enable/disable, NC/AMB button setting, Power Off, capture-voice-during-call.
**EQ caveat (FW 3.0.0):** only presets `Heavy`/`Clear`/`Hard`/`Soft` (`0x30`–`0x33`), `Custom` (`0xA0`) and
user band settings are accepted.

---

## 4. THE WIRE PROTOCOL (verified from `mos9527` `master` `src/CommandSerializer.*`, `src/Constants.h`)

This is the single most important section. Port it exactly.

### 4.1 RFCOMM service

- **Sony SPP service UUID:** `956C7B26-D49A-4BA8-B03F-B17D393CB6E2` (service name "Serial HPC").
  - Windows native reference opens it via `socket(AF_BTH, SOCK_STREAM, BTHPROTO_RFCOMM)` with
    `serviceClassId = UuidFromString(SERVICE_UUID)`.
  - **For Web Serial**, this UUID goes into `navigator.serial.requestPort({ filters:
    [{ bluetoothServiceClassId: '956c7b26-d49a-4ba8-b03f-b17d393cb6e2' }],
    allowedBluetoothServiceClassIds: ['956c7b26-d49a-4ba8-b03f-b17d393cb6e2'] })`.

### 4.2 Frame format

```
<START_MARKER> ESCAPE( <DATA_TYPE:1> <SEQ:1> <SIZE:4 BE> <DATA:SIZE> <CHECKSUM:1> ) <END_MARKER>
```

- `START_MARKER = 0x3E` (62), `END_MARKER = 0x3C` (60).
- **Checksum** = 8-bit running sum (`uint8` overflow) of the *unescaped* bytes `DATA_TYPE .. end of DATA`
  (i.e. everything between the markers **except** the checksum byte itself). Verified: `_sumChecksum` in
  `CommandSerializer.cpp`.
- **SIZE** = big-endian `uint32` length of `DATA` only (unescaped).
- **Escaping** (applied to the whole `DATA_TYPE..CHECKSUM` region, *not* the markers), sentinel `0x3D` (61):
  - `0x3C` → `0x3D 0x2C`
  - `0x3D` → `0x3D 0x2D`
  - `0x3E` → `0x3D 0x2E`
- **Parse offsets** (after unescape), from `CommandMessage`:
  `[0]`=start-marker-context, `[1]`=DATA_TYPE, `[2]`=SEQ, `[3..6]`=BE size, `[7..7+size-1]`=payload,
  `[7+size]`=checksum.
- `MAX_BLUETOOTH_MESSAGE_SIZE`: upstream throws if exceeded (does not chunk). Port the same guard for v1;
  chunking is out of scope.

### 4.3 Sequence numbers & ACKs

- Each command carries a `SEQ` (0/1 toggling per upstream). The headphones **ACK** with a zero-length message
  of the ACK data type. **You must read and match ACKs**, and retry-on-timeout, or commands are dropped.
  Port the send-with-retry loop (upstream `sendCommandWithRetries` / `BluetoothSenderWrapper`).

### 4.4 Protocol tables

- Newer devices (XM5/**XM6**) use **Protocol V2**, split across **Table 1** and **Table 2** function types
  (`MessageMdrV2FunctionType_Table1` / `_Table2` in `Constants.h`; payload structs in `ProtocolV2T1.h`
  ~247 KB and `ProtocolV2T2.h` ~107 KB). **These are large — port only the payloads v1 needs** (see §6).
- `DATA_TYPE` enum, markers, UUID, and message/function-type enums all live in `src/Constants.h` (~33 KB).

### 4.5 Connection handshake (required before any control works)

Opening the RFCOMM socket is **not** enough. Port the init sequence from `Headphones.cpp`:
1. `connect()` the RFCOMM channel.
2. Send the **INIT / CONNECT** request; read `CONNECT_RET`.
3. **Capability / protocol-info exchange** — the device reports which features/tables it supports. This is how
   we learn the XM6 is present and what it can do (this exchange *is* the reliable "detection").
4. Request initial state (battery, current NC/ASM, EQ) and subscribe to notifications.

> Success signal for "detects XM6": after step 3 you have a populated capabilities/state object and can read a
> battery percentage. Print device name + firmware + battery to prove it.

---

## 5. Architecture

Monorepo (pnpm workspaces). **The core is transport-agnostic TypeScript; the only transport is Web Serial,
which runs identically in the browser and in Electron's Chromium renderer.**

```
sony-sound-connect/
  package.json                # workspace root, scripts
  pnpm-workspace.yaml
  tsconfig.base.json
  LICENSE                     # Apache-2.0 (existing)
  NOTICE                      # <-- ADD: attribution to mos9527/Plutoberth (MIT)
  PLAN.md                     # this file
  design/                     # approved UI design (Claude Design export) — see §5.3
    SoundConnect Desktop.dc.html   # full design doc: tokens, screens, states, component specs
    Dashboard.dc.html              # live dashboard component — primary source for the React port
    support.js                     # design-doc runtime (lets the .dc.html files render in a browser)
  packages/
    core/                     # @ssc/core — pure protocol, ZERO I/O
      src/
        framing.ts            # <- CommandSerializer.* (escape/unescape, checksum, package, parse)
        constants.ts          # <- Constants.h (markers, UUID, DATA_TYPE, enums we use)
        payloads/
          ncasm.ts            # NC/ASM (ANC + ambient + auto-ambient) encode/decode
          eq.ts               # Equalizer presets + custom bands
          battery.ts          # battery + charging state
          playback.ts         # (optional v1) current track / volume
          init.ts             # connect / capabilities / protocol-info
        headphones.ts         # <- Headphones.* : state model + high-level API + seq/ACK/retry
        transport.ts          # Transport interface { open, close, write(bytes), onData(cb) }
        index.ts
      test/
        framing.spec.ts       # round-trip + known-vectors (NO hardware)
        headphones.spec.ts    # state machine via LoopbackTransport (NO hardware)
    transport-webserial/      # @ssc/transport-webserial
      src/index.ts            # navigator.serial implementation of Transport
  apps/
    web/                      # Vite + React + TS PWA (Chrome-only)
      src/
        theme/tokens.css      # §5.3 dark/light tokens, IBM Plex fonts (bundled locally)
        components/           # NoiseModeSegmented, AmbientLevelSlider, EqualizerPanel, Switch, BatteryGauge
        screens/              # ConnectIdle, Connecting, ConnectFailed, UnsupportedBrowser, Dashboard, Settings
        state/                # optimistic-write + reconcile layer (shared UX rules, §5.3)
      manifest.webmanifest    # PWA (mirrors mos9527 web version capability)
    desktop/                  # Electron (Windows + macOS + Linux)
      electron/main.ts        # window (900×640, min 720×560), tray, `select-serial-port` handler (auto-pick XM6)
      electron/preload.ts
      # renderer = reuse apps/web build; tray popover = 320×420 window using the tray variant screens
```

### 5.1 The `Transport` interface (core owns it)

```ts
export interface Transport {
  open(): Promise<void>;
  close(): Promise<void>;
  write(bytes: Uint8Array): Promise<void>;
  onData(cb: (bytes: Uint8Array) => void): void; // framer feeds bytes; core reassembles frames
}
```

- Core does all framing/reassembly; the transport is a dumb byte pipe.
- `@ssc/transport-webserial` wraps a `SerialPort` obtained from `navigator.serial`.
- A `LoopbackTransport` (in tests) replays canned device responses for hardware-free testing.

### 5.2 Web Serial specifics (document in code)

- Requires **Chrome/Edge/Chromium ≥ 117 desktop**; must be served over **HTTPS** (or `localhost`).
- `requestPort()` **must be called from a user gesture** (click). Pass the Sony UUID filter (§4.1).
- The device **must already be paired** in OS Bluetooth settings. We cannot pair from the web.
- **Feature-detect** `('serial' in navigator)`; show a clear "use Chrome/Edge desktop" message otherwise
  (Firefox/Safari will never support this).

### 5.3 The approved UI design (`design/` — implement this, do not invent UI)

The visual design was produced in Claude Design and is checked into the repo:

- `design/SoundConnect Desktop.dc.html` — full design doc: cover, foundations (tokens/type/spacing),
  all four Connect states, dashboard state matrix, tray popover (connected + disconnected), settings/about,
  and **implementation-ready component specs**. Open it in a browser (needs `design/support.js` beside it).
- `design/Dashboard.dc.html` — the **live interactive dashboard component** with working drag/keyboard
  logic in plain JS. **This file is the primary porting source for the React dashboard**: its `renderVals()`
  logic (mode styles, band fill/thumb math, switch geometry, `dragLinear`, `keyStep`) translates almost 1:1
  into React components.

**Product identity:** the app is named **Nullpoint** (wordmark: `NULLPOINT`, blue dot glyph). Window
900×640 default / 720×560 min; tray popover 320×420 fixed. Disclaimer copy ("not affiliated with Sony…")
is written in the design's About panel — use it verbatim.

**Design tokens (CSS custom properties — copy exactly from `Dashboard.dc.html` DARK/LIGHT objects):**

| Token | Dark | Light | Use |
|---|---|---|---|
| `--bg` | `#0B0C0E` | `#F4F4F2` | app canvas |
| `--panel` | `#121418` | `#FFFFFF` | cards, bars |
| `--panel2` | `#191C21` | `#EDEDEA` | inset groups |
| `--line` | `#25292F` | `#DEDED8` | 1px borders |
| `--track` | `#1D2126` | `#E4E4DF` | slider tracks |
| `--fg` / `--fg2` / `--fg3` | `#E7E9EC` / `#9BA2AB` / `#6B727C` | `#17191C` / `#565C64` / `#878D95` | text tiers |
| `--accent` | `#6EA6EF` | `#2C6BC9` | ANC, focus, links |
| `--amber` | `#E0A15C` | `#A9701F` | ambient mode only |
| `--ok` / `--warn` | `#7FC29B` / `#E58A6B` | `#3C8A62` / `#B4552F` | linked/battery · low-batt/errors |

Type: **IBM Plex Sans** (UI) + **IBM Plex Mono** (all numerics, meta, section labels — tabular).
**Bundle the fonts locally** (Electron must work offline; no Google Fonts CDN at runtime).
Space 4/8/12/14/20/28; radius card 12 / control 10 / chip 7; borders 1px, no surface shadows;
motion: state 160ms ease, drag 100ms linear, remote-change ease 220ms; focus ring 2px `--ring`.

**Components with full specs in the design doc (§ "Component specs" — geometry, states, keyboard, API):**
- `NoiseModeSegmented` — 3-way ANC/Ambient/Off radiogroup; roving tabindex; arrow keys commit; tray variant = stacked rows.
- `AmbientLevelSlider` — integer 0–20; group dims to 38% + `pointer-events:none` when mode ≠ ambient (never reflows); drag clears auto; **writes throttled to 1 per 120ms with final value always sent**.
- `EqualizerPanel` — 5 bands + Clear Bass, −10…+10 dB (matches Sony's real EQ payload); presets lock sliders, only Custom edits; editing a band while a preset is active switches to Custom.

**Shared UX rules (from the design — bake into the state layer, not per-component):**
1. **Optimistic, reconciled** — paint the new value immediately, reconcile with the device notification;
   on write failure ease back + section tag "FAILED — DEVICE UNCHANGED".
2. **Values are text** — never color-only state; every slider prints its number, every disabled row prints its reason.
3. **One controller** — if the phone app grabs the session, enter *reconnecting* (don't fight), say who has the device.
4. **Responsive floor** — below 760px the dashboard stacks noise-control above EQ; the tray layout is reused in narrow PWA windows.
5. Remote changes animate 220ms + "UPDATED FROM DEVICE" tag (4s fade), never a toast. Low battery (≤15%) switches
   to warn colors + runtime label, no modal. Unsupported feature: 45% opacity, `aria-disabled`, `tabindex=-1`, reason in mono text.

**⚠ One correction to apply while implementing (design copy is wrong, protocol research is right):**
the design's cover card, connecting checklist ("Control service (GATT)"), failure state ("GATT_ERR 0x0E"),
and unsupported-browser paragraph say **"Web Bluetooth (GATT)"**. The actual transport (§0, §4, §5.2) is
**Bluetooth Classic RFCOMM via the Web Serial API**. Keep the visuals and layout exactly; fix the copy:
"Control service (GATT)" → "Control channel (RFCOMM)", "GATT_ERR …" → a real Web Serial/RFCOMM error string,
"needs the Web Bluetooth API" → "needs the Web Serial API (Chrome, Edge, Opera, Arc on desktop)". The
supported-browser grid (Chrome/Edge ✓, Safari/Firefox ✗) remains correct as-is.

Also note: demo values in the design (FW 2.0.1, LDAC 990kbps, battery 78%, track names, "⌘K", "⌥⇧N")
are placeholders — real values come from the device; keyboard shortcuts are suggestions to keep.

### 5.4 Electron specifics

- Electron ≥ recent (Chromium ≥ 117) supports Web Serial in the renderer. In `main.ts`:
  - `session.defaultSession.setPermissionCheckHandler(...)` to allow serial.
  - Handle `select-serial-port` + `serial-port-added`/`serial-port-removed` to **auto-select** the Sony port
    (match on the service UUID / device name) → smoother "auto-detect XM6" than the web build.
- Add tray icon, launch-on-startup, and a compact "now playing / ANC / battery" popover later.
- Packaging: `electron-builder` → NSIS (Windows) now, `dmg`/`zip` (macOS) in the macOS milestone.

---

## 6. Porting map (upstream `mos9527` → our TS)

| Upstream (`master` unless noted) | Target | v1 scope notes |
|---|---|---|
| `src/CommandSerializer.h/.cpp` | `core/src/framing.ts` | Port **verbatim** logic: escape/unescape, `_sumChecksum`, `packageDataForBt`, `CommandMessage` parse/verify |
| `src/Constants.h` | `core/src/constants.ts` | Markers, UUID, `DATA_TYPE`, `MAX_BLUETOOTH_MESSAGE_SIZE`, and **only** the message/function-type enums used by v1 features |
| `src/ByteMagic.h` | fold into `framing.ts` | `intToBytesBE`/`bytesToIntBE` etc. |
| `src/Headphones.h/.cpp` (~80 KB) | `core/src/headphones.ts` + `payloads/*` | Port **selectively**: init handshake, seq/ACK/retry, and setters/getters for NC-ASM, EQ, battery. Skip touch-remap, DSEE, listening-mode, etc. for v1 |
| `src/ProtocolV2T1.h` / `ProtocolV2T2.h` | `core/src/payloads/*` | **Do not port wholesale.** Extract only the NC/ASM, EQ, battery, and connect/capability payload structs (V2 = XM6) |
| `src/platform/windows/WindowsBluetoothConnector.cpp` | reference only | Confirms UUID + RFCOMM socket usage; we don't port native sockets (Web Serial replaces it) |
| `docs/packet-capture.md` (`rewrite`) | dev docs | Method for capturing real packets to build test vectors |

**v1 feature → payload checklist:**
- **Detect + battery** → `init.ts` (connect/capabilities) + `battery.ts`.
- **ANC / ambient / auto-ambient** → `ncasm.ts` (NC/ASM set + notify). Include XM6 auto-ambient-level.
- **EQ** → `eq.ts`: presets `Heavy/Clear/Hard/Soft` (`0x30–0x33`), `Custom` (`0xA0`) + user bands
  (per XM6 FW 3.0.0 constraint from PR #48).

---

## 7. Milestones (each with success criteria = §CLAUDE.md "goal-driven")

**M0 — Scaffold.** pnpm monorepo, TS config, lint/format, `NOTICE` with MIT attribution, empty package
graph builds. ✅ when `pnpm -r build` succeeds and `packages/core` is importable.

**M1 — Core framing (no hardware).** Port `framing.ts` + `constants.ts`. ✅ when unit tests pass:
round-trip `escape∘unescape = id`; checksum matches known vectors; a hand-built `packageDataForBt` output
byte-matches an upstream-captured frame (grab 2–3 real frames via `docs/packet-capture.md` or from the
upstream test data). **This milestone is the correctness backbone — do not skip the byte-exact vectors.**

**M2 — Web Serial connect + DETECT XM6 + battery (first hardware milestone).**
Implement `@ssc/transport-webserial`, the connect handshake (§4.5), seq/ACK/retry, and battery read.
UI: implement the design's **theme tokens + Connect screens** (idle → connecting checklist → failed,
plus unsupported-browser) from `design/SoundConnect Desktop.dc.html` §1b — with the RFCOMM copy fix
from §5.3. ✅ when, with the user's paired XM6, the app shows the connected header (device name,
firmware, live battery %) per the design. **This answers the original question on real hardware.**

**M3 — ANC / ambient.** `ncasm.ts` + the design's `NoiseModeSegmented` and `AmbientLevelSlider`
components (port interaction logic from `design/Dashboard.dc.html`; specs in §1e). Wire the
optimistic-write/reconcile rules and the "UPDATED FROM DEVICE" affordance. ✅ when toggling in the UI
audibly changes the XM6 and external changes (via the phone app) reflect back with the 220ms ease + tag.

**M4 — Equalizer.** `eq.ts` + the design's `EqualizerPanel` (presets Heavy/Clear/Hard/Soft/Custom,
5 bands + Clear Bass, −10…+10). ✅ when a preset change is audible on the XM6 and custom band edits
persist/reflect; non-Custom presets lock the sliders exactly as specced.

**M5 — Electron desktop (Windows first, macOS-ready).** Wrap `apps/web`, add `select-serial-port`
auto-select, the **320×420 tray popover** (connected + disconnected variants from design §1d), the
Settings/About screen (design §1d, disclaimer copy verbatim), packaging via electron-builder (NSIS).
✅ when a Windows build launches, auto-detects the XM6, and M2–M4 features work identically; dashboard
matches the design side-by-side in dark and light. macOS build target added but signing/notarization deferred.

**M6 — Polish.** PWA install, reconnect banner + low-battery states (design's state matrix §1c),
responsive <760px stacking, GitHub Actions CI (build web + electron matrix). ✅ when CI is green, the
PWA installs, and all four dashboard state variants render as designed.

---

## 8. Risks & honest unknowns (must stay visible)

1. **Web Serial ↔ Bluetooth RFCOMM reliability** varies by OS Bluetooth stack. Primary risk is on the
   transport, not the protocol. Mitigation: Electron path (native Chromium serial) as the robust fallback if
   the pure-web path is flaky on a given machine.
2. **XM6 protocol drift with firmware.** Support was validated around **FW 3.0.0** (EQ preset constraint).
   A future Sony firmware could change payloads. Mitigation: keep payload constants centralized; log
   unrecognized notifications instead of crashing.
3. **Capability exchange details** for XM6 must be confirmed against `rewrite`/PR #48, not assumed from V1.
4. **Undocumented protocol / legal:** this is personal-use interoperability with a reverse-engineered,
   unofficial protocol. No Sony endorsement. A malformed packet is not expected to brick hardware but there
   are no guarantees. Keep the MIT `NOTICE` and a clear README disclaimer.
5. **Detection is not silent on web:** the browser security model forces a user-gesture port picker. Truly
   automatic detection only exists on the Electron path.

---

## 9. First concrete steps for the executor

1. Open `design/SoundConnect Desktop.dc.html` in a browser and read all six sections — this is the
   approved UI contract. Note the GATT→RFCOMM copy fix in §5.3.
2. `M0`: init pnpm workspace; add `packages/core`, `packages/transport-webserial`, `apps/web`,
   `apps/desktop`; add `NOTICE` (MIT attribution to `mos9527` + `Plutoberth`); create
   `apps/web/src/theme/tokens.css` from the §5.3 token table and bundle IBM Plex Sans/Mono.
3. Clone/read `mos9527@master` `src/CommandSerializer.{h,cpp}`, `src/Constants.h`, `src/ByteMagic.h`,
   `src/Headphones.{h,cpp}` — these are the protocol port sources.
4. Execute M1 (framing + byte-exact tests) **before** touching hardware.
5. Then M2 to light up the XM6, building the Connect screens from the design as you go.

Do not broaden scope beyond ANC/EQ/ambient (+detect+battery) until M2–M4 are green on the real XM6.
Do not invent UI: every screen, state, color, and interaction is specified in `design/` + §5.3.
