// Ported from mos9527/SonyHeadphonesClient (MIT) — see /NOTICE.
// Source: src/ProtocolV2T2.h:490-830 @ master, src/Headphones.cpp:606-613

import {
  CommandT2,
  ConnectivityActionType,
  PeripheralInquiredType,
  PeripheralOutcome,
} from "../constants.js";

const ADDRESS_LENGTH = 17;

/**
 * What kind of thing a paired device is, derived from its Bluetooth Class of Device. Used to
 * show a meaningful icon per row rather than an identical dot for everything.
 */
export type PairedDeviceKind = "phone" | "computer" | "audio" | "wearable" | "other";

export interface PairedDevice {
  /** "XX:XX:XX:XX:XX:XX" as reported by the headset. */
  address: string;
  name: string;
  connected: boolean;
  kind: PairedDeviceKind;
  /** True for the device currently allowed to play audio (Sony calls this the playback right). */
  hasPlaybackRight: boolean;
}

/**
 * Bluetooth assigned numbers: the major device class sits in bits 8..12 of the 24-bit Class of
 * Device. That is enough to tell a phone from a laptop from a speaker, which is all we need.
 */
function kindFromClassOfDevice(cod: number): PairedDeviceKind {
  switch ((cod >> 8) & 0x1f) {
    case 0x01:
      return "computer";
    case 0x02:
      return "phone";
    case 0x04:
      return "audio";
    case 0x07:
      return "wearable";
    default:
      return "other";
  }
}

export function encodeGetPairedDevices(): Uint8Array {
  return Uint8Array.from([
    CommandT2.PERI_GET_PARAM,
    PeripheralInquiredType.PAIRING_DEVICE_MANAGEMENT_WITH_BLUETOOTH_CLASS_OF_DEVICE,
  ]);
}

/**
 * Decodes the paired-device list. ProtocolV2T2.h:762-830.
 *
 *   [command][inquiredType][count]
 *   then per device: [address:17 ASCII][connected:1][classOfDevice:3 BE][nameLen:1][name]
 *   then: [playbackRightDeviceIndex:1]
 *
 * Returns an empty list rather than throwing on a malformed record: this runs on the transport
 * read loop, where an exception would tear down the whole session (PLAN.md standing rule 1).
 */
export function decodePairedDevices(payload: Uint8Array): PairedDevice[] {
  const count = payload[2] ?? 0;
  const devices: PairedDevice[] = [];
  let offset = 3;

  try {
    for (let i = 0; i < count; i++) {
      const address = new TextDecoder("utf-8").decode(payload.subarray(offset, offset + ADDRESS_LENGTH));
      offset += ADDRESS_LENGTH;

      const connected = payload[offset] === 1;
      offset += 1;

      const cod = ((payload[offset]! << 16) | (payload[offset + 1]! << 8) | payload[offset + 2]!) >>> 0;
      offset += 3;

      const nameLength = payload[offset] ?? 0;
      offset += 1;
      // The firmware permits an empty friendly name even though Sony's own app does not
      // (mos9527/SonyHeadphonesClient#21), so zero length here is valid, not a parse error.
      const name = new TextDecoder("utf-8").decode(payload.subarray(offset, offset + nameLength));
      offset += nameLength;

      if (offset > payload.length) throw new Error("device record runs past the end of the payload");

      devices.push({
        address,
        name: name || address,
        connected,
        kind: kindFromClassOfDevice(cod),
        hasPlaybackRight: false,
      });
    }

    const playbackRightIndex = payload[offset];
    if (playbackRightIndex !== undefined && devices[playbackRightIndex]) {
      devices[playbackRightIndex]!.hasPlaybackRight = true;
    }
  } catch (err) {
    console.warn("[ssc/core] could not read the paired device list:", err);
    return [];
  }

  return devices;
}

/**
 * Connect or disconnect one paired device. ProtocolV2T2.h:1046-1084 — note this goes out as
 * PERI_SET_EXTENDED_PARAM, not PERI_SET_PARAM: the device list itself has no SET form.
 *
 *   [command][inquiredType][action][address:17 ASCII]
 */
export function encodeSetDeviceConnection(
  address: string,
  action: ConnectivityActionType
): Uint8Array {
  const addressBytes = new TextEncoder().encode(address);
  if (addressBytes.length !== ADDRESS_LENGTH) {
    throw new Error(`Bluetooth address must be exactly ${ADDRESS_LENGTH} characters: "${address}"`);
  }
  return Uint8Array.from([
    CommandT2.PERI_SET_EXTENDED_PARAM,
    PeripheralInquiredType.PAIRING_DEVICE_MANAGEMENT_WITH_BLUETOOTH_CLASS_OF_DEVICE,
    action,
    ...addressBytes,
  ]);
}

export interface ConnectivityResult {
  action: ConnectivityActionType;
  outcome: PeripheralOutcome;
  address: string;
}

/** ProtocolV2T2.h:1140-1174 — `[command][inquiredType][action][result][address:17 ASCII]`. */
export function decodeConnectivityResult(payload: Uint8Array): ConnectivityResult {
  return {
    action: payload[2] as ConnectivityActionType,
    // The high nibble just repeats the action; only the low nibble says how it went.
    outcome: (payload[3]! & 0x0f) as PeripheralOutcome,
    address: new TextDecoder("utf-8").decode(payload.subarray(4, 4 + ADDRESS_LENGTH)),
  };
}
