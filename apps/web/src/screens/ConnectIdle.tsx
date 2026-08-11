import { DeviceArt } from "../components/DeviceArt.js";
import { TitleBar } from "./TitleBar.js";

/** design/SoundConnect Desktop.dc.html §1b "IDLE — NO DEVICE" */
export function ConnectIdle({ onConnect }: { onConnect: () => void }) {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <TitleBar />
      <div
        className="pad-x"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: 16,
            border: "1px solid var(--line)",
            backgroundColor: "var(--panel2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* No device yet — the generic silhouette reads better than an abstract placeholder. */}
          <DeviceArt model={null} size={64} color="var(--fg3)" />
        </div>
        <div style={{ marginTop: 26, fontWeight: 600, fontSize: 26, letterSpacing: "-0.02em", color: "var(--fg)" }}>
          No headphones connected
        </div>
        <div
          style={{
            marginTop: 12,
            maxWidth: 420,
            textAlign: "center",
            fontSize: 13.5,
            lineHeight: 1.6,
            color: "var(--fg2)",
          }}
        >
          Nullpoint controls headphones that are already paired in your system Bluetooth
          settings. It never handles audio — playback stays with your OS.
        </div>
        <button
          onClick={onConnect}
          style={{
            marginTop: 26,
            padding: "13px 26px",
            borderRadius: 9,
            border: "none",
            background: "var(--accent)",
            color: "var(--bg)",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          Connect headphones
        </button>
        <div className="mono" style={{ marginTop: 14, fontSize: 11, color: "var(--fg3)" }}>
          OPENS THE SYSTEM DEVICE PICKER
        </div>
        <div
          style={{
            marginTop: 40,
            width: "100%",
            maxWidth: 520,
            display: "flex",
            gap: 10,
            padding: 14,
            border: "1px solid var(--line)",
            borderRadius: 10,
            background: "var(--panel)",
          }}
        >
          <div style={{ width: 4, flex: "none", borderRadius: 2, background: "var(--dot)" }} />
          <div>
            <div style={{ fontWeight: 500, fontSize: 12, lineHeight: 1.4, color: "var(--fg2)" }}>
              Not seeing your headphones?
            </div>
            <div
              className="mono"
              style={{ marginTop: 6, fontSize: 11.5, lineHeight: 1.6, color: "var(--fg3)" }}
            >
              1 · PAIR THEM IN SYSTEM BLUETOOTH FIRST
              <br />
              2 · TAKE THEM OUT OF THE CASE / POWER ON
              <br />
              3 · CLOSE THE PHONE APP — ONE CONTROLLER AT A TIME
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
