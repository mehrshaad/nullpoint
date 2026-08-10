import { EqPresetId, type EqBands } from "@ssc/core";
import { useLinearDrag } from "./useLinearDrag.js";

/**
 * design/Dashboard.dc.html §1e "EqualizerPanel". Presets limited to Heavy/Clear/Hard/Soft/Custom
 * — the only ones the WH-1000XM6 FW 3.0.0 EQ accepts (PLAN.md §3, mos9527 PR #48).
 */
const PRESETS: Array<{ id: EqPresetId; label: string }> = [
  { id: EqPresetId.HEAVY, label: "Heavy" },
  { id: EqPresetId.CLEAR, label: "Clear" },
  { id: EqPresetId.HARD, label: "Hard" },
  { id: EqPresetId.SOFT, label: "Soft" },
  { id: EqPresetId.CUSTOM, label: "Custom" },
];

const BANDS: Array<{ key: keyof EqBands; label: string; aria: string }> = [
  { key: "clearBass", label: "CLEAR\nBASS", aria: "Clear Bass" },
  { key: "band400", label: "400", aria: "400 hertz band" },
  { key: "band1k", label: "1k", aria: "1 kilohertz band" },
  { key: "band2_5k", label: "2.5k", aria: "2.5 kilohertz band" },
  { key: "band6_3k", label: "6.3k", aria: "6.3 kilohertz band" },
  { key: "band16k", label: "16k", aria: "16 kilohertz band" },
];

function BandSlider({
  value,
  aria,
  label,
  editable,
  onChange,
}: {
  value: number;
  aria: string;
  label: string;
  editable: boolean;
  onChange: (v: number) => void;
}) {
  const drag = useLinearDrag(-10, 10, onChange);
  const frac = (value + 10) / 20;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, minWidth: 0, opacity: editable ? 1 : 0.5 }}>
      <div className="mono" style={{ fontWeight: 600, fontSize: 11, color: editable ? "var(--fg)" : "var(--fg3)" }}>
        {value > 0 ? `+${value}` : value}
      </div>
      <div
        role="slider"
        tabIndex={editable ? 0 : -1}
        aria-label={aria}
        aria-valuemin={-10}
        aria-valuemax={10}
        aria-valuenow={value}
        aria-disabled={!editable}
        onPointerDown={editable ? (e) => drag.onPointerDown(e, true) : undefined}
        onKeyDown={editable ? (e) => drag.onKeyDown(e, value) : undefined}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 34,
          flex: 1,
          minHeight: 96,
          borderRadius: 8,
          background: "var(--track)",
          border: "1px solid var(--line)",
          cursor: editable ? "ns-resize" : "not-allowed",
          outline: "none",
          touchAction: "none",
        }}
      >
        <div style={{ position: "absolute", left: 6, right: 6, top: "50%", height: 1, background: "var(--line)" }} />
        <div
          style={{
            position: "absolute",
            left: 5,
            right: 5,
            bottom: value >= 0 ? "50%" : `${frac * 100}%`,
            top: value >= 0 ? `${100 - frac * 100}%` : "50%",
            background: "var(--accent)",
            opacity: 0.32,
            borderRadius: 3,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 3,
            right: 3,
            height: 10,
            bottom: `calc(${frac * 100}% - 5px)`,
            borderRadius: 5,
            background: "var(--accent)",
            boxShadow: "0 1px 3px rgba(0,0,0,.6)",
          }}
        />
      </div>
      <div className="mono" style={{ fontSize: 10, letterSpacing: "0.04em", color: "var(--fg3)", textAlign: "center", whiteSpace: "pre" }}>
        {label}
      </div>
    </div>
  );
}

export function EqualizerPanel({
  preset,
  bands,
  onPresetChange,
  onBandChange,
}: {
  preset: EqPresetId;
  bands: EqBands | null;
  onPresetChange: (preset: EqPresetId) => void;
  onBandChange: (key: keyof EqBands, value: number) => void;
}) {
  const editable = preset === EqPresetId.CUSTOM;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 15, border: "1px solid var(--line)", borderRadius: 12, background: "var(--panel)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 16 }}>
        <div className="mono" style={{ fontWeight: 600, fontSize: 11, letterSpacing: "0.14em", color: "var(--fg3)" }}>
          EQUALIZER
        </div>
        <div className="mono" style={{ fontSize: 10, color: "var(--fg3)" }}>
          {editable ? "DRAG OR ARROW KEYS · dB" : "PRESET — SELECT CUSTOM TO EDIT"}
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {PRESETS.map((p) => {
          const on = preset === p.id;
          return (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              aria-pressed={on}
              onClick={() => onPresetChange(p.id)}
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") {
                  e.preventDefault();
                  onPresetChange(p.id);
                }
              }}
              style={{
                padding: "6px 11px",
                borderRadius: 7,
                cursor: "pointer",
                outline: "none",
                userSelect: "none",
                fontWeight: 500,
                fontSize: 11.5,
                background: on ? "var(--accent-soft)" : "transparent",
                border: `1px solid ${on ? "var(--accent)" : "var(--line)"}`,
                color: on ? "var(--accent)" : "var(--fg2)",
                transition: "all .14s ease",
              }}
            >
              {p.label}
            </div>
          );
        })}
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "stretch", gap: 6, paddingTop: 4 }}>
        {BANDS.map((b) => (
          <BandSlider
            key={b.key}
            value={bands?.[b.key] ?? 0}
            aria={b.aria}
            label={b.label}
            editable={editable}
            onChange={(v) => onBandChange(b.key, v)}
          />
        ))}
      </div>
    </div>
  );
}
