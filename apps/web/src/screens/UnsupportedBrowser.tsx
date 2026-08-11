const BROWSERS: Array<{ name: string; ok: boolean }> = [
  { name: "Chrome", ok: true },
  { name: "Edge", ok: true },
  { name: "Safari", ok: false },
  { name: "Firefox", ok: false },
];

/** design/SoundConnect Desktop.dc.html §1b "WEB — UNSUPPORTED BROWSER" — RFCOMM copy fix per PLAN.md §5.3. */
export function UnsupportedBrowser() {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <div
        style={{
          height: 44,
          flex: "none",
          display: "flex",
          alignItems: "center",
          gap: 10,
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
      </div>
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
            fontWeight: 600,
            fontSize: 22,
            lineHeight: 1.25,
            letterSpacing: "-0.02em",
            textAlign: "center",
            maxWidth: 520,
          }}
        >
          This browser can't talk to Bluetooth Classic devices
        </div>
        <div
          style={{
            marginTop: 12,
            maxWidth: 460,
            textAlign: "center",
            fontSize: 13,
            lineHeight: 1.6,
            color: "var(--fg2)",
          }}
        >
          The web version needs the Web Serial API, available in Chrome, Edge, Opera and Arc on
          desktop. Safari and Firefox don't implement it.
        </div>
        <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(4, 120px)", gap: 8 }}>
          {BROWSERS.map((b) => (
            <div
              key={b.name}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                height: 62,
                borderRadius: 9,
                border: `1px solid ${b.ok ? "rgba(127,194,155,.35)" : "var(--line)"}`,
                background: b.ok ? "var(--ok-bg)" : "transparent",
                color: b.ok ? "var(--ok)" : "var(--fg3)",
              }}
            >
              <div style={{ fontWeight: 500, fontSize: 12 }}>{b.name}</div>
              <div className="mono" style={{ fontWeight: 500, fontSize: 10, letterSpacing: "0.08em", opacity: 0.75 }}>
                {b.ok ? "SUPPORTED" : "NO API"}
              </div>
            </div>
          ))}
        </div>
        <div
          style={{
            marginTop: 36,
            padding: "12px 16px",
            border: "1px dashed var(--line)",
            borderRadius: 9,
            fontSize: 11,
            lineHeight: 1.6,
            color: "var(--fg3)",
            textAlign: "center",
          }}
          className="mono"
        >
          Or use the Nullpoint desktop app for Windows / macOS instead.
        </div>
      </div>
    </div>
  );
}
