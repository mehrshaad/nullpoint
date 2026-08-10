import { useCallback, useEffect, useRef, useState } from "react";
import { Headphones, type HeadphonesState } from "@ssc/core";
import { WebSerialTransport } from "@ssc/transport-webserial";

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
export function useHeadphones() {
  const [connection, setConnection] = useState<ConnectionStatus>(
    WebSerialTransport.isSupported() ? { status: "idle" } : { status: "unsupported" }
  );
  const [deviceState, setDeviceState] = useState<HeadphonesState | null>(null);
  const headphonesRef = useRef<Headphones | null>(null);
  const attemptReconnectRef = useRef<(port: SerialPort) => void>(() => {});
  const cancelledRef = useRef(false);

  const establish = useCallback(async (port: SerialPort): Promise<HeadphonesState> => {
    const transport = new WebSerialTransport(port);
    const headphones = new Headphones(transport);
    headphonesRef.current = headphones;
    headphones.on((event) => {
      setDeviceState({ ...headphones.state });
      if (event.type === "disconnected") attemptReconnectRef.current(port);
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
