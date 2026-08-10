import { useState } from "react";
import { Switch } from "../components/Switch.js";

/**
 * design/SoundConnect Desktop.dc.html §1d "SETTINGS / ABOUT". Toggle state is local-only for
 * now (not yet persisted to disk/localStorage — PLAN.md M6). Disclaimer copy is verbatim from
 * the design's About panel.
 */
export function Settings({ onDone }: { onDone: () => void }) {
  const [reconnect, setReconnect] = useState(true);
  const [launchAtLogin, setLaunchAtLogin] = useState(true);
  const [startMinimized, setStartMinimized] = useState(false);
  const [soundPressure, setSoundPressure] = useState(false);

  const rows: Array<{ label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }> = [
    { label: "Reconnect automatically", hint: "WHEN THE DEVICE POWERS ON", checked: reconnect, onChange: setReconnect },
    { label: "Launch at login", hint: "MENU BAR ONLY, NO WINDOW", checked: launchAtLogin, onChange: setLaunchAtLogin },
    { label: "Start minimised to tray", hint: "SKIPS THE MAIN WINDOW", checked: startMinimized, onChange: setStartMinimized },
    { label: "Show sound pressure readout", hint: "ESTIMATED, NOT CALIBRATED", checked: soundPressure, onChange: setSoundPressure },
  ];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <div
        style={{
          height: 44,
          flex: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 14px",
          borderBottom: "1px solid var(--line)",
          background: "var(--panel)",
        }}
      >
        <div style={{ display: "flex", gap: 7 }}>
          <div style={{ width: 11, height: 11, borderRadius: "50%", background: "var(--dot)" }} />
          <div style={{ width: 11, height: 11, borderRadius: "50%", background: "var(--dot)" }} />
          <div style={{ width: 11, height: 11, borderRadius: "50%", background: "var(--dot)" }} />
        </div>
        <div className="mono" style={{ fontWeight: 600, fontSize: 11, letterSpacing: "0.16em", color: "var(--fg2)" }}>
          SETTINGS
        </div>
        <button
          onClick={onDone}
          style={{ background: "none", border: "none", color: "var(--accent)", fontWeight: 500, fontSize: 11, padding: "6px 8px" }}
        >
          Done
        </button>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
        <div className="mono" style={{ fontWeight: 600, fontSize: 11, letterSpacing: "0.14em", color: "var(--fg3)" }}>
          GENERAL
        </div>
        <div style={{ border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
          {rows.map((r, i) => (
            <div
              key={r.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                padding: "14px 16px",
                background: "var(--panel)",
                borderTop: i === 0 ? "none" : "1px solid var(--line)",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: 13, color: "var(--fg)" }}>{r.label}</div>
                <div className="mono" style={{ marginTop: 4, fontSize: 11, color: "var(--fg3)" }}>
                  {r.hint}
                </div>
              </div>
              <Switch checked={r.checked} onChange={r.onChange} ariaLabel={r.label} />
            </div>
          ))}
        </div>

        <div className="mono" style={{ fontWeight: 600, fontSize: 11, letterSpacing: "0.14em", color: "var(--fg3)" }}>
          ABOUT
        </div>
        <div style={{ padding: "16px 18px", border: "1px solid var(--line)", borderRadius: 10, background: "var(--panel)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{ width: 11, height: 11, borderRadius: "50%", background: "var(--accent)" }} />
            <div className="mono" style={{ fontWeight: 600, fontSize: 12, letterSpacing: "0.24em", color: "var(--fg)" }}>
              NULLPOINT
            </div>
            <div className="mono" style={{ fontSize: 11, color: "var(--fg3)" }}>
              0.1.0 · Apache-2.0
            </div>
          </div>
          <div style={{ marginTop: 12, fontSize: 12, lineHeight: 1.65, color: "var(--fg2)", maxWidth: 520 }}>
            Nullpoint is an independent, community-built client. It is not affiliated with,
            endorsed by, or connected to Sony Group Corporation. Model names are used solely to
            identify compatible hardware. Protocol support is derived from public
            reverse-engineering work; features may break after firmware updates.
          </div>
          <div style={{ marginTop: 14, display: "flex", gap: 16, fontWeight: 500, fontSize: 11.5 }}>
            <a href="https://github.com/mos9527/SonyHeadphonesClient" target="_blank" rel="noreferrer">
              Protocol credits
            </a>
            <a href="/NOTICE" target="_blank" rel="noreferrer">
              Source &amp; licenses
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
