import { useCallback, useEffect, useRef, useState } from "react";
import { Headphones, type HeadphonesState } from "@ssc/core";
import { WebSerialTransport } from "@ssc/transport-webserial";

/**
 * Turns a raw failure into something the person can act on. The cause matters a lot here:
 * "no port in the chooser" and "the headset refused the link" need completely different fixes,
 * so we never show a single canned explanation.
 */
export function describeConnectError(err: unknown): { headline: string; hint: string; detail: string } {
  const detail = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : "";

  if (/No port selected/i.test(detail) || name === "NotFoundError") {
    return {
      headline: "No headphones showed up",
      hint: "Either the picker was dismissed, or Windows isn't offering the headset's control service. Make sure the headphones are connected (not just paired), then try again. Closing Sony's phone app can help — it can hold the control channel open.",
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
      headline: "Something else is holding the control link",
      hint: "These headphones accept settings from one device at a time, even though they play audio from two. If they're also connected to your phone, disconnect them there and try again — Sony's app doesn't need to be open for the phone to be holding the link. A copy of Nullpoint still running in the tray will do the same.",
      detail,
    };
  }
  if (/Timed out|No ACK/i.test(detail)) {
    return {
      headline: "The headphones didn't answer",
      hint: "The link opened but the headset never replied. Power it off and on, then reconnect.",
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
  | { status: "reconnecting" }
  | { status: "failed"; message: string }
  | { status: "connected" };

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 1500;

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
  const headphonesRef = useRef<Headphones | null>(null);
  const attemptReconnectRef = useRef<(port: SerialPort) => void>(() => {});
  const cancelledRef = useRef(false);
  // Read through a ref so an in-flight connection picks up a settings change without
  // needing to be torn down and re-established.
  const autoReconnectRef = useRef(autoReconnect);
  autoReconnectRef.current = autoReconnect;

  const establish = useCallback(async (port: SerialPort): Promise<HeadphonesState> => {
    const transport = new WebSerialTransport(port);
    const headphones = new Headphones(transport);
    headphonesRef.current = headphones;
    headphones.on((event) => {
      setDeviceState({ ...headphones.state });
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
      setConnection({ status: "reconnecting" });
      for (let attempt = 0; attempt < MAX_RECONNECT_ATTEMPTS; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, RECONNECT_DELAY_MS));
        if (cancelledRef.current) return; // user hit Cancel — abandon the retry loop
        try {
          const state = await establish(port);
          if (cancelledRef.current) return;
          setDeviceState(state);
          setConnection({ status: "connected" });
          return;
        } catch {
          // keep retrying — the headset is likely still powering back on
        }
      }
      if (!cancelledRef.current) {
        setConnection({ status: "failed", message: "Lost the connection and couldn't reconnect automatically." });
      }
    },
    [establish]
  );

  useEffect(() => {
    attemptReconnectRef.current = attemptReconnect;
  }, [attemptReconnect]);

  const connect = useCallback(async () => {
    setConnection({ status: "connecting" });
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
    setConnection({ status: "idle" });
    setDeviceState(null);
    headphonesRef.current = null;
  }, []);

  return { connection, deviceState, connect, reset, headphones: headphonesRef.current };
}
