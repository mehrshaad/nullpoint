// Ported from mos9527/SonyHeadphonesClient (MIT) — see /NOTICE.
// Source: src/ProtocolV2T1.h:5238-5307 @ master, src/Headphones.cpp:349-361

import { AudioInquiredType, CommandT1, PriorMode, UpscalingTypeAutoOff } from "../constants.js";

/**
 * The AUDIO param family. Every message in it has the same three-byte shape —
 * `[command][inquiredType][value]` — so one pair of helpers covers both settings we use.
 */

export function encodeGetAudioParam(type: AudioInquiredType): Uint8Array {
  return Uint8Array.from([CommandT1.AUDIO_GET_PARAM, type]);
}

export function encodeSetAudioParam(type: AudioInquiredType, value: number): Uint8Array {
  return Uint8Array.from([CommandT1.AUDIO_SET_PARAM, type, value]);
}

/**
 * Returns null for a param we don't handle, rather than throwing: this runs on the transport
 * read loop, and the headset sends AUDIO frames for settings beyond the two we read.
 */
export function decodeAudioParam(
  payload: Uint8Array
): { type: AudioInquiredType.CONNECTION_MODE; value: PriorMode }
  | { type: AudioInquiredType.UPSCALING; value: UpscalingTypeAutoOff }
  | null {
  const value = payload[2];
  if (value === undefined) return null;
  switch (payload[1]) {
    case AudioInquiredType.CONNECTION_MODE:
      return { type: AudioInquiredType.CONNECTION_MODE, value: value as PriorMode };
    case AudioInquiredType.UPSCALING:
      return { type: AudioInquiredType.UPSCALING, value: value as UpscalingTypeAutoOff };
    default:
      return null;
  }
}
