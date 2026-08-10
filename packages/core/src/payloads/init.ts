// Ported from mos9527/SonyHeadphonesClient (MIT) — see /NOTICE.
// Source: src/ProtocolV2T1.h @ master (CONNECT_* region, lines ~380-760), src/Headphones.cpp:510-723

import { CommandT1, ConnectInquiredType, DeviceInfoType } from "../constants.js";

/** ProtocolV2T1.h:401-419 — request the device's protocol-version + Table1/Table2 support flags. */
export function encodeGetProtocolInfo(): Uint8Array {
  return Uint8Array.from([CommandT1.CONNECT_GET_PROTOCOL_INFO, ConnectInquiredType.FIXED_VALUE]);
}

export interface ProtocolInfo {
  /** Big-endian 32-bit version, per the double byte-swap round trip in ProtocolV2T1.h:428-445. */
  protocolVersion: number;
  supportsTable1: boolean;
  supportsTable2: boolean;
}

/**
 * ProtocolV2T1.h:425-455.
 * `MessageMdrV2EnableDisable` is ENABLE=0 / DISABLE=1 (inverted from a naive boolean read) —
 * Constants.h ~line 80.
 */
export function decodeRetProtocolInfo(payload: Uint8Array): ProtocolInfo {
  if (payload.length !== 8) throw new Error(`ConnectRetProtocolInfo: expected 8 bytes, got ${payload.length}`);
  const view = new DataView(payload.buffer, payload.byteOffset + 2, 4);
  return {
    protocolVersion: view.getUint32(0, false),
    supportsTable1: payload[6] === 0,
    supportsTable2: payload[7] === 0,
  };
}

/** ProtocolV2T1.h:466-484 — no fields beyond the header; response presence is itself the useful signal. */
export function encodeGetCapabilityInfo(): Uint8Array {
  return Uint8Array.from([CommandT1.CONNECT_GET_CAPABILITY_INFO, ConnectInquiredType.FIXED_VALUE]);
}

/** ProtocolV2T1.h:550-568 */
export function encodeGetDeviceInfo(type: DeviceInfoType): Uint8Array {
  return Uint8Array.from([CommandT1.CONNECT_GET_DEVICE_INFO, type]);
}

/**
 * Decodes MODEL_NAME / FW_VERSION responses: [command][type][length][chars...].
 * ProtocolV2T1.h:594-656. SERIES_AND_COLOR_INFO has a different, fixed-size shape and is not
 * decoded here (out of v1 scope).
 */
export function decodeRetDeviceInfoString(payload: Uint8Array): { type: DeviceInfoType; value: string } {
  const type = payload[1] as DeviceInfoType;
  const length = payload[2]!;
  const bytes = payload.subarray(3, 3 + length);
  const value = new TextDecoder("utf-8").decode(bytes);
  return { type, value };
}

/** ProtocolV2T1.h:688-706 */
export function encodeGetSupportFunction(): Uint8Array {
  return Uint8Array.from([CommandT1.CONNECT_GET_SUPPORT_FUNCTION, ConnectInquiredType.FIXED_VALUE]);
}

/**
 * Decodes the capability bitmap: [command][inquiredType][count][(functionType, priority) x count].
 * ProtocolV2T1.h:712-740, MessageMdrV2SupportFunction = 2-byte {functionType, priority} — Constants.h:550-558.
 * Returns the set of supported function-type byte codes (Table1 namespace, since this is the
 * Table1 CONNECT_GET_SUPPORT_FUNCTION request).
 */
export function decodeRetSupportFunction(payload: Uint8Array): Set<number> {
  const count = payload[2]!;
  const supported = new Set<number>();
  for (let i = 0; i < count; i++) {
    const functionType = payload[3 + i * 2]!;
    supported.add(functionType);
  }
  return supported;
}
