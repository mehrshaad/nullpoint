import { useCallback, useEffect, useRef, useState } from "react";
import { Headphones, type HeadphonesState } from "@ssc/core";
import { WebSerialTransport } from "@ssc/transport-webserial";

/**
 * Turns a raw failure into something the person can act on. The cause matters a lot here:
 * "no port in the chooser" and "the headset refused the link" need completely different fixes,
 * so we never show a single canned explanation.
 */
export interface ConnectErrorHelp {
  headline: string;
  hint: string;
  /** Concrete things to try, most likely first. Rendered as a list, not prose. */
  steps?: string[];
  detail: string;
}

export function describeConnectError(err: unknown): ConnectErrorHelp {
  const detail = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : "";

  if (/No port selected/i.test(detail) || name === "NotFoundError") {
    return {
      headline: "No headphones showed up",
      hint: "Either the picker was dismissed, or Windows isn't offering the headset's control service.",
      steps: [
        "Check the headphones are connected in your Bluetooth settings, not only paired.",
        "Quit Nullpoint if it's running in your system tray, then try again.",
        "Turn the headphones off and on if they've been idle.",
      ],
      detail,
    };
  }
  if (name === "SecurityError" || /permission/i.test(detail)) {
    return {
      headline: "The browser blocked the connection",
      hint: "Serial access needs a secure page and your permission. On the web, use HTTPS and allow the device when prompted.",
      detail,
    };
  }
  if (name === "NetworkError" || /already open|failed to open|access denied/i.test(detail)) {
    return {
      headline: "Something else is holding the settings channel",
      // These are ordered by how often each one is actually the culprit — the copy of
      // Nullpoint you forgot is in the tray beats the phone you're thinking of.
      hint: "Your headphones take settings from one place at a time, even while playing audio to two devices.",
      steps: [
        "Quit Nullpoint in your system tray — the desktop app holds the channel while it runs.",
        "Close any other Nullpoint tab or window.",
        "Disconnect the headphones from your phone. Sony's app doesn't need to be open for the phone to be holding it.",
      ],
      detail,
    };
  }
  if (/Timed out|No ACK/i.test(detail)) {
    return {
      headline: "The headphones didn't answer",
      hint: "The link opened but the headset never replied, which usually means it powered itself off.",
      steps: [
        "Press the power button on the headphones and wait for them to reconnect.",
        "If they're already on, turn them off and on again.",
      ],
      detail,
    };
  }
  return {
    headline: "Couldn't reach your headphones",
    hint: "The connection failed before the headset could be read. Check that it's powered on and connected, then try again.",
    detail,
  };
}

export type ConnectionStatus =
  | { status: "unsupported" }
  | { status: "idle" }
  | { status: "connecting" }
  | { status: "reconnecting"; reason: "busy" | "gone" }
  | { status: "failed"; message: string }
  | { status: "connected" };

// Reconnection keeps going for as long as the user lets it. Giving up after a handful of
// tries stranded people on a dead end that only a page refresh cleared, when the usual cause
// — a phone holding the control channel — resolves on its own minutes later.
const RECONNECT_BASE_MS = 1500;
const RECONNECT_MAX_MS = 15_000;
/**
 * Taking a busy channel back is a race, not a wait: you win it by asking at a moment the other
 * device isn't holding it. Backing off to fifteen seconds lost that race almost every time, so
 * this case keeps knocking.
 */
const RECONNECT_BUSY_MAX_MS = 2500;
/**
 * How many times to race before accepting the channel is genuinely occupied. "One socket open
 * every couple of seconds costs nothing" was wrong: it shares a radio with the audio, and a
 * successful attempt is a forty-frame handshake. Roughly fifteen seconds of racing catches the
 * device that grabbed the channel for a moment, which is the case worth winning.
 */
const BUSY_RACE_ATTEMPTS = 6;
/** Once it is clear something is holding on, check back at this interval instead of racing. */
const RECONNECT_BUSY_CALM_MS = 30_000;

/** The headset is reachable but its control channel is taken (see PROTOCOL.md, 0x2740). */
function isChannelBusy(err: unknown): boolean {
  const text = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return /failed to open|already open|access denied|NetworkError/i.test(text);
}

/**
 * Owns the connect lifecycle: pick a port (user gesture), open the Web Serial transport, run the
 * @ssc/core handshake, and expose live device state. Also owns reconnection: if the transport
 * reports "disconnected" (device powered off, went out of range — PLAN.md's design §5.3 rule 3
 * "one controller"/reconnecting state), retries against the *same* already-granted port without
 * needing a new user gesture, since Web Serial permission persists for a previously picked port.
 */
export function useHeadphones({ autoReconnect = true }: { autoReconnect?: boolean } = {}) {
  const [connection, setConnection] = useState<ConnectionStatus>(
    WebSerialTransport.isSupported() ? { status: "idle" } : { status: "unsupported" }
  );
  const [deviceState, setDeviceState] = useState<HeadphonesState | null>(null);
  /**
   * The link is up but the headset is refusing commands — another device (usually a phone on
   * multipoint) holds the control channel. Distinct from disconnected: nothing to reconnect,
   * and it clears by itself once the other device lets go.
   */
  const [controlLost, setControlLost] = useState(false);
  const headphonesRef = useRef<Headphones | null>(null);
  /** Held so a session being retired can be detached before it is closed. */
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const attemptReconnectRef = useRef<(port: SerialPort) => void>(() => {});
  const cancelledRef = useRef(false);
  // Read through a ref so an in-flight connection picks up a settings change without
  // needing to be torn down and re-established.
  const autoReconnectRef = useRef(autoReconnect);
  autoReconnectRef.current = autoReconnect;

  const establish = useCallback(async (port: SerialPort): Promise<HeadphonesState> => {
    // Retire the previous session before starting another. Without this, every reconnect left
    // an orphaned one behind with its battery poll still running — and each poll is a radio
    // transmission sharing the air with your music, so a couple of leaked sessions turn into a
    // periodic audio dropout that looks like a Bluetooth fault.
    //
    // Unsubscribe first: closing the transport can surface as a disconnect, and a listener from
    // a session we are deliberately retiring must not kick off a reconnect for it.
    const previous = headphonesRef.current;
    const previousUnsubscribe = unsubscribeRef.current;
    headphonesRef.current = null;
    unsubscribeRef.current = null;
    previousUnsubscribe?.();
    if (previous) await previous.disconnect().catch(() => undefined);

    const transport = new WebSerialTransport(port);
    const headphones = new Headphones(transport);
    headphonesRef.current = headphones;
    // Reconnecting produces a new session, so any earlier loss of control no longer applies.
    setControlLost(false);
    unsubscribeRef.current = headphones.on((event) => {
      setDeviceState({ ...headphones.state });
      if (event.type === "controlLost") setControlLost(true);
      if (event.type === "controlRegained") setControlLost(false);
      if (event.type !== "disconnected") return;
      if (autoReconnectRef.current) {
        attemptReconnectRef.current(port);
      } else {
        setConnection({ status: "failed", message: "The headphones disconnected." });
      }
    });
    return headphones.connect();
  }, []);

  const attemptReconnect = useCallback(
    async (port: SerialPort) => {
      cancelledRef.current = false;
      let reason: "busy" | "gone" = "gone";
      let delay = RECONNECT_BASE_MS;
      let busyAttempts = 0;
      setConnection({ status: "reconnecting", reason });

      while (!cancelledRef.current) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        if (cancelledRef.current) return; // user hit Cancel — abandon the retry loop
        try {
          const state = await establish(port);
          if (cancelledRef.current) return;
          setDeviceState(state);
          setConnection({ status: "connected" });
          return;
        } catch (err) {
          const next: "busy" | "gone" = isChannelBusy(err) ? "busy" : "gone";
          // Start over on the delay whenever the situation changes — a headset that just came
          // back should not inherit the long wait from when it was missing.
          if (next !== reason) {
            delay = RECONNECT_BASE_MS;
            busyAttempts = 0;
          }
          reason = next;
          setConnection({ status: "reconnecting", reason });
          // The two cases want opposite behaviour. "Gone" means nothing is listening, so back
          // off; retrying quickly at a headset that is switched off just burns battery. "Busy"
          // means it is right there and something else is holding the channel — a race you win
          // by asking often.
          //
          // But only for a while. Every attempt is a connection on the same radio carrying the
          // audio, and a successful one is a forty-frame handshake, so racing a phone that has
          // held the channel for minutes puts a burst on the air every couple of seconds for as
          // long as it holds — heard as music breaking up at no particular interval. Race hard
          // enough to win the blips, then settle down and wait it out.
          if (reason === "busy") {
            busyAttempts += 1;
            delay =
              busyAttempts <= BUSY_RACE_ATTEMPTS
                ? Math.min(Math.round(delay * 1.25), RECONNECT_BUSY_MAX_MS)
                : Math.min(Math.round(delay * 1.6), RECONNECT_BUSY_CALM_MS);
          } else {
            delay = Math.min(Math.round(delay * 1.6), RECONNECT_MAX_MS);
          }
        }
      }
    },
    [establish]
  );

  useEffect(() => {
    attemptReconnectRef.current = attemptReconnect;
  }, [attemptReconnect]);

  /** How many previously-granted ports exist, so the UI knows whether to offer reconnection. */
  const [grantedPorts, setGrantedPorts] = useState(0);
  useEffect(() => {
    if (!WebSerialTransport.isSupported()) return;
    void WebSerialTransport.grantedPortCount().then(setGrantedPorts);
  }, [connection.status]);

  /**
   * Connect without Chrome's device chooser, using a port the user already permitted.
   *
   * Granted ports carry no identity, so the only way to find the right one is to try them in
   * turn — several entries can point at the same headset, and stale ones fail fast at open().
   * The first that completes a handshake is the one.
   */
  const reconnectKnown = useCallback(async () => {
    setConnection({ status: "connecting" });
    setControlLost(false);
    const ports = await WebSerialTransport.grantedPorts();
    let lastError: unknown = new Error("No previously connected headphones are reachable.");
    for (const port of ports) {
      try {
        const state = await establish(port);
        setDeviceState(state);
        setConnection({ status: "connected" });
        return;
      } catch (err) {
        lastError = err;
      }
    }
    setConnection({
      status: "failed",
      message: lastError instanceof Error ? lastError.message : "Unknown error",
    });
  }, [establish]);

  const connect = useCallback(async () => {
    setConnection({ status: "connecting" });
    setControlLost(false);
    try {
      // Must be called directly from the click handler's call stack — Web Serial requires a
      // user gesture for requestPort(). PLAN.md §5.2.
      const port = await WebSerialTransport.pickPort();
      const state = await establish(port);
      setDeviceState(state);
      setConnection({ status: "connected" });
    } catch (err) {
      setConnection({
        status: "failed",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }, [establish]);

  const reset = useCallback(() => {
    cancelledRef.current = true; // stop any in-flight reconnect loop from clobbering this reset
    setControlLost(false);
    setConnection({ status: "idle" });
    setDeviceState(null);
    // Detach and close rather than just dropping the reference: an abandoned session keeps
    // polling for battery every minute and keeps the port open, and the headset only has the
    // one control channel to give.
    const previous = headphonesRef.current;
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    headphonesRef.current = null;
    void previous?.disconnect().catch(() => undefined);
  }, []);

  return {
    connection,
    deviceState,
    controlLost,
    connect,
    reconnectKnown,
    grantedPorts,
    reset,
    headphones: headphonesRef.current,
  };
}
