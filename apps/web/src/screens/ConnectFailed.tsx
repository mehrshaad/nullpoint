import { describeConnectError } from "../state/useHeadphones.js";
import { TitleBar } from "./TitleBar.js";

/**
 * design/SoundConnect Desktop.dc.html §1b "CONNECTION FAILED".
 * The explanation is derived from the actual error rather than assumed — see
 * describeConnectError — because "nothing in the picker" and "the headset refused" look
 * identical here but need different fixes.
 */
export function ConnectFailed({
  message,
  onRetry,
  onChooseAnother,
}: {
  message: string;
  onRetry: () => void;
  onChooseAnother: () => void;
}) {
  const { headline, hint, detail } = describeConnectError(new Error(message));

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <TitleBar statusColor="var(--warn)" />
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
          {headline}
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
          {hint}
        </div>
        <div
          className="mono"
          style={{ marginTop: 14, fontSize: 10.5, color: "var(--fg3)", maxWidth: 520, textAlign: "center" }}
        >
          {detail}
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
            Try again
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
            Start over
          </button>
        </div>
      </div>
    </div>
  );
}
