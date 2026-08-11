import { useEffect, useMemo, useRef, useState } from "react";
import {
  AmbientSoundMode,
  DataType,
  NcAsmMode,
  SONY_SPP_SERVICE_UUID,
  encodeSetNcAsm,
  packageDataForBt,
  type NoiseMode,
} from "@ssc/core";
import { DeviceArt } from "../components/DeviceArt.js";
import "./landing.css";

const REPO = "https://github.com/mehrshaad/nullpoint";
const LATEST_RELEASE = `${REPO}/releases/latest`;

const MODES: Array<{ id: NoiseMode; label: string; sub: string; tone: string }> = [
  { id: "anc", label: "Noise Canceling", sub: "ANC", tone: "accent" },
  { id: "ambient", label: "Ambient Sound", sub: "AMB", tone: "amber" },
  { id: "off", label: "Off", sub: "BYPASS", tone: "mute" },
];

const hex = (b: number) => b.toString(16).toUpperCase().padStart(2, "0");

/**
 * The signature element: the real frame Nullpoint puts on the wire, encoded here by the very
 * same @ssc/core functions the app uses. Switching modes re-encodes it, and the bytes that
 * actually changed are highlighted — so the page demonstrates the product's whole premise
 * (it speaks Sony's protocol) instead of asserting it.
 */
function useFrame(mode: NoiseMode): Uint8Array {
  return useMemo(
    () =>
      packageDataForBt(
        DataType.DATA_MDR,
        0,
        encodeSetNcAsm({
          totalEffectOn: mode !== "off",
          mode: mode === "anc" ? NcAsmMode.NC : NcAsmMode.ASM,
          ambientMode: AmbientSoundMode.NORMAL,
          ambientLevel: 14,
        })
      ),
    [mode]
  );
}

interface Segment {
  role: string;
  label: string;
  from: number;
  to: number;
}

/**
 * Frame layout, per PLAN.md §4.2:
 *   <START> <DATA_TYPE> <SEQ> <SIZE:4 BE> <PAYLOAD> <CHECKSUM> <END>
 * The demo values never contain 0x3C/0x3D/0x3E, so no escaping shifts these offsets; if a
 * future value did, we fall back to showing the frame unsegmented rather than mislabelling it.
 */
function segmentsFor(frame: Uint8Array): Segment[] | null {
  const payloadLen = frame.length - 9;
  if (payloadLen < 1) return null;
  return [
    { role: "marker", label: "START", from: 0, to: 1 },
    { role: "type", label: "TYPE", from: 1, to: 2 },
    { role: "seq", label: "SEQ", from: 2, to: 3 },
    { role: "size", label: "LENGTH", from: 3, to: 7 },
    { role: "payload", label: "NC / ASM PAYLOAD", from: 7, to: 7 + payloadLen },
    { role: "checksum", label: "SUM", from: 7 + payloadLen, to: 8 + payloadLen },
    { role: "marker", label: "END", from: 8 + payloadLen, to: 9 + payloadLen },
  ];
}

function WireInspector() {
  const [mode, setMode] = useState<NoiseMode>("anc");
  const frame = useFrame(mode);
  const previous = useRef<Uint8Array>(frame);
  const [changed, setChanged] = useState<Set<number>>(new Set());

  useEffect(() => {
    const before = previous.current;
    const diff = new Set<number>();
    if (before.length === frame.length) {
      for (let i = 0; i < frame.length; i++) if (before[i] !== frame[i]) diff.add(i);
    }
    previous.current = frame;
    if (diff.size === 0) return;
    setChanged(diff);
    const timer = setTimeout(() => setChanged(new Set()), 1100);
    return () => clearTimeout(timer);
  }, [frame]);

  const segments = segmentsFor(frame);

  return (
    <div className="lp-wire lp-rise" style={{ animationDelay: "0.18s" }}>
      <div className="lp-wire-head">
        <DeviceArt model="WH-1000XM6" size={22} color="var(--fg3)" />
        <div className="lp-wire-title">WH-1000XM6 · NOISE CONTROL</div>
        <div className="lp-wire-uuid">RFCOMM {SONY_SPP_SERVICE_UUID.toLowerCase()}</div>
      </div>

      <div className="lp-wire-body">
        <div className="lp-modes" role="radiogroup" aria-label="Demo noise control mode">
          {MODES.map((m) => (
            <button
              key={m.id}
              className="lp-mode"
              role="radio"
              aria-checked={mode === m.id}
              data-tone={m.tone}
              onClick={() => setMode(m.id)}
            >
              <span className="lp-mode-label">{m.label}</span>
              <span className="lp-mode-sub">{m.sub}</span>
            </button>
          ))}
        </div>

        <p className="lp-wire-caption">
          Pick a mode. These are the exact bytes Nullpoint writes to the headphones over
          Bluetooth — encoded right here by the same code the app ships.
        </p>

        <div className="lp-bytes">
          {segments ? (
            segments.map((seg) => (
              <div className="lp-seg" key={seg.label} data-role={seg.role}>
                <div className="lp-seg-bytes">
                  {Array.from(frame.slice(seg.from, seg.to)).map((byte, i) => {
                    const index = seg.from + i;
                    return (
                      <span
                        className="lp-byte"
                        key={index}
                        data-changed={changed.has(index) ? "true" : "false"}
                      >
                        {hex(byte)}
                      </span>
                    );
                  })}
                </div>
                <div className="lp-seg-label">{seg.label}</div>
              </div>
            ))
          ) : (
            <div className="lp-seg">
              <div className="lp-seg-bytes">
                {Array.from(frame).map((byte, i) => (
                  <span className="lp-byte" key={i}>
                    {hex(byte)}
                  </span>
                ))}
              </div>
              <div className="lp-seg-label">FRAME</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const FEATURES = [
  {
    model: "WH-1000XM6",
    title: "Noise control",
    body: "Switch between noise canceling, ambient sound and off, and set the ambient level anywhere from sealed to fully open.",
  },
  {
    model: "WF-1000XM5",
    title: "Equalizer",
    body: "The five bands plus Clear Bass, with Sony's presets. Changes apply to the headset itself, so they follow you to every device.",
  },
  {
    model: "WI-1000XM2",
    title: "Battery at a glance",
    body: "Live charge level and charging state, read straight from the headset — no phone in the loop.",
  },
  {
    model: null,
    title: "Stays out of the way",
    body: "Lives in the tray, can start with you at login without opening a window, and reconnects on its own when the headphones come back.",
  },
];

export function Landing() {
  return (
    <div className="lp">
      <nav className="lp-nav">
        <div className="lp-wrap lp-nav-inner">
          <div className="lp-mark">
            <span className="lp-dot" />
            NULLPOINT
          </div>
          <div className="lp-nav-links">
            <a className="lp-nav-link" href="#download">
              Download
            </a>
            <a className="lp-nav-link" href={REPO} target="_blank" rel="noreferrer">
              GitHub
            </a>
            <a className="lp-nav-link" href="/app">
              Open web app
            </a>
          </div>
        </div>
      </nav>

      <header className="lp-wrap lp-hero">
        <div className="lp-eyebrow lp-rise">
          <span>UNOFFICIAL CLIENT</span>
          <span className="lp-eyebrow-sep" />
          <span>APACHE-2.0</span>
          <span className="lp-eyebrow-sep" />
          <span>NOT AFFILIATED WITH SONY</span>
        </div>

        <h1 className="lp-h1 lp-rise" style={{ animationDelay: "0.06s" }}>
          Sony never made a desktop app for your headphones. <em>This is it.</em>
        </h1>

        <p className="lp-sub lp-rise" style={{ animationDelay: "0.1s" }}>
          Nullpoint controls noise canceling, ambient sound and the equalizer on your Sony
          headphones from Windows, macOS, or straight from your browser — over the same
          Bluetooth channel Sony's own phone app uses.
        </p>

        <div className="lp-cta-row lp-rise" style={{ animationDelay: "0.14s" }}>
          <a className="lp-btn lp-btn-primary" href={LATEST_RELEASE}>
            Download for Windows
          </a>
          <a className="lp-btn lp-btn-ghost" href="/app">
            Open in your browser
          </a>
        </div>
        <div className="lp-cta-note lp-rise" style={{ animationDelay: "0.18s" }}>
          FREE AND OPEN SOURCE · NO ACCOUNT · PAIR THE HEADPHONES FIRST
        </div>

        <WireInspector />
      </header>

      <section className="lp-wrap lp-section">
        <div className="lp-section-head">
          <h2 className="lp-h2">What you get</h2>
          <span className="lp-section-note">TESTED ON WH-1000XM6</span>
        </div>
        <div className="lp-grid">
          {FEATURES.map((f) => (
            <div className="lp-card" key={f.title}>
              <DeviceArt model={f.model} size={30} color="var(--accent)" />
              <div className="lp-card-title">{f.title}</div>
              <p className="lp-card-body">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-wrap lp-section" id="download">
        <div className="lp-section-head">
          <h2 className="lp-h2">Get Nullpoint</h2>
          <span className="lp-section-note">THE HEADPHONES MUST ALREADY BE PAIRED</span>
        </div>
        <div className="lp-dl">
          <a className="lp-dl-card" data-primary="true" href={LATEST_RELEASE}>
            <div className="lp-dl-os">Windows</div>
            <div className="lp-dl-meta">INSTALLER · 64-BIT</div>
            <p className="lp-dl-body">
              The full desktop app. Sits in the tray, can start at login, and picks your headset
              automatically.
            </p>
            <div className="lp-dl-action">Download the installer →</div>
          </a>

          <a className="lp-dl-card" href={`${REPO}#getting-started`}>
            <div className="lp-dl-os">macOS</div>
            <div className="lp-dl-meta">BUILD FROM SOURCE</div>
            <p className="lp-dl-body">
              The app runs on macOS and lives in the menu bar, but there is no signed build to
              download yet — you will need to build it yourself.
            </p>
            <div className="lp-dl-action">See the build steps →</div>
          </a>

          <a className="lp-dl-card" href="/app">
            <div className="lp-dl-os">Browser</div>
            <div className="lp-dl-meta">CHROME · EDGE · OPERA · ARC</div>
            <p className="lp-dl-body">
              Nothing to install. Needs a Chromium browser on desktop, because Safari and Firefox
              cannot talk to Bluetooth Classic devices.
            </p>
            <div className="lp-dl-action">Open the web app →</div>
          </a>
        </div>
      </section>

      <section className="lp-wrap lp-section">
        <div className="lp-section-head">
          <h2 className="lp-h2">How it works</h2>
          <span className="lp-section-note">RFCOMM, NOT BLE</span>
        </div>
        <p className="lp-sub" style={{ marginTop: 20 }}>
          Sony's headphones take their settings over a proprietary Bluetooth Classic serial
          channel — audio itself is ordinary A2DP that your operating system already handles.
          Nullpoint implements that control channel, using the Web Serial API to reach it, and
          the protocol work comes from the community projects credited in the repository.
        </p>
        <div className="lp-cta-row">
          <a className="lp-btn lp-btn-ghost" href={`${REPO}/blob/main/PROTOCOL.md`} target="_blank" rel="noreferrer">
            Read the protocol notes
          </a>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-wrap">
          <p className="lp-disclaimer">
            Nullpoint is an independent, community-built client. It is not affiliated with,
            endorsed by, or connected to Sony Group Corporation. Model names are used solely to
            identify compatible hardware. Protocol support is derived from public
            reverse-engineering work, so features may break after a firmware update.
          </p>
          <div className="lp-footer-links">
            <a href={REPO} target="_blank" rel="noreferrer">
              Source
            </a>
            <a href={`${REPO}/blob/main/NOTICE`} target="_blank" rel="noreferrer">
              Licenses
            </a>
            <a href={`${REPO}/issues`} target="_blank" rel="noreferrer">
              Report a device
            </a>
            <a href="/app">Open web app</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
