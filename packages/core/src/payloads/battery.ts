// Ported from mos9527/SonyHeadphonesClient (MIT) — see /NOTICE.
// Source: src/ProtocolV2T1.h:895-1227 @ master, src/Headphones.cpp:727-754,1078-1130

import {
  AutoPowerOff,
  BatteryChargingStatus,
  CommandT1,
  PowerInquiredType,
  PowerOffSettingValue,
} from "../constants.js";

/**
 * Ask the headphones to switch themselves off. ProtocolV2T1.h:1269-1286 —
 * `[POWER_SET_STATUS][POWER_OFF][USER_POWER_OFF]`. The other documented value is a factory
 * power-off which the firmware itself rejects from this message, so it isn't offered.
 */
export function encodePowerOff(): Uint8Array {
  return Uint8Array.from([
    CommandT1.POWER_SET_STATUS,
    PowerInquiredType.POWER_OFF,
    PowerOffSettingValue.USER_POWER_OFF,
  ]);
}

/**
 * Auto power off, in the wearing-detection form — the one a WH-1000XM6 advertises (0x25).
 * ProtocolV2T1.h:1442-1464: `[command][inquiredType][current][lastSelected]`.
 */
export function encodeGetAutoPowerOff(): Uint8Array {
  return Uint8Array.from([
    CommandT1.POWER_GET_PARAM,
    PowerInquiredType.AUTO_POWER_OFF_WEARING_DETECTION,
  ]);
}

/**
 * `lastSelected` is what the headset falls back to when a timeout is re-enabled after being
 * turned off, so it must stay a real duration. Upstream pins it to five minutes
 * (Headphones.cpp:396-401) and so do we — sending the current value would make "disabled"
 * the thing it restores to, which is not a duration at all.
 */
export function encodeSetAutoPowerOff(value: AutoPowerOff): Uint8Array {
  return Uint8Array.from([
    CommandT1.POWER_SET_PARAM,
    PowerInquiredType.AUTO_POWER_OFF_WEARING_DETECTION,
    value,
    AutoPowerOff.AFTER_5_MIN,
  ]);
}

/** Null when the frame is about some other power parameter. */
export function decodeAutoPowerOff(payload: Uint8Array): AutoPowerOff | null {
  if (payload[1] !== PowerInquiredType.AUTO_POWER_OFF_WEARING_DETECTION) return null;
  if (payload[2] === undefined) return null;
  return payload[2] as AutoPowerOff;
}

export function encodeGetBattery(type: PowerInquiredType = PowerInquiredType.BATTERY): Uint8Array {
  return Uint8Array.from([CommandT1.POWER_GET_STATUS, type]);
}

export interface BatteryStatus {
  level: number; // 0-100
  charging: BatteryChargingStatus;
}

/**
 * ProtocolV2T1.h:1117-1127 — [command][PowerInquiredType.BATTERY][level 0-100][chargingStatus].
 * Single-unit battery (headphones with one shared cell, e.g. WH-1000XM-series over-ear).
 */
export function decodeRetBattery(payload: Uint8Array): BatteryStatus {
  if (payload.length !== 4) throw new Error(`PowerRetStatusBattery: expected 4 bytes, got ${payload.length}`);
  return {
    level: payload[2]!,
    charging: payload[3] as BatteryChargingStatus,
  };
}

export interface LeftRightBatteryStatus {
  left: BatteryStatus;
  right: BatteryStatus;
}

/** ProtocolV2T1.h:1131-1146 — earbuds with independently reported L/R cells. */
export function decodeRetLeftRightBattery(payload: Uint8Array): LeftRightBatteryStatus {
  if (payload.length !== 6) throw new Error(`PowerRetStatusLeftRightBattery: expected 6 bytes, got ${payload.length}`);
  return {
    left: { level: payload[2]!, charging: payload[3] as BatteryChargingStatus },
    right: { level: payload[4]!, charging: payload[5] as BatteryChargingStatus },
  };
}
