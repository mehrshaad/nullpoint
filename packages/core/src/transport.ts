/**
 * A dumb byte pipe. All framing/reassembly lives in @ssc/core — a Transport only moves bytes.
 * @ssc/transport-webserial implements this over navigator.serial; tests use LoopbackTransport.
 */
export interface Transport {
  open(): Promise<void>;
  close(): Promise<void>;
  write(bytes: Uint8Array): Promise<void>;
  onData(cb: (bytes: Uint8Array) => void): void;
  /** Fires when the underlying link drops unexpectedly (device powered off, went out of range). */
  onDisconnect(cb: () => void): void;
}

/** In-memory transport for tests: scripted responses, no real I/O. */
export class LoopbackTransport implements Transport {
  private dataHandler: ((bytes: Uint8Array) => void) | null = null;
  private disconnectHandler: (() => void) | null = null;
  public sent: Uint8Array[] = [];
  private opened = false;

  constructor(private respond?: (sent: Uint8Array) => Uint8Array[] | void) {}

  async open(): Promise<void> {
    this.opened = true;
  }

  async close(): Promise<void> {
    this.opened = false;
  }

  async write(bytes: Uint8Array): Promise<void> {
    if (!this.opened) throw new Error("LoopbackTransport: write before open");
    this.sent.push(bytes);
    const replies = this.respond?.(bytes);
    if (replies) {
      for (const reply of replies) this.dataHandler?.(reply);
    }
  }

  onData(cb: (bytes: Uint8Array) => void): void {
    this.dataHandler = cb;
  }

  onDisconnect(cb: () => void): void {
    this.disconnectHandler = cb;
  }

  /** Test helper: push bytes into the stream as if the device sent them unprompted. */
  emit(bytes: Uint8Array): void {
    this.dataHandler?.(bytes);
  }

  /** Test helper: simulate the link dropping. */
  simulateDisconnect(): void {
    this.opened = false;
    this.disconnectHandler?.();
  }
}
