import { useLinearDrag } from "./useLinearDrag.js";
import { Switch } from "./Switch.js";

/**
 * design/Dashboard.dc.html §1e "AmbientLevelSlider". The design also specs an "Auto ambient
 * level" toggle — that maps to the NcAsmParamModeNcDualModeSwitchAsmSeamlessNa protocol variant
 * (ProtocolV2T1.h:2504-2537), which PLAN.md §6 explicitly scopes OUT of v1 ("a documented
 * follow-up"). Shown here using the design's own "unsupported feature" treatment (§5.3 rule 5)
 * rather than faking a control that writes nothing.
 */
export function AmbientLevelSlider({
  active,
  level,
  focusOnVoice,
  onLevelChange,
  onFocusOnVoiceChange,
}: {
  active: boolean;
  level: number;
  focusOnVoice: boolean;
  onLevelChange: (level: number) => void;
  onFocusOnVoiceChange: (enabled: boolean) => void;
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, opacity: 0.45 }}>
          <div>
            <div style={{ fontWeight: 500, fontSize: 12, color: "var(--fg2)" }}>Auto ambient level</div>
            <div className="mono" style={{ marginTop: 3, fontSize: 10, color: "var(--fg3)" }}>
              NOT IMPLEMENTED IN THIS BUILD
            </div>
          </div>
          <Switch checked={false} disabled onChange={() => {}} ariaLabel="Auto ambient level (not implemented)" />
        </div>
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
