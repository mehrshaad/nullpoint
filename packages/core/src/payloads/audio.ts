// Ported from mos9527/SonyHeadphonesClient (MIT) — see /NOTICE.
// Source: src/ProtocolV2T1.h:5238-5307 @ master, src/Headphones.cpp:349-361

import {
  AudioInquiredType,
  CommandT1,
  EnableDisable,
  PriorMode,
  RoomSize,
  UpmixItem,
  UpscalingTypeAutoOff,
} from "../constants.js";

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
 * Background music mode: the headset places what you're listening to around you rather than
 * inside your head. ProtocolV2T1.h:5364-5390 — `[command][inquiredType][onOff][roomSize]`.
 *
 * Note the inquired type is whichever variant the headset advertises: 0x03 plain, or 0x09 for
 * the error-code form a WH-1000XM6 reports. Both carry the same payload.
 */
export interface BgmModeState {
  enabled: boolean;
  /** How far away the music is placed. */
  room: RoomSize;
}

export function encodeSetBgmMode(
  type: AudioInquiredType,
  { enabled, room }: BgmModeState
): Uint8Array {
  return Uint8Array.from([
    CommandT1.AUDIO_SET_PARAM,
    type,
    // Inverted, like everywhere this enum appears: ENABLE is 0.
    enabled ? EnableDisable.ENABLE : EnableDisable.DISABLE,
    room,
  ]);
}

/**
 * Which spatial upmix is active, on headsets that offer the picker rather than the single
 * cinema toggle. ProtocolV2T1.h:5489-5504 — `[command][UPMIX_SERIES][item]`.
 */
export function encodeSetUpmixSeries(item: UpmixItem): Uint8Array {
  return Uint8Array.from([CommandT1.AUDIO_SET_PARAM, AudioInquiredType.UPMIX_SERIES, item]);
}

/** Cinema upmix. ProtocolV2T1.h:5394-5410 — `[command][inquiredType][onOff]`. */
export function encodeSetUpmixCinema(enabled: boolean): Uint8Array {
  return Uint8Array.from([
    CommandT1.AUDIO_SET_PARAM,
    AudioInquiredType.UPMIX_CINEMA,
    enabled ? EnableDisable.ENABLE : EnableDisable.DISABLE,
  ]);
}

/**
 * Returns null for a param we don't handle, rather than throwing: this runs on the transport
 * read loop, and the headset sends AUDIO frames for settings beyond the ones we read.
 */
export function decodeAudioParam(
  payload: Uint8Array
):
  | { type: "connectionMode"; value: PriorMode }
  | { type: "upscaling"; value: UpscalingTypeAutoOff }
  | { type: "bgmMode"; value: BgmModeState }
  | { type: "upmixCinema"; value: boolean }
  | { type: "upmixSeries"; value: UpmixItem }
  | null {
  const value = payload[2];
  if (value === undefined) return null;
  switch (payload[1]) {
    case AudioInquiredType.CONNECTION_MODE:
      return { type: "connectionMode", value: value as PriorMode };
    case AudioInquiredType.UPSCALING:
      return { type: "upscaling", value: value as UpscalingTypeAutoOff };
    case AudioInquiredType.BGM_MODE:
    case AudioInquiredType.BGM_MODE_AND_ERRORCODE: {
      if (payload[3] === undefined) return null;
      return {
        type: "bgmMode",
        value: { enabled: value === EnableDisable.ENABLE, room: payload[3] as RoomSize },
      };
    }
    case AudioInquiredType.UPMIX_CINEMA:
      return { type: "upmixCinema", value: value === EnableDisable.ENABLE };
    case AudioInquiredType.UPMIX_SERIES:
      return { type: "upmixSeries", value: value as UpmixItem };
    default:
      return null;
  }
}
