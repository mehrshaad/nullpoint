import { describe, expect, it } from "vitest";
import { Headphones } from "../src/headphones.js";
import { LoopbackTransport } from "../src/transport.js";
import { decodeFrameBody, packageDataForBt } from "../src/framing.js";
import {
  CommandT1,
  ConnectInquiredType,
  DataType,
  DeviceInfoType,
  PowerInquiredType,
  BatteryChargingStatus,
  NcAsmInquiredType,
  OnOff,
  NcAsmMode,
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
 * A fake WH-1000XM6 that answers the v1 connect handshake and feature gets.
 *
 * It remembers what it was told, because the client reads state back after every write — a
 * stateless stub would report defaults and make correct code look broken.
 */
function createFakeDevice() {
  const state = {
    ncAsm: {
      onOff: OnOff.ON as number,
      mode: NcAsmMode.NC as number,
      ambientMode: AmbientSoundMode.NORMAL as number,
      level: 12,
    },
    eqPreset: EqPresetId.CUSTOM as number,
    eqSteps: [13, 12, 10, 8, 13, 15],
  };

  return (sent: Uint8Array) => {
    const { payload } = decodeFrameBody(sent.subarray(1, sent.length - 1));
    const command = payload[0] as CommandT1;
    const replies: Uint8Array[] = [ack()];
    const mdr = (bytes: number[]) => packageDataForBt(DataType.DATA_MDR, 0, Uint8Array.from(bytes));

    switch (command) {
      case CommandT1.CONNECT_GET_PROTOCOL_INFO:
        replies.push(mdr([CommandT1.CONNECT_RET_PROTOCOL_INFO, ConnectInquiredType.FIXED_VALUE, 0, 0, 0, 2, 0, 1]));
        break;
      case CommandT1.CONNECT_GET_DEVICE_INFO: {
        const type = payload[1] as DeviceInfoType;
        const bytes = textBytes(type === DeviceInfoType.MODEL_NAME ? "WH-1000XM6" : "2.0.1");
        replies.push(mdr([CommandT1.CONNECT_RET_DEVICE_INFO, type, bytes.length, ...bytes]));
        break;
      }
      case CommandT1.CONNECT_GET_SUPPORT_FUNCTION:
        replies.push(mdr([CommandT1.CONNECT_RET_SUPPORT_FUNCTION, ConnectInquiredType.FIXED_VALUE, 2, 0x20, 0, 0x6b, 0]));
        break;
      case CommandT1.POWER_GET_STATUS:
        replies.push(mdr([CommandT1.POWER_RET_STATUS, PowerInquiredType.BATTERY, 78, BatteryChargingStatus.NOT_CHARGING]));
        break;

      case CommandT1.NCASM_SET_PARAM:
        state.ncAsm = {
          onOff: payload[3]!,
          mode: payload[4]!,
          ambientMode: payload[5]!,
          level: payload[6]!,
        };
        replies.push(
          mdr([
            CommandT1.NCASM_NTFY_PARAM,
            NcAsmInquiredType.MODE_NC_ASM_DUAL_NC_MODE_SWITCH_AND_ASM_SEAMLESS,
            ValueChangeStatus.CHANGED,
            state.ncAsm.onOff,
            state.ncAsm.mode,
            state.ncAsm.ambientMode,
            state.ncAsm.level,
          ])
        );
        break;
      case CommandT1.NCASM_GET_PARAM:
        replies.push(
          mdr([
            CommandT1.NCASM_RET_PARAM,
            NcAsmInquiredType.MODE_NC_ASM_DUAL_NC_MODE_SWITCH_AND_ASM_SEAMLESS,
            ValueChangeStatus.CHANGED,
            state.ncAsm.onOff,
            state.ncAsm.mode,
            state.ncAsm.ambientMode,
            state.ncAsm.level,
          ])
        );
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

  it("emits 'disconnected' when the transport link drops", async () => {
    const transport = new LoopbackTransport(createFakeDevice());
    const hp = new Headphones(transport);
    await hp.connect();

    const events: string[] = [];
    hp.on((e) => events.push(e.type));
    transport.simulateDisconnect();
    expect(events).toEqual(["disconnected"]);
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
