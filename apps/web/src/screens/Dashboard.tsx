import { useEffect, useRef, useState } from "react";
import type { Headphones, HeadphonesState } from "@ssc/core";
import { AmbientSoundMode, BatteryChargingStatus, EqPresetId, noiseModeFromState } from "@ssc/core";
import { customEqKey } from "../state/useSettings.js";
import { TitleBar } from "./TitleBar.js";
import { DeviceArt } from "../components/DeviceArt.js";
import { ConnectedDevices } from "../components/ConnectedDevices.js";
import { NoiseModeSegmented } from "../components/NoiseModeSegmented.js";
import { AmbientLevelSlider } from "../components/AmbientLevelSlider.js";
import { EqualizerPanel } from "../components/EqualizerPanel.js";

const SYNC_TAG_DURATION_MS = 4000; // design §5.3 rule 5

/** design/SoundConnect Desktop.dc.html §1c — header, NOISE CONTROL / EQUALIZER, reconnect banner. */
export function Dashboard({
  state,
  headphones,
  onSettingsClick,
  reconnecting,
  reconnectReason = "gone",
  controlLost = false,
  savedCustomEq,
  onCustomEqChange,
  onCancelReconnect,
}: {
  state: HeadphonesState;
  headphones: Headphones;
  onSettingsClick: () => void;
  reconnecting: boolean;
  /** Why we are reconnecting: the channel is taken, or the headset is simply not there. */
  reconnectReason?: "busy" | "gone";
  /** Link is up, but another device holds the control channel — see useHeadphones. */
  controlLost?: boolean;
  /** Persisted user equalizer curves, keyed by customEqKey(). */
  savedCustomEq?: Record<string, number[]>;
  onCustomEqChange?: (key: string, values: number[]) => void;
  onCancelReconnect: () => void;
}) {
  const battery = state.battery;
  const low = (battery?.level ?? 100) <= 15;
  const charging = battery?.charging === BatteryChargingStatus.CHARGING;
  const ncAsm = state.ncAsm;

  // "UPDATED FROM DEVICE" tag (design §5.3 rule 5) — fades in for 4s when NOISE CONTROL changes
  // because the device pushed it (touch sensor, phone app), not because we wrote it here.
  const [ncAsmSynced, setNcAsmSynced] = useState(false);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const unsubscribe = headphones.on((event) => {
      if (event.type === "ncAsm" && event.origin === "device") {
        setNcAsmSynced(true);
        if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
        syncTimerRef.current = setTimeout(() => setNcAsmSynced(false), SYNC_TAG_DURATION_MS);
      }
    });
    return () => {
      unsubscribe();
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, [headphones]);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <TitleBar statusColor={reconnecting ? "var(--warn)" : "var(--ok)"} onSettingsClick={onSettingsClick} />

      {reconnecting && (
        <div
          style={{
            flex: "none",
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "9px 20px",
            background: "var(--warn-bg)",
            borderBottom: "1px solid var(--warn-line)",
          }}
        >
          <div
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "var(--warn)",
              animation: "np-pulse 1.4s ease-in-out infinite",
            }}
          />
          <div style={{ fontWeight: 500, fontSize: 12, lineHeight: 1.35, color: "var(--warn)" }}>
            {reconnectReason === "busy"
              ? "Another device has the control channel — waiting for it to let go. This reconnects on its own; no need to retry."
              : `Link lost — reconnecting to ${state.modelName ?? "your headphones"}…`}
          </div>
          <div style={{ flex: 1 }} />
          <button
            onClick={onCancelReconnect}
            className="mono"
            style={{
              fontWeight: 500,
              fontSize: 11,
              letterSpacing: "0.08em",
              color: "var(--warn)",
              border: "1px solid var(--warn-line)",
              background: "none",
              padding: "5px 9px",
              borderRadius: 6,
            }}
          >
            CANCEL
          </button>
          <style>{"@keyframes np-pulse { 0% { opacity: .95 } 50% { opacity: .3 } 100% { opacity: .95 } }"}</style>
        </div>
      )}

      {controlLost && !reconnecting && (
        <div
          style={{
            flex: "none",
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "9px 20px",
            background: "var(--amber-soft)",
            borderBottom: "1px solid var(--amber)",
          }}
        >
          <div style={{ width: 7, height: 7, borderRadius: "50%", flex: "none", background: "var(--amber)" }} />
          <div style={{ fontWeight: 500, fontSize: 12, lineHeight: 1.35, color: "var(--amber)" }}>
            Another device has control. These headphones take settings from one device at a
            time — disconnect them from your phone and this reconnects on its own.
          </div>
        </div>
      )}

      <div
        className="measure"
        style={{ flex: "none", display: "flex", alignItems: "center", gap: 16, padding: "18px 20px 16px" }}
      >
        <div
          style={{
            width: 52,
            height: 52,
            flex: "none",
            borderRadius: 10,
            border: "1px solid var(--line)",
            backgroundColor: "var(--panel2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <DeviceArt model={state.modelName} size={38} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{ fontWeight: 600, fontSize: 19, letterSpacing: "-0.01em", color: "var(--fg)" }}>
              {state.modelName ?? "Unknown model"}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "3px 7px",
                borderRadius: 5,
                background: reconnecting
                  ? "var(--warn-bg)"
                  : controlLost
                    ? "var(--amber-soft)"
                    : "var(--ok-bg)",
              }}
            >
              <div
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: reconnecting ? "var(--warn)" : controlLost ? "var(--amber)" : "var(--ok)",
                }}
              />
              <div
                className="mono"
                style={{
                  fontWeight: 500,
                  fontSize: 10,
                  letterSpacing: "0.1em",
                  color: reconnecting ? "var(--warn)" : controlLost ? "var(--amber)" : "var(--ok)",
                }}
              >
                {reconnecting ? "LAST KNOWN" : controlLost ? "NO CONTROL" : "LINKED"}
              </div>
            </div>
          </div>
          <div className="mono" style={{ marginTop: 5, fontSize: 11.5, color: "var(--fg3)" }}>
            FW {state.firmwareVersion ?? "?"}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {battery && (
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <div style={{ textAlign: "right" }}>
              <div
                className="mono"
                style={{ fontWeight: 600, fontSize: 22, color: low ? "var(--warn)" : "var(--fg)" }}
              >
                {battery.level}%
              </div>
              <div className="mono" style={{ marginTop: 5, fontSize: 10, letterSpacing: "0.1em", color: "var(--fg3)" }}>
                {charging ? "CHARGING" : low ? "LOW" : "OK"}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <div
                style={{
                  width: 30,
                  height: 15,
                  borderRadius: 3,
                  border: "1.5px solid var(--fg3)",
                  padding: 2,
                  display: "flex",
                }}
              >
                <div
                  style={{
                    width: `${battery.level}%`,
                    borderRadius: 1,
                    background: low ? "var(--warn)" : "var(--ok)",
                  }}
                />
              </div>
              <div style={{ width: 2.5, height: 6, borderRadius: "0 2px 2px 0", background: "var(--fg3)" }} />
            </div>
          </div>
        )}
      </div>

      <div
        className="dashboard-grid measure"
        style={{
          flex: 1,
          minHeight: 0,
          // Panels size to their content and sit at the top rather than stretching to fill a
          // tall window, which is what turned the EQ into a wall of ribbons.
          alignContent: "start",
          gap: 14,
          padding: "0 20px 20px",
          opacity: reconnecting || controlLost ? 0.6 : 1,
          pointerEvents: reconnecting || controlLost ? "none" : "auto",
          transition: "opacity .18s ease",
        }}
      >
        {ncAsm ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 15, border: "1px solid var(--line)", borderRadius: 12, background: "var(--panel)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 16 }}>
              <div className="mono" style={{ fontWeight: 600, fontSize: 11, letterSpacing: "0.14em", color: "var(--fg3)" }}>
                NOISE CONTROL
              </div>
              {ncAsmSynced && (
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--accent)" }} />
                  <div className="mono" style={{ fontWeight: 500, fontSize: 10, letterSpacing: "0.06em", color: "var(--accent)" }}>
                    UPDATED FROM DEVICE
                  </div>
                </div>
              )}
            </div>
            <NoiseModeSegmented
              value={noiseModeFromState(ncAsm)}
              onChange={(mode) => void headphones.setNoiseMode(mode)}
            />
            <AmbientLevelSlider
              active={noiseModeFromState(ncAsm) === "ambient"}
              level={ncAsm.ambientLevel}
              focusOnVoice={ncAsm.ambientMode === AmbientSoundMode.VOICE}
              onLevelChange={(level) => void headphones.setAmbientLevel(level)}
              onFocusOnVoiceChange={(enabled) => void headphones.setFocusOnVoice(enabled)}
            />
          </div>
        ) : (
          <div />
        )}

        {state.eq ? (
          <EqualizerPanel
            preset={state.eq.preset}
            bands={state.eq.bands}
            onPresetChange={(preset) => {
              // Selecting Custom restores the curve the user built, which the headset itself
              // does not remember — a named preset overwrites the bands outright.
              const layout = state.eq?.bands?.layout;
              const saved = layout ? savedCustomEq?.[customEqKey(state.modelName, layout)] : undefined;
              const restore =
                preset === EqPresetId.CUSTOM && saved && layout
                  ? { layout, values: saved }
                  : undefined;
              void headphones.setEqPreset(preset, restore);
            }}
            onBandChange={(index, value) => {
              const current = state.eq?.bands;
              if (!current) return;
              const values = [...current.values];
              values[index] = value;
              // Remember it: this is the user's own curve, and the device will lose it the
              // moment a preset is chosen.
              onCustomEqChange?.(customEqKey(state.modelName, current.layout), values);
              void headphones.setEqBands({ ...current, values });
            }}
          />
        ) : (
          <div />
        )}

        {/* Full width beneath both panels: a list reads better wide than in a narrow column,
            and it stays a single column on small screens for free. Absent entirely on devices
            that don't report a paired-device list rather than shown empty. */}
        {state.pairedDevices && (
          <div style={{ gridColumn: "1 / -1" }}>
            <ConnectedDevices
              devices={state.pairedDevices}
              onSetConnection={(address, connect) => headphones.setDeviceConnection(address, connect)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
