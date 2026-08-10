// Ported from mos9527/SonyHeadphonesClient (MIT) — see /NOTICE.
// Source: src/ProtocolV2T1.h:1564-1984 @ master, src/Headphones.cpp:302-324,1691-1712

import { CommandT1, EqEbbInquiredType, EqPresetId } from "../constants.js";

export function encodeGetEq(): Uint8Array {
  return Uint8Array.from([CommandT1.EQEBB_GET_PARAM, EqEbbInquiredType.PRESET_EQ]);
}

export interface EqBands {
  /** All values are dB, range -10..+10. */
  clearBass: number;
  band400: number;
  band1k: number;
  band2_5k: number;
  band6_3k: number;
  band16k: number;
}

export interface EqState {
  preset: EqPresetId;
  bands: EqBands | null; // null when the device reports 0 band steps (preset with no editable bands)
}

/**
 * ProtocolV2T1.h:1943-1984 — [command][type=0x00][presetId][numberOfBandStep][bandSteps...].
 * Upstream's own capture comment (Headphones.cpp:1693-1694):
 *   "[RET/NOTIFY 00 a2 06] 0a/bass 0a/band1 0a/band2 0a/band3 0a/band4 0a/band5 — values have +10 offset"
 * i.e. bandSteps[0] is Clear Bass, bandSteps[1..5] are 400/1k/2.5k/6.3k/16k, each byte = dB + 10.
 * A device reporting a 10-band graphic EQ (older non-WH-1000X models) uses a different +6 offset
 * and no Clear Bass slot — out of v1 scope (WH-1000XM6 is the 6-step shape).
 */
export function decodeEq(payload: Uint8Array): EqState {
  const preset = payload[2] as EqPresetId;
  const numberOfBandStep = payload[3];
  if (numberOfBandStep === 0) return { preset, bands: null };
  if (numberOfBandStep !== 6) {
    throw new Error(`Unsupported EQ band count: ${numberOfBandStep} (v1 only supports the 6-step Clear-Bass+5-band shape)`);
  }
  const steps = payload.subarray(4, 10);
  return {
    preset,
    bands: {
      clearBass: steps[0]! - 10,
      band400: steps[1]! - 10,
      band1k: steps[2]! - 10,
      band2_5k: steps[3]! - 10,
      band6_3k: steps[4]! - 10,
      band16k: steps[5]! - 10,
    },
  };
}

/** ProtocolV2T1.h:1943-1984, Headphones.cpp:302-306 — change preset only, no band payload. */
export function encodeSetPreset(preset: EqPresetId): Uint8Array {
  return Uint8Array.from([CommandT1.EQEBB_SET_PARAM, EqEbbInquiredType.PRESET_EQ, preset, 0]);
}

/**
 * ProtocolV2T1.h:1943-1984, Headphones.cpp:311-324 — set custom band values. Bands are only
 * settable while EqPresetId.CUSTOM is active (WH-1000XM6 FW 3.0.0 constraint — PLAN.md §3).
 */
export function encodeSetBands(preset: EqPresetId, bands: EqBands): Uint8Array {
  const clamp = (dB: number) => Math.max(-10, Math.min(10, dB)) + 10;
  return Uint8Array.from([
    CommandT1.EQEBB_SET_PARAM,
    EqEbbInquiredType.PRESET_EQ,
    preset,
    6,
    clamp(bands.clearBass),
    clamp(bands.band400),
    clamp(bands.band1k),
    clamp(bands.band2_5k),
    clamp(bands.band6_3k),
    clamp(bands.band16k),
  ]);
}
