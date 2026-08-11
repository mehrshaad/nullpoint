import type { Transport } from "@ssc/core";
import { SONY_SPP_SERVICE_UUID } from "@ssc/core";

/**
 * Web Serial transport — the only way to reach a Bluetooth *Classic* RFCOMM/SPP channel from a
 * web page (Web Bluetooth is BLE-only). PLAN.md §5.2 / §0.
 *
 * Requirements this transport does NOT handle:
 *  - The device must already be paired in the OS Bluetooth settings; this API cannot pair.
 *  - `requestPort()` must be called from a user gesture (a click) — call `pickPort()` directly
 *    from a button's onClick handler, not from inside a promise chain or effect.
 *  - Chrome/Edge/Opera/Arc desktop only, served over HTTPS or localhost.
 */
export class WebSerialTransport implements Transport {
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private dataHandler: ((bytes: Uint8Array) => void) | null = null;
  private disconnectHandler: (() => void) | null = null;
  private disconnectFired = false;
  private readLoopAbort = false;
  private readonly onGlobalDisconnect = (event: Event) => {
    if ((event as { target?: unknown }).target === this.port) this.notifyDisconnect();
  };

  static isSupported(): boolean {
    return "serial" in navigator;
  }

  /**
   * Must be called synchronously from a user gesture — browser security requirement.
   *
   * Both options are required to reach a Bluetooth device, and they do different jobs:
   * `filters` narrows what the chooser shows, while `allowedBluetoothServiceClassIds` is the
   * security gate that lets the page touch that RFCOMM service class at all. Without the
   * second one Chrome excludes every Bluetooth port from the chooser, so the picker comes up
   * empty and requestPort rejects with "No port selected by the user".
   */
  static async pickPort(): Promise<SerialPort> {
    const serviceClassId = SONY_SPP_SERVICE_UUID.toLowerCase();
    return navigator.serial.requestPort({
      filters: [{ bluetoothServiceClassId: serviceClassId }],
      allowedBluetoothServiceClassIds: [serviceClassId],
    } as SerialPortRequestOptions);
  }

  /** Ports the user has already granted us, used for diagnostics on the failure screen. */
  static async grantedPortCount(): Promise<number> {
    try {
      return (await navigator.serial.getPorts()).length;
    } catch {
      return 0;
    }
  }

  constructor(port: SerialPort) {
    this.port = port;
  }

  async open(): Promise<void> {
    if (!this.port) throw new Error("WebSerialTransport: no port");
    this.disconnectFired = false;

    // A dropped link does not close the port, and reopening an open port throws
    // InvalidStateError — which would make every reconnect attempt fail before it ever reached
    // the headphones. Release whatever the previous session left behind first.
    await this.releasePort();

    // baudRate is required by the Web Serial API but meaningless for an RFCOMM virtual channel —
    // the OS Bluetooth stack ignores it. Chrome for Developers, "Serial over Bluetooth".
    await this.port.open({ baudRate: 115200 });
    navigator.serial.addEventListener("disconnect", this.onGlobalDisconnect);
    this.readLoopAbort = false;
    void this.readLoop();
  }

  /** Tears down reader, writer and the port itself, tolerating anything already closed. */
  private async releasePort(): Promise<void> {
    this.readLoopAbort = true;
    try {
      await this.reader?.cancel();
    } catch {
      // already cancelled
    }
    this.reader = null;
    try {
      this.writer?.releaseLock();
    } catch {
      // already released
    }
    this.writer = null;
    if (this.port?.readable || this.port?.writable) {
      try {
        await this.port.close();
      } catch {
        // already closed, or never opened
      }
    }
  }

  async close(): Promise<void> {
    navigator.serial.removeEventListener("disconnect", this.onGlobalDisconnect);
    await this.releasePort();
  }

  async write(bytes: Uint8Array): Promise<void> {
    if (!this.port?.writable) throw new Error("WebSerialTransport: port not open for writing");
    this.writer ??= this.port.writable.getWriter();
    await this.writer.write(bytes);
  }

  onData(cb: (bytes: Uint8Array) => void): void {
    this.dataHandler = cb;
  }

  onDisconnect(cb: () => void): void {
    this.disconnectHandler = cb;
  }

  private notifyDisconnect(): void {
    if (this.disconnectFired) return;
    this.disconnectFired = true;
    this.disconnectHandler?.();
  }

  private async readLoop(): Promise<void> {
    if (!this.port?.readable) return;
    this.reader = this.port.readable.getReader();
    try {
      while (!this.readLoopAbort) {
        const { value, done } = await this.reader.read();
        if (done) {
          // The port closed from the far end without an explicit close() call on our side —
          // treat it the same as the navigator.serial "disconnect" event.
          if (!this.readLoopAbort) this.notifyDisconnect();
          break;
        }
        if (value) this.dataHandler?.(value);
      }
    } catch (err) {
      if (!this.readLoopAbort) {
        console.error("[ssc/transport-webserial] read loop error:", err);
        this.notifyDisconnect();
      }
    } finally {
      this.reader?.releaseLock();
    }
  }
}
