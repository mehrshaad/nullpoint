# The Sony headphone control protocol

Reference for the wire protocol Nullpoint speaks, including the parts that only became clear
from testing against real hardware. Ported from the reverse-engineering work in
[`mos9527/SonyHeadphonesClient`](https://github.com/mos9527/SonyHeadphonesClient) and
[`Plutoberth/SonyHeadphonesClient`](https://github.com/Plutoberth/SonyHeadphonesClient) (both
MIT — see [`NOTICE`](./NOTICE)).

Everything below marked **verified** was confirmed against a WH-1000XM6 on firmware 3.1.5.

## Transport

Settings travel over a Sony-proprietary **Bluetooth Classic RFCOMM/SPP** channel. Audio is
ordinary A2DP handled by the OS and is unrelated.

- **Service UUID** `956C7B26-D49A-4BA8-B03F-B17D393CB6E2` (service name "Serial HPC")
- Web Bluetooth cannot reach this — it is BLE-only. We use the **Web Serial API**, which
  exposes Bluetooth RFCOMM on Chromium ≥ 117 desktop.
- **verified** Windows exposes the service as a device node:
  `BTHENUM\{956C7B26-…}_VID&0002054C_PID&0F8A`

### requestPort needs both options

```js
navigator.serial.requestPort({
  filters: [{ bluetoothServiceClassId: uuid }],
  allowedBluetoothServiceClassIds: [uuid],   // required, not optional
});
```

`filters` narrows the chooser; `allowedBluetoothServiceClassIds` is the security gate that
permits touching that service class at all. **verified** Omitting the second makes Chromium
offer **zero** ports; including it offers exactly the headset.

### One controller at a time

**verified** The headset serves audio to two devices (multipoint) but its control channel to
**one at a time**. While another host holds it, opening fails with `0x2740` (`WSAEADDRINUSE`,
"only one usage of each socket address"), and Sony's app does not need to be running for a
phone to be holding it.

The channel is **reclaimable**, though: retrying wins it back while the other device keeps
playing audio, so controlling settings from a computer during phone playback does work. An
earlier reading of this as a hard firmware limit was wrong — the retries were failing for an
unrelated reason (the local port was never closed before being reopened, so every attempt died
at `open()` before reaching the headset).

## Frame format

```
<START> ESCAPE( <DATA_TYPE:1> <SEQ:1> <SIZE:4 BE> <PAYLOAD> <CHECKSUM:1> ) <END>
```

- `START = 0x3E`, `END = 0x3C`
- **Checksum**: 8-bit wrapping sum of `DATA_TYPE .. end of PAYLOAD`, computed *before* escaping
- **SIZE**: big-endian `uint32`, length of `PAYLOAD` only
- **Escaping** inside the frame body only, sentinel `0x3D`:
  `0x3C → 3D 2C`, `0x3D → 3D 2D`, `0x3E → 3D 2E`

`DATA_TYPE` values we use: `ACK = 1`, `DATA_MDR = 12` (Table 1), `DATA_MDR_NO2 = 14` (Table 2).

## Sequencing and acknowledgement

Two rules that are easy to miss and break everything if you do:

1. **Acknowledge every frame the headset sends.** After receiving a `DATA_MDR` frame, reply
   with an `ACK` frame carrying `1 - receivedSeq` and an empty payload. **verified** The device
   sends nothing further until this arrives — skip it and the session dies immediately after
   the first reply.
2. **Sequence numbers are device-driven.** Every received frame sets the shared counter;
   outgoing commands carry its current value. Toggling it locally drifts out of step.

## Handshake

1. `CONNECT_GET_PROTOCOL_INFO` → returns protocol version and the Table 1 / Table 2 support flags
2. `CONNECT_GET_DEVICE_INFO` × 2 → model name, firmware version
3. `CONNECT_GET_SUPPORT_FUNCTION` → capability bitmap; gate every feature on this
4. Feature GETs: battery, NC/ASM, EQ

## Equalizer — two different shapes

The device reports how many band steps it uses, and the shapes differ in more than count:

| Steps | Layout | Range | Wire encoding | Bands |
|---|---|---|---|---|
| 6 | Clear Bass + 5 | −10…+10 dB | `byte = dB + 10` | Clear Bass, 400, 1k, 2.5k, 6.3k, 16k |
| 10 | Graphic | −6…+6 dB | `byte = dB + 6` | 31, 63, 125, 250, 500, 1k, 2k, 4k, 8k, 16k |

**verified** A WH-1000XM6 on FW 3.1.5 reports the **10-band** shape. Never assume one layout,
and never throw on an unrecognised step count — decoding runs on the transport read loop, so an
exception there tears down the whole connection.

**verified** `Custom` is not a stored curve on the headset; it *is* whatever band values you
send. Selecting it with an empty band list is silently ignored — send the band values with it.

## NC/ASM has two shapes

Which one to write is decided from the capability bitmap, in this order (Headphones.cpp:184-195):

| Capability | Inquired type | Payload |
|---|---|---|
| `…LEVEL_ADJUSTMENT` (0x6B) | 0x17 | 7 bytes: `[cmd][type][changeStatus][totalEffect][mode][ambientMode][level]` |
| `…LEVEL_ADJUSTMENT_NOISE_ADAPTATION` (0x6D) | 0x19 | the same, plus `[noiseAdaptiveOnOff][sensitivity]` |

A headset advertising the first uses it even if it also advertises the second. The trailing two
fields are **auto ambient level** and its sensitivity (`STANDARD 0`, `HIGH 1`, `LOW 2`) — without
the 0x19 form that control cannot be written at all.

Reads should key off the inquired type in the received frame rather than off what you think the
device supports; the frame describes itself.

## Capability-gated settings

Each is asked for only if `CONNECT_RET_SUPPORT_FUNCTION` lists its function type.

| Setting | Function type | Messages |
|---|---|---|
| Connection quality | 0xE1 | `AUDIO_*_PARAM (0xE6/E7/E8/E9)`, inquired type `CONNECTION_MODE 0x00`, value `PriorMode` (`SOUND_QUALITY 0`, `CONNECTION_QUALITY 1`, `LOW_LATENCY_BETA 2`) |
| DSEE Extreme | 0xE2 | the same family, inquired type `UPSCALING 0x01`, value `OFF 0` / `AUTO 1` |
| Speak-to-Chat | 0xFC | **two** messages, see below |
| Pause on removal | 0xF1 | `SYSTEM_*_PARAM`, inquired type `PLAYBACK_CONTROL_BY_WEARING 0x01`, value `EnableDisable` |
| Power off | 0x23 | `POWER_SET_STATUS (0x24)` + `POWER_OFF (0x03)` + `USER_POWER_OFF (0x01)`. No value to read back |

All the AUDIO param messages share one shape: `[command][inquiredType][value]`.

Speak-to-Chat is split. Whether it's on lives in `SYSTEM_*_PARAM (0xF6/F7/F8/F9)` as
`[command][type 0x0C][onOff][previewMode]`; sensitivity and resume delay live in
`SYSTEM_*_EXT_PARAM (0xFA/FB/FC/FD)` as `[command][type 0x0C][detectSensitivity][modeOffTime]`.
Write only the one that changed. Sensitivity is `AUTO 0`, `HIGH 1`, `LOW 2`; resume delay is
`FAST 0`, `MID 1`, `SLOW 2`, `NONE 3` (never resumes on its own). Preview mode is a demo mode
Sony's own app uses; send it off.

> **`EnableDisable` is inverted.** `ENABLE = 0`, `DISABLE = 1` (Constants.h:82-88) — the
> opposite of the `OnOff` enum used elsewhere in the same protocol. Assuming the usual mapping
> silently inverts every setting that uses it.

## Preset IDs

`OFF 0x00`, `HEAVY 0x30`, `CLEAR 0x31`, `HARD 0x32`, `SOFT 0x33`, `CUSTOM 0xA0`,
`USER_SETTING1..5 0xA1..0xA5`, `UNSPECIFIED 0xFF`.

## Table 2 — paired devices

Table 2 rides in `DATA_MDR_NO2` frames and is an entirely **separate command space** from
Table 1: the same byte means different things in each, so response listeners must be keyed by
frame type as well as command. Availability is reported by byte 7 of
`CONNECT_RET_PROTOCOL_INFO` (0 = supported), and `CONNECT_GET_PROTOCOL_INFO` is answered before
anything else, so there is never a reason to guess.

### Reading the list

`PERI_GET_PARAM (0x36)` with inquired type
`PAIRING_DEVICE_MANAGEMENT_WITH_BLUETOOTH_CLASS_OF_DEVICE (0x02)` →
`PERI_RET_PARAM (0x37)`:

```
[command][inquiredType][deviceCount]
  per device: [address:17 ASCII][connectedStatus:1][classOfDevice:3 BE][nameLen:1][name]
[playbackRightDeviceIndex:1]
```

| Field | Notes |
|---|---|
| `btDeviceAddress` | 17 ASCII bytes, `XX:XX:XX:XX:XX:XX`, no terminator |
| `connectedStatus` | 1 byte |
| `bluetoothClassOfDevice` | 24-bit big-endian. Major device class is bits 8–12: `0x01` computer, `0x02` phone, `0x04` audio/video, `0x07` wearable |
| `btFriendlyName` | length-prefixed; **may legitimately be empty**, even though Sony's own app requires at least one character ([mos9527#21](https://github.com/mos9527/SonyHeadphonesClient/issues/21)) |

The trailing byte is an *index into the list*, not an address — the device currently holding
the playback right. Inquired type `0x00` returns the same shape **without** the class-of-device
field; don't parse one with the other's layout.

The headset pushes `PERI_NTFY_PARAM (0x39)` with the whole list again whenever a device
connects or disconnects, so this never needs polling.

### Connecting and disconnecting

There is **no SET form of the device list** — `PeripheralParam…`'s set slot is `UNKNOWN`
upstream. Connect/disconnect goes through `PERI_SET_EXTENDED_PARAM (0x3C)` instead:

```
[0x3C][inquiredType][connectivityActionType][address:17 ASCII]
```

with `DISCONNECT = 0x00`, `CONNECT = 0x01`, `UNPAIR = 0x02` (Nullpoint deliberately does not
expose unpair). The reply is `PERI_NTFY_EXTENDED_PARAM (0x3D)`:

```
[0x3D][inquiredType][connectivityActionType][result][address:17 ASCII]
```

`result`'s high nibble repeats the action and the low nibble is the outcome — `0` success,
`1` error, `2` in progress, `3` busy. "In progress" is a normal answer, not a failure: the
finished state arrives later as a `PERI_NTFY_PARAM` list.

Disconnecting the machine you are talking through is legal, and simply drops your own link.

## Source map

| Upstream (`mos9527@master`) | What it covers |
|---|---|
| `src/CommandSerializer.{h,cpp}` | framing, escaping, checksum |
| `src/Constants.h` | markers, UUID, data types, function-type enums |
| `src/Headphones.cpp` | handshake order, ACK replies, per-feature encode/decode |
| `src/BluetoothWrapper.cpp` | sequence numbers, `sendAck` |
| `src/ProtocolV2T1.h` | Table 1 payload structs |
| `src/ProtocolV2T2.h` | Table 2 payload structs (peripherals, voice guidance) |
