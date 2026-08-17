import { useEffect, useRef, useState } from "react";

/**
 * A binaural demo: audio placed at a point in space around your head, rendered with an HRTF.
 *
 * This is the one place Nullpoint touches sound, and it is deliberately narrow. It plays a tone
 * of its own, or a file you choose, entirely inside this page — it does not intercept your
 * music, and your OS still owns playback everywhere else. Doing this to the system audio stream
 * would mean shipping a virtual audio device, which is a different product.
 *
 * It is not head-tracked, and cannot be: the headphones advertise a head tracker but the public
 * reverse-engineering work has no message format for reading it, so there is no orientation to
 * follow. The position here is the one you set.
 *
 * The point is comparison — this is what spatialisation sounds like when software does it, next
 * to what your headphones do themselves in Spatial music.
 */
export function SpatialDemo() {
  const [playing, setPlaying] = useState(false);
  const [azimuth, setAzimuth] = useState(0);
  const [distance, setDistance] = useState(1.6);
  const [orbiting, setOrbiting] = useState(true);
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const pannerRef = useRef<PannerNode | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const fileRef = useRef<ArrayBuffer | null>(null);
  const frameRef = useRef<number | null>(null);

  // Everything here holds an AudioContext and a running graph; leaving one alive after the
  // panel closes would keep the audio device open for no reason.
  useEffect(() => {
    return () => {
      stopRef.current?.();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      void ctxRef.current?.close();
    };
  }, []);

  /** Position is polar around the listener: azimuth in degrees, distance in metres. */
  const place = (deg: number, metres: number) => {
    const panner = pannerRef.current;
    const ctx = ctxRef.current;
    if (!panner || !ctx) return;
    const rad = (deg * Math.PI) / 180;
    const when = ctx.currentTime;
    // Ramped rather than set outright: a jump in position clicks audibly.
    panner.positionX.linearRampToValueAtTime(Math.sin(rad) * metres, when + 0.05);
    panner.positionZ.linearRampToValueAtTime(-Math.cos(rad) * metres, when + 0.05);
    panner.positionY.linearRampToValueAtTime(0, when + 0.05);
  };

  useEffect(() => {
    place(azimuth, distance);
  }, [azimuth, distance]);

  // Auto-orbit: the clearest way to hear an HRTF working is to let the source travel.
  useEffect(() => {
    if (!playing || !orbiting) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const delta = now - last;
      last = now;
      setAzimuth((a) => (a + delta * 0.045) % 360);
      raf = requestAnimationFrame(tick);
      frameRef.current = raf;
    };
    raf = requestAnimationFrame(tick);
    frameRef.current = raf;
    return () => cancelAnimationFrame(raf);
  }, [playing, orbiting]);

  const start = async () => {
    setError(null);
    try {
      const ctx = ctxRef.current ?? new AudioContext();
      ctxRef.current = ctx;
      await ctx.resume();

      const panner = new PannerNode(ctx, {
        // The whole point: a real head-related transfer function, not left/right balance.
        panningModel: "HRTF",
        distanceModel: "inverse",
        refDistance: 1,
      });
      panner.connect(ctx.destination);
      pannerRef.current = panner;
      place(azimuth, distance);

      if (fileRef.current) {
        const buffer = await ctx.decodeAudioData(fileRef.current.slice(0));
        const source = new AudioBufferSourceNode(ctx, { buffer, loop: true });
        source.connect(panner);
        source.start();
        stopRef.current = () => {
          source.stop();
          source.disconnect();
        };
      } else {
        // No file: short noise bursts. Broadband and transient, which is what makes direction
        // audible — a pure sine tone is close to impossible to localise.
        const noise = ctx.createBufferSource();
        const length = Math.floor(ctx.sampleRate * 2);
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
          // A pulse every half second, decaying — a click train localises far better than a hiss.
          const phase = (i % (ctx.sampleRate / 2)) / (ctx.sampleRate / 2);
          data[i] = (Math.random() * 2 - 1) * Math.exp(-phase * 18) * 0.6;
        }
        noise.buffer = buffer;
        noise.loop = true;
        noise.connect(panner);
        noise.start();
        stopRef.current = () => {
          noise.stop();
          noise.disconnect();
        };
      }
      setPlaying(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start audio.");
    }
  };

  const stop = () => {
    stopRef.current?.();
    stopRef.current = null;
    pannerRef.current?.disconnect();
    pannerRef.current = null;
    setPlaying(false);
  };

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    // Read locally and keep it in memory: nothing is uploaded anywhere.
    fileRef.current = await file.arrayBuffer();
    setSourceName(file.name);
    if (playing) {
      stop();
      await start();
    }
  };

  // Where the source currently is, drawn as a dot orbiting a head.
  const rad = (azimuth * Math.PI) / 180;
  const radius = 26 + (distance - 0.5) * 14;
  const dotX = 50 + Math.sin(rad) * radius;
  const dotY = 50 - Math.cos(rad) * radius;

  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 10, background: "var(--panel)", padding: 15 }}>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <svg width={100} height={100} viewBox="0 0 100 100" aria-hidden="true" style={{ flex: "none" }}>
          <circle cx="50" cy="50" r="44" fill="none" stroke="var(--line)" strokeDasharray="2 4" />
          {/* The listener, facing up the page. */}
          <circle cx="50" cy="50" r="11" fill="none" stroke="var(--fg3)" strokeWidth="1.5" />
          <path d="M44 42a6 6 0 0 1 12 0" fill="none" stroke="var(--fg3)" strokeWidth="1.5" />
          <circle cx={dotX} cy={dotY} r="5" fill="var(--accent)" />
        </svg>

        <div style={{ flex: "1 1 220px", minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => (playing ? stop() : void start())}
              className="mono"
              style={{
                fontWeight: 600,
                fontSize: 10.5,
                letterSpacing: "0.08em",
                padding: "7px 12px",
                borderRadius: 7,
                cursor: "pointer",
                color: playing ? "var(--warn)" : "var(--accent)",
                border: `1px solid ${playing ? "var(--warn-line)" : "var(--accent)"}`,
                background: "none",
              }}
            >
              {playing ? "■ STOP" : "▶ PLAY"}
            </button>
            <button
              onClick={() => setOrbiting((o) => !o)}
              aria-pressed={orbiting}
              className="mono"
              style={{
                fontWeight: 500,
                fontSize: 10.5,
                letterSpacing: "0.08em",
                padding: "7px 12px",
                borderRadius: 7,
                cursor: "pointer",
                color: orbiting ? "var(--accent)" : "var(--fg2)",
                border: `1px solid ${orbiting ? "var(--accent)" : "var(--line)"}`,
                background: "none",
              }}
            >
              ORBIT
            </button>
            <label
              className="mono"
              style={{
                fontWeight: 500,
                fontSize: 10.5,
                letterSpacing: "0.08em",
                padding: "7px 12px",
                borderRadius: 7,
                cursor: "pointer",
                color: "var(--fg2)",
                border: "1px solid var(--line)",
              }}
            >
              {sourceName ? "CHANGE FILE" : "USE A FILE"}
              <input
                type="file"
                accept="audio/*"
                onChange={(e) => void pickFile(e.target.files?.[0])}
                style={{ display: "none" }}
              />
            </label>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "var(--fg2)" }}>
            <span style={{ width: 56, flex: "none" }}>Angle</span>
            <input
              type="range"
              min={0}
              max={359}
              value={Math.round(azimuth)}
              onChange={(e) => {
                setOrbiting(false);
                setAzimuth(Number(e.target.value));
              }}
              style={{ flex: 1, minWidth: 0, accentColor: "var(--accent)" }}
            />
            <span className="mono" style={{ width: 42, textAlign: "right", fontSize: 11 }}>
              {Math.round(azimuth)}°
            </span>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "var(--fg2)" }}>
            <span style={{ width: 56, flex: "none" }}>Distance</span>
            <input
              type="range"
              min={0.5}
              max={4}
              step={0.1}
              value={distance}
              onChange={(e) => setDistance(Number(e.target.value))}
              style={{ flex: 1, minWidth: 0, accentColor: "var(--accent)" }}
            />
            <span className="mono" style={{ width: 42, textAlign: "right", fontSize: 11 }}>
              {distance.toFixed(1)}m
            </span>
          </label>
        </div>
      </div>

      <div style={{ marginTop: 12, fontSize: 12, lineHeight: 1.55, color: "var(--fg3)" }}>
        {sourceName ? `Playing ${sourceName} — ` : "Playing a click train — "}
        rendered through an HRTF in this page. Your music and the rest of your audio are
        untouched. Not head-tracked: your headphones report having a head tracker but no public
        message format exists for reading it, so the position is the one you set above.
      </div>

      {error && (
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--warn)" }}>{error}</div>
      )}
    </div>
  );
}
