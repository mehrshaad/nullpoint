import { DeviceArt } from "../components/DeviceArt.js";
import { TitleBar } from "./TitleBar.js";

/**
 * design/SoundConnect Desktop.dc.html §1b "IDLE — NO DEVICE"
 *
 * Headphones you've connected before are listed here and reconnect in one click, because a port
 * the browser has already permitted can be opened without going through Chrome's device chooser
 * again. Those ports carry no identity of their own — `getInfo()` is empty for Bluetooth — so
 * the names come from what the headset told us last time it was connected.
 */
export function ConnectIdle({
  onConnect,
  onReconnect,
  knownDevices = [],
  grantedPorts = 0,
}: {
  onConnect: () => void;
  onReconnect?: () => void;
  /** Model names remembered from previous sessions, most recent first. */
  knownDevices?: string[];
  /** Ports the browser has already permitted; without one there is nothing to reconnect to. */
  grantedPorts?: number;
}) {
  const canReconnect = grantedPorts > 0 && Boolean(onReconnect);
  return (
    <div className="screen" style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
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
        {/* Everything here scales with the viewport rather than sitting at one fixed size: on a
            wide display a 96px tile and a 420px column read as a phone layout that wandered onto
            a monitor. Each value keeps a floor and a ceiling so it never inflates absurdly. */}
        <div
          style={{
            width: "clamp(96px, 7vw, 132px)",
            height: "clamp(96px, 7vw, 132px)",
            borderRadius: 18,
            border: "1px solid var(--line)",
            backgroundColor: "var(--panel2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* No device yet — the generic silhouette reads better than an abstract placeholder. */}
          <DeviceArt model={null} size="66%" color="var(--fg3)" />
        </div>
        <div
          style={{
            marginTop: 28,
            fontWeight: 600,
            fontSize: "clamp(26px, 2vw, 34px)",
            letterSpacing: "-0.02em",
            color: "var(--fg)",
          }}
        >
          No headphones connected
        </div>
        <div
          style={{
            marginTop: 12,
            // Wide enough that "playback stays with your OS" doesn't orphan its last word.
            maxWidth: "clamp(440px, 40vw, 620px)",
            textAlign: "center",
            fontSize: "clamp(13.5px, 1vw, 15.5px)",
            lineHeight: 1.65,
            color: "var(--fg2)",
          }}
        >
          Nullpoint controls headphones that are already paired in your system Bluetooth
          settings. It never handles audio — playback stays with your OS.
        </div>
        {canReconnect && (
          <div
            style={{
              marginTop: 28,
              width: "100%",
              maxWidth: "clamp(420px, 34vw, 520px)",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {(knownDevices.length > 0 ? knownDevices : ["Previously connected headphones"]).map(
              (name) => (
                <button
                  key={name}
                  onClick={onReconnect}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 14px",
                    borderRadius: 10,
                    border: "1px solid var(--line)",
                    background: "var(--panel)",
                    color: "var(--fg)",
                    textAlign: "left",
                    transition: "border-color .18s ease, background .18s ease",
                  }}
                >
                  <DeviceArt model={name} size={26} color="var(--fg2)" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{name}</div>
                    <div className="mono" style={{ marginTop: 3, fontSize: 10, color: "var(--fg3)" }}>
                      RECONNECT WITHOUT THE PICKER
                    </div>
                  </div>
                  <div className="mono" style={{ fontSize: 11, color: "var(--accent)" }}>
                    →
                  </div>
                </button>
              )
            )}
          </div>
        )}

        <button
          onClick={onConnect}
          style={{
            marginTop: canReconnect ? 16 : 28,
            padding: canReconnect ? "11px 22px" : "14px 30px",
            borderRadius: 10,
            border: canReconnect ? "1px solid var(--line)" : "none",
            background: canReconnect ? "transparent" : "var(--accent)",
            color: canReconnect ? "var(--fg2)" : "var(--bg)",
            fontWeight: 600,
            fontSize: canReconnect ? 13 : "clamp(14px, 1.05vw, 16px)",
          }}
        >
          {canReconnect ? "Connect different headphones" : "Connect headphones"}
        </button>
        <div className="mono" style={{ marginTop: 14, fontSize: 11, color: "var(--fg3)" }}>
          OPENS THE SYSTEM DEVICE PICKER
        </div>
        <div
          style={{
            marginTop: 40,
            width: "100%",
            maxWidth: "clamp(520px, 44vw, 700px)",
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
