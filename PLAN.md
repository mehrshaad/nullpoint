# Nullpoint — plan for v0.3 and beyond

v0.2.2 shipped and works: it connects to a WH-1000XM6, reads model/firmware/battery, and
controls noise mode and the equalizer, on Windows, macOS and the web. The build-out plan that
got us there is finished; the wire-protocol reference it contained now lives in
[`PROTOCOL.md`](./PROTOCOL.md).

This document is what comes next. Phases are ordered by value, and each one is independently
shippable — none of them blocks the others except where stated.

---

## Phase 0 — Make multipoint work (highest priority)

The one thing that stops Nullpoint being usable day-to-day: **the headset hands out its control
channel to one host at a time**, so with a phone also connected, connecting fails with `0x2740`
(see PROTOCOL.md). Audio multipoint is unaffected — this is only the settings channel.

What is *not* yet known is whether this is a hard device limit or a first-come-first-served
claim. That distinction decides everything below, so establish it first.

**Experiment (needs a second device, so it cannot be automated here):**

1. Disconnect the phone. Connect Nullpoint. Confirm it works.
2. **With Nullpoint still connected**, reconnect the phone and let it take audio.
3. Change ANC from Nullpoint.

- If step 3 works → the channel is claimed first-come. Ship "connect Nullpoint first" as the
  documented behaviour, hold the session open deliberately, and reconnect automatically the
  moment the channel frees up.
- If step 3 fails → it is a firmware limit. Then the honest answer is UX, not engineering:
  detect the condition precisely, name which device is holding it (Phase 1 gives us the
  names), and offer a one-click "take control" that retries in a loop until the phone
  releases it.

Either way, add: retry-with-backoff on `0x2740` rather than failing immediately, and a clear
banner while another device holds the link.

**Done when:** the two-device behaviour is understood, documented, and the app either works in
that state or explains it accurately and recovers by itself.

---

## Phase 1 — Connected devices (Table 2)

Show every device the headphones are paired with and which are connected, and switch between
them. Requires implementing **Table 2** (`DATA_MDR_NO2`), which the codebase does not speak yet;
everything else in this phase depends on that groundwork.

- `PeripheralGetParam(PAIRING_DEVICE_MANAGEMENT_WITH_BLUETOOTH_CLASS_OF_DEVICE)` returns, per
  device: MAC, connected status, 24-bit Bluetooth Class of Device, and friendly name.
- The Class of Device gives us the device *type*, so each row gets a real icon (phone, laptop,
  speaker) rather than a generic dot.
- Connect / disconnect a specific device, and toggle pairing mode.

**Done when:** a Devices panel lists e.g. "Mehrshad's iPhone — connected" and "ThinkPad —
paired", with correct icons, and the user can connect or disconnect one from the app.

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
