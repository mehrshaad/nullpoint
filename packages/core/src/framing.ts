// Ported from mos9527/SonyHeadphonesClient (MIT) — see /NOTICE.
// Source: src/CommandSerializer.{h,cpp} @ master, src/ByteMagic.h @ master

import {
  DataType,
  END_MARKER,
  ESCAPED_60,
  ESCAPED_61,
  ESCAPED_62,
  ESCAPE_SENTINEL,
  MAX_BLUETOOTH_MESSAGE_SIZE,
  START_MARKER,
} from "./constants.js";

/**
 * A fully-decoded frame: the outer envelope (data type + sequence number) plus the raw
 * inner payload bytes (the V2 protocol command byte + its fields).
 */
export interface DecodedFrame {
  dataType: DataType;
  seq: number;
  payload: Uint8Array;
}

function sumChecksum(bytes: Uint8Array): number {
  let acc = 0;
  for (const b of bytes) acc = (acc + b) & 0xff;
  return acc;
}

/** CommandSerializer.cpp: _escapeSpecials */
function escapeSpecials(src: Uint8Array): number[] {
  const out: number[] = [];
  for (const b of src) {
    switch (b) {
      case 0x3c:
        out.push(ESCAPE_SENTINEL, ESCAPED_60);
        break;
      case 0x3d:
        out.push(ESCAPE_SENTINEL, ESCAPED_61);
        break;
      case 0x3e:
        out.push(ESCAPE_SENTINEL, ESCAPED_62);
        break;
      default:
        out.push(b);
    }
  }
  return out;
}

/** CommandSerializer.cpp: _unescapeSpecials */
function unescapeSpecials(src: Uint8Array): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < src.length; i++) {
    const b = src[i]!;
    if (b === ESCAPE_SENTINEL) {
      if (i === src.length - 1) {
        throw new Error("No data left for escaped byte data");
      }
      i += 1;
      const next = src[i]!;
      switch (next) {
        case ESCAPED_60:
          out.push(0x3c);
          break;
        case ESCAPED_61:
          out.push(0x3d);
          break;
        case ESCAPED_62:
          out.push(0x3e);
          break;
        default:
          throw new Error("Unexpected escaped byte");
      }
    } else {
      out.push(b);
    }
  }
  return Uint8Array.from(out);
}

/**
 * Build the on-wire frame for a command.
 *
 * Layout (CommandSerializer.h comment, verified against .cpp):
 *   <START_MARKER> ESCAPE( <DATA_TYPE:1> <SEQ:1> <SIZE:4 BE> <DATA:SIZE> <CHECKSUM:1> ) <END_MARKER>
 * Checksum is the 8-bit wrapping sum of DATA_TYPE..end-of-DATA (everything but itself),
 * computed BEFORE escaping.
 */
export function packageDataForBt(
  dataType: DataType,
  seq: number,
  data: Uint8Array
): Uint8Array {
  const sizeBytes = new Uint8Array(4);
  new DataView(sizeBytes.buffer).setUint32(0, data.length, false);

  const toEscape = new Uint8Array(2 + 4 + data.length + 1);
  toEscape[0] = dataType;
  toEscape[1] = seq;
  toEscape.set(sizeBytes, 2);
  toEscape.set(data, 6);
  const checksum = sumChecksum(toEscape.subarray(0, toEscape.length - 1));
  toEscape[toEscape.length - 1] = checksum;

  const escaped = escapeSpecials(toEscape);
  const frame = new Uint8Array(escaped.length + 2);
  frame[0] = START_MARKER;
  frame.set(escaped, 1);
  frame[frame.length - 1] = END_MARKER;

  if (frame.length > MAX_BLUETOOTH_MESSAGE_SIZE) {
    throw new Error(
      `Frame exceeds MAX_BLUETOOTH_MESSAGE_SIZE (${frame.length} > ${MAX_BLUETOOTH_MESSAGE_SIZE}); chunking is not implemented`
    );
  }
  return frame;
}

/**
 * Decode the bytes strictly between a START_MARKER and END_MARKER (exclusive of both).
 * Throws if the checksum does not match — matches CommandMessage::verify().
 */
export function decodeFrameBody(escapedBody: Uint8Array): DecodedFrame {
  const unescaped = unescapeSpecials(escapedBody);
  if (unescaped.length < 7) {
    throw new Error(`Frame too short: ${unescaped.length} bytes`);
  }
  const dataType = unescaped[0] as DataType;
  const seq = unescaped[1]!;
  const size = new DataView(unescaped.buffer, unescaped.byteOffset + 2, 4).getUint32(0, false);
  const expectedLen = 6 + size + 1;
  if (unescaped.length !== expectedLen) {
    throw new Error(`Frame size mismatch: header says ${size}, have ${unescaped.length - 7} payload bytes`);
  }
  const payload = unescaped.subarray(6, 6 + size);
  const checksum = unescaped[6 + size]!;
  const computed = sumChecksum(unescaped.subarray(0, 6 + size));
  if (checksum !== computed) {
    throw new Error(`Checksum mismatch: got 0x${checksum.toString(16)}, computed 0x${computed.toString(16)}`);
  }
  return { dataType, seq, payload };
}

/**
 * Incremental frame reassembler for a raw byte stream (what Web Serial hands us).
 * Bytes between an unescaped START_MARKER and the next unescaped END_MARKER are one frame.
 * Because 0x3E/0x3C are escaped inside the payload (§ escapeSpecials), a raw 0x3E/0x3C byte
 * in the stream is unambiguously a real marker, not payload data.
 */
export class FrameReassembler {
  private buffer: number[] = [];
  private inFrame = false;

  /** Feed raw bytes; returns any complete frames decoded from them, in order. */
  push(chunk: Uint8Array): DecodedFrame[] {
    const frames: DecodedFrame[] = [];
    for (const byte of chunk) {
      if (!this.inFrame) {
        if (byte === START_MARKER) {
          this.inFrame = true;
          this.buffer = [];
        }
        // ignore stray bytes outside a frame
        continue;
      }
      if (byte === END_MARKER) {
        this.inFrame = false;
        try {
          frames.push(decodeFrameBody(Uint8Array.from(this.buffer)));
        } catch (err) {
          // Drop malformed frame; log for diagnostics rather than crashing the transport.
          console.warn("[ssc/core] dropped malformed frame:", err);
        }
        this.buffer = [];
        continue;
      }
      this.buffer.push(byte);
    }
    return frames;
  }
}
