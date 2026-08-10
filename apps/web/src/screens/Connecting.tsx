import { TitleBar } from "./TitleBar.js";

/**
 * design/SoundConnect Desktop.dc.html §1b "CONNECTING".
 * NOTE: the design's per-step checklist implies live progress tracking we don't have yet
 * (Headphones.connect() runs the whole handshake as one call) — shown here as a single honest
 * status line instead of fabricated step checkmarks. Wiring granular progress is a follow-up.
 */
export function Connecting({ onCancel }: { onCancel: () => void }) {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <TitleBar statusColor="var(--accent)" />
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 80px",
        }}
      >
        <div style={{ position: "relative", width: 96, height: 96 }}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              border: "2px solid var(--track)",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              border: "2px solid transparent",
              borderTopColor: "var(--accent)",
              animation: "spin 1s linear infinite",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 22,
              borderRadius: 12,
              border: "1px solid var(--line)",
              backgroundColor: "var(--panel2)",
              backgroundImage: "repeating-linear-gradient(135deg, transparent 0 6px, var(--stripe) 6px 7px)",
            }}
          />
        </div>
        <div style={{ marginTop: 26, fontWeight: 600, fontSize: 22, letterSpacing: "-0.02em", color: "var(--fg)" }}>
          Connecting…
        </div>
        <div style={{ marginTop: 12, fontSize: 13, color: "var(--fg2)", textAlign: "center" }}>
          Opening the control channel (RFCOMM) and reading device state.
        </div>
        <button
          onClick={onCancel}
          style={{
            marginTop: 30,
            padding: "10px 20px",
            border: "1px solid var(--line)",
            borderRadius: 8,
            background: "transparent",
            color: "var(--fg2)",
            fontWeight: 500,
            fontSize: 12.5,
          }}
        >
          Cancel
        </button>
      </div>
      <style>{"@keyframes spin { to { transform: rotate(360deg) } }"}</style>
    </div>
  );
}
