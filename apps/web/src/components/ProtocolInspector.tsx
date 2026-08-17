import { useEffect, useRef, useState } from "react";
import { DataType, formatBytes, type Headphones, type TracedFrame } from "@ssc/core";

/**
 * Every frame the app sends and receives.
 *
 * No consumer headphone app shows this, and it is the thing that settles arguments: every
 * serious bug in this project was diagnosed from bytes and misdiagnosed from the rendered UI.
 * Recording is off until you press start, so it costs nothing when closed.
 */
export function ProtocolInspector({ headphones }: { headphones: Headphones | null }) {
  const [frames, setFrames] = useState<readonly TracedFrame[]>([]);
  const [recording, setRecording] = useState(false);
  const [copied, setCopied] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  useEffect(() => {
    if (!headphones) return;
    setRecording(headphones.trace.enabled);
    return headphones.trace.onChange(() => {
      setFrames([...headphones.trace.list()]);
      setRecording(headphones.trace.enabled);
    });
  }, [headphones]);

  // Follow the tail only while the reader is already at the bottom — yanking the view back
  // while someone is reading an earlier frame is worse than not following at all.
  useEffect(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [frames]);

  if (!headphones) {
    return (
      <div style={{ padding: "16px 18px", border: "1px solid var(--line)", borderRadius: 10, background: "var(--panel)" }}>
        <div style={{ fontSize: 12.5, color: "var(--fg3)" }}>Connect your headphones to record frames.</div>
      </div>
    );
  }

  const toggle = () => {
    if (headphones.trace.enabled) headphones.trace.stop();
    else headphones.trace.start(Date.now());
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(headphones.trace.toText());
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard can be refused; the log is still on screen to select by hand.
    }
  };

  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 10, background: "var(--panel)", overflow: "hidden" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          padding: "12px 14px",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <button
          onClick={toggle}
          className="mono"
          style={{
            fontWeight: 600,
            fontSize: 10.5,
            letterSpacing: "0.08em",
            padding: "6px 11px",
            borderRadius: 7,
            cursor: "pointer",
            color: recording ? "var(--warn)" : "var(--accent)",
            border: `1px solid ${recording ? "var(--warn-line)" : "var(--accent)"}`,
            background: "none",
          }}
        >
          {recording ? "■ STOP" : "● RECORD"}
        </button>
        <button
          onClick={() => headphones.trace.clear()}
          className="mono"
          style={{
            fontWeight: 500,
            fontSize: 10.5,
            letterSpacing: "0.08em",
            padding: "6px 11px",
            borderRadius: 7,
            cursor: "pointer",
            color: "var(--fg2)",
            border: "1px solid var(--line)",
            background: "none",
          }}
        >
          CLEAR
        </button>
        <button
          onClick={() => void copy()}
          disabled={frames.length === 0}
          className="mono"
          style={{
            fontWeight: 500,
            fontSize: 10.5,
            letterSpacing: "0.08em",
            padding: "6px 11px",
            borderRadius: 7,
            cursor: frames.length ? "pointer" : "default",
            color: frames.length ? "var(--fg2)" : "var(--fg3)",
            border: "1px solid var(--line)",
            background: "none",
          }}
        >
          {copied ? "COPIED" : "COPY SESSION"}
        </button>
        <div style={{ flex: 1 }} />
        <div className="mono" style={{ fontSize: 10, color: "var(--fg3)" }}>
          {frames.length} FRAMES
        </div>
      </div>

      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
        style={{ maxHeight: 320, overflowY: "auto", overflowX: "auto" }}
      >
        {frames.length === 0 ? (
          <div style={{ padding: "16px 14px", fontSize: 12.5, color: "var(--fg3)" }}>
            {recording
              ? "Recording. Change a setting to see the exchange."
              : "Press record, then change a setting to watch what goes over the wire."}
          </div>
        ) : (
          frames.map((f, i) => (
            <div
              key={i}
              className="mono"
              style={{
                display: "flex",
                gap: 10,
                padding: "5px 14px",
                fontSize: 10.5,
                lineHeight: 1.5,
                whiteSpace: "nowrap",
                borderTop: i === 0 ? "none" : "1px solid color-mix(in srgb, var(--line) 45%, transparent)",
                // Sent and received need to be distinguishable at a glance, before reading.
                color: f.direction === "tx" ? "var(--accent)" : "var(--fg2)",
              }}
            >
              <span style={{ flex: "none", width: 62, textAlign: "right", color: "var(--fg3)" }}>
                {f.at}ms
              </span>
              <span style={{ flex: "none", width: 22 }}>{f.direction === "tx" ? "→" : "←"}</span>
              <span style={{ flex: "none", width: 190, overflow: "hidden", textOverflow: "ellipsis" }}>
                {f.label}
              </span>
              <span style={{ color: "var(--fg3)" }}>
                {f.dataType === DataType.ACK ? "" : formatBytes(f.payload)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
