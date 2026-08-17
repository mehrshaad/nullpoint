# Nullpoint — plan beyond v0.3

v0.3.0 shipped: it connects to a WH-1000XM6, reads model/firmware/battery, controls noise mode
and the equalizer, holds its connection through interruptions, and can be driven from a computer
while a phone plays music — on Windows, macOS and the web. The build-out plan that got us there
is finished; the wire-protocol reference it contained now lives in
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

## Phase 1 — Connected devices (Table 2) ✅ working on hardware

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

- Connecting a device when both multipoint slots are full silently does nothing — the headset
  refuses and the row gives no feedback. Worth surfacing.
- Merely-paired devices report an unknown Bluetooth class (`0xFFFFFF`); their icon is guessed
  from the device name instead, which covers the common ones and falls back to generic.
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

## Phase 3 — Protocol breadth — in progress

Gate every one of these on the capability bitmap so other models degrade cleanly, and omit a
control the hardware doesn't have rather than showing it disabled.

**Done** (all unverified on hardware — see the note at the end):

| Feature | Notes |
|---|---|
| ✅ **Auto ambient level** | Was shown disabled since v1. Needed the `…NOISE_ADAPTATION` NC/ASM variant, plus LOW/STANDARD/HIGH sensitivity |
| ✅ **Speak-to-Chat** | On/off, voice sensitivity, and how long before your music resumes |
| ✅ **DSEE Extreme** | Upscaling auto/off |
| ✅ **Connection quality** | Sound quality vs. stable link vs. low latency. Not offered by the XM6, which doesn't advertise `0xE1` |
| ✅ **Pause on removal** | Wear detection driving playback |
| ✅ **Power off** | A button in Settings, beside the capability report |

**Remaining**, highest value first:

| Feature | Notes |
|---|---|
| **Adaptive Sound Control** | Auto-switches ANC/ambient by activity (still, walking, transport). Arguably the XM6's headline feature and entirely missing today |
| **Touch sensor** | Enable/disable, and remap what each side does |
| **Voice guidance** | On/off and volume |
| **Auto power off** | Idle timeout, with or without wear detection |
| **Listening mode** | Background-music mode and its distance setting |
| **Safe listening** | Exposure reporting |

The capability report in Settings lists every function type the headset advertised, including
the ones Nullpoint ignores. That list is where the next features should come from — it says what
this hardware can actually do, rather than what the protocol dump says some hardware can.

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

## What the hardware said

Everything added after v0.3.0 has now met a real WH-1000XM6 on FW 3.1.5. It reports **45**
capabilities, and Table 2 works — the device list comes back complete, names intact through
UTF-8 curly apostrophes.

Confirmed working: the paired-device list, auto ambient level and its sensitivity, Speak-to-Chat,
DSEE Extreme, pause on removal, battery, the 10-band equalizer.

Two things behaved correctly and only looked broken:

- **Connection quality is absent** because the XM6 does not advertise `0xE1` at all. It
  advertises `0xE7` (classic/LE audio) instead. The row is right to be missing.
- **Auto ambient appeared dead** when driven by a script that clicked it while the headphones
  were in noise-cancelling mode, where the UI deliberately disables it. A programmatic click
  bypasses a disabled control; a human could not have hit it.

One real bug, found only by reading raw frames rather than the rendered page: `connectedStatus`
is a **multipoint slot**, not a flag, and the trailing byte of the device list is a slot rather
than a list index — so the "has the audio" marker sat on a phone that was not even connected,
and a device in slot 2 read as disconnected. Details in [`PROTOCOL.md`](./PROTOCOL.md).

**The lesson worth keeping:** two of the three "bugs" first reported from this session were
misreadings of the app's own UI text. The bytes settled all three. Read the frames.

Connect, disconnect and power off are verified too. Connecting a third device really does
connect it — and because the XM6 holds only **two** at once, doing so evicts one of the
existing pair. That is the headset's behaviour, not a fault, but it is worth knowing before
pressing the button: connecting something can silently drop the phone you were listening on.
Power off leaves the headset unreachable until its own power button is pressed; a Bluetooth
socket timeout (`0x274C`) rather than "address in use" (`0x2740`) is the signature of a headset
that is off rather than busy.

## Two failure modes that look like broken headphones

Both were reported as hardware faults and neither was. Worth recognising on sight.

**Audio playing does not mean the settings channel is available.** Music is A2DP and keeps going
regardless; settings ride a separate single-occupancy RFCOMM channel. The usual occupant is
another copy of Nullpoint — the tray app holds it for as long as it runs. Windows distinguishes
the cases: `0x2740` means something else holds the channel, `0x274C` means nothing is answering
at all, which in practice means the headset is off.

**A decode error takes out a whole panel, silently.** Guarding the read loop against exceptions
keeps the session alive, which is right, but the state that frame carried is simply never set —
so the panel renders nothing and the app looks like it forgot a feature. v0.3.0 lost noise
control this way for a full release: it required a 7-byte NC/ASM frame and the WH-1000XM6 sends
9. If a panel is missing rather than empty, suspect a swallowed decode before anything else.

## Standing engineering rules

Learned the hard way while building v0.2:

1. **Never let a decode error escape onto the transport read loop.** One unreadable frame must
   not end the session. Log it and carry on — but note the cost: the state that frame carried
   stays unset, so the feature disappears from the UI rather than reporting a fault. Decoders
   should widen to accept what the hardware sends, not lean on the guard.
2. **Verify against hardware, not just the fake device.** Every serious bug in v0.2 — the
   missing ACKs, the sequence numbering, the 10-band EQ, the Custom preset — passed the unit
   tests and failed on the real headset. **Everything added after v0.3.0 is in this position
   right now**: the device list, auto ambient level, Speak-to-Chat, DSEE and connection quality
   all pass their tests and none has met a real headset. Expect at least one of them to be
   wrong.
3. **Check CI actually runs.** It was red for its first several commits while being described
   as green.
4. **Gate on the capability bitmap**, never on the model name.
