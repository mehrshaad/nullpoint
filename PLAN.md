# Nullpoint — plan for v0.3 and beyond

v0.2.2 shipped and works: it connects to a WH-1000XM6, reads model/firmware/battery, and
controls noise mode and the equalizer, on Windows, macOS and the web. The build-out plan that
got us there is finished; the wire-protocol reference it contained now lives in
[`PROTOCOL.md`](./PROTOCOL.md).

This document is what comes next. Phases are ordered by value, and each one is independently
shippable — none of them blocks the others except where stated.

---

## Phase 0 — Multipoint ✅ done

**Changing settings from the computer while the phone plays music works.** Confirmed on a
WH-1000XM6, and separately on a WH-CH720N.

The open question — hard firmware limit, or first-come-first-served — turned out to be neither
exactly. The headset does hand out its control channel to one device at a time, but the channel
is **reclaimable**: retrying wins it back while the other device keeps playing audio. The
earlier conclusion that this was impossible was wrong, and the reason is worth remembering: the
retries were failing for an unrelated bug. The local serial port was never closed before being
reopened, so every attempt died at `open()` before it ever reached the headset. The device was
never given a fair chance to answer.

Shipped as a result:

- Reconnection retries for as long as the user allows, backing off to 15s, instead of giving up
  after five attempts and dead-ending on a screen only a refresh could clear.
- The banner distinguishes waiting for a busy channel from a headset that is simply gone.
- Losing control mid-session is detected, surfaced honestly, and recovered from on its own; the
  UI reverts rather than showing a setting the headphones never accepted.
- All commands are serialised, since the link carries one request/response at a time and
  overlapping commands were orphaning each other's acknowledgement.

## Phase 1 — Connected devices (Table 2) — built, unverified on hardware

**Table 2 (`DATA_MDR_NO2`) is implemented**, and with it the "CONNECTED TO" panel: every device
the headphones are paired with, which are connected, which holds the playback right, an icon per
device type from the Bluetooth Class of Device, and a Connect / Disconnect button per row. The
list updates itself from the headset's own notifications when a device comes or goes.

Details worth remembering are in [`PROTOCOL.md`](./PROTOCOL.md) — in particular that Table 2 is a
separate command space (response listeners are keyed by frame type *and* command), and that the
device list has no SET form, so connect/disconnect goes through `PERI_SET_EXTENDED_PARAM`.

The paired-device fetch is deliberately **not** awaited by `connect()`: a headset that advertises
Table 2 without answering the peripheral inquiry would otherwise add the full response timeout to
every connection.

**Still open:**

- **Nobody has seen this against real hardware yet.** It is unknown whether a WH-1000XM6 on
  FW 3.1.5 reports Table 2 support at all; if it doesn't, the panel correctly never appears, and
  the work needed is to find out rather than to write more code. This is exactly the trap
  standing rule 2 describes.
- Pairing mode (put the headset into pairing) is not implemented.
- Unpair is deliberately left out: irreversible from the app, and nothing needs it.

---

## Phase 2 — The desktop-native layer

The things Sony will never build, and the main reason to run this on a computer at all.

- **Tray popover** — 320×420, battery + ANC + now playing, no window. The design already
  specifies it (`design/SoundConnect Desktop.dc.html` §1d).
- **Battery in the tray** — percentage on the icon, low-battery notification.
- **Global hotkeys** — cycle ANC / ambient / off from any application.
- **App-aware profiles** — switch to ANC and a flat EQ when Teams or Zoom takes focus, restore
  afterwards. Impossible on a phone; genuinely useful here.
- **EQ profile library** — the headset stores a handful of slots; the app can store any number
  of named curves locally and push them on demand.

**Done when:** the app is useful without ever opening its window.

---

## Phase 3 — Protocol breadth

All of these are supported by the WH-1000XM6 and already described by the ported protocol. Gate
each on the capability bitmap so other models degrade cleanly.

Highest value first:

| Feature | Notes |
|---|---|
| **Adaptive Sound Control** | Auto-switches ANC/ambient by activity (still, walking, transport). Arguably the XM6's headline feature and entirely missing today |
| **Auto ambient level** | The one control currently shown disabled. Needs the `MODE_NC_ASM_…_NOISE_ADAPTATION` variant plus its sensitivity setting |
| **Speak-to-Chat** | On/off, sensitivity, and auto-resume timing |
| **DSEE Extreme** | Upscaling on/off/auto |
| **Connection quality** | LDAC 990 kbps vs. stable connection — a real daily tradeoff |
| **Touch sensor** | Enable/disable, and remap what each side does |
| **Voice guidance** | On/off and volume |
| **Pause on removal** | Wear-detection behaviour |
| **Auto power off** | Idle timeout, with or without wear detection |
| **Power off** | One command |
| **Listening mode** | Background-music mode and its distance setting |
| **Safe listening** | Exposure reporting |

---

## Phase 4 — Now playing and volume

Track metadata, play/pause, next/previous, volume, and the sound-pressure readout. The design's
dashboard footer was drawn for exactly this and is currently unbuilt.

---

## Phase 5 — Model awareness

Drive the whole UI from the capability bitmap rather than assuming a WH-1000XM6:

- Earbuds (WF-) report **per-bud and case battery** — currently only the single-cell reading is
  implemented, so buds show nothing useful.
- ULT models expose a sound-effect/ULT mode.
- Any unsupported control should be hidden, not shown broken.
- Ship the device-support matrix in the README as models get confirmed.

---

## Phase 6 — Distribution and trust

- **Code signing.** The only real fix for the Windows SmartScreen warning and macOS
  notarization. Azure Trusted Signing (~$10/mo) is the cheapest credible route; an EV
  certificate clears SmartScreen immediately but costs far more. The release workflow should
  take a certificate from secrets so this is a drop-in when one exists.
- **Auto-update** via electron-updater, once builds are signed.
- **Linux** AppImage — the config is already there but untested.

---

## Standing engineering rules

Learned the hard way while building v0.2:

1. **Never let a decode error escape onto the transport read loop.** One unreadable frame must
   not end the session. Log it and carry on.
2. **Verify against hardware, not just the fake device.** Every serious bug in v0.2 — the
   missing ACKs, the sequence numbering, the 10-band EQ, the Custom preset — passed the unit
   tests and failed on the real headset.
3. **Check CI actually runs.** It was red for its first several commits while being described
   as green.
4. **Gate on the capability bitmap**, never on the model name.
