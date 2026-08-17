import { AudioCodec, MAX_VOLUME, codecLabel, type PlaybackState } from "@ssc/core";
import { useLinearDrag } from "./useLinearDrag.js";

/**
 * Transport and volume for whatever device is playing, plus the codec actually carrying the
 * audio.
 *
 * The transport buttons are relayed to the source device rather than stored on the headphones,
 * which is why they work from here while a phone is the thing playing. The codec readout is the
 * detail people argue about and rarely get to check.
 */

function Triangle({ back = false }: { back?: boolean }) {
  return <path d={back ? "M13 4 6 10l7 6z" : "M7 4l7 6-7 6z"} />;
}

function TransportButton({
  label,
  onClick,
  disabled,
  primary = false,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  primary?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: primary ? 44 : 36,
        height: primary ? 44 : 36,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "50%",
        border: `1px solid ${primary ? "var(--accent)" : "var(--line)"}`,
        background: primary ? "var(--accent)" : "var(--panel2)",
        color: primary ? "var(--bg)" : "var(--fg2)",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.4 : 1,
        transition: "background .18s ease, border-color .18s ease, color .18s ease",
      }}
    >
      <svg width={20} height={20} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}

export function NowPlaying({
  playback,
  volume,
  codec,
  onPlayPause,
  onNext,
  onPrevious,
  onVolumeChange,
}: {
  playback: PlaybackState | null;
  volume: number | null;
  codec: AudioCodec | null;
  onPlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onVolumeChange: (level: number) => void;
}) {
  const drag = useLinearDrag(0, MAX_VOLUME, onVolumeChange);
  if (!playback && volume === null && codec === null) return null;

  // The headset says when the source isn't offering transport control — a phone on a call, or
  // nothing playing at all. Better to dim the buttons than to have them quietly do nothing.
  const canControl = playback?.available ?? false;
  const frac = volume === null ? 0 : volume / MAX_VOLUME;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        padding: 15,
        border: "1px solid var(--line)",
        borderRadius: 12,
        background: "var(--panel)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div
          className="mono"
          style={{ fontWeight: 600, fontSize: 11, letterSpacing: "0.14em", color: "var(--fg3)" }}
        >
          PLAYBACK
        </div>
        {codec !== null && (
          <div
            className="mono"
            style={{
              fontWeight: 600,
              fontSize: 10,
              letterSpacing: "0.08em",
              color: codec === AudioCodec.LDAC ? "var(--accent)" : "var(--fg2)",
              border: `1px solid ${codec === AudioCodec.LDAC ? "var(--accent)" : "var(--line)"}`,
              borderRadius: 5,
              padding: "3px 7px",
            }}
            title="The codec currently carrying audio"
          >
            {codecLabel(codec)}
          </div>
        )}
      </div>

      {playback && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14 }}>
          <TransportButton label="Previous track" onClick={onPrevious} disabled={!canControl}>
            <Triangle back />
          </TransportButton>
          <TransportButton
            label={playback.playing ? "Pause" : "Play"}
            onClick={onPlayPause}
            disabled={!canControl}
            primary
          >
            {playback.playing ? (
              <>
                <rect x="6" y="4" width="3" height="12" rx="1" />
                <rect x="11" y="4" width="3" height="12" rx="1" />
              </>
            ) : (
              <path d="M6 4l10 6-10 6z" />
            )}
          </TransportButton>
          <TransportButton label="Next track" onClick={onNext} disabled={!canControl}>
            <Triangle />
          </TransportButton>
        </div>
      )}

      {volume !== null && (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <label style={{ fontWeight: 500, fontSize: 12, color: "var(--fg2)" }}>Volume</label>
            <div className="mono" style={{ fontWeight: 600, fontSize: 13, color: "var(--fg)" }}>
              {volume} / {MAX_VOLUME}
            </div>
          </div>
          <div
            role="slider"
            tabIndex={0}
            aria-label="Volume"
            aria-valuemin={0}
            aria-valuemax={MAX_VOLUME}
            aria-valuenow={volume}
            onPointerDown={(e) => drag.onPointerDown(e, false)}
            onKeyDown={(e) => drag.onKeyDown(e, volume)}
            style={{
              position: "relative",
              height: 26,
              display: "flex",
              alignItems: "center",
              cursor: "pointer",
              outline: "none",
              touchAction: "none",
            }}
          >
            <div style={{ position: "absolute", left: 0, right: 0, height: 6, borderRadius: 3, background: "var(--track)" }} />
            <div
              style={{
                position: "absolute",
                left: 0,
                height: 6,
                borderRadius: 3,
                background: "var(--accent)",
                width: `${frac * 100}%`,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: `calc(${frac * 100}% - 8px)`,
                width: 16,
                height: 16,
                borderRadius: "50%",
                background: "var(--accent)",
                border: "3px solid var(--panel)",
                boxShadow: "0 1px 4px rgba(0,0,0,.45)",
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
