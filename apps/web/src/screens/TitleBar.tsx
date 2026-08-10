/** design/SoundConnect Desktop.dc.html §1b window chrome (dots + wordmark). */
export function TitleBar({
  statusColor = "var(--dot)",
  onSettingsClick,
}: {
  statusColor?: string;
  onSettingsClick?: () => void;
}) {
  return (
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
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 9, height: 9, borderRadius: "50%", background: statusColor }} />
        <div className="mono" style={{ fontWeight: 600, fontSize: 11, letterSpacing: "0.16em", color: "var(--fg2)" }}>
          NULLPOINT
        </div>
      </div>
      <button
        onClick={onSettingsClick}
        disabled={!onSettingsClick}
        style={{
          background: "none",
          border: "none",
          fontSize: 11,
          color: "var(--fg3)",
          padding: "6px 8px",
          cursor: onSettingsClick ? "pointer" : "default",
        }}
      >
        Settings
      </button>
    </div>
  );
}
