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
**one**. While another host holds it, opening fails with `0x2740`
(`WSAEADDRINUSE`, "only one usage of each socket address"). Sony's app does not need to be
running for a phone to be holding it.

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

## Preset IDs

`OFF 0x00`, `HEAVY 0x30`, `CLEAR 0x31`, `HARD 0x32`, `SOFT 0x33`, `CUSTOM 0xA0`,
`USER_SETTING1..5 0xA1..0xA5`, `UNSPECIFIED 0xFF`.

## Paired device list (Table 2, not yet implemented)

`PeripheralGetParam(PAIRING_DEVICE_MANAGEMENT_WITH_BLUETOOTH_CLASS_OF_DEVICE)` returns one
record per paired device:

| Field | Notes |
|---|---|
| `btDeviceAddress` | 17 ASCII bytes, `XX:XX:XX:XX:XX:XX`, no terminator |
| `connectedStatus` | 1 byte |
| `bluetoothClassOfDevice` | 24-bit big-endian; identifies phone / computer / audio device |
| `btFriendlyName` | length-prefixed string |

Requires Table 2 support (`DATA_MDR_NO2`) and the pairing-device-management capability.

## Source map

| Upstream (`mos9527@master`) | What it covers |
|---|---|
| `src/CommandSerializer.{h,cpp}` | framing, escaping, checksum |
| `src/Constants.h` | markers, UUID, data types, function-type enums |
| `src/Headphones.cpp` | handshake order, ACK replies, per-feature encode/decode |
| `src/BluetoothWrapper.cpp` | sequence numbers, `sendAck` |
| `src/ProtocolV2T1.h` | Table 1 payload structs |
| `src/ProtocolV2T2.h` | Table 2 payload structs (peripherals, voice guidance) |
