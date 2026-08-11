import { EQ_LAYOUTS, EqPresetId, type EqBands } from "@ssc/core";
import { useLinearDrag } from "./useLinearDrag.js";

/**
 * design/SoundConnect Desktop.dc.html §1e "EqualizerPanel".
 *
 * The band count, labels and dB range all come from whichever layout the headset reported —
 * a WH-1000XM6 on firmware 3.1.5 sends the 10-band graphic shape, older units send Clear Bass
 * plus 5 bands — so nothing here is hard-coded to one of them.
 */
const PRESETS: Array<{ id: EqPresetId; label: string }> = [
  { id: EqPresetId.OFF, label: "Off" },
  { id: EqPresetId.HEAVY, label: "Heavy" },
  { id: EqPresetId.CLEAR, label: "Clear" },
  { id: EqPresetId.HARD, label: "Hard" },
  { id: EqPresetId.SOFT, label: "Soft" },
  { id: EqPresetId.CUSTOM, label: "Custom" },
];

function BandSlider({
  value,
  label,
  min,
  max,
  editable,
  onChange,
}: {
  value: number;
  label: string;
  min: number;
  max: number;
  editable: boolean;
  onChange: (v: number) => void;
}) {
  const drag = useLinearDrag(min, max, onChange);
  const frac = (value - min) / (max - min);
  const aria = label.replace("\n", " ");

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, minWidth: 0, opacity: editable ? 1 : 0.5 }}>
      <div className="mono" style={{ fontWeight: 600, fontSize: 11, color: editable ? "var(--fg)" : "var(--fg3)" }}>
        {value > 0 ? `+${value}` : value}
      </div>
      <div
        role="slider"
        tabIndex={editable ? 0 : -1}
        aria-label={aria}
        aria-valuemin={min}
        aria-valuemax={max}
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
          // Without a ceiling these grow with the window and become unusable ribbons on a
          // tall or ultrawide display.
          maxHeight: 260,
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
      <div
        className="mono"
        style={{ fontSize: 10, letterSpacing: "0.04em", color: "var(--fg3)", textAlign: "center", whiteSpace: "pre" }}
      >
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
  /** index is the band's position in the device's own order. */
  onBandChange: (index: number, value: number) => void;
}) {
  const spec = bands ? EQ_LAYOUTS[bands.layout] : null;
  // Presets compute their own curve; only Custom takes arbitrary band values.
  const editable = preset === EqPresetId.CUSTOM && Boolean(bands);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 15, border: "1px solid var(--line)", borderRadius: 12, background: "var(--panel)", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 16, gap: 10 }}>
        <div className="mono" style={{ fontWeight: 600, fontSize: 11, letterSpacing: "0.14em", color: "var(--fg3)" }}>
          EQUALIZER
        </div>
        <div className="mono" style={{ fontSize: 10, color: "var(--fg3)", textAlign: "right" }}>
          {editable
            ? `DRAG OR ARROW KEYS · ${spec?.min}…+${spec?.max} dB`
            : "PRESET — SELECT CUSTOM TO EDIT"}
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

      {bands && spec ? (
        <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "stretch", gap: 4, paddingTop: 4 }}>
          {bands.values.map((value, i) => (
            <BandSlider
              key={i}
              value={value}
              label={spec.labels[i] ?? String(i + 1)}
              min={spec.min}
              max={spec.max}
              editable={editable}
              onChange={(v) => onBandChange(i, v)}
            />
          ))}
        </div>
      ) : (
        <div
          className="mono"
          style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10.5, color: "var(--fg3)", textAlign: "center" }}
        >
          THIS PRESET HAS NO ADJUSTABLE BANDS
        </div>
      )}
    </div>
  );
}
