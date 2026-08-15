// Ported from mos9527/SonyHeadphonesClient (MIT) — see /NOTICE.
// Source: src/Constants.h @ master

/** RFCOMM/SPP service UUID Sony headphones advertise ("Serial HPC"). Constants.h:39 */
export const SONY_SPP_SERVICE_UUID = "956C7B26-D49A-4BA8-B03F-B17D393CB6E2";

/** Frame delimiters. Constants.h:18-19 */
export const START_MARKER = 0x3e; // '>'
export const END_MARKER = 0x3c; // '<'

/** Escape sentinel + escaped codes. CommandSerializer.cpp */
export const ESCAPE_SENTINEL = 0x3d;
export const ESCAPED_60 = 44; // 0x3C -> 0x3D 0x2C
export const ESCAPED_61 = 45; // 0x3D -> 0x3D 0x2D
export const ESCAPED_62 = 46; // 0x3E -> 0x3D 0x2E

/** Constants.h:18 */
export const MAX_BLUETOOTH_MESSAGE_SIZE = 2048;

/** Outer frame envelope type. Constants.h:52-68 */
export enum DataType {
  DATA = 0,
  ACK = 1,
  DATA_MC_NO1 = 2,
  DATA_ICD = 9,
  DATA_EV = 10,
  /** Carries THMSGV2T1 (Protocol V2 Table 1) messages. Headphones.cpp:1825 */
  DATA_MDR = 12,
  DATA_COMMON = 13,
  /** Carries THMSGV2T2 (Protocol V2 Table 2) messages. Headphones.cpp:1945 */
  DATA_MDR_NO2 = 14,
  SHOT = 16,
  SHOT_MC_NO1 = 18,
  SHOT_ICD = 25,
  SHOT_EV = 26,
  SHOT_MDR = 28,
  SHOT_COMMON = 29,
  SHOT_MDR_NO2 = 30,
  LARGE_DATA_COMMON = 45,
  UNKNOWN = 0xff,
}

/** Request/response role a payload plays in the RET/SET/NTFY family. Constants.h:70 */
export enum CommandType {
  Get = 0,
  Ret = 1,
  Set = 2,
  Notify = 3,
}

/**
 * Protocol V2 Table 1 command IDs (the first byte of the DATA_MDR payload).
 * Subset actually used by v1 features — full table is ProtocolV2T1.h:17-104.
 */
export enum CommandT1 {
  CONNECT_GET_PROTOCOL_INFO = 0x00,
  CONNECT_RET_PROTOCOL_INFO = 0x01,
  CONNECT_GET_CAPABILITY_INFO = 0x02,
  CONNECT_RET_CAPABILITY_INFO = 0x03,
  CONNECT_GET_DEVICE_INFO = 0x04,
  CONNECT_RET_DEVICE_INFO = 0x05,
  CONNECT_GET_SUPPORT_FUNCTION = 0x06,
  CONNECT_RET_SUPPORT_FUNCTION = 0x07,

  POWER_GET_STATUS = 0x22,
  POWER_RET_STATUS = 0x23,
  /** Pushed by the headset when the charge level changes, without being asked. */
  POWER_NTFY_STATUS = 0x25,

  EQEBB_GET_PARAM = 0x56,
  EQEBB_RET_PARAM = 0x57,
  EQEBB_SET_PARAM = 0x58,
  EQEBB_NTFY_PARAM = 0x59,

  NCASM_GET_PARAM = 0x66,
  NCASM_RET_PARAM = 0x67,
  NCASM_SET_PARAM = 0x68,
  NCASM_NTFY_PARAM = 0x69,

  /** Connection quality and DSEE upscaling live here. ProtocolV2T1.h:182-192 */
  AUDIO_GET_PARAM = 0xe6,
  AUDIO_RET_PARAM = 0xe7,
  AUDIO_SET_PARAM = 0xe8,
  AUDIO_NTFY_PARAM = 0xe9,

  /** Speak-to-Chat lives here, across both the param and ext-param pairs. ProtocolV2T1.h:194-210 */
  SYSTEM_GET_PARAM = 0xf6,
  SYSTEM_RET_PARAM = 0xf7,
  SYSTEM_SET_PARAM = 0xf8,
  SYSTEM_NTFY_PARAM = 0xf9,
  SYSTEM_GET_EXT_PARAM = 0xfa,
  SYSTEM_RET_EXT_PARAM = 0xfb,
  SYSTEM_SET_EXT_PARAM = 0xfc,
  SYSTEM_NTFY_EXT_PARAM = 0xfd,
}

/** ProtocolV2T1.h:4855-4869 */
export enum AudioInquiredType {
  CONNECTION_MODE = 0x00,
  UPSCALING = 0x01,
}

/** ProtocolV2T1.h:5595-5638 (subset). */
export enum SystemInquiredType {
  SMART_TALKING_MODE_TYPE2 = 0x0c,
}

/**
 * Constants.h:82-94. **Note the inversion**: `ENABLE` is 0 and `DISABLE` is 1, the opposite of
 * the OnOff enum used elsewhere in the same protocol. Assuming the usual mapping here silently
 * inverts every setting that uses it.
 */
export enum EnableDisable {
  ENABLE = 0,
  DISABLE = 1,
}

/** Bluetooth connection quality — the LDAC 990kbps vs. stable-link tradeoff. ProtocolV2T1.h:4909-4914 */
export enum PriorMode {
  SOUND_QUALITY = 0x00,
  CONNECTION_QUALITY = 0x01,
  LOW_LATENCY_BETA = 0x02,
}

/** DSEE Extreme. ProtocolV2T1.h:4928-4932 */
export enum UpscalingTypeAutoOff {
  OFF = 0x00,
  AUTO = 0x01,
}

/** How readily Speak-to-Chat decides you're talking. ProtocolV2T1.h:6474-6479 */
export enum DetectSensitivity {
  AUTO = 0x00,
  HIGH = 0x01,
  LOW = 0x02,
}

/** How long Speak-to-Chat waits before handing you back your music. ProtocolV2T1.h:6493-6499 */
export enum ModeOutTime {
  FAST = 0x00,
  MID = 0x01,
  SLOW = 0x02,
  /** Never resumes on its own. */
  NONE = 0x03,
}

/**
 * Protocol V2 **Table 2** command IDs — a separate command space carried in DATA_MDR_NO2
 * frames, so the same byte means different things here and in CommandT1. Subset used by v1.
 * ProtocolV2T2.h:33-47
 */
export enum CommandT2 {
  PERI_GET_PARAM = 0x36,
  PERI_RET_PARAM = 0x37,
  PERI_SET_PARAM = 0x38,
  PERI_NTFY_PARAM = 0x39,
  /** How connect/disconnect is issued — the device list has no SET form. ProtocolV2T2.h:1024-1084 */
  PERI_SET_EXTENDED_PARAM = 0x3c,
  PERI_NTFY_EXTENDED_PARAM = 0x3d,
}

/** ProtocolV2T2.h:313-315 */
export enum PeripheralInquiredType {
  PAIRING_DEVICE_MANAGEMENT_CLASSIC_BT = 0x00,
  PAIRING_DEVICE_MANAGEMENT_WITH_BLUETOOTH_CLASS_OF_DEVICE = 0x02,
}

/**
 * ProtocolV2T2.h:932-937. `UNPAIR = 0x02` also exists and is deliberately left out: it cannot
 * be undone from this app, and nothing in the product needs it.
 */
export enum ConnectivityActionType {
  DISCONNECT = 0x00,
  CONNECT = 0x01,
}

/**
 * ProtocolV2T2.h:951-972. The high nibble repeats the action and the low nibble is the
 * outcome, so the outcome alone is `result & 0x0f`.
 */
export enum PeripheralOutcome {
  SUCCESS = 0x0,
  ERROR = 0x1,
  IN_PROGRESS = 0x2,
  BUSY = 0x3,
}

/** ProtocolV2T1.h:382-395 */
export enum ConnectInquiredType {
  FIXED_VALUE = 0,
}

/** ProtocolV2T1.h:492-498 */
export enum DeviceInfoType {
  MODEL_NAME = 1,
  FW_VERSION = 2,
  SERIES_AND_COLOR_INFO = 3,
  INSTRUCTION_GUIDE = 4,
}

/**
 * Function-type byte reported in CONNECT_RET_SUPPORT_FUNCTION and used to gate which
 * feature Get/Set calls a device supports. Subset used by v1 — full table is
 * Constants.h:178-290 (MessageMdrV2FunctionType_Table1).
 */
export enum FunctionTypeT1 {
  BATTERY_LEVEL_INDICATOR = 0x20,
  LEFT_RIGHT_BATTERY_LEVEL_INDICATOR = 0x21,
  CRADLE_BATTERY_LEVEL_INDICATOR = 0x22,
  BATTERY_LEVEL_WITH_THRESHOLD = 0x28,
  PRESET_EQ = 0x50,
  PRESET_EQ_NON_CUSTOMIZABLE = 0x52,
  NOISE_CANCELLING_ONOFF_AND_AMBIENT_SOUND_MODE_ONOFF = 0x62,
  NOISE_CANCELLING_ONOFF_AND_AMBIENT_SOUND_MODE_LEVEL_ADJUSTMENT = 0x64,
  AMBIENT_SOUND_MODE_LEVEL_ADJUSTMENT = 0x67,
  MODE_NC_ASM_NOISE_CANCELLING_DUAL_AUTO_AMBIENT_SOUND_MODE_LEVEL_ADJUSTMENT = 0x68,
  MODE_NC_ASM_NOISE_CANCELLING_DUAL_AMBIENT_SOUND_MODE_LEVEL_ADJUSTMENT = 0x6b,
  MODE_NC_ASM_NOISE_CANCELLING_DUAL_AMBIENT_SOUND_MODE_LEVEL_ADJUSTMENT_NOISE_ADAPTATION = 0x6d,
  CONNECTION_MODE_SOUND_QUALITY_CONNECTION_QUALITY = 0xe1,
  UPSCALING_AUTO_OFF = 0xe2,
  SMART_TALKING_MODE_TYPE2 = 0xfc,
}

/** ProtocolV2T1.h:2120-2136 */
export enum NcAsmInquiredType {
  NC_ON_OFF = 0x1,
  MODE_NC_ASM_DUAL_NC_MODE_SWITCH_AND_ASM_SEAMLESS = 0x17,
  MODE_NC_ASM_DUAL_NC_MODE_SWITCH_AND_ASM_SEAMLESS_NA = 0x19,
  ASM_ON_OFF = 0x21,
  ASM_SEAMLESS = 0x22,
}

/** How eagerly the headset adapts the ambient level to your surroundings. ProtocolV2T1.h:2231-2236 */
export enum NoiseAdaptiveSensitivity {
  STANDARD = 0,
  HIGH = 1,
  LOW = 2,
}

/** ProtocolV2T1.h:2163-2167 */
export enum ValueChangeStatus {
  UNDER_CHANGING = 0,
  CHANGED = 1,
}

/** ProtocolV2T1.h:2180-2184 */
export enum OnOff {
  OFF = 0,
  ON = 1,
}

/** ProtocolV2T1.h:2197-2201 */
export enum NcAsmMode {
  NC = 0,
  ASM = 1,
}

/** ProtocolV2T1.h:2214-2218 */
export enum AmbientSoundMode {
  NORMAL = 0,
  VOICE = 1,
}

/** ProtocolV2T1.h:899-917 */
export enum PowerInquiredType {
  BATTERY = 0x00,
  LEFT_RIGHT_BATTERY = 0x01,
  CRADLE_BATTERY = 0x02,
  BATTERY_WITH_THRESHOLD = 0x08,
}

/** ProtocolV2T1.h:998-1004 */
export enum BatteryChargingStatus {
  NOT_CHARGING = 0,
  CHARGING = 1,
  UNKNOWN = 2,
  CHARGED = 3,
}

/** ProtocolV2T1.h:1527-1545 */
export enum EqEbbInquiredType {
  PRESET_EQ = 0x00,
}

/**
 * Preset IDs. HEAVY..SOFT + CUSTOM match the WH-1000XM6 FW 3.0.0 constraint documented in
 * mos9527 PR #48 (docs/device-support/WH-1000XM6.md): those are the only presets that accept
 * user-set band values. ProtocolV2T1.h:1564-1625
 */
export enum EqPresetId {
  OFF = 0x00,
  HEAVY = 0x30,
  CLEAR = 0x31,
  HARD = 0x32,
  SOFT = 0x33,
  CUSTOM = 0xa0,
  UNSPECIFIED = 0xff,
}
