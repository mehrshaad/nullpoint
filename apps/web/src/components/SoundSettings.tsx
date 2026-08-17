import type { ReactNode } from "react";
import {
  AutoPowerOff,
  DetectSensitivity,
  ModeOutTime,
  PriorMode,
  RoomSize,
  UpmixItem,
  UpscalingTypeAutoOff,
  type BgmModeState,
  type SpeakToChatState,
} from "@ssc/core";
import { Switch } from "./Switch.js";
import { Collapse } from "./Collapse.js";

/**
 * The capability-gated extras: connection quality, DSEE upscaling and Speak-to-Chat.
 *
 * Every row is driven by whether the headphones reported the matching capability, never by the
 * model name. A setting this hardware doesn't have is omitted, and if none of them apply the
 * whole panel disappears — see PLAN.md standing rule 4.
 */

function Row({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 14,
        flexWrap: "wrap",
      }}
    >
      <div style={{ minWidth: 150, flex: "1 1 auto" }}>
        <div style={{ fontWeight: 500, fontSize: 12.5, color: "var(--fg2)" }}>{label}</div>
        <div className="mono" style={{ marginTop: 3, fontSize: 10, color: "var(--fg3)" }}>
          {hint}
        </div>
      </div>
      <div style={{ flex: "0 0 auto" }}>{children}</div>
    </div>
  );
}

function Segmented<T extends number>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} style={{ display: "flex", gap: 5 }}>
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className="mono"
            style={{
              fontWeight: 500,
              fontSize: 9.5,
              letterSpacing: "0.08em",
              padding: "6px 9px",
              borderRadius: 6,
              cursor: "pointer",
              whiteSpace: "nowrap",
              color: selected ? "var(--bg)" : "var(--fg3)",
              background: selected ? "var(--accent)" : "none",
              border: `1px solid ${selected ? "var(--accent)" : "var(--line)"}`,
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function SoundSettings({
  connectionMode,
  upscaling,
  speakToChat,
  pauseOnRemoval,
  headGesture,
  autoPowerOff,
  bgmMode,
  upmixCinema,
  upmixSeries,
  onConnectionModeChange,
  onUpscalingChange,
  onSpeakToChatChange,
  speakToChatLocked,
  onLockSpeakToChange,
  onPauseOnRemovalChange,
  onHeadGestureChange,
  onAutoPowerOffChange,
  onBgmModeChange,
  onUpmixCinemaChange,
  onUpmixSeriesChange,
}: {
  connectionMode: PriorMode | null;
  upscaling: UpscalingTypeAutoOff | null;
  speakToChat: SpeakToChatState | null;
  pauseOnRemoval: boolean | null;
  headGesture: boolean | null;
  autoPowerOff: AutoPowerOff | null;
  bgmMode: BgmModeState | null;
  upmixCinema: boolean | null;
  upmixSeries: UpmixItem | null;
  onConnectionModeChange: (mode: PriorMode) => void;
  onUpscalingChange: (value: UpscalingTypeAutoOff) => void;
  onSpeakToChatChange: (next: SpeakToChatState) => void;
  /** True when the app is holding Speak-to-Chat at a chosen value. */
  speakToChatLocked?: boolean;
  /** Pass a value to lock it there, or undefined to stop holding it. */
  onLockSpeakToChange?: (value: boolean | undefined) => void;
  onPauseOnRemovalChange: (enabled: boolean) => void;
  onHeadGestureChange: (enabled: boolean) => void;
  onAutoPowerOffChange: (value: AutoPowerOff) => void;
  onBgmModeChange: (next: BgmModeState) => void;
  onUpmixCinemaChange: (enabled: boolean) => void;
  onUpmixSeriesChange: (item: UpmixItem) => void;
}) {
  const anything =
    connectionMode !== null ||
    upscaling !== null ||
    speakToChat !== null ||
    pauseOnRemoval !== null ||
    headGesture !== null ||
    autoPowerOff !== null ||
    bgmMode !== null ||
    upmixCinema !== null ||
    upmixSeries !== null;
  if (!anything) return null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        padding: 15,
        border: "1px solid var(--line)",
        borderRadius: 12,
        background: "var(--panel)",
      }}
    >
      <div
        className="mono"
        style={{ fontWeight: 600, fontSize: 11, letterSpacing: "0.14em", color: "var(--fg3)", height: 16 }}
      >
        SOUND &amp; SPEECH
      </div>

      {connectionMode !== null && (
        <Row label="Connection quality" hint="Bitrate against link stability">
          <Segmented
            ariaLabel="Connection quality"
            value={connectionMode}
            onChange={onConnectionModeChange}
            options={[
              { value: PriorMode.SOUND_QUALITY, label: "SOUND" },
              { value: PriorMode.CONNECTION_QUALITY, label: "STABLE" },
              { value: PriorMode.LOW_LATENCY_BETA, label: "LOW LATENCY" },
            ]}
          />
        </Row>
      )}

      {upscaling !== null && (
        <Row label="DSEE Extreme" hint="Restores detail lost to compression">
          <Switch
            checked={upscaling === UpscalingTypeAutoOff.AUTO}
            onChange={(on) => onUpscalingChange(on ? UpscalingTypeAutoOff.AUTO : UpscalingTypeAutoOff.OFF)}
            ariaLabel="DSEE Extreme"
          />
        </Row>
      )}

      {bgmMode && (
        <>
          <Row label="Background music" hint="Places the music around you, not in your head">
            <Switch
              checked={bgmMode.enabled}
              onChange={(enabled) => onBgmModeChange({ ...bgmMode, enabled })}
              ariaLabel="Background music"
            />
          </Row>
          <Collapse open={bgmMode.enabled} parentGap={16}>
            <Row label="Room size" hint="How far away it sounds">
              <Segmented
                ariaLabel="Room size"
                value={bgmMode.room}
                onChange={(room) => onBgmModeChange({ ...bgmMode, room })}
                options={[
                  { value: RoomSize.SMALL, label: "SMALL" },
                  { value: RoomSize.MIDDLE, label: "MEDIUM" },
                  { value: RoomSize.LARGE, label: "LARGE" },
                ]}
              />
            </Row>
          </Collapse>
        </>
      )}

      {upmixCinema !== null && (
        <Row label="Cinema upmix" hint="Widens a stereo mix for film soundtracks">
          <Switch checked={upmixCinema} onChange={onUpmixCinemaChange} ariaLabel="Cinema upmix" />
        </Row>
      )}

      {upmixSeries !== null && (
        <Row label="Spatial upmix" hint="Spreads a stereo mix out around you">
          <Segmented
            ariaLabel="Spatial upmix"
            value={upmixSeries}
            onChange={onUpmixSeriesChange}
            options={[
              { value: UpmixItem.NONE, label: "OFF" },
              { value: UpmixItem.MUSIC, label: "MUSIC" },
              { value: UpmixItem.CINEMA, label: "CINEMA" },
              { value: UpmixItem.GAME, label: "GAME" },
            ]}
          />
        </Row>
      )}

      {pauseOnRemoval !== null && (
        <Row label="Pause when removed" hint="Stops playback when you take them off">
          <Switch checked={pauseOnRemoval} onChange={onPauseOnRemovalChange} ariaLabel="Pause when removed" />
        </Row>
      )}

      {headGesture !== null && (
        <Row label="Head gestures" hint="Nod to answer a call, shake to decline">
          <Switch checked={headGesture} onChange={onHeadGestureChange} ariaLabel="Head gestures" />
        </Row>
      )}

      {autoPowerOff !== null && (
        <Row label="Switch off when idle" hint="Saves battery when you walk away">
          <Segmented
            ariaLabel="Switch off when idle"
            value={autoPowerOff}
            onChange={onAutoPowerOffChange}
            options={[
              { value: AutoPowerOff.AFTER_5_MIN, label: "5 MIN" },
              { value: AutoPowerOff.AFTER_30_MIN, label: "30 MIN" },
              { value: AutoPowerOff.AFTER_180_MIN, label: "3 HR" },
              { value: AutoPowerOff.WHEN_REMOVED, label: "WHEN OFF EARS" },
              { value: AutoPowerOff.DISABLED, label: "NEVER" },
            ]}
          />
        </Row>
      )}

      {speakToChat && (
        <>
          <Row label="Speak-to-Chat" hint="Pauses your music when you start talking">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* Speak-to-Chat is reported switching itself back on, during meetings. Locking
                  it makes the app put it back whenever the headset changes it. */}
              {onLockSpeakToChange && (
                <button
                  onClick={() => onLockSpeakToChange(speakToChatLocked ? undefined : speakToChat.enabled)}
                  aria-pressed={speakToChatLocked}
                  title={
                    speakToChatLocked
                      ? "Locked — the app puts this back if the headphones change it"
                      : "Lock this setting"
                  }
                  className="mono"
                  style={{
                    fontSize: 9.5,
                    fontWeight: 500,
                    letterSpacing: "0.08em",
                    padding: "5px 8px",
                    borderRadius: 6,
                    cursor: "pointer",
                    color: speakToChatLocked ? "var(--accent)" : "var(--fg3)",
                    border: `1px solid ${speakToChatLocked ? "var(--accent)" : "var(--line)"}`,
                    background: "none",
                  }}
                >
                  {speakToChatLocked ? "LOCKED" : "LOCK"}
                </button>
              )}
              <Switch
                checked={speakToChat.enabled}
                onChange={(enabled) => onSpeakToChatChange({ ...speakToChat, enabled })}
                ariaLabel="Speak-to-Chat"
              />
            </div>
          </Row>
          <Collapse open={speakToChat.enabled} parentGap={16}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 16 }}>
              <Row label="Voice sensitivity" hint="How readily it decides you're speaking">
                <Segmented
                  ariaLabel="Voice sensitivity"
                  value={speakToChat.sensitivity}
                  onChange={(sensitivity) => onSpeakToChatChange({ ...speakToChat, sensitivity })}
                  options={[
                    { value: DetectSensitivity.AUTO, label: "AUTO" },
                    { value: DetectSensitivity.LOW, label: "LOW" },
                    { value: DetectSensitivity.HIGH, label: "HIGH" },
                  ]}
                />
              </Row>
              <Row label="Resume after" hint="Wait before your music comes back">
                <Segmented
                  ariaLabel="Resume after"
                  value={speakToChat.timeout}
                  onChange={(timeout) => onSpeakToChatChange({ ...speakToChat, timeout })}
                  options={[
                    { value: ModeOutTime.FAST, label: "SHORT" },
                    { value: ModeOutTime.MID, label: "STANDARD" },
                    { value: ModeOutTime.SLOW, label: "LONG" },
                    { value: ModeOutTime.NONE, label: "NEVER" },
                  ]}
                />
              </Row>
            </div>
          </Collapse>
        </>
      )}
    </div>
  );
}
