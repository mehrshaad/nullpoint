// Ported from mos9527/SonyHeadphonesClient (MIT) — see /NOTICE.
// Orchestration source: src/Headphones.{h,cpp} @ master (selectively — see PLAN.md §6 porting map).

import {
  AudioCodec,
  AudioInquiredType,
  AutoPowerOff,
  CommandT1,
  CommandT2,
  ConnectivityActionType,
  DataType,
  DetectSensitivity,
  DeviceInfoType,
  EqPresetId,
  FunctionTypeT1,
  ModeOutTime,
  NoiseAdaptiveSensitivity,
  PeripheralInquiredType,
  PeripheralOutcome,
  PlaybackControl,
  PowerInquiredType,
  PriorMode,
  SystemInquiredType,
  UpmixItem,
  UpscalingTypeAutoOff,
} from "./constants.js";
import { FrameReassembler, packageDataForBt, type DecodedFrame } from "./framing.js";
import type { Transport } from "./transport.js";
import * as Init from "./payloads/init.js";
import * as Battery from "./payloads/battery.js";
import * as NcAsm from "./payloads/ncasm.js";
import * as Eq from "./payloads/eq.js";
import * as Peripheral from "./payloads/peripheral.js";
import * as Audio from "./payloads/audio.js";
import * as System from "./payloads/system.js";
import * as Playback from "./payloads/playback.js";
import { FrameTrace } from "./trace.js";

export interface HeadphonesState {
  modelName: string | null;
  firmwareVersion: string | null;
  supportedFunctions: Set<number>;
  battery: Battery.BatteryStatus | null;
  ncAsm: NcAsm.NcAsmState | null;
  eq: Eq.EqState | null;
  /** Null until asked for, and on devices that don't speak Table 2. Empty array = asked, none. */
  pairedDevices: Peripheral.PairedDevice[] | null;
  /**
   * The settings below are null on headphones whose capability bitmap doesn't claim them. Null
   * means "not offered by this hardware", which is what the UI keys off to omit the control
   * entirely rather than show one that writes nothing.
   */
  connectionMode: PriorMode | null;
  upscaling: UpscalingTypeAutoOff | null;
  speakToChat: System.SpeakToChatState | null;
  /** "Pause when you take them off." */
  pauseOnRemoval: boolean | null;
  /** When the headphones switch themselves off. */
  autoPowerOff: AutoPowerOff | null;
  /** Background music mode — music placed around you rather than in your head. */
  bgmMode: Audio.BgmModeState | null;
  upmixCinema: boolean | null;
  /** The spatial upmix picker, on headsets that offer it instead of the cinema toggle. */
  upmixSeries: UpmixItem | null;
  /** Nod to accept a call, shake to decline. */
  headGesture: boolean | null;
  /** Which codec is carrying audio right now. */
  codec: AudioCodec | null;
  /** Transport state of whatever device is playing. */
  playback: Playback.PlaybackState | null;
  /** 0–30, as the headset counts it. */
  volume: number | null;
  /** Whether the headphones accept a power-off command; there is no value to read back. */
  canPowerOff: boolean;
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
  | { type: "pairedDevices"; devices: Peripheral.PairedDevice[] }
  /** One of the capability-gated extras (connection quality, DSEE, Speak-to-Chat) changed. */
  | { type: "settings" }
  | { type: "deviceInfo" }
  | {
      type: "writeFailed";
      feature:
        | "ncAsm"
        | "eq"
        | "connectionMode"
        | "upscaling"
        | "speakToChat"
        | "pauseOnRemoval"
        | "headGesture"
        | "autoPowerOff"
        | "bgmMode"
        | "upmixCinema"
        | "upmixSeries"
        | "playback"
        | "volume";
    }
  /**
   * The link is still open but the headset has stopped accepting commands — in practice
   * because another device (usually a phone on multipoint) has taken the control channel.
   * Distinct from "disconnected": there is nothing to reconnect, we just cannot steer it.
   */
  | { type: "controlLost" }
  | { type: "controlRegained" }
  | { type: "disconnected" };

const ACK_TIMEOUT_MS = 2000;
const MAX_SEND_ATTEMPTS = 3; // PLAN.md §4.3: retry-on-timeout
/**
 * The headset pushes POWER_NTFY_STATUS when the charge level changes, but appears to do so
 * only on coarse steps. A slow poll keeps the reading honest without meaningful traffic.
 */
const BATTERY_REFRESH_MS = 60_000;
/** While another device holds control, probe often so we notice the moment it lets go. */
const CONTROL_PROBE_MS = 4_000;
/** How long to wait for the headset to announce that a change has taken effect. */
const CONFIRM_TIMEOUT_MS = 2_500;
/**
 * Unanswered exchanges before the app says anything is wrong. One miss is usually a momentary
 * stall; announcing it made the UI flicker between usable and disabled for nothing.
 */
const DECLARE_LOST_AFTER = 2;
/** Further unanswered probes after that before relinking rather than waiting. */
const RECLAIM_AFTER_FAILED_PROBES = 2;

/**
 * A single connected headset. Owns the frame reassembler and the send/ACK/retry loop;
 * exposes a small typed API + change events over the raw protocol in ./payloads/*.
 */
export class Headphones {
  private reassembler = new FrameReassembler();
  private seq = 0;
  /**
   * Frames on the wire, off by default. Nothing is recorded until someone opens the inspector,
   * so this costs nothing in normal use.
   */
  readonly trace = new FrameTrace();
  private listeners = new Set<(event: HeadphonesEvent) => void>();
  private pendingAck: (() => void) | null = null;

  readonly state: HeadphonesState = {
    modelName: null,
    firmwareVersion: null,
    supportedFunctions: new Set(),
    battery: null,
    ncAsm: null,
    eq: null,
    pairedDevices: null,
    connectionMode: null,
    upscaling: null,
    speakToChat: null,
    pauseOnRemoval: null,
    autoPowerOff: null,
    bgmMode: null,
    upmixCinema: null,
    upmixSeries: null,
    headGesture: null,
    codec: null,
    playback: null,
    volume: null,
    canPowerOff: false,
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
    transport.onDisconnect(() => {
      this.stopBatteryRefresh();
      this.emit({ type: "disconnected" });
    });
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
    this.supportsTable2 = protocolInfo.supportsTable2;

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
    // Which NC/ASM message shape to write must be decided from the capability bitmap, before
    // the first GET — the noise-adaptation form carries two extra fields.
    this.ncAsmVariant = NcAsm.ncAsmVariantFor(this.state.supportedFunctions);

    await this.request(DataType.DATA_MDR, Battery.encodeGetBattery(PowerInquiredType.BATTERY), CommandT1.POWER_RET_STATUS);
    await this.request(DataType.DATA_MDR, NcAsm.encodeGetNcAsm(this.ncAsmVariant), CommandT1.NCASM_RET_PARAM);
    await this.request(DataType.DATA_MDR, Eq.encodeGetEq(), CommandT1.EQEBB_RET_PARAM);

    // Optional extras must never be able to fail the connection. A headset that lists a
    // capability and then declines to answer the question about it would otherwise take the
    // whole session down, costing the user every control rather than the one they can't have.
    await this.readExtraSettings();

    this.startBatteryRefresh();

    // Deliberately not awaited. A headset that advertises Table 2 but doesn't answer the
    // peripheral inquiry would otherwise add the full response timeout to every connect, and
    // the dashboard has nothing to gain from waiting — the panel fills itself in when the
    // answer arrives, or never appears at all.
    void this.refreshPairedDevices();

    return this.state;
  }

  private supports(fn: FunctionTypeT1): boolean {
    return this.state.supportedFunctions.has(fn);
  }

  /**
   * Reads the capability-gated extras. Each is asked for only if the bitmap claims it, so a
   * headset that doesn't have the feature is never made to answer a question about it, and
   * `state.<setting>` stays null — which is how the UI knows not to draw the control.
   */
  private async readExtraSettings(): Promise<void> {
    /** One optional question. Left unanswered, the setting simply stays null. */
    const ask = async (label: string, data: Uint8Array, expect: CommandT1): Promise<void> => {
      try {
        await this.request(DataType.DATA_MDR, data, expect);
      } catch (err) {
        console.warn(`[ssc/core] the headset claims ${label} but did not answer:`, err);
      }
    };

    if (this.supports(FunctionTypeT1.CONNECTION_MODE_SOUND_QUALITY_CONNECTION_QUALITY)) {
      await ask(
        "connection quality",
        Audio.encodeGetAudioParam(AudioInquiredType.CONNECTION_MODE),
        CommandT1.AUDIO_RET_PARAM
      );
    }
    if (this.supports(FunctionTypeT1.UPSCALING_AUTO_OFF)) {
      await ask("DSEE", Audio.encodeGetAudioParam(AudioInquiredType.UPSCALING), CommandT1.AUDIO_RET_PARAM);
    }
    if (this.supports(FunctionTypeT1.SMART_TALKING_MODE_TYPE2)) {
      await ask("Speak-to-Chat", System.encodeGetSpeakToChat(), CommandT1.SYSTEM_RET_PARAM);
      await ask("Speak-to-Chat detail", System.encodeGetSpeakToChatDetail(), CommandT1.SYSTEM_RET_EXT_PARAM);
    }
    if (this.supports(FunctionTypeT1.PLAYBACK_CONTROL_BY_WEARING_REMOVING_HEADPHONE_ON_OFF)) {
      await ask(
        "pause on removal",
        System.encodeGetSystemParam(SystemInquiredType.PLAYBACK_CONTROL_BY_WEARING),
        CommandT1.SYSTEM_RET_PARAM
      );
    }
    if (this.supports(FunctionTypeT1.HEAD_GESTURE_ON_OFF_TRAINING)) {
      await ask(
        "head gestures",
        System.encodeGetSystemParam(SystemInquiredType.HEAD_GESTURE_ON_OFF),
        CommandT1.SYSTEM_RET_PARAM
      );
    }
    if (this.supports(FunctionTypeT1.AUTO_POWER_OFF_WITH_WEARING_DETECTION)) {
      await ask("auto power off", Battery.encodeGetAutoPowerOff(), CommandT1.POWER_RET_PARAM);
    }
    // The headset advertises which BGM variant it speaks; both carry the same payload.
    this.bgmInquiredType = this.supports(FunctionTypeT1.BGM_MODE_SMALL_MIDDLE_LARGE_AND_ERRORCODE)
      ? AudioInquiredType.BGM_MODE_AND_ERRORCODE
      : AudioInquiredType.BGM_MODE;
    if (
      this.supports(FunctionTypeT1.LISTENING_OPTION) ||
      this.supports(FunctionTypeT1.BGM_MODE_SMALL_MIDDLE_LARGE_AND_ERRORCODE)
    ) {
      await ask(
        "background music mode",
        Audio.encodeGetAudioParam(this.bgmInquiredType),
        CommandT1.AUDIO_RET_PARAM
      );
    }
    if (this.supports(FunctionTypeT1.UPMIX_CINEMA)) {
      await ask(
        "cinema upmix",
        Audio.encodeGetAudioParam(AudioInquiredType.UPMIX_CINEMA),
        CommandT1.AUDIO_RET_PARAM
      );
    }
    if (this.supports(FunctionTypeT1.UPMIX_SERIES)) {
      await ask(
        "spatial upmix",
        Audio.encodeGetAudioParam(AudioInquiredType.UPMIX_SERIES),
        CommandT1.AUDIO_RET_PARAM
      );
    }
    if (this.supports(FunctionTypeT1.CODEC_INDICATOR)) {
      await ask("the codec in use", Playback.encodeGetCodec(), CommandT1.COMMON_RET_STATUS);
    }
    if (this.supports(FunctionTypeT1.PLAYBACK_CONTROLLER_WITH_CALL_VOLUME_ADJUSTMENT)) {
      await ask("playback state", Playback.encodeGetPlayback(), CommandT1.PLAY_RET_STATUS);
      await ask("volume", Playback.encodeGetVolume(), CommandT1.PLAY_RET_PARAM);
    }
    // Nothing to read: this one is an action, not a value.
    this.state.canPowerOff = this.supports(FunctionTypeT1.POWER_OFF);
  }

  /** "Pause when you take them off." */
  async setPauseOnRemoval(enabled: boolean): Promise<void> {
    await this.writeSetting("pauseOnRemoval", enabled, () =>
      System.encodeSetSystemParam(SystemInquiredType.PLAYBACK_CONTROL_BY_WEARING, enabled)
    );
  }

  /** Nod to accept a call, shake to decline. */
  async setHeadGesture(enabled: boolean): Promise<void> {
    await this.writeSetting("headGesture", enabled, () =>
      System.encodeSetSystemParam(SystemInquiredType.HEAD_GESTURE_ON_OFF, enabled)
    );
  }

  /** When the headphones switch themselves off after being left idle. */
  async setAutoPowerOff(value: AutoPowerOff): Promise<void> {
    await this.writeSetting("autoPowerOff", value, () => Battery.encodeSetAutoPowerOff(value));
  }

  /** Background music mode, and how far away it places what you're listening to. */
  async setBgmMode(next: Audio.BgmModeState): Promise<void> {
    await this.writeSetting("bgmMode", next, () =>
      Audio.encodeSetBgmMode(this.bgmInquiredType, next)
    );
  }

  async setUpmixCinema(enabled: boolean): Promise<void> {
    await this.writeSetting("upmixCinema", enabled, () => Audio.encodeSetUpmixCinema(enabled));
  }

  /** Which spatial upmix is active — none, cinema, game or music. */
  async setUpmixSeries(item: UpmixItem): Promise<void> {
    await this.writeSetting("upmixSeries", item, () => Audio.encodeSetUpmixSeries(item));
  }

  /**
   * Transport controls. These are relayed to whichever device is playing the audio, not stored
   * on the headphones — which is what makes them work from a laptop while a phone is playing.
   * The headset answers with the resulting state, so nothing is painted optimistically.
   */
  async playPause(): Promise<void> {
    const playing = this.state.playback?.playing ?? false;
    await this.sendPlaybackControl(playing ? PlaybackControl.PAUSE : PlaybackControl.PLAY);
  }

  async nextTrack(): Promise<void> {
    await this.sendPlaybackControl(PlaybackControl.TRACK_UP);
  }

  async previousTrack(): Promise<void> {
    await this.sendPlaybackControl(PlaybackControl.TRACK_DOWN);
  }

  private async sendPlaybackControl(control: PlaybackControl): Promise<void> {
    if (!this.state.playback) throw new Error("These headphones don't relay playback controls.");
    try {
      await this.send(DataType.DATA_MDR, Playback.encodePlaybackControl(control));
      this.noteResponsive();
    } catch {
      this.emit({ type: "writeFailed", feature: "playback" });
      this.noteUnanswered();
    }
  }

  /** 0–30. */
  async setVolume(level: number): Promise<void> {
    await this.writeSetting("volume", level, () => Playback.encodeSetVolume(level));
  }

  /**
   * Switch the headphones off. They drop the link on the way down, so the transport reporting a
   * disconnection immediately afterwards is the expected outcome, not a failure.
   */
  async powerOff(): Promise<void> {
    if (!this.state.canPowerOff) {
      throw new Error("These headphones don't accept a power-off command.");
    }
    this.stopBatteryRefresh();
    await this.send(DataType.DATA_MDR, Battery.encodePowerOff());
  }

  /** Sound quality vs. a stable link — on LDAC devices this is the 990kbps tradeoff. */
  async setConnectionMode(mode: PriorMode): Promise<void> {
    await this.writeSetting("connectionMode", mode, () =>
      Audio.encodeSetAudioParam(AudioInquiredType.CONNECTION_MODE, mode)
    );
  }

  /** DSEE Extreme upscaling. */
  async setUpscaling(value: UpscalingTypeAutoOff): Promise<void> {
    await this.writeSetting("upscaling", value, () =>
      Audio.encodeSetAudioParam(AudioInquiredType.UPSCALING, value)
    );
  }

  /**
   * Speak-to-Chat. On/off and the detail settings are separate messages upstream
   * (Headphones.cpp:262-280), so only what actually changed is written.
   */
  async setSpeakToChat(next: System.SpeakToChatState): Promise<void> {
    const current = this.state.speakToChat;
    if (!current) throw new Error("These headphones don't support Speak-to-Chat.");
    const previous = current;
    this.state.speakToChat = next;
    this.emit({ type: "settings" });
    try {
      if (next.enabled !== previous.enabled) {
        await this.send(DataType.DATA_MDR, System.encodeSetSpeakToChat(next.enabled));
      }
      if (next.sensitivity !== previous.sensitivity || next.timeout !== previous.timeout) {
        await this.send(
          DataType.DATA_MDR,
          System.encodeSetSpeakToChatDetail(next.sensitivity, next.timeout)
        );
      }
      this.noteResponsive();
    } catch {
      this.state.speakToChat = previous;
      this.emit({ type: "settings" });
      this.emit({ type: "writeFailed", feature: "speakToChat" });
      this.noteUnanswered();
    }
  }

  /**
   * Paint the new value, write it, and put the old one back if the headset never took it —
   * the same contract every other control in the app follows.
   */
  private async writeSetting<
    K extends
      | "connectionMode"
      | "upscaling"
      | "pauseOnRemoval"
      | "headGesture"
      | "autoPowerOff"
      | "bgmMode"
      | "upmixCinema"
      | "upmixSeries"
      | "volume",
  >(
    key: K,
    value: NonNullable<HeadphonesState[K]>,
    encode: () => Uint8Array
  ): Promise<void> {
    const previous = this.state[key];
    if (previous === null) {
      throw new Error(`These headphones don't support ${key}.`);
    }
    this.state[key] = value;
    this.emit({ type: "settings" });
    try {
      await this.send(DataType.DATA_MDR, encode());
      this.noteResponsive();
    } catch {
      this.state[key] = previous;
      this.emit({ type: "settings" });
      this.emit({ type: "writeFailed", feature: key });
      this.noteUnanswered();
    }
  }

  /**
   * Ask which devices the headset is paired with and which of them are connected. Table 2 is
   * optional, and even devices that report support for it may not implement the peripheral
   * inquiry, so a failure here is not a failed connection — the panel just stays hidden.
   */
  async refreshPairedDevices(): Promise<Peripheral.PairedDevice[] | null> {
    if (!this.supportsTable2) return null;
    try {
      const payload = await this.request(
        DataType.DATA_MDR_NO2,
        Peripheral.encodeGetPairedDevices(),
        CommandT2.PERI_RET_PARAM
      );
      return this.adoptPairedDevices(payload);
    } catch (err) {
      console.warn("[ssc/core] the headset did not report its paired devices:", err);
      return null;
    }
  }

  /**
   * Connect or disconnect one of the paired devices.
   *
   * Resolves once the headset reports the outcome, which can legitimately be "in progress" —
   * a Bluetooth connection takes a moment to come up, and the headset announces the finished
   * device list separately when it does. Rejects only on a refusal we can state plainly.
   *
   * Note this can be used to disconnect the very machine we're talking through; that drops the
   * link, and the reconnect loop then behaves exactly as it does for any other disconnection.
   */
  async setDeviceConnection(address: string, connect: boolean): Promise<void> {
    const action = connect ? ConnectivityActionType.CONNECT : ConnectivityActionType.DISCONNECT;
    const response = await this.request(
      DataType.DATA_MDR_NO2,
      Peripheral.encodeSetDeviceConnection(address, action),
      CommandT2.PERI_NTFY_EXTENDED_PARAM
    );
    const { outcome } = Peripheral.decodeConnectivityResult(response);
    if (outcome === PeripheralOutcome.ERROR || outcome === PeripheralOutcome.BUSY) {
      throw new Error(
        outcome === PeripheralOutcome.BUSY
          ? "The headphones are busy — try again in a moment."
          : `The headphones refused to ${connect ? "connect to" : "disconnect from"} that device.`
      );
    }
    this.noteResponsive();
    // The list is stale the instant this lands, and the headset's own notification may lag
    // behind a connection that is still coming up.
    await this.refreshPairedDevices();
  }

  /**
   * Move the audio to a device that is already connected, without disturbing either connection.
   *
   * This is the multipoint complaint Sony has never addressed: both devices are connected, one
   * has the sound, and there is no way to say which. Rejects with something the person can act
   * on — the headset distinguishes "you're on a call" from "that device isn't playing".
   */
  async switchAudioTo(address: string): Promise<void> {
    const response = await this.request(
      DataType.DATA_MDR_NO2,
      Peripheral.encodeSwitchAudioTo(address),
      CommandT2.PERI_NTFY_EXTENDED_PARAM
    );
    const outcome = Peripheral.decodeSourceSwitchResult(response);
    // A null here means the notification was about something else sharing this command byte.
    // Refreshing tells us the truth either way, so don't invent a failure.
    if (outcome) {
      const problem = Peripheral.describeSourceSwitch(outcome.result);
      if (problem) throw new Error(problem);
    }
    this.noteResponsive();
    await this.refreshPairedDevices();
  }

  private adoptPairedDevices(payload: Uint8Array): Peripheral.PairedDevice[] {
    const devices = Peripheral.decodePairedDevices(payload);
    this.state.pairedDevices = devices;
    this.emit({ type: "pairedDevices", devices });
    return devices;
  }

  private batteryTimer: ReturnType<typeof setInterval> | null = null;
  private hasControl = true;
  private supportsTable2 = false;
  private ncAsmVariant: NcAsm.NcAsmVariant = "seamless";
  /** Consecutive unanswered exchanges. Reset by any reply. */
  private unanswered = 0;
  /** Which background-music variant this headset speaks; set during the handshake. */
  private bgmInquiredType: AudioInquiredType = AudioInquiredType.BGM_MODE;

  /** True while the headset is still accepting our commands. */
  get controllable(): boolean {
    return this.hasControl;
  }

  private startBatteryRefresh(): void {
    this.setBatteryInterval(BATTERY_REFRESH_MS);
  }

  /**
   * One timer serves two purposes: keeping the battery reading fresh, and probing whether we
   * still have the control channel. A reply proves both.
   */
  private setBatteryInterval(intervalMs: number): void {
    this.stopBatteryRefresh();
    this.batteryTimer = setInterval(() => {
      void this.send(DataType.DATA_MDR, Battery.encodeGetBattery(PowerInquiredType.BATTERY))
        .then(() => this.noteResponsive())
        .catch(() => this.noteProbeFailed());
    }, intervalMs);
  }

  private stopBatteryRefresh(): void {
    if (this.batteryTimer) clearInterval(this.batteryTimer);
    this.batteryTimer = null;
  }

  /** Stop background work and close the link. */
  async disconnect(): Promise<void> {
    this.stopBatteryRefresh();
    await this.transport.close();
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

  /**
   * "Auto ambient level" — let the headset adapt the ambient level to how noisy it is around
   * you. Only headphones speaking the noise-adaptation variant have this; on anything else
   * `state.ncAsm.autoAmbient` is null and the control is not offered.
   */
  async setAutoAmbient(enabled: boolean, sensitivity?: NoiseAdaptiveSensitivity): Promise<void> {
    const current = this.state.ncAsm;
    if (!current) throw new Error("setAutoAmbient called before connect()");
    if (!current.autoAmbient) {
      throw new Error("These headphones don't support auto ambient level.");
    }
    await this.writeNcAsm({
      ...current,
      autoAmbient: {
        enabled,
        sensitivity: sensitivity ?? current.autoAmbient.sensitivity,
      },
    });
  }

  private async writeNcAsm(next: NcAsm.NcAsmState): Promise<void> {
    const confirmed = this.state.ncAsm;
    // Paint immediately (design §5.3 rule 1), but treat it as a guess until the headset says
    // otherwise.
    this.state.ncAsm = next;
    this.emit({ type: "ncAsm", state: next, origin: "local" });
    try {
      // Arm the listener and write as one queued unit. The headset announces the change
      // itself and that announcement is what confirms it landed, so we must be listening
      // before the write goes out — but starting the clock before the queue reaches us would
      // burn the timeout waiting behind another command.
      await this.enqueue(async () => {
        const settled = this.waitForSettledNcAsm(CONFIRM_TIMEOUT_MS);
        // If the write itself fails we never reach the await below, so claim the rejection
        // now — an unowned one surfaces as an unhandled rejection well after we've recovered.
        settled.catch(() => undefined);
        await this.sendNow(DataType.DATA_MDR, NcAsm.encodeSetNcAsm(next, this.ncAsmVariant));
        await settled;
      });
      this.noteResponsive();
    } catch {
      // No announcement. Ask outright before concluding anything: some changes are quiet.
      try {
        await this.request(DataType.DATA_MDR, NcAsm.encodeGetNcAsm(this.ncAsmVariant), CommandT1.NCASM_RET_PARAM);
        this.noteResponsive();
        return;
      } catch {
        // genuinely unreachable — fall through to the revert below
      }
      // Put the last known-good value back rather than leaving the optimistic one on screen.
      if (confirmed) {
        this.state.ncAsm = confirmed;
        this.emit({ type: "ncAsm", state: confirmed, origin: "device" });
      }
      this.emit({ type: "writeFailed", feature: "ncAsm" });
      this.noteUnanswered();
    }
  }

  /**
   * Resolves once the headset reports an NC/ASM state it considers final. Interim frames
   * (valueChangeStatus = UNDER_CHANGING) are ignored, since they describe a setting in motion.
   */
  private waitForSettledNcAsm(timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const unsubscribes: Array<() => void> = [];
      const finish = (ok: boolean) => {
        clearTimeout(timer);
        for (const off of unsubscribes) off();
        ok ? resolve() : reject(new Error("headset did not confirm the change"));
      };
      const timer = setTimeout(() => finish(false), timeoutMs);
      for (const command of [CommandT1.NCASM_NTFY_PARAM, CommandT1.NCASM_RET_PARAM]) {
        unsubscribes.push(
          this.onRawResponse(DataType.DATA_MDR, command, (payload) => {
            if (NcAsm.decodeNcAsm(payload).settled) finish(true);
          })
        );
      }
    });
  }

  /** The headset answered us, so we still have the control channel. */
  private noteResponsive(): void {
    const wasStruggling = this.unanswered > 0;
    this.unanswered = 0;
    if (!this.hasControl) {
      this.hasControl = true;
      this.emit({ type: "controlRegained" });
    }
    // Back off the fast probe once it has served its purpose.
    if (wasStruggling) this.setBatteryInterval(BATTERY_REFRESH_MS);
  }

  /**
   * One exchange went unanswered.
   *
   * A single miss is usually a momentary stall — the headset is busy renegotiating a codec, or
   * a call arrives — and announcing it immediately made the app flicker between usable and
   * disabled for something that fixed itself a second later. So this starts probing faster
   * right away, but stays quiet until a second miss corroborates it.
   */
  private noteUnanswered(): void {
    this.unanswered += 1;
    if (this.unanswered === 1) this.setBatteryInterval(CONTROL_PROBE_MS);
    if (this.unanswered < DECLARE_LOST_AFTER || !this.hasControl) return;
    this.hasControl = false;
    this.emit({ type: "controlLost" });
  }

  /**
   * A probe went unanswered. Waiting is only worth so much: the headset keeps broadcasting
   * notifications while refusing our commands, so the link looks alive and the app sits there
   * showing values it can no longer change. Polling never wins the control channel back —
   * reopening the port is what does (PROTOCOL.md, "the channel is reclaimable") — so once the
   * misses keep coming, drop the link and let the reconnect loop take it back.
   */
  private noteProbeFailed(): void {
    this.noteUnanswered();
    if (this.unanswered < DECLARE_LOST_AFTER + RECLAIM_AFTER_FAILED_PROBES) return;
    this.unanswered = 0;
    this.stopBatteryRefresh();
    void this.transport
      .close()
      .catch(() => undefined)
      .then(() => this.emit({ type: "disconnected" }));
  }

  /**
   * @param restoreBands values to apply along with a Custom selection. The headset does not
   * remember a user curve across preset changes, so the app supplies the one it saved.
   */
  async setEqPreset(preset: number, restoreBands?: Eq.EqBands): Promise<void> {
    try {
      const bands = restoreBands ?? this.state.eq?.bands;
      // Custom is not a stored curve on the headset — it *is* whatever band values you send it.
      // Selecting it with an empty band list is a no-op the device silently ignores, so send
      // the current values along with it. Named presets carry their own curve and take the
      // preset-only form.
      const command =
        preset === EqPresetId.CUSTOM && bands
          ? Eq.encodeSetBands(preset, bands)
          : Eq.encodeSetPreset(preset);
      await this.send(DataType.DATA_MDR, command);
      // Upstream always follows a preset change with a fresh GET (Headphones.cpp:307-308) —
      // the device recomputes band values for the new preset and we need those, not a guess.
      // It also reconciles the UI if the headset ignored the change.
      await this.request(DataType.DATA_MDR, Eq.encodeGetEq(), CommandT1.EQEBB_RET_PARAM);
      this.noteResponsive();
    } catch {
      this.emit({ type: "writeFailed", feature: "eq" });
      this.noteUnanswered();
    }
  }

  async setEqBands(bands: Eq.EqBands): Promise<void> {
    if (!this.state.eq) throw new Error("setEqBands called before connect()");
    const confirmed = this.state.eq;
    const next: Eq.EqState = { preset: confirmed.preset, bands };
    this.state.eq = next;
    this.emit({ type: "eq", state: next, origin: "local" });
    try {
      await this.send(DataType.DATA_MDR, Eq.encodeSetBands(next.preset, bands));
      this.noteResponsive();
    } catch {
      this.state.eq = confirmed;
      this.emit({ type: "eq", state: confirmed, origin: "device" });
      this.emit({ type: "writeFailed", feature: "eq" });
      this.noteUnanswered();
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
    return this.enqueue(() => this.sendNow(dataType, data));
  }

  /**
   * Serialises every exchange with the headset.
   *
   * The link carries one request/response at a time and there is a single slot for the pending
   * acknowledgement, so two overlapping commands — a user changing a mode while the background
   * battery refresh is in flight, or two quick clicks — orphan each other's ACK. The orphaned
   * one then times out, is treated as a failure, and the UI briefly snaps back before the
   * device's own notification corrects it. Queueing removes the collision entirely.
   */
  private queue: Promise<unknown> = Promise.resolve();

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    // Keep the chain alive regardless of how the previous task ended.
    this.queue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  private async sendNow(dataType: DataType, data: Uint8Array): Promise<void> {
    for (let attempt = 0; attempt < MAX_SEND_ATTEMPTS; attempt++) {
      const frame = packageDataForBt(dataType, this.seq, data);
      const ackPromise = new Promise<void>((resolve) => {
        this.pendingAck = resolve;
      });
      this.trace.record("tx", dataType, data, Date.now());
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
  private request(
    dataType: DataType,
    data: Uint8Array,
    expectCommand: CommandT1 | CommandT2
  ): Promise<Uint8Array> {
    // Queued as one unit: the listener must be armed before the write, and no other command
    // may interleave between the two.
    return this.enqueue(async () => {
      const responsePromise = new Promise<Uint8Array>((resolve, reject) => {
        const timer = setTimeout(() => {
          unsubscribe();
          reject(new Error(`Timed out waiting for response 0x${expectCommand.toString(16)}`));
        }, ACK_TIMEOUT_MS);
        const unsubscribe = this.onRawResponse(dataType, expectCommand, (payload) => {
          clearTimeout(timer);
          unsubscribe();
          resolve(payload);
        });
      });
      // Same reason as in writeNcAsm: a failed write means nothing ever awaits this, and its
      // own timeout would then reject into the void.
      responsePromise.catch(() => undefined);
      await this.sendNow(dataType, data);
      return responsePromise;
    });
  }

  private rawResponseListeners = new Map<string, Set<(payload: Uint8Array) => void>>();

  /**
   * Keyed by frame type as well as command: Table 1 and Table 2 are separate command spaces
   * carried in different frames, so the same byte means different things in each and a bare
   * command number would cross-wire them.
   */
  private onRawResponse(
    dataType: DataType,
    command: CommandT1 | CommandT2,
    cb: (payload: Uint8Array) => void
  ): () => void {
    const key = `${dataType}:${command}`;
    let set = this.rawResponseListeners.get(key);
    if (!set) {
      set = new Set();
      this.rawResponseListeners.set(key, set);
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
    const isTable1 = frame.dataType === DataType.DATA_MDR;
    const isTable2 = frame.dataType === DataType.DATA_MDR_NO2;
    if ((!isTable1 && !isTable2) || frame.payload.length === 0) return;

    // Acknowledge before handling: the device will not send its next frame until we do.
    void this.sendAck(frame.seq);

    const command = frame.payload[0]!;
    this.trace.record("rx", frame.dataType, frame.payload, Date.now());
    for (const cb of this.rawResponseListeners.get(`${frame.dataType}:${command}`) ?? []) cb(frame.payload);

    if (isTable2) {
      this.handleTable2(command, frame.payload);
      return;
    }

    switch (command as CommandT1) {
      case CommandT1.POWER_RET_STATUS:
      case CommandT1.POWER_NTFY_STATUS: {
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
        // The shape the headset replies in is the authority on the shape it wants to be told,
        // whatever its capability bitmap implied. Getting this wrong writes a message with no
        // auto-ambient fields, so the control appears to work and changes nothing.
        this.ncAsmVariant = ncAsm.autoAmbient ? "seamlessNa" : "seamless";
        // A setting still in motion reports the value it is leaving behind. Adopting that
        // would visibly bounce the UI back to the old mode, so wait for the settled frame.
        if (!ncAsm.settled) break;
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
      case CommandT1.COMMON_RET_STATUS:
      case CommandT1.COMMON_NTFY_STATUS: {
        const codec = Playback.decodeCodec(frame.payload);
        if (codec === null) break;
        this.state.codec = codec;
        this.emit({ type: "settings" });
        break;
      }
      case CommandT1.PLAY_RET_STATUS:
      case CommandT1.PLAY_NTFY_STATUS: {
        const playback = Playback.decodePlayback(frame.payload);
        if (!playback) break;
        this.state.playback = playback;
        this.emit({ type: "settings" });
        break;
      }
      case CommandT1.PLAY_RET_PARAM:
      case CommandT1.PLAY_NTFY_PARAM: {
        const volume = Playback.decodeVolume(frame.payload);
        if (volume === null) break;
        this.state.volume = volume;
        this.emit({ type: "settings" });
        break;
      }
      case CommandT1.POWER_RET_PARAM:
      case CommandT1.POWER_NTFY_PARAM: {
        const value = Battery.decodeAutoPowerOff(frame.payload);
        if (value === null) break;
        this.state.autoPowerOff = value;
        this.emit({ type: "settings" });
        break;
      }
      case CommandT1.AUDIO_RET_PARAM:
      case CommandT1.AUDIO_NTFY_PARAM: {
        const param = Audio.decodeAudioParam(frame.payload);
        if (!param) break;
        if (param.type === "connectionMode") this.state.connectionMode = param.value;
        else if (param.type === "upscaling") this.state.upscaling = param.value;
        else if (param.type === "bgmMode") this.state.bgmMode = param.value;
        else if (param.type === "upmixSeries") this.state.upmixSeries = param.value;
        else this.state.upmixCinema = param.value;
        this.emit({ type: "settings" });
        break;
      }
      case CommandT1.SYSTEM_RET_PARAM:
      case CommandT1.SYSTEM_NTFY_PARAM: {
        const wearing = System.decodeSystemParam(
          frame.payload,
          SystemInquiredType.PLAYBACK_CONTROL_BY_WEARING
        );
        if (wearing !== null) {
          this.state.pauseOnRemoval = wearing;
          this.emit({ type: "settings" });
          break;
        }
        const gesture = System.decodeSystemParam(frame.payload, SystemInquiredType.HEAD_GESTURE_ON_OFF);
        if (gesture !== null) {
          this.state.headGesture = gesture;
          this.emit({ type: "settings" });
          break;
        }
        const enabled = System.decodeSpeakToChatEnabled(frame.payload);
        if (enabled === null) break;
        // The detail settings arrive in their own message, so keep whatever we already know.
        this.state.speakToChat = {
          sensitivity: DetectSensitivity.AUTO,
          timeout: ModeOutTime.MID,
          ...this.state.speakToChat,
          enabled,
        };
        this.emit({ type: "settings" });
        break;
      }
      case CommandT1.SYSTEM_RET_EXT_PARAM:
      case CommandT1.SYSTEM_NTFY_EXT_PARAM: {
        const detail = System.decodeSpeakToChatDetail(frame.payload);
        if (!detail) break;
        this.state.speakToChat = { enabled: false, ...this.state.speakToChat, ...detail };
        this.emit({ type: "settings" });
        break;
      }
    }
  }

  /**
   * Table 2 frames. The headset pushes PERI_NTFY_PARAM whenever a device connects or
   * disconnects, so the panel stays live without polling.
   */
  private handleTable2(command: number, payload: Uint8Array): void {
    switch (command) {
      case CommandT2.PERI_RET_PARAM:
      case CommandT2.PERI_NTFY_PARAM: {
        if (payload[1] === PeripheralInquiredType.PAIRING_DEVICE_MANAGEMENT_WITH_BLUETOOTH_CLASS_OF_DEVICE) {
          this.adoptPairedDevices(payload);
        }
        break;
      }
    }
  }
}
