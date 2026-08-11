// Ported from mos9527/SonyHeadphonesClient (MIT) — see /NOTICE.
// Source: src/ProtocolV2T1.h:2118-2588 @ master, src/Headphones.cpp:178-235,1028-1041

import {
  AmbientSoundMode,
  CommandT1,
  NcAsmInquiredType,
  NcAsmMode,
  OnOff,
  ValueChangeStatus,
} from "../constants.js";

/**
 * v1 targets the MODE_NC_ASM_DUAL_NC_MODE_SWITCH_AND_ASM_SEAMLESS variant — the "most universal"
 * fallback upstream itself uses (Headphones.cpp:215-225), and the one that matches a 3-way
 * NC/Ambient/Off control with a continuous 0-20 ambient level. The *_NA (noise-adaptation) variant
 * adds two trailing fields for "auto ambient level" sensitivity and is a documented follow-up —
 * see ProtocolV2T1.h:2504-2537.
 */
const INQUIRED_TYPE = NcAsmInquiredType.MODE_NC_ASM_DUAL_NC_MODE_SWITCH_AND_ASM_SEAMLESS;

export function encodeGetNcAsm(): Uint8Array {
  return Uint8Array.from([CommandT1.NCASM_GET_PARAM, INQUIRED_TYPE]);
}

export interface NcAsmState {
  /** Whether NC+ASM as a whole is enabled (the physical effect is currently active). */
  totalEffectOn: boolean;
  mode: NcAsmMode;
  /** "Focus on voice" — ProtocolV2T1.h:2214-2218. */
  ambientMode: AmbientSoundMode;
  /** 0-20. */
  ambientLevel: number;
  /**
   * False while the headset is still moving to the new setting. Interim frames carry values
   * that are on their way out, so treating them as final makes a freshly changed mode appear
   * to snap back to the old one.
   */
  settled: boolean;
}

/**
 * ProtocolV2T1.h:2474-2500 — 7 bytes:
 * [command][type][valueChangeStatus][ncAsmTotalEffect][ncAsmMode][ambientSoundMode][ambientSoundLevelValue]
 */
export function decodeNcAsm(payload: Uint8Array): NcAsmState {
  if (payload.length !== 7) throw new Error(`NcAsmParamModeNcDualModeSwitchAsmSeamless: expected 7 bytes, got ${payload.length}`);
  return {
    totalEffectOn: payload[3] === OnOff.ON,
    mode: payload[4] as NcAsmMode,
    ambientMode: payload[5] as AmbientSoundMode,
    ambientLevel: payload[6]!,
    settled: payload[2] === ValueChangeStatus.CHANGED,
  };
}

/**
 * Builds a SET_PARAM request. Always sends valueChangeStatus=CHANGED — per the design's write
 * rules (§5.3) only the *final* value of a drag is ever sent, never an in-progress one.
 * Level is clamped to >=1 to match upstream (Headphones.cpp:191, avoids an edge case the real
 * app itself never sends); the UI's "0 · SEALED" end of the slider maps to NC mode instead.
 */
export function encodeSetNcAsm(state: NcAsmState): Uint8Array {
  return Uint8Array.from([
    CommandT1.NCASM_SET_PARAM,
    INQUIRED_TYPE,
    ValueChangeStatus.CHANGED,
    state.totalEffectOn ? OnOff.ON : OnOff.OFF,
    state.mode,
    state.ambientMode,
    Math.max(state.ambientLevel, 1),
  ]);
}

/** Convenience matching the design's 3-way NoiseModeSegmented control. */
export type NoiseMode = "anc" | "ambient" | "off";

export function noiseModeFromState(state: NcAsmState): NoiseMode {
  if (!state.totalEffectOn) return "off";
  return state.mode === NcAsmMode.NC ? "anc" : "ambient";
}

export function applyNoiseMode(state: NcAsmState, mode: NoiseMode): NcAsmState {
  if (mode === "off") return { ...state, totalEffectOn: false };
  return {
    ...state,
    totalEffectOn: true,
    mode: mode === "anc" ? NcAsmMode.NC : NcAsmMode.ASM,
  };
}
