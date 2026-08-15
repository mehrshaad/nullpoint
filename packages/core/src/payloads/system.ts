// Ported from mos9527/SonyHeadphonesClient (MIT) — see /NOTICE.
// Source: src/ProtocolV2T1.h:6078-6100,6831-6852 @ master, src/Headphones.cpp:262-280

import {
  CommandT1,
  DetectSensitivity,
  EnableDisable,
  ModeOutTime,
  SystemInquiredType,
} from "../constants.js";

/**
 * Speak-to-Chat: the headset pauses your music and lets ambient sound through when it hears
 * you start talking.
 *
 * It is split across two messages. Whether it's on lives in the ordinary param
 * (`SystemParamSmartTalking`); how sensitive it is and how long it waits before handing your
 * music back live in the *ext* param (`SystemExtParamSmartTalkingMode2`). Both are needed for a
 * complete picture, and they must be written separately.
 */
export interface SpeakToChatState {
  enabled: boolean;
  sensitivity: DetectSensitivity;
  /** How long it waits after you stop talking. NONE means it never resumes on its own. */
  timeout: ModeOutTime;
}

const TYPE = SystemInquiredType.SMART_TALKING_MODE_TYPE2;

export function encodeGetSpeakToChat(): Uint8Array {
  return Uint8Array.from([CommandT1.SYSTEM_GET_PARAM, TYPE]);
}

export function encodeGetSpeakToChatDetail(): Uint8Array {
  return Uint8Array.from([CommandT1.SYSTEM_GET_EXT_PARAM, TYPE]);
}

/**
 * `[command][type][onOff][previewMode]`. ProtocolV2T1.h:6078-6090.
 *
 * Note EnableDisable is inverted — ENABLE is 0. Preview mode is a demo mode Sony's app uses
 * while explaining the feature; upstream always sends it off (Headphones.cpp:269) and so do we.
 */
export function encodeSetSpeakToChat(enabled: boolean): Uint8Array {
  return Uint8Array.from([
    CommandT1.SYSTEM_SET_PARAM,
    TYPE,
    enabled ? EnableDisable.ENABLE : EnableDisable.DISABLE,
    EnableDisable.DISABLE,
  ]);
}

/** `[command][type][detectSensitivity][modeOffTime]`. ProtocolV2T1.h:6831-6842. */
export function encodeSetSpeakToChatDetail(
  sensitivity: DetectSensitivity,
  timeout: ModeOutTime
): Uint8Array {
  return Uint8Array.from([CommandT1.SYSTEM_SET_EXT_PARAM, TYPE, sensitivity, timeout]);
}

/** Null when the frame is about some other system setting — the headset sends plenty. */
export function decodeSpeakToChatEnabled(payload: Uint8Array): boolean | null {
  if (payload[1] !== TYPE || payload[2] === undefined) return null;
  return payload[2] === EnableDisable.ENABLE;
}

export function decodeSpeakToChatDetail(
  payload: Uint8Array
): { sensitivity: DetectSensitivity; timeout: ModeOutTime } | null {
  if (payload[1] !== TYPE || payload[3] === undefined) return null;
  return {
    sensitivity: payload[2] as DetectSensitivity,
    timeout: payload[3] as ModeOutTime,
  };
}
