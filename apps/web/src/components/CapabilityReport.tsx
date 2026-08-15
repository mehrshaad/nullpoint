import { FunctionTypeT1, type HeadphonesState } from "@ssc/core";

/**
 * What the headphones said they can do, verbatim.
 *
 * Nullpoint gates every optional control on the capability bitmap, so when a control is missing
 * the only useful question is "did the headset report it?". Without this you have to attach a
 * debugger to find out. It also makes compatibility reports for unfamiliar models actually
 * actionable — the numbers here are exactly what a bug report needs.
 */

/** The function types the app actually acts on, in the order they matter. */
const TRACKED: Array<{ fn: FunctionTypeT1; label: string }> = [
  { fn: FunctionTypeT1.BATTERY_LEVEL_INDICATOR, label: "Battery level" },
  { fn: FunctionTypeT1.LEFT_RIGHT_BATTERY_LEVEL_INDICATOR, label: "Per-bud battery" },
  { fn: FunctionTypeT1.CRADLE_BATTERY_LEVEL_INDICATOR, label: "Case battery" },
  { fn: FunctionTypeT1.PRESET_EQ, label: "Equalizer presets" },
  {
    fn: FunctionTypeT1.MODE_NC_ASM_NOISE_CANCELLING_DUAL_AMBIENT_SOUND_MODE_LEVEL_ADJUSTMENT,
    label: "Noise control (plain)",
  },
  {
    fn: FunctionTypeT1.MODE_NC_ASM_NOISE_CANCELLING_DUAL_AMBIENT_SOUND_MODE_LEVEL_ADJUSTMENT_NOISE_ADAPTATION,
    label: "Noise control + auto ambient",
  },
  { fn: FunctionTypeT1.CONNECTION_MODE_SOUND_QUALITY_CONNECTION_QUALITY, label: "Connection quality" },
  { fn: FunctionTypeT1.UPSCALING_AUTO_OFF, label: "DSEE Extreme" },
  { fn: FunctionTypeT1.SMART_TALKING_MODE_TYPE2, label: "Speak-to-Chat" },
  { fn: FunctionTypeT1.PLAYBACK_CONTROL_BY_WEARING_REMOVING_HEADPHONE_ON_OFF, label: "Pause when removed" },
  { fn: FunctionTypeT1.POWER_OFF, label: "Power off" },
];

function hex(value: number): string {
  return `0x${value.toString(16).toUpperCase().padStart(2, "0")}`;
}

function Dot({ on }: { on: boolean }) {
  return (
    <div
      style={{
        width: 6,
        height: 6,
        flex: "none",
        borderRadius: "50%",
        background: on ? "var(--ok)" : "var(--line)",
      }}
    />
  );
}

export function CapabilityReport({ state }: { state: HeadphonesState | null }) {
  if (!state) {
    return (
      <div style={{ padding: "16px 18px", border: "1px solid var(--line)", borderRadius: 10, background: "var(--panel)" }}>
        <div style={{ fontSize: 12.5, color: "var(--fg3)" }}>
          Connect your headphones to see what they report.
        </div>
      </div>
    );
  }

  const supported = state.supportedFunctions;
  // Anything the headset listed that isn't in TRACKED — features it has and the app ignores.
  const untracked = [...supported].filter((fn) => !TRACKED.some((t) => t.fn === fn)).sort((a, b) => a - b);

  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 10, background: "var(--panel)", overflow: "hidden" }}>
      <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--line)" }}>
        <div style={{ fontWeight: 500, fontSize: 13, color: "var(--fg)" }}>
          {state.modelName ?? "Unknown model"}
        </div>
        <div className="mono" style={{ marginTop: 4, fontSize: 11, color: "var(--fg3)" }}>
          FW {state.firmwareVersion ?? "?"} · {supported.size} FUNCTIONS REPORTED
          {state.pairedDevices ? " · TABLE 2" : ""}
        </div>
      </div>

      {TRACKED.map((row) => {
        const on = supported.has(row.fn);
        return (
          <div
            key={row.fn}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "9px 16px",
              borderTop: "1px solid var(--line)",
            }}
          >
            <Dot on={on} />
            <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: on ? "var(--fg2)" : "var(--fg3)" }}>
              {row.label}
            </div>
            <div className="mono" style={{ flex: "none", fontSize: 10.5, color: "var(--fg3)" }}>
              {hex(row.fn)}
            </div>
          </div>
        );
      })}

      {untracked.length > 0 && (
        <div style={{ padding: "12px 16px", borderTop: "1px solid var(--line)" }}>
          <div className="mono" style={{ fontSize: 10, letterSpacing: "0.1em", color: "var(--fg3)" }}>
            REPORTED BUT NOT USED BY NULLPOINT
          </div>
          <div
            className="mono"
            style={{ marginTop: 7, fontSize: 11, lineHeight: 1.7, color: "var(--fg3)", overflowWrap: "anywhere" }}
          >
            {untracked.map(hex).join("  ")}
          </div>
        </div>
      )}
    </div>
  );
}
