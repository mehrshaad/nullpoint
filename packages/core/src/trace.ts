import { CommandT1, CommandT2, DataType } from "./constants.js";

/**
 * A record of one frame on the wire, kept so the app can show what it actually said and heard.
 *
 * Every consumer headphone app hides this. Showing it is the point of Nullpoint: when a control
 * misbehaves, the bytes are the only thing that settles it — every serious bug in this project
 * so far was diagnosed from frames and misdiagnosed from the rendered UI.
 */
export interface TracedFrame {
  /** Milliseconds since the trace started, so entries read as a sequence rather than clock time. */
  at: number;
  direction: "tx" | "rx";
  dataType: DataType;
  /** Decoded command name where we know it, otherwise the raw byte. */
  label: string;
  payload: Uint8Array;
}

/** Frames kept before the oldest is dropped. Bounded so a long session can't grow without end. */
const TRACE_LIMIT = 400;

const T1_NAMES = new Map<number, string>(
  Object.entries(CommandT1)
    .filter(([, v]) => typeof v === "number")
    .map(([k, v]) => [v as number, k])
);
const T2_NAMES = new Map<number, string>(
  Object.entries(CommandT2)
    .filter(([, v]) => typeof v === "number")
    .map(([k, v]) => [v as number, k])
);

function hex(byte: number): string {
  return `0x${byte.toString(16).toUpperCase().padStart(2, "0")}`;
}

/**
 * Names the command a frame carries. Table 1 and Table 2 are separate command spaces, so the
 * frame type decides which table to read the byte against — the same number means different
 * things in each.
 */
export function labelFrame(dataType: DataType, payload: Uint8Array): string {
  if (dataType === DataType.ACK) return "ACK";
  const command = payload[0];
  if (command === undefined) return "(empty)";
  const table = dataType === DataType.DATA_MDR_NO2 ? T2_NAMES : T1_NAMES;
  return table.get(command) ?? hex(command);
}

/** Payload as spaced hex, which is how you compare it against the protocol notes. */
export function formatBytes(payload: Uint8Array): string {
  return [...payload].map((b) => b.toString(16).padStart(2, "0")).join(" ");
}

/**
 * A bounded, in-memory log of frames. Costs nothing when nobody is looking: entries are small,
 * capped, and never leave the process.
 */
export class FrameTrace {
  private frames: TracedFrame[] = [];
  private started = 0;
  private listeners = new Set<() => void>();

  /** True once recording has begun; until then `record` does nothing at all. */
  enabled = false;

  start(now: number): void {
    this.enabled = true;
    this.started = now;
    this.notify();
  }

  stop(): void {
    this.enabled = false;
    this.notify();
  }

  clear(): void {
    this.frames = [];
    this.notify();
  }

  record(direction: "tx" | "rx", dataType: DataType, payload: Uint8Array, now: number): void {
    if (!this.enabled) return;
    this.frames.push({
      at: now - this.started,
      direction,
      dataType,
      label: labelFrame(dataType, payload),
      // Copied: the caller's buffer is reused by the transport.
      payload: new Uint8Array(payload),
    });
    if (this.frames.length > TRACE_LIMIT) this.frames.splice(0, this.frames.length - TRACE_LIMIT);
    this.notify();
  }

  list(): readonly TracedFrame[] {
    return this.frames;
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify(): void {
    for (const cb of this.listeners) cb();
  }

  /** A plain-text session, for pasting into a bug report. */
  toText(): string {
    return this.frames
      .map(
        (f) =>
          `${String(f.at).padStart(7)}ms  ${f.direction.toUpperCase()}  ` +
          `dt=${String(f.dataType).padStart(2)}  ${f.label.padEnd(32)}  ${formatBytes(f.payload)}`
      )
      .join("\n");
  }
}
