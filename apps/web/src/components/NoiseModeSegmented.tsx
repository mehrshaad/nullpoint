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
 * The chosen mode is a solid button raised out of the track, not an outlined cell. Mixing the
 * tint into the panel colour keeps it opaque enough to read as a surface sitting on top, while
 * the unselected modes stay flat and borderless so there is something for it to sit above.
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
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: 3,
        padding: 3,
        borderRadius: 10,
        background: "var(--track)",
        border: "1px solid var(--line)",
      }}
    >
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
              background: on ? selectedSurface(m.id) : "transparent",
              color: on ? c : "var(--fg3)",
              transform: on ? "translateY(-1px)" : "none",
              boxShadow: on ? RAISED_SHADOW : "none",
              transition:
                "background .2s ease, color .2s ease, transform .2s ease, box-shadow .2s ease",
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
