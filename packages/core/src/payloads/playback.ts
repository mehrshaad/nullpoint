// Ported from mos9527/SonyHeadphonesClient (MIT) — see /NOTICE.
// Source: src/ProtocolV2T1.h:823-890,3722-4360 @ master, src/Headphones.cpp:237-245,581,790-796

import {
  AudioCodec,
  CommandT1,
  CommonInquiredType,
  EnableDisable,
  PlayInquiredType,
  PlaybackControl,
  PlaybackStatus,
} from "../constants.js";

/** The headset reports 0–30; the UI shows it as a proportion. */
export const MAX_VOLUME = 30;

// ---------------------------------------------------------------- codec

export function encodeGetCodec(): Uint8Array {
  return Uint8Array.from([CommandT1.COMMON_GET_STATUS, CommonInquiredType.AUDIO_CODEC]);
}

/** `[command][inquiredType][codec]`. ProtocolV2T1.h:867-881. Null for other COMMON frames. */
export function decodeCodec(payload: Uint8Array): AudioCodec | null {
  if (payload[1] !== CommonInquiredType.AUDIO_CODEC || payload[2] === undefined) return null;
  return payload[2] as AudioCodec;
}

/** What to actually print. The wire names are not the ones anyone says out loud. */
export function codecLabel(codec: AudioCodec): string {
  switch (codec) {
    case AudioCodec.SBC:
      return "SBC";
    case AudioCodec.AAC:
      return "AAC";
    case AudioCodec.LDAC:
      return "LDAC";
    case AudioCodec.APT_X:
      return "aptX";
    case AudioCodec.APT_X_HD:
      return "aptX HD";
    case AudioCodec.LC3:
      return "LC3";
    case AudioCodec.UNSETTLED:
      return "Negotiating";
    default:
      return "Unknown";
  }
}

// ---------------------------------------------------------------- transport

const TRANSPORT_TYPE = PlayInquiredType.PLAYBACK_CONTROL_WITH_CALL_VOLUME_ADJUSTMENT;

export function encodeGetPlayback(): Uint8Array {
  return Uint8Array.from([CommandT1.PLAY_GET_STATUS, TRANSPORT_TYPE]);
}

/**
 * Ask the source device to play, pause or change track. ProtocolV2T1.h:4061-4079 —
 * `[command][inquiredType][status][control]`. The `status` byte enables the control itself and
 * is always ENABLE, matching upstream's `requestPlaybackControl` (Headphones.cpp:790-796).
 *
 * Note this is a *request to the phone or computer playing the audio*, not a setting on the
 * headphones — which is why it can be sent from here while another device is the one playing.
 */
export function encodePlaybackControl(control: PlaybackControl): Uint8Array {
  return Uint8Array.from([CommandT1.PLAY_SET_STATUS, TRANSPORT_TYPE, EnableDisable.ENABLE, control]);
}

export interface PlaybackState {
  /** True while something is actually playing. */
  playing: boolean;
  /** False when the headset says transport control isn't available right now. */
  available: boolean;
}

/**
 * `[command][inquiredType][status][playbackStatus][musicCallStatus]` — and one byte longer for
 * the "…AND_FUNCTION_CHANGE" variant, which we read the same way since the fields we want sit
 * at the same offsets. ProtocolV2T1.h:3907-3931.
 */
export function decodePlayback(payload: Uint8Array): PlaybackState | null {
  if (payload[3] === undefined) return null;
  return {
    available: payload[2] === EnableDisable.ENABLE,
    playing: payload[3] === PlaybackStatus.PLAY,
  };
}

// ---------------------------------------------------------------- volume

export function encodeGetVolume(): Uint8Array {
  return Uint8Array.from([CommandT1.PLAY_GET_PARAM, PlayInquiredType.MUSIC_VOLUME]);
}

/** `[command][MUSIC_VOLUME][level]`, 0–30. ProtocolV2T1.h:4327-4350. */
export function encodeSetVolume(level: number): Uint8Array {
  const clamped = Math.max(0, Math.min(MAX_VOLUME, Math.round(level)));
  return Uint8Array.from([CommandT1.PLAY_SET_PARAM, PlayInquiredType.MUSIC_VOLUME, clamped]);
}

/** Null when the frame is about a different play parameter, such as the track name. */
export function decodeVolume(payload: Uint8Array): number | null {
  if (payload[1] !== PlayInquiredType.MUSIC_VOLUME || payload[2] === undefined) return null;
  return payload[2];
}
