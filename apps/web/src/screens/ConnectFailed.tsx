import { TitleBar } from "./TitleBar.js";

/** design/SoundConnect Desktop.dc.html §1b "CONNECTION FAILED" — RFCOMM copy fix per PLAN.md §5.3. */
export function ConnectFailed({
  message,
  onRetry,
  onChooseAnother,
}: {
  message: string;
  onRetry: () => void;
  onChooseAnother: () => void;
}) {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <TitleBar statusColor="var(--warn)" />
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
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: 16,
            border: "1px solid var(--warn-line)",
            background: "var(--warn-bg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ width: 3, height: 44, borderRadius: 2, background: "var(--warn)" }} />
        </div>
        <div style={{ marginTop: 26, fontWeight: 600, fontSize: 22, letterSpacing: "-0.02em", color: "var(--fg)" }}>
          Couldn't reach your headphones
        </div>
        <div
          style={{
            marginTop: 12,
            maxWidth: 440,
            textAlign: "center",
            fontSize: 13,
            lineHeight: 1.6,
            color: "var(--fg2)",
          }}
        >
          The device answered pairing but closed the control link. This usually means another
          app — often Sound Connect on your phone — holds the session.
        </div>
        <div className="mono" style={{ marginTop: 12, fontSize: 11, color: "var(--fg3)" }}>
          {message}
        </div>
        <div style={{ marginTop: 26, display: "flex", gap: 10 }}>
          <button
            onClick={onRetry}
            style={{
              padding: "12px 24px",
              borderRadius: 9,
              border: "none",
              background: "var(--accent)",
              color: "var(--bg)",
              fontWeight: 600,
              fontSize: 13.5,
            }}
          >
            Retry
          </button>
          <button
            onClick={onChooseAnother}
            style={{
              padding: "12px 20px",
              borderRadius: 9,
              border: "1px solid var(--line)",
              background: "transparent",
              color: "var(--fg2)",
              fontWeight: 500,
              fontSize: 13.5,
            }}
          >
            Choose another device
          </button>
        </div>
      </div>
    </div>
  );
}
