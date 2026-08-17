import { useState, type ReactElement } from "react";
import type { PairedDevice, PairedDeviceKind } from "@ssc/core";

/**
 * The devices the headphones are paired with, and which of them are connected right now.
 *
 * This is the one panel that isn't about the headphones themselves, and it answers a question
 * the phone app can't: when settings changes are being refused, *what else* is holding the link.
 * Icons follow DeviceArt's stroke language (1.5px, rounded caps) at a smaller size.
 */

function Phone() {
  return (
    <>
      <rect x="5" y="1.5" width="12" height="19" rx="2.5" />
      <path d="M9 17.5h4" />
    </>
  );
}

function Computer() {
  return (
    <>
      <rect x="1.5" y="3.5" width="19" height="12.5" rx="2" />
      <path d="M7.5 19.5h7" />
    </>
  );
}

function Audio() {
  return (
    <>
      <rect x="4" y="1.5" width="14" height="19" rx="3" />
      <circle cx="11" cy="14" r="3.5" />
      <circle cx="11" cy="6" r="1.5" />
    </>
  );
}

function Tablet() {
  return (
    <>
      <rect x="2.5" y="2.5" width="17" height="17" rx="2.5" />
      <path d="M9 17h4" />
    </>
  );
}

function Wearable() {
  return (
    <>
      <rect x="5.5" y="5.5" width="11" height="11" rx="3" />
      <path d="M8.5 5.5V2.5h5v3M8.5 16.5v3h5v-3" />
    </>
  );
}

/** A device we can identify neither by its reported class nor by its name. */
function Other() {
  return (
    <>
      <rect x="3" y="3" width="16" height="16" rx="4" />
      <circle cx="11" cy="11" r="1.4" />
    </>
  );
}

const ICONS: Record<PairedDeviceKind, () => ReactElement> = {
  phone: Phone,
  tablet: Tablet,
  computer: Computer,
  audio: Audio,
  wearable: Wearable,
  other: Other,
};

function DeviceIcon({ kind, color }: { kind: PairedDeviceKind; color: string }) {
  const Icon = ICONS[kind];
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 22 22"
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flex: "none" }}
    >
      <Icon />
    </svg>
  );
}

/**
 * Sony's multipoint carries two devices at once. Connecting a third really does connect it —
 * and silently drops one of the pair — which is confusing enough to be worth stating in the UI.
 */
const MULTIPOINT_SLOTS = 2;

export function ConnectedDevices({
  devices,
  onSetConnection,
  onSwitchAudio,
}: {
  devices: PairedDevice[];
  /** Rejects with a message worth showing when the headphones refuse. */
  onSetConnection?: (address: string, connect: boolean) => Promise<void>;
  /** Moves the audio to an already-connected device, leaving both connected. */
  onSwitchAudio?: (address: string) => Promise<void>;
}) {
  // Which row is mid-request, and the last thing that went wrong on it. Kept per address so a
  // failure on one device doesn't blank out the rest of the list.
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<{ address: string; message: string } | null>(null);

  const connectedCount = devices.filter((d) => d.connected).length;
  const full = connectedCount >= MULTIPOINT_SLOTS;

  async function switchAudio(device: PairedDevice) {
    if (!onSwitchAudio || pending) return;
    setPending(device.address);
    setError(null);
    try {
      await onSwitchAudio(device.address);
    } catch (err) {
      setError({
        address: device.address,
        message: err instanceof Error ? err.message : "That didn't work.",
      });
    } finally {
      setPending(null);
    }
  }

  async function toggle(device: PairedDevice) {
    if (!onSetConnection || pending) return;
    setPending(device.address);
    setError(null);
    try {
      await onSetConnection(device.address, !device.connected);
    } catch (err) {
      setError({
        address: device.address,
        message: err instanceof Error ? err.message : "That didn't work.",
      });
    } finally {
      setPending(null);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 15,
        border: "1px solid var(--line)",
        borderRadius: 12,
        background: "var(--panel)",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <div
          className="mono"
          style={{ fontWeight: 600, fontSize: 11, letterSpacing: "0.14em", color: "var(--fg3)" }}
        >
          CONNECTED TO
        </div>
        {devices.length > 0 && (
          <div className="mono" style={{ fontSize: 10, color: "var(--fg3)" }}>
            {connectedCount} OF {MULTIPOINT_SLOTS} SLOTS
          </div>
        )}
      </div>

      {/* Connecting a device when both slots are taken silently drops one of the pair. Saying
          so up front is the difference between a deliberate swap and a button that looks broken. */}
      {full && (
        <div style={{ fontSize: 12, lineHeight: 1.5, color: "var(--fg3)", marginTop: -4 }}>
          Both slots are in use. Connecting another device disconnects one of these.
        </div>
      )}

      {devices.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "var(--fg3)" }}>
          These headphones aren't paired with anything else.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {devices.map((device) => {
            const color = device.connected ? "var(--fg2)" : "var(--fg3)";
            const busy = pending === device.address;
            return (
              <div key={device.address} style={{ padding: "9px 2px" }}>
              {/* Wraps rather than forcing the panel wide: a row carries a name, an address, up
                  to two badges and a button, which together do not fit a narrow window. Without
                  this the whole dashboard grid inherits the row's min-content width. */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  minWidth: 0,
                  flexWrap: "wrap",
                }}
              >
                <DeviceIcon kind={device.kind} color={color} />
                <div style={{ minWidth: 0, flex: "1 1 130px" }}>
                  <div
                    style={{
                      fontWeight: 500,
                      fontSize: 13.5,
                      color: device.connected ? "var(--fg)" : "var(--fg3)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {device.name}
                  </div>
                  <div
                    className="mono"
                    style={{
                      marginTop: 3,
                      fontSize: 10.5,
                      color: "var(--fg3)",
                      // A MAC address is one unbreakable token; let it break rather than set
                      // the floor for how narrow the panel can be.
                      overflowWrap: "anywhere",
                    }}
                  >
                    {device.address}
                  </div>
                </div>
                {device.hasPlaybackRight && (
                  <div
                    className="mono"
                    style={{
                      flex: "none",
                      fontWeight: 500,
                      fontSize: 9.5,
                      letterSpacing: "0.1em",
                      color: "var(--accent)",
                      border: "1px solid var(--accent)",
                      borderRadius: 4,
                      padding: "2px 5px",
                    }}
                  >
                    AUDIO
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "none" }}>
                  <div
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: "50%",
                      background: device.connected ? "var(--ok)" : "var(--fg3)",
                    }}
                  />
                  <div
                    className="mono"
                    style={{
                      fontWeight: 500,
                      fontSize: 10,
                      letterSpacing: "0.1em",
                      color: device.connected ? "var(--ok)" : "var(--fg3)",
                    }}
                  >
                    {device.connected ? "CONNECTED" : "PAIRED"}
                  </div>
                </div>
                {/* Only offered where it can do something: the device must be connected and not
                    already holding the audio. */}
                {onSwitchAudio && device.connected && !device.hasPlaybackRight && (
                  <button
                    onClick={() => void switchAudio(device)}
                    disabled={pending !== null}
                    className="mono"
                    style={{
                      flex: "none",
                      fontWeight: 500,
                      fontSize: 10,
                      letterSpacing: "0.08em",
                      color: "var(--accent)",
                      border: "1px solid var(--accent)",
                      background: "none",
                      borderRadius: 6,
                      padding: "5px 8px",
                      cursor: pending ? "default" : "pointer",
                      opacity: pending && pending !== device.address ? 0.4 : 1,
                    }}
                  >
                    MAKE AUDIO
                  </button>
                )}
                {onSetConnection && (
                  <button
                    onClick={() => void toggle(device)}
                    disabled={pending !== null}
                    className="mono"
                    style={{
                      flex: "none",
                      fontWeight: 500,
                      fontSize: 10,
                      letterSpacing: "0.08em",
                      color: "var(--fg2)",
                      border: "1px solid var(--line)",
                      background: "none",
                      borderRadius: 6,
                      padding: "5px 8px",
                      cursor: pending ? "default" : "pointer",
                      opacity: pending && !busy ? 0.4 : 1,
                    }}
                  >
                    {busy ? "…" : device.connected ? "DISCONNECT" : full ? "SWAP IN" : "CONNECT"}
                  </button>
                )}
              </div>
              {error?.address === device.address && (
                <div style={{ marginTop: 7, marginLeft: 33, fontSize: 12, color: "var(--warn)" }}>
                  {error.message}
                </div>
              )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
