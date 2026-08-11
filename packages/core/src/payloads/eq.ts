// Ported from mos9527/SonyHeadphonesClient (MIT) — see /NOTICE.
// Source: src/ProtocolV2T1.h:1564-1984 @ master, src/Headphones.cpp:302-345,1691-1730

import { CommandT1, EqEbbInquiredType, EqPresetId } from "../constants.js";

export function encodeGetEq(): Uint8Array {
  return Uint8Array.from([CommandT1.EQEBB_GET_PARAM, EqEbbInquiredType.PRESET_EQ]);
}

/**
 * Sony ships two different equalizer shapes and the device tells us which by how many band
 * steps it reports. They differ in count, in the dB range, and in the encoding offset, so they
 * cannot be treated as one:
 *
 *   clearBass5  6 steps  Clear Bass + 5 bands, -10..+10 dB, byte = dB + 10
 *   graphic10  10 steps  10 graphic bands (no Clear Bass), -6..+6 dB, byte = dB + 6
 *
 * A WH-1000XM6 on firmware 3.1.5 reports the 10-band shape.
 */
export type EqLayout = "clearBass5" | "graphic10";

export interface EqLayoutSpec {
  labels: string[];
  /** Value added to the dB figure to get the wire byte. */
  offset: number;
  min: number;
  max: number;
  /** True when the first band is Clear Bass rather than a frequency band. */
  hasClearBass: boolean;
}

export const EQ_LAYOUTS: Record<EqLayout, EqLayoutSpec> = {
  clearBass5: {
    labels: ["CLEAR\nBASS", "400", "1k", "2.5k", "6.3k", "16k"],
    offset: 10,
    min: -10,
    max: 10,
    hasClearBass: true,
  },
  graphic10: {
    labels: ["31", "63", "125", "250", "500", "1k", "2k", "4k", "8k", "16k"],
    offset: 6,
    min: -6,
    max: 6,
    hasClearBass: false,
  },
};

export interface EqBands {
  layout: EqLayout;
  /** dB values in the device's own band order. */
  values: number[];
}

export interface EqState {
  preset: EqPresetId;
  /** null when the device reports no editable bands, or a shape we do not understand. */
  bands: EqBands | null;
}

function layoutForStepCount(count: number): EqLayout | null {
  if (count === 6) return "clearBass5";
  if (count === 10) return "graphic10";
  return null;
}

/**
 * ProtocolV2T1.h:1943-1984 — [command][type=0x00][presetId][numberOfBandStep][bandSteps...].
 * Upstream's capture comment (Headphones.cpp:1693-1694):
 *   "[RET/NOTIFY 00 a2 06] 0a/bass 0a/band1 … — values have +10 offset"
 *
 * Never throws on an unfamiliar shape: this runs on the transport's read loop, and a throw
 * there would tear down the whole session over one unreadable frame (PLAN.md §8).
 */
export function decodeEq(payload: Uint8Array): EqState {
  const preset = payload[2] as EqPresetId;
  const count = payload[3] ?? 0;
  if (count === 0) return { preset, bands: null };

  const layout = layoutForStepCount(count);
  if (!layout) {
    console.warn(`[ssc/core] unrecognised EQ band count: ${count}; ignoring band values`);
    return { preset, bands: null };
  }

  const { offset } = EQ_LAYOUTS[layout];
  const steps = payload.subarray(4, 4 + count);
  if (steps.length < count) {
    console.warn(`[ssc/core] truncated EQ payload: expected ${count} steps, got ${steps.length}`);
    return { preset, bands: null };
  }
  return { preset, bands: { layout, values: Array.from(steps, (b) => b - offset) } };
}

/** ProtocolV2T1.h:1943-1984, Headphones.cpp:302-306 — change preset only, no band payload. */
export function encodeSetPreset(preset: EqPresetId): Uint8Array {
  return Uint8Array.from([CommandT1.EQEBB_SET_PARAM, EqEbbInquiredType.PRESET_EQ, preset, 0]);
}

/** ProtocolV2T1.h:1943-1984, Headphones.cpp:311-345 — set band values for the reported shape. */
export function encodeSetBands(preset: EqPresetId, bands: EqBands): Uint8Array {
  const spec = EQ_LAYOUTS[bands.layout];
  const encoded = bands.values.map(
    (dB) => Math.max(spec.min, Math.min(spec.max, Math.round(dB))) + spec.offset
  );
  return Uint8Array.from([
    CommandT1.EQEBB_SET_PARAM,
    EqEbbInquiredType.PRESET_EQ,
    preset,
    encoded.length,
    ...encoded,
  ]);
}
