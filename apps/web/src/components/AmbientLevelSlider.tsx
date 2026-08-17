import { NoiseAdaptiveSensitivity } from "@ssc/core";
import { useLinearDrag } from "./useLinearDrag.js";
import { Switch } from "./Switch.js";
import { Collapse } from "./Collapse.js";

const SENSITIVITY_OPTIONS: Array<{ value: NoiseAdaptiveSensitivity; label: string }> = [
  { value: NoiseAdaptiveSensitivity.LOW, label: "LOW" },
  { value: NoiseAdaptiveSensitivity.STANDARD, label: "STANDARD" },
  { value: NoiseAdaptiveSensitivity.HIGH, label: "HIGH" },
];

/**
 * design/Dashboard.dc.html §1e "AmbientLevelSlider".
 *
 * "Auto ambient level" only exists on headphones that speak the noise-adaptation variant of the
 * NC/ASM message (ProtocolV2T1.h:2504-2537). Where they don't, `autoAmbient` is null and the
 * control is omitted entirely rather than shown disabled — a control that cannot work is not
 * information the person needs.
 */
export function AmbientLevelSlider({
  active,
  level,
  focusOnVoice,
  autoAmbient,
  onLevelChange,
  onFocusOnVoiceChange,
  onAutoAmbientChange,
}: {
  active: boolean;
  level: number;
  focusOnVoice: boolean;
  /** Null on headphones without noise adaptation. */
  autoAmbient: { enabled: boolean; sensitivity: NoiseAdaptiveSensitivity } | null;
  onLevelChange: (level: number) => void;
  onFocusOnVoiceChange: (enabled: boolean) => void;
  onAutoAmbientChange: (enabled: boolean, sensitivity?: NoiseAdaptiveSensitivity) => void;
}) {
  const drag = useLinearDrag(0, 20, onLevelChange);
  const frac = level / 20;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: 13,
        borderRadius: 10,
        background: "var(--panel2)",
        border: "1px solid var(--line)",
        opacity: active ? 1 : 0.38,
        pointerEvents: active ? "auto" : "none",
        transition: "opacity .18s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <label style={{ fontWeight: 500, fontSize: 12, color: "var(--fg2)" }}>Ambient level</label>
        <div className="mono" style={{ fontWeight: 600, fontSize: 13, color: "var(--fg)" }}>
          {level} / 20
        </div>
      </div>
      <div
        role="slider"
        tabIndex={0}
        aria-label="Ambient level"
        aria-valuemin={0}
        aria-valuemax={20}
        aria-valuenow={level}
        onPointerDown={(e) => drag.onPointerDown(e, false)}
        onKeyDown={(e) => drag.onKeyDown(e, level)}
        style={{
          position: "relative",
          height: 26,
          display: "flex",
          alignItems: "center",
          cursor: "pointer",
          outline: "none",
          touchAction: "none",
        }}
      >
        <div style={{ position: "absolute", left: 0, right: 0, height: 6, borderRadius: 3, background: "var(--track)" }} />
        <div
          style={{
            position: "absolute",
            left: 0,
            height: 6,
            borderRadius: 3,
            background: "var(--amber)",
            width: `${frac * 100}%`,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: `calc(${frac * 100}% - 8px)`,
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: "var(--amber)",
            border: "3px solid var(--panel2)",
            boxShadow: "0 1px 4px rgba(0,0,0,.45)",
          }}
        />
      </div>
      <div className="mono" style={{ display: "flex", justifyContent: "space-between", fontSize: 9.5, color: "var(--fg3)" }}>
        <div>0 · SEALED</div>
        <div>10</div>
        <div>20 · OPEN</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 2 }}>
        {autoAmbient && (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 12, color: "var(--fg2)" }}>Auto ambient level</div>
                <div className="mono" style={{ marginTop: 3, fontSize: 10, color: "var(--fg3)" }}>
                  Follows how noisy it is around you
                </div>
              </div>
              <Switch
                checked={autoAmbient.enabled}
                onChange={(enabled) => onAutoAmbientChange(enabled)}
                ariaLabel="Auto ambient level"
              />
            </div>
            <Collapse open={autoAmbient.enabled} parentGap={9}>
              <div
                role="radiogroup"
                aria-label="Auto ambient sensitivity"
                style={{ display: "flex", gap: 6, paddingTop: 9 }}
              >
                {SENSITIVITY_OPTIONS.map((option) => {
                  const selected = autoAmbient.sensitivity === option.value;
                  return (
                    <button
                      key={option.value}
                      role="radio"
                      aria-checked={selected}
                      onClick={() => onAutoAmbientChange(true, option.value)}
                      className="mono"
                      style={{
                        flex: 1,
                        fontWeight: 500,
                        fontSize: 9.5,
                        letterSpacing: "0.08em",
                        padding: "6px 4px",
                        borderRadius: 6,
                        cursor: "pointer",
                        color: selected ? "var(--bg)" : "var(--fg3)",
                        background: selected ? "var(--amber)" : "none",
                        border: `1px solid ${selected ? "var(--amber)" : "var(--line)"}`,
                      }}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </Collapse>
          </>
        )}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div>
            <div style={{ fontWeight: 500, fontSize: 12, color: "var(--fg2)" }}>Focus on voice</div>
            <div className="mono" style={{ marginTop: 3, fontSize: 10, color: "var(--fg3)" }}>
              Passes speech through
            </div>
          </div>
          <Switch checked={focusOnVoice} onChange={onFocusOnVoiceChange} ariaLabel="Focus on voice" />
        </div>
      </div>
    </div>
  );
}
