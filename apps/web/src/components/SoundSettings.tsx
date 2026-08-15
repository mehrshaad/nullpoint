import type { ReactNode } from "react";
import {
  DetectSensitivity,
  ModeOutTime,
  PriorMode,
  UpscalingTypeAutoOff,
  type SpeakToChatState,
} from "@ssc/core";
import { Switch } from "./Switch.js";

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
  onConnectionModeChange,
  onUpscalingChange,
  onSpeakToChatChange,
  onPauseOnRemovalChange,
}: {
  connectionMode: PriorMode | null;
  upscaling: UpscalingTypeAutoOff | null;
  speakToChat: SpeakToChatState | null;
  pauseOnRemoval: boolean | null;
  onConnectionModeChange: (mode: PriorMode) => void;
  onUpscalingChange: (value: UpscalingTypeAutoOff) => void;
  onSpeakToChatChange: (next: SpeakToChatState) => void;
  onPauseOnRemovalChange: (enabled: boolean) => void;
}) {
  if (connectionMode === null && upscaling === null && speakToChat === null && pauseOnRemoval === null) {
    return null;
  }

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

      {pauseOnRemoval !== null && (
        <Row label="Pause when removed" hint="Stops playback when you take them off">
          <Switch checked={pauseOnRemoval} onChange={onPauseOnRemovalChange} ariaLabel="Pause when removed" />
        </Row>
      )}

      {speakToChat && (
        <>
          <Row label="Speak-to-Chat" hint="Pauses your music when you start talking">
            <Switch
              checked={speakToChat.enabled}
              onChange={(enabled) => onSpeakToChatChange({ ...speakToChat, enabled })}
              ariaLabel="Speak-to-Chat"
            />
          </Row>
          {speakToChat.enabled && (
            <>
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
            </>
          )}
        </>
      )}
    </div>
  );
}
