// Ported from mos9527/SonyHeadphonesClient (MIT) — see /NOTICE.
// Source: src/ProtocolV2T1.h:2118-2588 @ master, src/Headphones.cpp:178-235,1028-1041

import {
  AmbientSoundMode,
  CommandT1,
  FunctionTypeT1,
  NcAsmInquiredType,
  NcAsmMode,
  NoiseAdaptiveSensitivity,
  OnOff,
  ValueChangeStatus,
} from "../constants.js";

/**
 * Which shape of the NC/ASM message this headset speaks.
 *
 * `seamless` is the "most universal" form upstream falls back to (Headphones.cpp:215-225).
 * `seamlessNa` adds two trailing fields — noise adaptation on/off and its sensitivity — which
 * is what Sony's app calls **auto ambient level**, and is the only reason that control can do
 * anything at all. ProtocolV2T1.h:2474-2537.
 */
export type NcAsmVariant = "seamless" | "seamlessNa";

const INQUIRED_TYPE: Record<NcAsmVariant, NcAsmInquiredType> = {
  seamless: NcAsmInquiredType.MODE_NC_ASM_DUAL_NC_MODE_SWITCH_AND_ASM_SEAMLESS,
  seamlessNa: NcAsmInquiredType.MODE_NC_ASM_DUAL_NC_MODE_SWITCH_AND_ASM_SEAMLESS_NA,
};

/**
 * Picks the message shape from the capability bitmap, never from the model name (PLAN.md
 * standing rule 4). The order matches upstream (Headphones.cpp:184-195).
 *
 * This is only the opening guess. Whichever shape the headset actually replies in wins, because
 * the reply is direct evidence and the bitmap is an inference — see `Headphones.handleFrame`.
 * A WH-1000XM6 on FW 3.1.5 advertises 0x6D and not 0x6B, so it lands on the noise-adaptation
 * form either way.
 */
export function ncAsmVariantFor(supportedFunctions: Set<number>): NcAsmVariant {
  if (supportedFunctions.has(FunctionTypeT1.MODE_NC_ASM_NOISE_CANCELLING_DUAL_AMBIENT_SOUND_MODE_LEVEL_ADJUSTMENT)) {
    return "seamless";
  }
  if (
    supportedFunctions.has(
      FunctionTypeT1.MODE_NC_ASM_NOISE_CANCELLING_DUAL_AMBIENT_SOUND_MODE_LEVEL_ADJUSTMENT_NOISE_ADAPTATION
    )
  ) {
    return "seamlessNa";
  }
  return "seamless";
}

export function encodeGetNcAsm(variant: NcAsmVariant = "seamless"): Uint8Array {
  return Uint8Array.from([CommandT1.NCASM_GET_PARAM, INQUIRED_TYPE[variant]]);
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
  /**
   * "Auto ambient level" — the headset adapts the ambient level to how noisy your surroundings
   * are. Null on headphones that don't speak the noise-adaptation variant, which is how the UI
   * knows to hide the control rather than show one that writes nothing.
   */
  autoAmbient: { enabled: boolean; sensitivity: NoiseAdaptiveSensitivity } | null;
}

/**
 * Reads either shape, choosing by the inquired type the *device* sent rather than by what we
 * think it supports — the frame describes itself, so there is no need to guess.
 *
 *   seamless   (7 bytes) [command][type][valueChangeStatus][totalEffect][mode][ambientMode][level]
 *   seamlessNa (9 bytes) …the same, then [noiseAdaptiveOnOff][noiseAdaptiveSensitivity]
 *
 * ProtocolV2T1.h:2474-2537.
 */
export function decodeNcAsm(payload: Uint8Array): NcAsmState {
  const na = payload[1] === NcAsmInquiredType.MODE_NC_ASM_DUAL_NC_MODE_SWITCH_AND_ASM_SEAMLESS_NA;
  const expected = na ? 9 : 7;
  if (payload.length !== expected) {
    throw new Error(
      `NcAsmParam${na ? "…Na" : ""}: expected ${expected} bytes, got ${payload.length}`
    );
  }
  return {
    totalEffectOn: payload[3] === OnOff.ON,
    mode: payload[4] as NcAsmMode,
    ambientMode: payload[5] as AmbientSoundMode,
    ambientLevel: payload[6]!,
    settled: payload[2] === ValueChangeStatus.CHANGED,
    autoAmbient: na
      ? { enabled: payload[7] === OnOff.ON, sensitivity: payload[8] as NoiseAdaptiveSensitivity }
      : null,
  };
}

/**
 * Builds a SET_PARAM request. Always sends valueChangeStatus=CHANGED — per the design's write
 * rules (§5.3) only the *final* value of a drag is ever sent, never an in-progress one.
 * Level is clamped to >=1 to match upstream (Headphones.cpp:191, avoids an edge case the real
 * app itself never sends); the UI's "0 · SEALED" end of the slider maps to NC mode instead.
 */
export function encodeSetNcAsm(state: NcAsmState, variant: NcAsmVariant = "seamless"): Uint8Array {
  const base = [
    CommandT1.NCASM_SET_PARAM,
    INQUIRED_TYPE[variant],
    ValueChangeStatus.CHANGED,
    state.totalEffectOn ? OnOff.ON : OnOff.OFF,
    state.mode,
    state.ambientMode,
    Math.max(state.ambientLevel, 1),
  ];
  if (variant !== "seamlessNa") return Uint8Array.from(base);
  // The headset requires both trailing fields even when it is only the level that changed, so
  // default rather than omit when we have never been told what they are.
  return Uint8Array.from([
    ...base,
    state.autoAmbient?.enabled ? OnOff.ON : OnOff.OFF,
    state.autoAmbient?.sensitivity ?? NoiseAdaptiveSensitivity.STANDARD,
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
