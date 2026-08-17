import type { NoiseMode } from "@ssc/core";

const MODES: Array<{ id: NoiseMode; label: string; sub: string }> = [
  { id: "anc", label: "Noise Canceling", sub: "ANC" },
  { id: "ambient", label: "Ambient Sound", sub: "AMB" },
  { id: "off", label: "Off", sub: "BYPASS" },
];

const ORDER: NoiseMode[] = ["anc", "ambient", "off"];

function tint(mode: NoiseMode): string {
  if (mode === "ambient") return "var(--amber)";
  if (mode === "anc") return "var(--accent)";
  return "var(--fg2)";
}

/**
 * The surface under the selected label. Mixed with the panel colour so it stays opaque enough
 * to read as something sitting on the track rather than a wash over it.
 */
function selectedSurface(mode: NoiseMode): string {
  if (mode === "ambient") return "color-mix(in srgb, var(--amber-soft) 70%, var(--panel))";
  if (mode === "anc") return "color-mix(in srgb, var(--accent-soft) 70%, var(--panel))";
  return "var(--panel2)";
}

const RAISED_SHADOW = "0 6px 14px -8px rgb(0 0 0 / 0.85), 0 1px 0 0 rgb(255 255 255 / 0.04) inset";

/** design/Dashboard.dc.html §1e "NoiseModeSegmented" — full geometry/state/keyboard spec there. */
export function NoiseModeSegmented({ value, onChange }: { value: NoiseMode; onChange: (mode: NoiseMode) => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="Noise control mode"
      style={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        // No gap between cells: the indicator below is exactly one third wide and steps by its
        // own width, which only lines up if the cells are flush.
        padding: 3,
        borderRadius: 10,
        background: "var(--track)",
        border: "1px solid var(--line)",
      }}
    >
      {/* One indicator that slides to the chosen mode, rather than three cells that light up
          independently — so switching reads as the same object moving. It carries the border
          too, without which "Off" is nearly invisible against the track. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 3,
          bottom: 3,
          left: 3,
          width: "calc((100% - 6px) / 3)",
          transform: `translateX(${ORDER.indexOf(value) * 100}%)`,
          borderRadius: 8,
          background: selectedSurface(value),
          border: `1px solid ${tint(value)}`,
          boxShadow: RAISED_SHADOW,
          transition:
            "transform .3s cubic-bezier(.4, 0, .2, 1), background .2s ease, border-color .2s ease",
        }}
      />
      {MODES.map((m, i) => {
        const on = value === m.id;
        const c = tint(m.id);
        return (
          <div
            key={m.id}
            role="radio"
            tabIndex={on ? 0 : -1}
            aria-checked={on}
            aria-label={m.label}
            onClick={() => onChange(m.id)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                onChange(ORDER[(i + 1) % 3]!);
              }
              if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                onChange(ORDER[(i + 2) % 3]!);
              }
              if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                onChange(m.id);
              }
            }}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              height: 52,
              borderRadius: 8,
              cursor: "pointer",
              outline: "none",
              userSelect: "none",
              // The indicator behind supplies the surface; the cell only carries its label.
              position: "relative",
              zIndex: 1,
              background: "transparent",
              color: on ? c : "var(--fg3)",
              transition: "color .22s ease",
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 12 }}>{m.label}</div>
            <div className="mono" style={{ fontSize: 9.5, letterSpacing: "0.08em", opacity: 0.62 }}>
              {m.sub}
            </div>
          </div>
        );
      })}
    </div>
  );
}
