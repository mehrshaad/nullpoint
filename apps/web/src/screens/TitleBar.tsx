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
      {/* It was 11px of --fg3 with no affordance, which read as a caption rather than the only
          control in the bar. Now it carries weight, an icon, and answers to the pointer. */}
      <button
        className="titlebar-action"
        onClick={onSettingsClick}
        disabled={!onSettingsClick}
        style={{ cursor: onSettingsClick ? "pointer" : "default" }}
      >
        <svg
          width={14}
          height={14}
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="8" cy="8" r="2.3" />
          {/* Eight teeth, drawn as spokes so the gear stays legible at 14px where a toothed
              outline turns to mush. */}
          <path d="M8 1.4v1.9M8 12.7v1.9M14.6 8h-1.9M3.3 8H1.4M12.67 3.33l-1.35 1.35M4.68 11.32l-1.35 1.35M12.67 12.67l-1.35-1.35M4.68 4.68 3.33 3.33" />
        </svg>
        Settings
      </button>
    </div>
  );
}
