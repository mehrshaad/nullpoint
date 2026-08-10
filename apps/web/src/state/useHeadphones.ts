import { useCallback, useRef, useState } from "react";
import { Headphones, type HeadphonesState } from "@ssc/core";
import { WebSerialTransport } from "@ssc/transport-webserial";

export type ConnectionStatus =
  | { status: "unsupported" }
  | { status: "idle" }
  | { status: "connecting" }
  | { status: "failed"; message: string }
  | { status: "connected" };

/**
 * Owns the connect lifecycle: pick a port (user gesture), open the Web Serial transport, run the
 * @ssc/core handshake, and expose live device state. PLAN.md M2.
 */
export function useHeadphones() {
  const [connection, setConnection] = useState<ConnectionStatus>(
    WebSerialTransport.isSupported() ? { status: "idle" } : { status: "unsupported" }
  );
  const [deviceState, setDeviceState] = useState<HeadphonesState | null>(null);
  const headphonesRef = useRef<Headphones | null>(null);

  const connect = useCallback(async () => {
    setConnection({ status: "connecting" });
    try {
      // Must be called directly from the click handler's call stack — Web Serial requires a
      // user gesture for requestPort(). PLAN.md §5.2.
      const port = await WebSerialTransport.pickPort();
      const transport = new WebSerialTransport(port);
      const headphones = new Headphones(transport);
      headphonesRef.current = headphones;
      headphones.on(() => setDeviceState({ ...headphones.state }));

      const state = await headphones.connect();
      setDeviceState(state);
      setConnection({ status: "connected" });
    } catch (err) {
      setConnection({
        status: "failed",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }, []);

  const reset = useCallback(() => {
    setConnection({ status: "idle" });
    setDeviceState(null);
    headphonesRef.current = null;
  }, []);

  return { connection, deviceState, connect, reset, headphones: headphonesRef.current };
}
