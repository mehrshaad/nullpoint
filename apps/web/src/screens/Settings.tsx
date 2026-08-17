import type { Headphones, HeadphonesState } from "@ssc/core";
import { Switch } from "../components/Switch.js";
import { CapabilityReport } from "../components/CapabilityReport.js";
import { ProtocolInspector } from "../components/ProtocolInspector.js";
import { ACCENTS, type AccentName, type AppSettings } from "../state/useSettings.js";

const THEMES: Array<AppSettings["theme"]> = ["system", "dark", "light"];

interface ToggleRow {
  key: keyof AppSettings;
  label: string;
  hint: string;
  /** Only meaningful in the Electron shell; hidden in the browser build. */
  desktopOnly?: boolean;
}

const TOGGLE_ROWS: ToggleRow[] = [
  { key: "launchAtLogin", label: "Launch at login", hint: "STARTS IN THE TRAY, NO WINDOW", desktopOnly: true },
  { key: "startMinimized", label: "Start minimised to tray", hint: "SKIPS THE MAIN WINDOW", desktopOnly: true },
  { key: "closeToTray", label: "Keep running when window closes", hint: "CLOSING HIDES TO THE TRAY", desktopOnly: true },
  { key: "reconnectAutomatically", label: "Reconnect automatically", hint: "WHEN THE DEVICE POWERS ON" },
  {
    key: "hotkeys",
    label: "Global shortcuts",
    hint: "CTRL+ALT+N CYCLES · 1 ANC · 2 AMBIENT · 3 OFF",
    desktopOnly: true,
  },
  { key: "showSoundPressure", label: "Show sound pressure readout", hint: "ESTIMATED, NOT CALIBRATED" },
];

/**
 * design/SoundConnect Desktop.dc.html §1d "SETTINGS / ABOUT".
 * Desktop-only rows (launch at login, tray behaviour) are hidden in the browser build, where
 * they have no meaning. Disclaimer copy is verbatim from the design's About panel.
 */
export function Settings({
  settings,
  update,
  isDesktop,
  deviceState,
  onPowerOff,
  headphones,
  onDone,
}: {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void | Promise<void>;
  isDesktop: boolean;
  /** Null when nothing is connected — the capability panel then just says so. */
  deviceState: HeadphonesState | null;
  /** Absent when nothing is connected. */
  onPowerOff?: () => void;
  /** The live session, for the protocol inspector. Null when nothing is connected. */
  headphones?: Headphones | null;
  onDone: () => void;
}) {
  const rows = TOGGLE_ROWS.filter((row) => isDesktop || !row.desktopOnly);

  return (
    <div className="screen" style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
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

      <div style={{ flex: 1, overflow: "auto" }}>
        <div
          className="measure-narrow"
          style={{ padding: "20px 24px 32px", display: "flex", flexDirection: "column", gap: 18 }}
        >
        <div className="mono" style={{ fontWeight: 600, fontSize: 11, letterSpacing: "0.14em", color: "var(--fg3)" }}>
          GENERAL
        </div>
        <div style={{ border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
          {rows.map((row, i) => (
            <div
              key={row.key}
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
                <div style={{ fontWeight: 500, fontSize: 13, color: "var(--fg)" }}>{row.label}</div>
                <div className="mono" style={{ marginTop: 4, fontSize: 11, color: "var(--fg3)" }}>
                  {row.hint}
                </div>
              </div>
              <Switch
                checked={Boolean(settings[row.key])}
                onChange={(next) => void update({ [row.key]: next })}
                ariaLabel={row.label}
              />
            </div>
          ))}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              padding: "14px 16px",
              background: "var(--panel)",
              borderTop: "1px solid var(--line)",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 500, fontSize: 13, color: "var(--fg)" }}>Theme</div>
              <div className="mono" style={{ marginTop: 4, fontSize: 11, color: "var(--fg3)" }}>
                FOLLOWS SYSTEM BY DEFAULT
              </div>
            </div>
            <div role="radiogroup" aria-label="Theme" style={{ display: "flex", gap: 4 }}>
              {THEMES.map((theme) => {
                const on = settings.theme === theme;
                return (
                  <button
                    key={theme}
                    role="radio"
                    aria-checked={on}
                    onClick={() => void update({ theme })}
                    className="mono"
                    style={{
                      padding: "7px 11px",
                      borderRadius: 7,
                      border: `1px solid ${on ? "var(--accent)" : "var(--line)"}`,
                      background: on ? "var(--accent-soft)" : "transparent",
                      color: on ? "var(--accent)" : "var(--fg2)",
                      fontWeight: 500,
                      fontSize: 11,
                      textTransform: "capitalize",
                    }}
                  >
                    {theme}
                  </button>
                );
              })}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              flexWrap: "wrap",
              padding: "14px 16px",
              background: "var(--panel)",
              borderTop: "1px solid var(--line)",
            }}
          >
            <div style={{ flex: "1 1 200px", minWidth: 0 }}>
              <div style={{ fontWeight: 500, fontSize: 13, color: "var(--fg)" }}>Accent</div>
              <div className="mono" style={{ marginTop: 4, fontSize: 11, color: "var(--fg3)" }}>
                {ACCENTS[settings.accent]?.label.toUpperCase() ?? "BLUE"}
              </div>
            </div>
            {/* Swatches rather than names: the colour is the label. */}
            <div role="radiogroup" aria-label="Accent colour" style={{ display: "flex", gap: 7 }}>
              {(Object.keys(ACCENTS) as AccentName[]).map((key) => {
                const on = settings.accent === key;
                const swatch = ACCENTS[key];
                return (
                  <button
                    key={key}
                    role="radio"
                    aria-checked={on}
                    aria-label={swatch.label}
                    title={swatch.label}
                    onClick={() => void update({ accent: key })}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: "50%",
                      cursor: "pointer",
                      background: `light-dark(${swatch.light}, ${swatch.dark})`,
                      // The ring sits outside the swatch so the colour stays a clean circle.
                      border: "2px solid var(--panel)",
                      boxShadow: on ? "0 0 0 2px var(--fg2)" : "0 0 0 1px var(--line)",
                      transition: "box-shadow .18s ease, transform .18s ease",
                      transform: on ? "scale(1.06)" : "none",
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>

        <div className="mono" style={{ fontWeight: 600, fontSize: 11, letterSpacing: "0.14em", color: "var(--fg3)" }}>
          WHAT YOUR HEADPHONES REPORT
        </div>
        <CapabilityReport state={deviceState} />

        {deviceState?.canPowerOff && onPowerOff && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              flexWrap: "wrap",
              padding: "14px 16px",
              border: "1px solid var(--line)",
              borderRadius: 10,
              background: "var(--panel)",
            }}
          >
            <div style={{ flex: "1 1 200px", minWidth: 0 }}>
              <div style={{ fontWeight: 500, fontSize: 13, color: "var(--fg)" }}>Turn off headphones</div>
              <div className="mono" style={{ marginTop: 4, fontSize: 11, color: "var(--fg3)" }}>
                DISCONNECTS — USE THEIR POWER BUTTON TO COME BACK
              </div>
            </div>
            <button
              onClick={onPowerOff}
              className="mono"
              style={{
                flex: "none",
                fontWeight: 500,
                fontSize: 11,
                letterSpacing: "0.08em",
                padding: "8px 12px",
                borderRadius: 7,
                cursor: "pointer",
                color: "var(--warn)",
                background: "none",
                border: "1px solid var(--warn-line)",
              }}
            >
              TURN OFF
            </button>
          </div>
        )}

        <div className="mono" style={{ fontWeight: 600, fontSize: 11, letterSpacing: "0.14em", color: "var(--fg3)" }}>
          PROTOCOL INSPECTOR
        </div>
        <ProtocolInspector headphones={headphones ?? null} />

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
              {__APP_VERSION__} · Apache-2.0
            </div>
          </div>
          <div style={{ marginTop: 12, fontSize: 12, lineHeight: 1.65, color: "var(--fg2)", maxWidth: 520 }}>
            Nullpoint is an independent, community-built client. It is not affiliated with,
            endorsed by, or connected to Sony Group Corporation. Model names are used solely to
            identify compatible hardware. Protocol support is derived from public
            reverse-engineering work; features may break after firmware updates.
          </div>
          <div style={{ marginTop: 14, display: "flex", gap: 16, fontWeight: 500, fontSize: 11.5 }}>
            <a href="https://github.com/mehrshaad/nullpoint" target="_blank" rel="noreferrer">
              Source &amp; licenses
            </a>
            <a href="https://github.com/mos9527/SonyHeadphonesClient" target="_blank" rel="noreferrer">
              Protocol credits
            </a>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
