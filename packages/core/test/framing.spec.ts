import { describe, expect, it } from "vitest";
import { DataType } from "../src/constants.js";
import { decodeFrameBody, packageDataForBt, FrameReassembler } from "../src/framing.js";

describe("packageDataForBt / decodeFrameBody round-trip", () => {
  it("round-trips a simple unescaped payload", () => {
    const data = Uint8Array.from([0x66, 0x17]); // NCASM_GET_PARAM, MODE_NC_ASM_DUAL...SEAMLESS
    const frame = packageDataForBt(DataType.DATA_MDR, 0, data);
    // START_MARKER, then body, then END_MARKER
    expect(frame[0]).toBe(0x3e);
    expect(frame[frame.length - 1]).toBe(0x3c);
    const decoded = decodeFrameBody(frame.subarray(1, frame.length - 1));
    expect(decoded.dataType).toBe(DataType.DATA_MDR);
    expect(decoded.seq).toBe(0);
    expect(Array.from(decoded.payload)).toEqual([0x66, 0x17]);
  });

  it("matches a hand-computed known vector (NCASM_GET_PARAM request)", () => {
    // DATA_TYPE=DATA_MDR(12), SEQ=0, DATA=[0x66,0x17]
    // checksum = (12 + 0 + 0+0+0+2 + 0x66 + 0x17) & 0xff = 139 = 0x8B
    const frame = packageDataForBt(DataType.DATA_MDR, 0, Uint8Array.from([0x66, 0x17]));
    expect(Array.from(frame)).toEqual([
      0x3e, // START
      12, // DATA_TYPE
      0, // SEQ
      0, 0, 0, 2, // SIZE (BE u32) = 2
      0x66, 0x17, // DATA
      0x8b, // CHECKSUM
      0x3c, // END
    ]);
  });

  it("escapes marker bytes appearing inside the payload and round-trips them", () => {
    // payload deliberately contains all three special bytes
    const data = Uint8Array.from([0x3e, 0x3c, 0x3d, 0xaa]);
    const frame = packageDataForBt(DataType.DATA, 1, data);
    // every special byte must have been escaped with the 0x3D sentinel
    const body = frame.subarray(1, frame.length - 1);
    expect(Array.from(body)).toContain(0x3d);
    const decoded = decodeFrameBody(body);
    expect(Array.from(decoded.payload)).toEqual([0x3e, 0x3c, 0x3d, 0xaa]);
  });

  it("throws on checksum mismatch", () => {
    const frame = packageDataForBt(DataType.DATA_MDR, 0, Uint8Array.from([1, 2, 3]));
    const body = Uint8Array.from(frame.subarray(1, frame.length - 1));
    body[body.length - 1] ^= 0xff; // corrupt checksum
    expect(() => decodeFrameBody(body)).toThrow(/Checksum mismatch/);
  });

  it("throws when declared size doesn't match actual payload length", () => {
    const frame = packageDataForBt(DataType.DATA_MDR, 0, Uint8Array.from([1, 2, 3]));
    // truncate one payload byte without fixing the size header -> size mismatch
    const body = frame.subarray(1, frame.length - 2);
    expect(() => decodeFrameBody(body)).toThrow(/size mismatch/i);
  });
});

describe("FrameReassembler", () => {
  it("reassembles a single frame delivered in arbitrary chunk sizes", () => {
    const frame = packageDataForBt(DataType.DATA_MDR, 0, Uint8Array.from([0x66, 0x17]));
    const reassembler = new FrameReassembler();
    const results = [];
    // feed one byte at a time — the worst case for a streaming reassembler
    for (const byte of frame) {
      results.push(...reassembler.push(Uint8Array.from([byte])));
    }
    expect(results).toHaveLength(1);
    expect(results[0].dataType).toBe(DataType.DATA_MDR);
    expect(Array.from(results[0].payload)).toEqual([0x66, 0x17]);
  });

  it("reassembles two back-to-back frames in one chunk", () => {
    const f1 = packageDataForBt(DataType.DATA_MDR, 0, Uint8Array.from([1]));
    const f2 = packageDataForBt(DataType.DATA_MDR, 1, Uint8Array.from([2]));
    const combined = new Uint8Array([...f1, ...f2]);
    const reassembler = new FrameReassembler();
    const results = reassembler.push(combined);
    expect(results).toHaveLength(2);
    expect(results[0].seq).toBe(0);
    expect(results[1].seq).toBe(1);
  });

  it("ignores noise bytes between frames", () => {
    const f1 = packageDataForBt(DataType.DATA_MDR, 0, Uint8Array.from([1]));
    const combined = new Uint8Array([0xff, 0x00, ...f1, 0x11]);
    const reassembler = new FrameReassembler();
    const results = reassembler.push(combined);
    expect(results).toHaveLength(1);
  });

  it("drops a malformed frame but keeps parsing subsequent frames", () => {
    const good = packageDataForBt(DataType.DATA_MDR, 0, Uint8Array.from([9]));
    const badBody = Uint8Array.from([12, 0, 0, 0, 0, 5, 1, 0xff]); // declares size 5, has 1 byte
    const combined = new Uint8Array([0x3e, ...badBody, 0x3c, ...good]);
    const reassembler = new FrameReassembler();
    const results = reassembler.push(combined);
    expect(results).toHaveLength(1);
    expect(Array.from(results[0].payload)).toEqual([9]);
  });
});
