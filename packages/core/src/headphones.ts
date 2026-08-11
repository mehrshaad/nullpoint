// Ported from mos9527/SonyHeadphonesClient (MIT) — see /NOTICE.
// Orchestration source: src/Headphones.{h,cpp} @ master (selectively — see PLAN.md §6 porting map).

import { CommandT1, DataType, DeviceInfoType, PowerInquiredType } from "./constants.js";
import { FrameReassembler, packageDataForBt, type DecodedFrame } from "./framing.js";
import type { Transport } from "./transport.js";
import * as Init from "./payloads/init.js";
import * as Battery from "./payloads/battery.js";
import * as NcAsm from "./payloads/ncasm.js";
import * as Eq from "./payloads/eq.js";

export interface HeadphonesState {
  modelName: string | null;
  firmwareVersion: string | null;
  supportedFunctions: Set<number>;
  battery: Battery.BatteryStatus | null;
  ncAsm: NcAsm.NcAsmState | null;
  eq: Eq.EqState | null;
}

/**
 * origin distinguishes a value we just wrote (or the device confirming a GET/SET we sent) from
 * one the device pushed unprompted — e.g. the user toggled ANC on the physical touch sensor or
 * in the phone app. Drives the design's "UPDATED FROM DEVICE" affordance (§5.3 rule 5).
 */
export type StateOrigin = "local" | "device";

export type HeadphonesEvent =
  | { type: "battery"; state: Battery.BatteryStatus }
  | { type: "ncAsm"; state: NcAsm.NcAsmState; origin: StateOrigin }
  | { type: "eq"; state: Eq.EqState; origin: StateOrigin }
  | { type: "deviceInfo" }
  | { type: "writeFailed"; feature: "ncAsm" | "eq" }
  | { type: "disconnected" };

const ACK_TIMEOUT_MS = 2000;
const MAX_SEND_ATTEMPTS = 3; // PLAN.md §4.3: retry-on-timeout

/**
 * A single connected headset. Owns the frame reassembler and the send/ACK/retry loop;
 * exposes a small typed API + change events over the raw protocol in ./payloads/*.
 */
export class Headphones {
  private reassembler = new FrameReassembler();
  private seq = 0;
  private listeners = new Set<(event: HeadphonesEvent) => void>();
  private pendingAck: (() => void) | null = null;

  readonly state: HeadphonesState = {
    modelName: null,
    firmwareVersion: null,
    supportedFunctions: new Set(),
    battery: null,
    ncAsm: null,
    eq: null,
  };

  constructor(private transport: Transport) {
    transport.onData((bytes) => {
      for (const frame of this.reassembler.push(bytes)) {
        // One frame we cannot interpret must never take down the connection: this runs on the
        // transport's read loop, so an escaping throw would end the session outright.
        try {
          this.handleFrame(frame);
        } catch (err) {
          console.warn("[ssc/core] failed to handle a device frame; ignoring it:", err);
        }
      }
    });
    transport.onDisconnect(() => this.emit({ type: "disconnected" }));
  }

  on(cb: (event: HeadphonesEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(event: HeadphonesEvent): void {
    for (const cb of this.listeners) cb(event);
  }

  /**
   * Connect handshake — Headphones.cpp:510-754 (subset used by v1). Throws if the device never
   * answers CONNECT_GET_PROTOCOL_INFO (i.e. this isn't a Sony MDR V2 Table 1 device, or the
   * RFCOMM channel opened but the headset app-layer session didn't come up).
   *
   * Battery/NC-ASM/EQ state is populated by `handleFrame`'s RET_PARAM handling, not here — the
   * response frame each `request()` below awaits is the same frame handleFrame dispatches on,
   * so by the time the await resolves `this.state` is already current. Reading it back out
   * separately here would just re-decode the same bytes and double-emit.
   */
  async connect(): Promise<HeadphonesState> {
    await this.transport.open();

    const protocolInfo = Init.decodeRetProtocolInfo(
      await this.request(DataType.DATA_MDR, Init.encodeGetProtocolInfo(), CommandT1.CONNECT_RET_PROTOCOL_INFO)
    );
    if (!protocolInfo.supportsTable1) {
      throw new Error("Unsupported device: does not support MDR V2 Table 1");
    }

    const modelInfo = Init.decodeRetDeviceInfoString(
      await this.request(DataType.DATA_MDR, Init.encodeGetDeviceInfo(DeviceInfoType.MODEL_NAME), CommandT1.CONNECT_RET_DEVICE_INFO)
    );
    this.state.modelName = modelInfo.value;

    const fwInfo = Init.decodeRetDeviceInfoString(
      await this.request(DataType.DATA_MDR, Init.encodeGetDeviceInfo(DeviceInfoType.FW_VERSION), CommandT1.CONNECT_RET_DEVICE_INFO)
    );
    this.state.firmwareVersion = fwInfo.value;
    this.emit({ type: "deviceInfo" });

    this.state.supportedFunctions = Init.decodeRetSupportFunction(
      await this.request(DataType.DATA_MDR, Init.encodeGetSupportFunction(), CommandT1.CONNECT_RET_SUPPORT_FUNCTION)
    );

    await this.request(DataType.DATA_MDR, Battery.encodeGetBattery(PowerInquiredType.BATTERY), CommandT1.POWER_RET_STATUS);
    await this.request(DataType.DATA_MDR, NcAsm.encodeGetNcAsm(), CommandT1.NCASM_RET_PARAM);
    await this.request(DataType.DATA_MDR, Eq.encodeGetEq(), CommandT1.EQEBB_RET_PARAM);

    return this.state;
  }

  async setNoiseMode(mode: NcAsm.NoiseMode): Promise<void> {
    if (!this.state.ncAsm) throw new Error("setNoiseMode called before connect()");
    await this.writeNcAsm(NcAsm.applyNoiseMode(this.state.ncAsm, mode));
  }

  async setAmbientLevel(level: number): Promise<void> {
    if (!this.state.ncAsm) throw new Error("setAmbientLevel called before connect()");
    await this.writeNcAsm({ ...this.state.ncAsm, ambientLevel: level });
  }

  async setFocusOnVoice(enabled: boolean): Promise<void> {
    if (!this.state.ncAsm) throw new Error("setFocusOnVoice called before connect()");
    await this.writeNcAsm({ ...this.state.ncAsm, ambientMode: enabled ? 1 : 0 });
  }

  private async writeNcAsm(next: NcAsm.NcAsmState): Promise<void> {
    // Optimistic update (PLAN.md §5.3 rule 1) — reconciled when the device NTFYs back.
    this.state.ncAsm = next;
    this.emit({ type: "ncAsm", state: next, origin: "local" });
    try {
      await this.send(DataType.DATA_MDR, NcAsm.encodeSetNcAsm(next));
    } catch {
      this.emit({ type: "writeFailed", feature: "ncAsm" });
    }
  }

  async setEqPreset(preset: number): Promise<void> {
    try {
      await this.send(DataType.DATA_MDR, Eq.encodeSetPreset(preset));
      // Upstream always follows a preset change with a fresh GET (Headphones.cpp:307-308) —
      // the device recomputes band values for the new preset and we need those, not a guess.
      await this.request(DataType.DATA_MDR, Eq.encodeGetEq(), CommandT1.EQEBB_RET_PARAM);
    } catch {
      this.emit({ type: "writeFailed", feature: "eq" });
    }
  }

  async setEqBands(bands: Eq.EqBands): Promise<void> {
    if (!this.state.eq) throw new Error("setEqBands called before connect()");
    const next: Eq.EqState = { preset: this.state.eq.preset, bands };
    this.state.eq = next;
    this.emit({ type: "eq", state: next, origin: "local" });
    try {
      await this.send(DataType.DATA_MDR, Eq.encodeSetBands(next.preset, bands));
    } catch {
      this.emit({ type: "writeFailed", feature: "eq" });
    }
  }

  /**
   * Send a command and wait for the ACK the device sends for every command frame.
   *
   * The sequence number is driven by the device, not toggled locally: every frame we receive
   * updates `this.seq` (see handleFrame), and outgoing commands carry whatever it last was.
   * That mirrors BluetoothWrapper::recvCommand/sendCommand upstream — toggling it ourselves
   * drifts out of step with the headset and it stops replying.
   */
  private async send(dataType: DataType, data: Uint8Array): Promise<void> {
    for (let attempt = 0; attempt < MAX_SEND_ATTEMPTS; attempt++) {
      const frame = packageDataForBt(dataType, this.seq, data);
      const ackPromise = new Promise<void>((resolve) => {
        this.pendingAck = resolve;
      });
      await this.transport.write(frame);
      const timedOut = await Promise.race([
        ackPromise.then(() => false),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(true), ACK_TIMEOUT_MS)),
      ]);
      this.pendingAck = null;
      if (!timedOut) return;
    }
    throw new Error("No ACK received after retries");
  }

  /**
   * Acknowledge a frame from the headset. This is not optional: the device waits for our ACK
   * before it will send anything further, so skipping it stalls the session after the first
   * reply. The ACK carries the inverse of the received sequence number
   * (BluetoothWrapper::sendAck upstream), and is fire-and-forget — ACKs are never themselves
   * acknowledged, so this must not go through send().
   */
  private async sendAck(receivedSeq: number): Promise<void> {
    try {
      await this.transport.write(packageDataForBt(DataType.ACK, 1 - receivedSeq, new Uint8Array(0)));
    } catch (err) {
      console.warn("[ssc/core] failed to ACK a device frame:", err);
    }
  }

  /** Send a command and wait for its typed RET response (not just the ACK). */
  private async request(dataType: DataType, data: Uint8Array, expectCommand: CommandT1): Promise<Uint8Array> {
    const responsePromise = new Promise<Uint8Array>((resolve, reject) => {
      const timer = setTimeout(() => {
        unsubscribe();
        reject(new Error(`Timed out waiting for response 0x${expectCommand.toString(16)}`));
      }, ACK_TIMEOUT_MS);
      const unsubscribe = this.onRawResponse(expectCommand, (payload) => {
        clearTimeout(timer);
        unsubscribe();
        resolve(payload);
      });
    });
    await this.send(dataType, data);
    return responsePromise;
  }

  private rawResponseListeners = new Map<number, Set<(payload: Uint8Array) => void>>();

  private onRawResponse(command: CommandT1, cb: (payload: Uint8Array) => void): () => void {
    let set = this.rawResponseListeners.get(command);
    if (!set) {
      set = new Set();
      this.rawResponseListeners.set(command, set);
    }
    set.add(cb);
    return () => set!.delete(cb);
  }

  private handleFrame(frame: DecodedFrame): void {
    // Every frame the headset sends advances the shared sequence number.
    this.seq = frame.seq;

    if (frame.dataType === DataType.ACK) {
      this.pendingAck?.();
      return;
    }
    if (frame.dataType !== DataType.DATA_MDR || frame.payload.length === 0) return;

    // Acknowledge before handling: the device will not send its next frame until we do.
    void this.sendAck(frame.seq);

    const command = frame.payload[0] as CommandT1;
    for (const cb of this.rawResponseListeners.get(command) ?? []) cb(frame.payload);

    switch (command) {
      case CommandT1.POWER_RET_STATUS: {
        if (frame.payload[1] === PowerInquiredType.BATTERY) {
          const battery = Battery.decodeRetBattery(frame.payload);
          this.state.battery = battery;
          this.emit({ type: "battery", state: battery });
        }
        break;
      }
      case CommandT1.NCASM_RET_PARAM:
      case CommandT1.NCASM_NTFY_PARAM: {
        const ncAsm = NcAsm.decodeNcAsm(frame.payload);
        this.state.ncAsm = ncAsm;
        // NTFY = the device pushed this unprompted (touch sensor, phone app, physical button).
        this.emit({ type: "ncAsm", state: ncAsm, origin: command === CommandT1.NCASM_NTFY_PARAM ? "device" : "local" });
        break;
      }
      case CommandT1.EQEBB_RET_PARAM:
      case CommandT1.EQEBB_NTFY_PARAM: {
        const eq = Eq.decodeEq(frame.payload);
        this.state.eq = eq;
        this.emit({ type: "eq", state: eq, origin: command === CommandT1.EQEBB_NTFY_PARAM ? "device" : "local" });
        break;
      }
    }
  }
}
