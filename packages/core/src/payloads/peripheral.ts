// Ported from mos9527/SonyHeadphonesClient (MIT) — see /NOTICE.
// Source: src/ProtocolV2T2.h:490-830 @ master, src/Headphones.cpp:606-613

import {
  CommandT2,
  ConnectivityActionType,
  PeripheralInquiredType,
  PeripheralOutcome,
  SourceSwitchResult,
} from "../constants.js";

const ADDRESS_LENGTH = 17;

/**
 * What kind of thing a paired device is, derived from its Bluetooth Class of Device. Used to
 * show a meaningful icon per row rather than an identical dot for everything.
 */
export type PairedDeviceKind = "phone" | "tablet" | "computer" | "audio" | "wearable" | "other";

export interface PairedDevice {
  /** "XX:XX:XX:XX:XX:XX" as reported by the headset. */
  address: string;
  name: string;
  connected: boolean;
  /**
   * Which multipoint slot this device occupies — 1 or 2 — or 0 when it isn't connected.
   * `connectedStatus` is a slot number, not a flag: a device in slot 2 reports 2, so testing
   * it for equality with 1 wrongly reports the second multipoint device as disconnected.
   */
  slot: number;
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

/**
 * Devices that are paired but not currently connected report their class as
 * `0xFFFFFF` — unknown — so the only thing left to go on is the name the owner gave them.
 * Most are recognisable ("Mehrshad's iPhone", "Sara's MacBook Air"), and a familiar icon on the
 * right row is worth more than a row of identical unknowns. Anything unrecognised stays
 * generic rather than being forced into a guess.
 */
const NAME_HINTS: Array<[RegExp, PairedDeviceKind]> = [
  [/\b(ipad|galaxy tab|tablet)\b/i, "tablet"],
  [/\b(iphone|galaxy|pixel|oneplus|xiaomi|redmi|huawei|honor|oppo|vivo|nokia|moto|phone)\b/i, "phone"],
  [
    /\b(macbook|imac|mac ?(mini|studio|pro)|thinkpad|ideapad|legion|loq|latitude|inspiron|xps|surface|elitebook|probook|zenbook|vivobook|omen|rog|laptop|desktop|pc)\b/i,
    "computer",
  ],
  [/\b(watch|band|fit(bit)?|tracker)\b/i, "wearable"],
  [/\b(airpods|buds|headphones?|earbuds|speaker|soundbar|tv|echo|homepod|sonos)\b/i, "audio"],
];

function kindFromName(name: string): PairedDeviceKind {
  for (const [pattern, kind] of NAME_HINTS) {
    if (pattern.test(name)) return kind;
  }
  return "other";
}

/** The reported class where there is one, the name as a fallback where there isn't. */
function kindFor(cod: number, name: string): PairedDeviceKind {
  const reported = kindFromClassOfDevice(cod);
  return reported === "other" ? kindFromName(name) : reported;
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

      const slot = payload[offset] ?? 0;
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

      const label = name || address;
      devices.push({
        address,
        name: label,
        connected: slot > 0,
        slot,
        kind: kindFor(cod, label),
        hasPlaybackRight: false,
      });
    }

    // The trailing byte is the *slot* holding the playback right, matching the connectedStatus
    // values above (Headphones.cpp:1365-1369 indexes a map keyed by slot). Reading it as a
    // position in the list puts the badge on whichever device happens to sit at that index —
    // in practice a disconnected one.
    const playbackRightSlot = payload[offset] ?? 0;
    const holder = playbackRightSlot > 0 && devices.find((d) => d.slot === playbackRightSlot);
    if (holder) holder.hasPlaybackRight = true;
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

/**
 * Move the audio to a device that is already connected — the multipoint "make this the one I'm
 * listening on" that Sony's app makes you fight for. ProtocolV2T2.h:1088-1100:
 * `[command][SOURCE_SWITCH_CONTROL][address:17 ASCII]`.
 *
 * Distinct from connect/disconnect: both devices stay connected, only the audio moves.
 */
export function encodeSwitchAudioTo(address: string): Uint8Array {
  const addressBytes = new TextEncoder().encode(address);
  if (addressBytes.length !== ADDRESS_LENGTH) {
    throw new Error(`Bluetooth address must be exactly ${ADDRESS_LENGTH} characters: "${address}"`);
  }
  return Uint8Array.from([
    CommandT2.PERI_SET_EXTENDED_PARAM,
    PeripheralInquiredType.SOURCE_SWITCH_CONTROL,
    ...addressBytes,
  ]);
}

/**
 * ProtocolV2T2.h:1185-1199 — `[command][inquiredType][result][address:17]`.
 *
 * Returns null when the frame is the *other* extended-param notification (connect/disconnect),
 * which shares this command byte and has a different shape.
 */
export function decodeSourceSwitchResult(
  payload: Uint8Array
): { result: SourceSwitchResult; address: string } | null {
  if (payload[1] !== PeripheralInquiredType.SOURCE_SWITCH_CONTROL || payload[2] === undefined) {
    return null;
  }
  return {
    result: payload[2] as SourceSwitchResult,
    address: new TextDecoder("utf-8").decode(payload.subarray(3, 3 + ADDRESS_LENGTH)),
  };
}

/** Something the person can act on, rather than a number. */
export function describeSourceSwitch(result: SourceSwitchResult): string | null {
  switch (result) {
    case SourceSwitchResult.SUCCESS:
      return null;
    case SourceSwitchResult.FAIL_CALLING:
      return "Can't move the audio during a call.";
    case SourceSwitchResult.FAIL_A2DP_NOT_CONNECT:
      return "That device isn't playing audio to these headphones.";
    case SourceSwitchResult.FAIL_GIVE_PRIORITY_TO_VOICE_ASSISTANT:
      return "A voice assistant has the audio right now.";
    default:
      return "The headphones wouldn't move the audio there.";
  }
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
