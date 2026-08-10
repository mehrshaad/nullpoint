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

/** A fake WH-1000XM6 that answers the v1 connect handshake + feature gets. */
function createFakeDevice() {
  return (sent: Uint8Array) => {
    const { payload } = decodeFrameBody(sent.subarray(1, sent.length - 1));
    const command = payload[0] as CommandT1;
    const replies: Uint8Array[] = [ack()];

    switch (command) {
      case CommandT1.CONNECT_GET_PROTOCOL_INFO:
        replies.push(
          packageDataForBt(
            DataType.DATA_MDR,
            0,
            Uint8Array.from([CommandT1.CONNECT_RET_PROTOCOL_INFO, ConnectInquiredType.FIXED_VALUE, 0, 0, 0, 2, 0, 1])
          )
        );
        break;
      case CommandT1.CONNECT_GET_DEVICE_INFO: {
        const type = payload[1] as DeviceInfoType;
        const value = type === DeviceInfoType.MODEL_NAME ? "WH-1000XM6" : "2.0.1";
        const bytes = textBytes(value);
        replies.push(
          packageDataForBt(
            DataType.DATA_MDR,
            0,
            Uint8Array.from([CommandT1.CONNECT_RET_DEVICE_INFO, type, bytes.length, ...bytes])
          )
        );
        break;
      }
      case CommandT1.CONNECT_GET_SUPPORT_FUNCTION:
        replies.push(
          packageDataForBt(
            DataType.DATA_MDR,
            0,
            Uint8Array.from([CommandT1.CONNECT_RET_SUPPORT_FUNCTION, ConnectInquiredType.FIXED_VALUE, 2, 0x20, 0, 0x6b, 0])
          )
        );
        break;
      case CommandT1.POWER_GET_STATUS:
        replies.push(
          packageDataForBt(
            DataType.DATA_MDR,
            0,
            Uint8Array.from([CommandT1.POWER_RET_STATUS, PowerInquiredType.BATTERY, 78, BatteryChargingStatus.NOT_CHARGING])
          )
        );
        break;
      case CommandT1.NCASM_GET_PARAM:
      case CommandT1.NCASM_SET_PARAM:
        replies.push(
          packageDataForBt(
            DataType.DATA_MDR,
            0,
            Uint8Array.from([
              command === CommandT1.NCASM_GET_PARAM ? CommandT1.NCASM_RET_PARAM : CommandT1.NCASM_NTFY_PARAM,
              NcAsmInquiredType.MODE_NC_ASM_DUAL_NC_MODE_SWITCH_AND_ASM_SEAMLESS,
              ValueChangeStatus.CHANGED,
              command === CommandT1.NCASM_SET_PARAM ? payload[3] : OnOff.ON,
              command === CommandT1.NCASM_SET_PARAM ? payload[4] : NcAsmMode.NC,
              command === CommandT1.NCASM_SET_PARAM ? payload[5] : AmbientSoundMode.NORMAL,
              command === CommandT1.NCASM_SET_PARAM ? payload[6] : 12,
            ])
          )
        );
        break;
      case CommandT1.EQEBB_GET_PARAM:
        replies.push(
          packageDataForBt(
            DataType.DATA_MDR,
            0,
            Uint8Array.from([CommandT1.EQEBB_RET_PARAM, EqEbbInquiredType.PRESET_EQ, EqPresetId.CUSTOM, 6, 13, 12, 10, 8, 13, 15])
          )
        );
        break;
      case CommandT1.EQEBB_SET_PARAM:
        // ACK only — the client re-GETs after a preset change, per Headphones.cpp:307-308
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
    });
    expect(state.eq).toEqual({
      preset: EqPresetId.CUSTOM,
      bands: { clearBass: 3, band400: 2, band1k: 0, band2_5k: -2, band6_3k: 3, band16k: 5 },
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
    const ncAsmEvents = events.filter((e) => e.type === "ncAsm");
    // one optimistic emit (origin: local) + one reconciled emit from the loopback NTFY (origin: device)
    expect(ncAsmEvents.map((e) => e.origin)).toEqual(["local", "device"]);
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
    const lastSent = transport.sent[transport.sent.length - 1];
    const { payload } = decodeFrameBody(lastSent.subarray(1, lastSent.length - 1));
    expect(payload[6]).toBe(1);
    // ...and the fake device's NTFY echo reconciles local state to what it actually accepted
    expect(hp.state.ncAsm?.ambientLevel).toBe(1);
  });
});
