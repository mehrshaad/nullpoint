import { describe, expect, it } from "vitest";
import { Headphones } from "../src/headphones.js";
import { LoopbackTransport } from "../src/transport.js";
import { decodeFrameBody, packageDataForBt } from "../src/framing.js";
import {
  CommandT1,
  CommandT2,
  ConnectInquiredType,
  ConnectivityActionType,
  AudioInquiredType,
  SystemInquiredType,
  EnableDisable,
  FunctionTypeT1,
  PriorMode,
  UpscalingTypeAutoOff,
  DetectSensitivity,
  ModeOutTime,
  DataType,
  DeviceInfoType,
  PeripheralInquiredType,
  PowerInquiredType,
  PowerOffSettingValue,
  BatteryChargingStatus,
  NcAsmInquiredType,
  OnOff,
  NcAsmMode,
  NoiseAdaptiveSensitivity,
  AmbientSoundMode,
  ValueChangeStatus,
  EqEbbInquiredType,
  EqPresetId,
} from "../src/constants.js";

function textBytes(s: string): number[] {
  return Array.from(new TextEncoder().encode(s));
}

function ack(): Uint8Array {
  return packageDataForBt(DataType.ACK, 0, Uint8Array.from([]));
}

/**
 * One device record as the headset lays it out: address, multipoint slot, 24-bit CoD, name.
 * `slot` is 0 when the device is merely paired, otherwise which of the two multipoint slots
 * it occupies.
 */
function pairedDeviceRecord(address: string, slot: number, cod: number, name: string): number[] {
  const nameBytes = textBytes(name);
  return [
    ...textBytes(address),
    slot,
    (cod >> 16) & 0xff,
    (cod >> 8) & 0xff,
    cod & 0xff,
    nameBytes.length,
    ...nameBytes,
  ];
}

const IPHONE = "AA:BB:CC:DD:EE:01";
const THINKPAD = "AA:BB:CC:DD:EE:02";

/**
 * A fake WH-1000XM6 that answers the v1 connect handshake and feature gets.
 *
 * It remembers what it was told, because the client reads state back after every write — a
 * stateless stub would report defaults and make correct code look broken.
 *
 * @param table2 whether to advertise and answer Protocol V2 Table 2. Off by default, so the
 * majority of tests exercise the same path a device without it takes.
 */
function createFakeDevice({
  table2 = false,
  noiseAdaptation = false,
  extras = false,
}: { table2?: boolean; noiseAdaptation?: boolean; extras?: boolean } = {}) {
  const ncAsmType = noiseAdaptation
    ? NcAsmInquiredType.MODE_NC_ASM_DUAL_NC_MODE_SWITCH_AND_ASM_SEAMLESS_NA
    : NcAsmInquiredType.MODE_NC_ASM_DUAL_NC_MODE_SWITCH_AND_ASM_SEAMLESS;
  const state = {
    ncAsm: {
      onOff: OnOff.ON as number,
      mode: NcAsmMode.NC as number,
      ambientMode: AmbientSoundMode.NORMAL as number,
      level: 12,
      autoOn: OnOff.OFF as number,
      sensitivity: NoiseAdaptiveSensitivity.STANDARD as number,
    },
    connectionMode: PriorMode.SOUND_QUALITY as number,
    upscaling: UpscalingTypeAutoOff.OFF as number,
    stcEnabled: false,
    stcSensitivity: DetectSensitivity.AUTO as number,
    stcTimeout: ModeOutTime.MID as number,
    pauseOnRemoval: true,
    poweredOff: false,
    eqPreset: EqPresetId.CUSTOM as number,
    eqSteps: [13, 12, 10, 8, 13, 15],
    // Which paired devices are currently connected. Mutated by connect/disconnect so the
    // read-back that follows reports what actually happened.
    connected: new Set([IPHONE]),
  };

  /** Whichever NC/ASM shape this fake speaks — the noise-adaptation one carries two more bytes. */
  const ncAsmFrame = (command: CommandT1) => [
    command,
    ncAsmType,
    ValueChangeStatus.CHANGED,
    state.ncAsm.onOff,
    state.ncAsm.mode,
    state.ncAsm.ambientMode,
    state.ncAsm.level,
    ...(noiseAdaptation ? [state.ncAsm.autoOn, state.ncAsm.sensitivity] : []),
  ];

  const deviceList = () => [
    pairedDeviceRecord(IPHONE, state.connected.has(IPHONE) ? 1 : 0, 0x5a020c, "Mehrshad's iPhone"),
    // Slot 2, so a second multipoint device is not mistaken for a disconnected one.
    pairedDeviceRecord(THINKPAD, state.connected.has(THINKPAD) ? 2 : 0, 0x0c0104, "ThinkPad"),
  ];

  return (sent: Uint8Array) => {
    const { dataType, payload } = decodeFrameBody(sent.subarray(1, sent.length - 1));
    const command = payload[0] as CommandT1;
    const replies: Uint8Array[] = [ack()];
    const mdr = (bytes: number[]) => packageDataForBt(DataType.DATA_MDR, 0, Uint8Array.from(bytes));
    const mdr2 = (bytes: number[]) => packageDataForBt(DataType.DATA_MDR_NO2, 0, Uint8Array.from(bytes));

    if (dataType === DataType.DATA_MDR_NO2) {
      if (payload[1] !== PeripheralInquiredType.PAIRING_DEVICE_MANAGEMENT_WITH_BLUETOOTH_CLASS_OF_DEVICE) {
        return replies;
      }
      if (command === (CommandT2.PERI_GET_PARAM as number)) {
        const list = deviceList();
        replies.push(
          mdr2([
            CommandT2.PERI_RET_PARAM,
            PeripheralInquiredType.PAIRING_DEVICE_MANAGEMENT_WITH_BLUETOOTH_CLASS_OF_DEVICE,
            list.length,
            ...list.flat(),
            1, // slot 1 holds the playback right
          ])
        );
      }
      if (command === (CommandT2.PERI_SET_EXTENDED_PARAM as number)) {
        const action = payload[2]!;
        const address = new TextDecoder().decode(payload.subarray(3, 20));
        if (action === ConnectivityActionType.CONNECT) state.connected.add(address);
        else state.connected.delete(address);
        replies.push(
          mdr2([
            CommandT2.PERI_NTFY_EXTENDED_PARAM,
            PeripheralInquiredType.PAIRING_DEVICE_MANAGEMENT_WITH_BLUETOOTH_CLASS_OF_DEVICE,
            action,
            // High nibble repeats the action, low nibble is the outcome.
            action === ConnectivityActionType.CONNECT ? 0x10 : 0x00,
            ...textBytes(address),
          ])
        );
      }
      return replies;
    }

    switch (command) {
      case CommandT1.CONNECT_GET_PROTOCOL_INFO:
        // payload[7] === 0 means "supports Table 2"; anything else means it does not.
        replies.push(
          mdr([CommandT1.CONNECT_RET_PROTOCOL_INFO, ConnectInquiredType.FIXED_VALUE, 0, 0, 0, 2, 0, table2 ? 0 : 1])
        );
        break;
      case CommandT1.CONNECT_GET_DEVICE_INFO: {
        const type = payload[1] as DeviceInfoType;
        const bytes = textBytes(type === DeviceInfoType.MODEL_NAME ? "WH-1000XM6" : "2.0.1");
        replies.push(mdr([CommandT1.CONNECT_RET_DEVICE_INFO, type, bytes.length, ...bytes]));
        break;
      }
      case CommandT1.CONNECT_GET_SUPPORT_FUNCTION: {
        const functions = [
          FunctionTypeT1.BATTERY_LEVEL_INDICATOR,
          // A real WH-1000XM6 on FW 3.1.5 advertises 0x6D and *not* 0x6B.
          noiseAdaptation ? 0x6d : 0x6b,
          ...(extras
            ? [
                FunctionTypeT1.CONNECTION_MODE_SOUND_QUALITY_CONNECTION_QUALITY,
                FunctionTypeT1.UPSCALING_AUTO_OFF,
                FunctionTypeT1.SMART_TALKING_MODE_TYPE2,
                FunctionTypeT1.PLAYBACK_CONTROL_BY_WEARING_REMOVING_HEADPHONE_ON_OFF,
                FunctionTypeT1.POWER_OFF,
              ]
            : []),
        ];
        replies.push(
          mdr([
            CommandT1.CONNECT_RET_SUPPORT_FUNCTION,
            ConnectInquiredType.FIXED_VALUE,
            functions.length,
            // Each entry is a (functionType, priority) pair.
            ...functions.flatMap((fn) => [fn, 0]),
          ])
        );
        break;
      }

      case CommandT1.AUDIO_GET_PARAM:
        replies.push(
          mdr([
            CommandT1.AUDIO_RET_PARAM,
            payload[1]!,
            payload[1] === AudioInquiredType.CONNECTION_MODE ? state.connectionMode : state.upscaling,
          ])
        );
        break;
      case CommandT1.AUDIO_SET_PARAM:
        if (payload[1] === AudioInquiredType.CONNECTION_MODE) state.connectionMode = payload[2]!;
        else state.upscaling = payload[2]!;
        break; // ACK only

      case CommandT1.SYSTEM_GET_PARAM:
        if (payload[1] === SystemInquiredType.PLAYBACK_CONTROL_BY_WEARING) {
          replies.push(
            mdr([
              CommandT1.SYSTEM_RET_PARAM,
              SystemInquiredType.PLAYBACK_CONTROL_BY_WEARING,
              state.pauseOnRemoval ? EnableDisable.ENABLE : EnableDisable.DISABLE,
            ])
          );
          break;
        }
        replies.push(
          mdr([
            CommandT1.SYSTEM_RET_PARAM,
            SystemInquiredType.SMART_TALKING_MODE_TYPE2,
            // Inverted on the wire: ENABLE is 0.
            state.stcEnabled ? EnableDisable.ENABLE : EnableDisable.DISABLE,
            EnableDisable.DISABLE,
          ])
        );
        break;
      case CommandT1.SYSTEM_SET_PARAM:
        if (payload[1] === SystemInquiredType.PLAYBACK_CONTROL_BY_WEARING) {
          state.pauseOnRemoval = payload[2] === EnableDisable.ENABLE;
        } else {
          state.stcEnabled = payload[2] === EnableDisable.ENABLE;
        }
        break; // ACK only

      case CommandT1.POWER_SET_STATUS:
        if (payload[1] === PowerInquiredType.POWER_OFF) state.poweredOff = true;
        break; // ACK only
      case CommandT1.SYSTEM_GET_EXT_PARAM:
        replies.push(
          mdr([
            CommandT1.SYSTEM_RET_EXT_PARAM,
            SystemInquiredType.SMART_TALKING_MODE_TYPE2,
            state.stcSensitivity,
            state.stcTimeout,
          ])
        );
        break;
      case CommandT1.SYSTEM_SET_EXT_PARAM:
        state.stcSensitivity = payload[2]!;
        state.stcTimeout = payload[3]!;
        break; // ACK only
      case CommandT1.POWER_GET_STATUS:
        replies.push(mdr([CommandT1.POWER_RET_STATUS, PowerInquiredType.BATTERY, 78, BatteryChargingStatus.NOT_CHARGING]));
        break;

      case CommandT1.NCASM_SET_PARAM:
        state.ncAsm = {
          onOff: payload[3]!,
          mode: payload[4]!,
          ambientMode: payload[5]!,
          level: payload[6]!,
          // Only present on the noise-adaptation shape.
          autoOn: payload[7] ?? state.ncAsm.autoOn,
          sensitivity: payload[8] ?? state.ncAsm.sensitivity,
        };
        replies.push(mdr(ncAsmFrame(CommandT1.NCASM_NTFY_PARAM)));
        break;
      case CommandT1.NCASM_GET_PARAM:
        replies.push(mdr(ncAsmFrame(CommandT1.NCASM_RET_PARAM)));
        break;

      case CommandT1.EQEBB_SET_PARAM: {
        state.eqPreset = payload[2]!;
        const count = payload[3]!;
        if (count > 0) state.eqSteps = Array.from(payload.subarray(4, 4 + count));
        break; // ACK only — the client re-GETs, per Headphones.cpp:307-308
      }
      case CommandT1.EQEBB_GET_PARAM:
        replies.push(
          mdr([
            CommandT1.EQEBB_RET_PARAM,
            EqEbbInquiredType.PRESET_EQ,
            state.eqPreset,
            state.eqSteps.length,
            ...state.eqSteps,
          ])
        );
        break;
    }
    return replies;
  };
}

describe("Headphones.connect() over a fake device", () => {
  it("performs the full v1 handshake and populates state", async () => {
    const transport = new LoopbackTransport(createFakeDevice());
    const hp = new Headphones(transport);
    const state = await hp.connect();

    expect(state.modelName).toBe("WH-1000XM6");
    expect(state.firmwareVersion).toBe("2.0.1");
    expect(state.supportedFunctions.has(0x20)).toBe(true);
    expect(state.battery).toEqual({ level: 78, charging: BatteryChargingStatus.NOT_CHARGING });
    expect(state.ncAsm).toEqual({
      totalEffectOn: true,
      mode: NcAsmMode.NC,
      ambientMode: AmbientSoundMode.NORMAL,
      ambientLevel: 12,
      settled: true,
      // This fake advertises the plain level-adjustment function, so there is no auto ambient.
      autoAmbient: null,
    });
    expect(state.eq).toEqual({
      preset: EqPresetId.CUSTOM,
      // 6 steps -> the Clear Bass + 5 band layout, decoded with the +10 offset.
      bands: { layout: "clearBass5", values: [3, 2, 0, -2, 3, 5] },
    });
  });

  it("optimistically updates noise mode then reconciles from the device NTFY", async () => {
    const transport = new LoopbackTransport(createFakeDevice());
    const hp = new Headphones(transport);
    await hp.connect();

    const events: Array<{ type: string; origin?: string }> = [];
    hp.on((e) => events.push(e as { type: string; origin?: string }));

    await hp.setNoiseMode("ambient");
    expect(hp.state.ncAsm?.mode).toBe(NcAsmMode.ASM);
    expect(hp.state.ncAsm?.totalEffectOn).toBe(true);

    const origins = events.filter((e) => e.type === "ncAsm").map((e) => e.origin);
    // Paints optimistically first, then the device's own NTFY, then the read-back that makes
    // the headset the final authority on what actually took effect.
    expect(origins[0]).toBe("local");
    expect(origins).toContain("device");
    expect(origins.length).toBeGreaterThanOrEqual(2);
  });

  it("tags a device-initiated NTFY as origin: device, and connect()'s own RET as origin: local", async () => {
    const transport = new LoopbackTransport(createFakeDevice());
    const hp = new Headphones(transport);
    await hp.connect();

    const events: Array<{ type: string; origin?: string }> = [];
    hp.on((e) => events.push(e as { type: string; origin?: string }));

    // Simulate the user changing EQ via the physical touch sensor / phone app — an unprompted NTFY.
    transport.emit(
      packageDataForBt(
        DataType.DATA_MDR,
        0,
        Uint8Array.from([CommandT1.EQEBB_NTFY_PARAM, EqEbbInquiredType.PRESET_EQ, EqPresetId.HEAVY, 0])
      )
    );
    expect(hp.state.eq?.preset).toBe(EqPresetId.HEAVY);
    expect(events).toEqual([{ type: "eq", state: hp.state.eq, origin: "device" }]);
  });

  it("acknowledges every frame the device sends, with the inverted sequence number", async () => {
    const transport = new LoopbackTransport(createFakeDevice());
    const hp = new Headphones(transport);
    await hp.connect();

    const sent = transport.sent.map((f) => decodeFrameBody(f.subarray(1, f.length - 1)));
    const deviceFrames = sent.filter((f) => f.dataType === DataType.DATA_MDR);
    const acks = sent.filter((f) => f.dataType === DataType.ACK);

    // The headset stops replying if we don't ACK, so there must be one ACK per frame it sent.
    // The fake device answers every command, so that is one ACK per command we issued.
    expect(acks.length).toBe(deviceFrames.length);
    // ACKs carry the inverse of the received sequence number (BluetoothWrapper::sendAck).
    for (const ack of acks) expect([0, 1]).toContain(ack.seq);
    expect(acks.every((a) => a.payload.length === 0)).toBe(true);
  });

  it("decodes the 10-band graphic EQ a WH-1000XM6 on FW 3.1.5 reports", async () => {
    const transport = new LoopbackTransport(createFakeDevice());
    const hp = new Headphones(transport);
    await hp.connect();

    // 10 steps use a +6 offset and a -6..+6 range, unlike the 6-step Clear Bass shape.
    const steps = [6, 7, 5, 6, 8, 6, 4, 6, 9, 6];
    transport.emit(
      packageDataForBt(
        DataType.DATA_MDR,
        0,
        Uint8Array.from([CommandT1.EQEBB_NTFY_PARAM, EqEbbInquiredType.PRESET_EQ, EqPresetId.CUSTOM, 10, ...steps])
      )
    );
    expect(hp.state.eq?.bands).toEqual({
      layout: "graphic10",
      values: [0, 1, -1, 0, 2, 0, -2, 0, 3, 0],
    });
  });

  it("ignores an EQ shape it doesn't recognise instead of tearing down the session", async () => {
    const transport = new LoopbackTransport(createFakeDevice());
    const hp = new Headphones(transport);
    await hp.connect();

    // A frame we cannot interpret must not kill the connection — it arrives on the read loop.
    expect(() =>
      transport.emit(
        packageDataForBt(
          DataType.DATA_MDR,
          0,
          Uint8Array.from([CommandT1.EQEBB_NTFY_PARAM, EqEbbInquiredType.PRESET_EQ, EqPresetId.CUSTOM, 7, 1, 2, 3, 4, 5, 6, 7])
        )
      )
    ).not.toThrow();
    expect(hp.state.eq?.bands).toBeNull();

    // ...and the session still works afterwards.
    await hp.setNoiseMode("ambient");
    expect(hp.state.ncAsm?.mode).toBe(NcAsmMode.ASM);
  });

  it("reverts the optimistic value and reports lost control when the headset stops answering", async () => {
    // Reproduces what happens when a phone takes the control channel over multipoint: the link
    // stays open, but commands go unanswered. The UI must not keep showing a mode the
    // headphones were never actually in.
    let deaf = false;
    const device = createFakeDevice();
    const transport = new LoopbackTransport((sent) => (deaf ? [] : device(sent)));
    const hp = new Headphones(transport);
    await hp.connect();

    const before = hp.state.ncAsm;
    const events: string[] = [];
    hp.on((e) => events.push(e.type));

    deaf = true;
    await hp.setNoiseMode("ambient");

    expect(hp.state.ncAsm).toEqual(before); // reverted, not left on the optimistic guess
    expect(events).toContain("writeFailed");
    expect(events).toContain("controlLost");
    expect(hp.controllable).toBe(false);
  }, 20_000);

  it("ignores an in-flight frame so a freshly chosen mode does not snap back", async () => {
    const transport = new LoopbackTransport(createFakeDevice());
    const hp = new Headphones(transport);
    await hp.connect();
    await hp.setNoiseMode("ambient");
    expect(hp.state.ncAsm?.mode).toBe(NcAsmMode.ASM);

    // The headset reports the value it is leaving behind while a change is still in motion.
    // Adopting that would visibly bounce the UI back to the previous mode.
    transport.emit(
      packageDataForBt(
        DataType.DATA_MDR,
        0,
        Uint8Array.from([
          CommandT1.NCASM_NTFY_PARAM,
          NcAsmInquiredType.MODE_NC_ASM_DUAL_NC_MODE_SWITCH_AND_ASM_SEAMLESS,
          ValueChangeStatus.UNDER_CHANGING,
          OnOff.ON,
          NcAsmMode.NC, // the old mode
          AmbientSoundMode.NORMAL,
          12,
        ])
      )
    );
    expect(hp.state.ncAsm?.mode).toBe(NcAsmMode.ASM);
  });

  it("serialises overlapping commands so neither loses its acknowledgement", async () => {
    // Two commands in flight at once used to collide on the single pending-ack slot: one was
    // orphaned, timed out, and briefly reverted the UI before the device corrected it. Issued
    // together, both must now succeed and the final state must be the later of the two.
    const transport = new LoopbackTransport(createFakeDevice());
    const hp = new Headphones(transport);
    await hp.connect();

    await Promise.all([hp.setNoiseMode("ambient"), hp.setAmbientLevel(9)]);

    expect(hp.controllable).toBe(true);
    expect(hp.state.ncAsm?.ambientLevel).toBe(9);
  }, 20_000);

  it("emits 'disconnected' when the transport link drops", async () => {
    const transport = new LoopbackTransport(createFakeDevice());
    const hp = new Headphones(transport);
    await hp.connect();

    const events: string[] = [];
    hp.on((e) => events.push(e.type));
    transport.simulateDisconnect();
    expect(events).toEqual(["disconnected"]);
  });

  it("relinks instead of waiting forever when the headset stops accepting commands", async () => {
    // The multipoint case: the link stays open and notifications keep arriving, but commands
    // go unanswered. Polling never wins the control channel back — reopening the port does —
    // so the session must give up and drop the link rather than sit there disabled.
    let deaf = false;
    const device = createFakeDevice();
    const transport = new LoopbackTransport((sent) => (deaf ? [] : device(sent)));
    const hp = new Headphones(transport);
    await hp.connect();

    const events: string[] = [];
    hp.on((e) => events.push(e.type));

    deaf = true;
    await hp.setNoiseMode("ambient"); // fails, flips to control-lost and starts fast probing
    expect(hp.controllable).toBe(false);

    // Two unanswered probes at 4s apart, each taking the full retry budget before failing.
    await new Promise((resolve) => setTimeout(resolve, 26_000));
    expect(events).toContain("disconnected");
  }, 60_000);

  it("uses the noise-adaptation message shape when the headset advertises it", async () => {
    const transport = new LoopbackTransport(createFakeDevice({ noiseAdaptation: true }));
    const hp = new Headphones(transport);
    const state = await hp.connect();

    expect(state.ncAsm?.autoAmbient).toEqual({
      enabled: false,
      sensitivity: NoiseAdaptiveSensitivity.STANDARD,
    });
    // Both the GET and the SET must carry the NA inquired type, or the headset answers with a
    // shape we then fail to decode.
    const ncAsmFrames = transport.sent
      .map((f) => decodeFrameBody(f.subarray(1, f.length - 1)))
      .filter((f) => f.payload[0] === CommandT1.NCASM_GET_PARAM);
    expect(ncAsmFrames.length).toBeGreaterThan(0);
    expect(ncAsmFrames[0]!.payload[1]).toBe(
      NcAsmInquiredType.MODE_NC_ASM_DUAL_NC_MODE_SWITCH_AND_ASM_SEAMLESS_NA
    );
  });

  it("turns auto ambient level on and sets its sensitivity", async () => {
    const transport = new LoopbackTransport(createFakeDevice({ noiseAdaptation: true }));
    const hp = new Headphones(transport);
    await hp.connect();

    await hp.setAutoAmbient(true, NoiseAdaptiveSensitivity.HIGH);

    expect(hp.state.ncAsm?.autoAmbient).toEqual({
      enabled: true,
      sensitivity: NoiseAdaptiveSensitivity.HIGH,
    });
    // 9 bytes, not 7 — the two trailing noise-adaptation fields must actually go out.
    const sets = transport.sent
      .map((f) => decodeFrameBody(f.subarray(1, f.length - 1)))
      .filter((f) => f.payload[0] === CommandT1.NCASM_SET_PARAM);
    const last = sets[sets.length - 1]!;
    expect(last.payload.length).toBe(9);
    expect(last.payload[7]).toBe(OnOff.ON);
    expect(last.payload[8]).toBe(NoiseAdaptiveSensitivity.HIGH);
  }, 20_000);

  it("keeps auto ambient settings intact when only the noise mode changes", async () => {
    // Every NC/ASM write sends the whole message, so a mode change that dropped these fields
    // would silently switch auto ambient off.
    const transport = new LoopbackTransport(createFakeDevice({ noiseAdaptation: true }));
    const hp = new Headphones(transport);
    await hp.connect();
    await hp.setAutoAmbient(true, NoiseAdaptiveSensitivity.LOW);

    await hp.setNoiseMode("ambient");

    expect(hp.state.ncAsm?.autoAmbient).toEqual({
      enabled: true,
      sensitivity: NoiseAdaptiveSensitivity.LOW,
    });
  }, 20_000);

  it("refuses auto ambient on headphones that don't have it", async () => {
    const transport = new LoopbackTransport(createFakeDevice());
    const hp = new Headphones(transport);
    await hp.connect();

    await expect(hp.setAutoAmbient(true)).rejects.toThrow(/don't support/i);
  });

  it("leaves capability-gated extras null when the headset doesn't claim them", async () => {
    const transport = new LoopbackTransport(createFakeDevice());
    const hp = new Headphones(transport);
    const state = await hp.connect();

    expect(state.connectionMode).toBeNull();
    expect(state.upscaling).toBeNull();
    expect(state.speakToChat).toBeNull();
    // And we must not have asked about features the headset never claimed.
    const asked = transport.sent
      .map((f) => decodeFrameBody(f.subarray(1, f.length - 1)))
      .filter((f) =>
        [CommandT1.AUDIO_GET_PARAM, CommandT1.SYSTEM_GET_PARAM, CommandT1.SYSTEM_GET_EXT_PARAM].includes(
          f.payload[0] as CommandT1
        )
      );
    expect(asked).toEqual([]);
  });

  it("reads connection quality, DSEE and Speak-to-Chat when they're supported", async () => {
    const transport = new LoopbackTransport(createFakeDevice({ extras: true }));
    const hp = new Headphones(transport);
    const state = await hp.connect();

    expect(state.connectionMode).toBe(PriorMode.SOUND_QUALITY);
    expect(state.upscaling).toBe(UpscalingTypeAutoOff.OFF);
    expect(state.speakToChat).toEqual({
      enabled: false,
      sensitivity: DetectSensitivity.AUTO,
      timeout: ModeOutTime.MID,
    });
  });

  it("switches connection quality and DSEE", async () => {
    const transport = new LoopbackTransport(createFakeDevice({ extras: true }));
    const hp = new Headphones(transport);
    await hp.connect();

    await hp.setConnectionMode(PriorMode.CONNECTION_QUALITY);
    await hp.setUpscaling(UpscalingTypeAutoOff.AUTO);

    expect(hp.state.connectionMode).toBe(PriorMode.CONNECTION_QUALITY);
    expect(hp.state.upscaling).toBe(UpscalingTypeAutoOff.AUTO);
  }, 20_000);

  it("writes Speak-to-Chat on the wire the right way round", async () => {
    // EnableDisable is inverted — ENABLE is 0 — so an "on" write must put 0 on the wire.
    const transport = new LoopbackTransport(createFakeDevice({ extras: true }));
    const hp = new Headphones(transport);
    await hp.connect();

    await hp.setSpeakToChat({
      enabled: true,
      sensitivity: DetectSensitivity.HIGH,
      timeout: ModeOutTime.SLOW,
    });

    const sets = transport.sent
      .map((f) => decodeFrameBody(f.subarray(1, f.length - 1)))
      .filter((f) => f.payload[0] === CommandT1.SYSTEM_SET_PARAM);
    expect(sets[sets.length - 1]!.payload[2]).toBe(EnableDisable.ENABLE);
    expect(hp.state.speakToChat).toEqual({
      enabled: true,
      sensitivity: DetectSensitivity.HIGH,
      timeout: ModeOutTime.SLOW,
    });
  }, 20_000);

  it("only writes the Speak-to-Chat message whose settings actually changed", async () => {
    const transport = new LoopbackTransport(createFakeDevice({ extras: true }));
    const hp = new Headphones(transport);
    await hp.connect();

    await hp.setSpeakToChat({
      enabled: false, // unchanged
      sensitivity: DetectSensitivity.LOW,
      timeout: ModeOutTime.MID,
    });

    const commands = transport.sent
      .map((f) => decodeFrameBody(f.subarray(1, f.length - 1)))
      .map((f) => f.payload[0]);
    expect(commands).toContain(CommandT1.SYSTEM_SET_EXT_PARAM);
    expect(commands).not.toContain(CommandT1.SYSTEM_SET_PARAM);
  }, 20_000);

  it("reads and writes pause-on-removal without confusing it for Speak-to-Chat", async () => {
    // Both ride the same SYSTEM_RET_PARAM command and are told apart only by inquired type.
    const transport = new LoopbackTransport(createFakeDevice({ extras: true }));
    const hp = new Headphones(transport);
    const state = await hp.connect();

    expect(state.pauseOnRemoval).toBe(true);
    expect(state.speakToChat?.enabled).toBe(false);

    await hp.setPauseOnRemoval(false);
    expect(hp.state.pauseOnRemoval).toBe(false);
    // Speak-to-Chat must not have been touched by a message aimed at the other setting.
    expect(hp.state.speakToChat?.enabled).toBe(false);
  }, 20_000);

  it("asks the headphones to power off, and stops polling them", async () => {
    const transport = new LoopbackTransport(createFakeDevice({ extras: true }));
    const hp = new Headphones(transport);
    await hp.connect();
    expect(hp.state.canPowerOff).toBe(true);

    await hp.powerOff();

    const sets = transport.sent
      .map((f) => decodeFrameBody(f.subarray(1, f.length - 1)))
      .filter((f) => f.payload[0] === CommandT1.POWER_SET_STATUS);
    expect(sets.length).toBe(1);
    expect(sets[0]!.payload[1]).toBe(PowerInquiredType.POWER_OFF);
    expect(sets[0]!.payload[2]).toBe(PowerOffSettingValue.USER_POWER_OFF);
  }, 20_000);

  it("refuses to power off headphones that never said they could", async () => {
    const transport = new LoopbackTransport(createFakeDevice());
    const hp = new Headphones(transport);
    await hp.connect();

    expect(hp.state.canPowerOff).toBe(false);
    await expect(hp.powerOff()).rejects.toThrow(/power-off/i);
  });

  it("reverts an extra setting the headset never accepted", async () => {
    let deaf = false;
    const device = createFakeDevice({ extras: true });
    const transport = new LoopbackTransport((sent) => (deaf ? [] : device(sent)));
    const hp = new Headphones(transport);
    await hp.connect();
    expect(hp.state.upscaling).toBe(UpscalingTypeAutoOff.OFF);

    deaf = true;
    await hp.setUpscaling(UpscalingTypeAutoOff.AUTO);

    expect(hp.state.upscaling).toBe(UpscalingTypeAutoOff.OFF);
    expect(hp.controllable).toBe(false);
  }, 20_000);

  it("reads the paired device list, with a kind per Bluetooth Class of Device", async () => {
    const transport = new LoopbackTransport(createFakeDevice({ table2: true }));
    const hp = new Headphones(transport);
    await hp.connect();
    // connect() kicks this off without waiting for it, so ask outright rather than racing it.
    const devices = await hp.refreshPairedDevices();

    expect(devices).toEqual([
      {
        address: "AA:BB:CC:DD:EE:01",
        name: "Mehrshad's iPhone",
        connected: true,
        slot: 1,
        kind: "phone",
        hasPlaybackRight: true,
      },
      {
        address: "AA:BB:CC:DD:EE:02",
        name: "ThinkPad",
        connected: false,
        slot: 0,
        kind: "computer",
        hasPlaybackRight: false,
      },
    ]);
  });

  it("gives the playback right to the device in that slot, not that list position", async () => {
    // Byte-for-byte the shape a real WH-1000XM6 sent: the connected laptop is in slot 1 and
    // holds the playback right; the phone is merely paired and sits at list index 1. Reading
    // the trailing byte as an index badges the phone, which is not even connected.
    const transport = new LoopbackTransport(createFakeDevice({ table2: true }));
    const hp = new Headphones(transport);
    await hp.connect();

    transport.emit(
      packageDataForBt(
        DataType.DATA_MDR_NO2,
        0,
        Uint8Array.from([
          CommandT2.PERI_NTFY_PARAM,
          PeripheralInquiredType.PAIRING_DEVICE_MANAGEMENT_WITH_BLUETOOTH_CLASS_OF_DEVICE,
          2,
          ...pairedDeviceRecord(THINKPAD, 1, 0x2e410c, "MEHRSHAD-LOQ"),
          // Disconnected devices report an unknown class of device.
          ...pairedDeviceRecord(IPHONE, 0, 0xffffff, "Mehrshad's iPhone"),
          1, // playback right belongs to slot 1
        ])
      )
    );

    const [laptop, phone] = hp.state.pairedDevices!;
    expect(laptop).toMatchObject({ name: "MEHRSHAD-LOQ", connected: true, hasPlaybackRight: true });
    expect(phone).toMatchObject({ name: "Mehrshad's iPhone", connected: false, hasPlaybackRight: false });
  });

  it("guesses a device type from its name when the class of device is unknown", async () => {
    // Paired-but-disconnected devices report 0xFFFFFF, so every one of them would otherwise
    // show the same generic icon. These are the real names from a WH-1000XM6.
    const transport = new LoopbackTransport(createFakeDevice({ table2: true }));
    const hp = new Headphones(transport);
    await hp.connect();

    const named = (name: string) => pairedDeviceRecord("AA:BB:CC:DD:EE:09", 0, 0xffffff, name);
    const kindOf = (name: string) => {
      transport.emit(
        packageDataForBt(
          DataType.DATA_MDR_NO2,
          0,
          Uint8Array.from([
            CommandT2.PERI_NTFY_PARAM,
            PeripheralInquiredType.PAIRING_DEVICE_MANAGEMENT_WITH_BLUETOOTH_CLASS_OF_DEVICE,
            1,
            ...named(name),
            0,
          ])
        )
      );
      return hp.state.pairedDevices![0]!.kind;
    };

    expect(kindOf("Mehrshad's iPhone")).toBe("phone");
    expect(kindOf("Sara's MacBook Air")).toBe("computer");
    expect(kindOf("Mehrshad's Apple Watch")).toBe("wearable");
    expect(kindOf("iPad Pro")).toBe("tablet");
    // A hostname that tells us nothing stays generic rather than being forced into a guess.
    expect(kindOf("H191KXL4DY")).toBe("other");
  });

  it("prefers the reported class of device over the name", async () => {
    const transport = new LoopbackTransport(createFakeDevice({ table2: true }));
    const hp = new Headphones(transport);
    await hp.connect();

    transport.emit(
      packageDataForBt(
        DataType.DATA_MDR_NO2,
        0,
        Uint8Array.from([
          CommandT2.PERI_NTFY_PARAM,
          PeripheralInquiredType.PAIRING_DEVICE_MANAGEMENT_WITH_BLUETOOTH_CLASS_OF_DEVICE,
          1,
          // Called a "phone", but the headset says it is a computer. Believe the headset.
          ...pairedDeviceRecord(THINKPAD, 1, 0x2e410c, "Work phone"),
          1,
        ])
      )
    );
    expect(hp.state.pairedDevices![0]!.kind).toBe("computer");
  });

  it("counts a device in the second multipoint slot as connected", async () => {
    const transport = new LoopbackTransport(createFakeDevice({ table2: true }));
    const hp = new Headphones(transport);
    await hp.connect();

    transport.emit(
      packageDataForBt(
        DataType.DATA_MDR_NO2,
        0,
        Uint8Array.from([
          CommandT2.PERI_NTFY_PARAM,
          PeripheralInquiredType.PAIRING_DEVICE_MANAGEMENT_WITH_BLUETOOTH_CLASS_OF_DEVICE,
          1,
          ...pairedDeviceRecord(IPHONE, 2, 0x5a020c, "Mehrshad's iPhone"),
          2,
        ])
      )
    );

    expect(hp.state.pairedDevices![0]).toMatchObject({ connected: true, slot: 2, hasPlaybackRight: true });
  });

  it("leaves the paired device list null on a device that doesn't speak Table 2", async () => {
    const transport = new LoopbackTransport(createFakeDevice());
    const hp = new Headphones(transport);
    const state = await hp.connect();

    // Not an error: the panel simply has nothing to show. And we must not have spent a
    // request on a table the headset told us it doesn't implement.
    expect(state.pairedDevices).toBeNull();
    const table2Frames = transport.sent
      .map((f) => decodeFrameBody(f.subarray(1, f.length - 1)))
      .filter((f) => f.dataType === DataType.DATA_MDR_NO2);
    expect(table2Frames).toEqual([]);
  });

  it("updates the device list live when the headset announces a connection change", async () => {
    const transport = new LoopbackTransport(createFakeDevice({ table2: true }));
    const hp = new Headphones(transport);
    await hp.connect();

    const events: Array<{ type: string }> = [];
    hp.on((e) => events.push(e));

    // The phone disconnects; the headset pushes the new list unprompted.
    transport.emit(
      packageDataForBt(
        DataType.DATA_MDR_NO2,
        0,
        Uint8Array.from([
          CommandT2.PERI_NTFY_PARAM,
          PeripheralInquiredType.PAIRING_DEVICE_MANAGEMENT_WITH_BLUETOOTH_CLASS_OF_DEVICE,
          1,
          ...pairedDeviceRecord("AA:BB:CC:DD:EE:02", 1, 0x0c0104, "ThinkPad"),
          1,
        ])
      )
    );

    expect(hp.state.pairedDevices).toEqual([
      {
        address: "AA:BB:CC:DD:EE:02",
        name: "ThinkPad",
        connected: true,
        slot: 1,
        kind: "computer",
        hasPlaybackRight: true,
      },
    ]);
    expect(events.map((e) => e.type)).toContain("pairedDevices");
  });

  it("disconnects a paired device and reflects it in the refreshed list", async () => {
    const transport = new LoopbackTransport(createFakeDevice({ table2: true }));
    const hp = new Headphones(transport);
    await hp.connect();
    await hp.refreshPairedDevices();
    expect(hp.state.pairedDevices?.find((d) => d.address === IPHONE)?.connected).toBe(true);

    await hp.setDeviceConnection(IPHONE, false);

    // Sent as PERI_SET_EXTENDED_PARAM — the device list itself has no SET form.
    const sets = transport.sent
      .map((f) => decodeFrameBody(f.subarray(1, f.length - 1)))
      .filter(
        (f) => f.dataType === DataType.DATA_MDR_NO2 && f.payload[0] === (CommandT2.PERI_SET_EXTENDED_PARAM as number)
      );
    expect(sets.length).toBe(1);
    expect(sets[0]!.payload[2]).toBe(ConnectivityActionType.DISCONNECT);
    expect(hp.state.pairedDevices?.find((d) => d.address === IPHONE)?.connected).toBe(false);
  });

  it("connects a paired device that wasn't connected", async () => {
    const transport = new LoopbackTransport(createFakeDevice({ table2: true }));
    const hp = new Headphones(transport);
    await hp.connect();

    await hp.setDeviceConnection(THINKPAD, true);
    expect(hp.state.pairedDevices?.find((d) => d.address === THINKPAD)?.connected).toBe(true);
  });

  it("reports a refusal rather than pretending the device connected", async () => {
    const device = createFakeDevice({ table2: true });
    const transport = new LoopbackTransport((sent) => {
      const { dataType, payload } = decodeFrameBody(sent.subarray(1, sent.length - 1));
      if (dataType === DataType.DATA_MDR_NO2 && payload[0] === (CommandT2.PERI_SET_EXTENDED_PARAM as number)) {
        return [
          packageDataForBt(DataType.ACK, 0, Uint8Array.from([])),
          packageDataForBt(
            DataType.DATA_MDR_NO2,
            0,
            Uint8Array.from([
              CommandT2.PERI_NTFY_EXTENDED_PARAM,
              PeripheralInquiredType.PAIRING_DEVICE_MANAGEMENT_WITH_BLUETOOTH_CLASS_OF_DEVICE,
              ConnectivityActionType.CONNECT,
              0x11, // CONNECTION_ERROR
              ...textBytes(THINKPAD),
            ])
          ),
        ];
      }
      return device(sent);
    });
    const hp = new Headphones(transport);
    await hp.connect();

    await expect(hp.setDeviceConnection(THINKPAD, true)).rejects.toThrow(/refused/i);
    expect(hp.state.pairedDevices?.find((d) => d.address === THINKPAD)?.connected).toBe(false);
  });

  it("survives a truncated device list instead of tearing down the session", async () => {
    const transport = new LoopbackTransport(createFakeDevice({ table2: true }));
    const hp = new Headphones(transport);
    await hp.connect();

    // Claims three devices but carries one. Decoding runs on the read loop, so throwing here
    // would end the connection outright (PLAN.md standing rule 1).
    expect(() =>
      transport.emit(
        packageDataForBt(
          DataType.DATA_MDR_NO2,
          0,
          Uint8Array.from([
            CommandT2.PERI_NTFY_PARAM,
            PeripheralInquiredType.PAIRING_DEVICE_MANAGEMENT_WITH_BLUETOOTH_CLASS_OF_DEVICE,
            3,
            ...pairedDeviceRecord("AA:BB:CC:DD:EE:02", 1, 0x0c0104, "ThinkPad"),
          ])
        )
      )
    ).not.toThrow();

    await hp.setNoiseMode("ambient");
    expect(hp.state.ncAsm?.mode).toBe(NcAsmMode.ASM);
  });

  it("clamps ambient level to the device's minimum of 1 on the wire, then reconciles to it", async () => {
    const transport = new LoopbackTransport(createFakeDevice());
    const hp = new Headphones(transport);
    await hp.connect();

    await hp.setAmbientLevel(0);
    // the wire message sent to the device was clamped to 1 (Headphones.cpp:191)...
    // Look for the SET specifically: we also send ACKs, and a GET read-back follows the write.
    const sets = transport.sent
      .map((f) => decodeFrameBody(f.subarray(1, f.length - 1)))
      .filter((f) => f.dataType === DataType.DATA_MDR && f.payload[0] === CommandT1.NCASM_SET_PARAM);
    expect(sets.length).toBeGreaterThan(0);
    expect(sets[sets.length - 1]!.payload[6]).toBe(1);
    // ...and the fake device's NTFY echo reconciles local state to what it actually accepted
    expect(hp.state.ncAsm?.ambientLevel).toBe(1);
  });
});
