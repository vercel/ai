import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  convertBase64ToUint8Array,
  convertToBase64,
  convertUint8ArrayToBase64,
} from './uint8-utils';

function createBytes(length: number): Uint8Array {
  return Uint8Array.from({ length }, (_, index) => index % 256);
}

describe('convertUint8ArrayToBase64', () => {
  it('converts a byte array to base64', () => {
    expect(
      convertUint8ArrayToBase64(new Uint8Array([72, 101, 108, 108, 111])),
    ).toBe('SGVsbG8=');
  });

  it('handles an empty array', () => {
    expect(convertUint8ArrayToBase64(new Uint8Array())).toBe('');
  });

  it('round-trips arrays larger than a single conversion chunk', () => {
    const bytes = createBytes(100_000);

    const result = convertBase64ToUint8Array(convertUint8ArrayToBase64(bytes));

    expect(result).toHaveLength(bytes.length);
    expect(result.every((byte, index) => byte === bytes[index])).toBe(true);
  });

  it('encodes a subarray with a nonzero byte offset', () => {
    const bytes = new Uint8Array([0, 72, 101, 108, 108, 111, 0]).subarray(1, 6);

    expect(convertUint8ArrayToBase64(bytes)).toBe('SGVsbG8=');
  });

  it('round-trips all byte values', () => {
    const bytes = createBytes(256);

    expect(convertBase64ToUint8Array(convertUint8ArrayToBase64(bytes))).toEqual(
      bytes,
    );
  });

  describe('when Buffer is available', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('encodes with Buffer without copying the input', () => {
      const from = vi.spyOn(globalThis.Buffer, 'from');
      const bytes = createBytes(10).subarray(2, 8);

      convertUint8ArrayToBase64(bytes);

      expect(from).toHaveBeenCalledWith(bytes.buffer, 2, 6);
    });

    it('throws for a Uint8Array backed by a detached ArrayBuffer', () => {
      const buffer = new ArrayBuffer(8);
      const bytes = new Uint8Array(buffer);
      structuredClone(buffer, { transfer: [buffer] });

      expect(() => convertUint8ArrayToBase64(bytes)).toThrow(TypeError);
    });
  });

  describe('when Buffer is unavailable', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('encodes with the chunked fallback', () => {
      const bytes = createBytes(10_000).subarray(3);
      const expected = convertUint8ArrayToBase64(bytes);
      vi.stubGlobal('Buffer', undefined);

      expect(convertUint8ArrayToBase64(new Uint8Array())).toBe('');
      expect(
        convertUint8ArrayToBase64(
          new Uint8Array([0, 72, 101, 108, 108, 111, 0]).subarray(1, 6),
        ),
      ).toBe('SGVsbG8=');
      expect(convertUint8ArrayToBase64(bytes)).toBe(expected);
    });

    it('encodes with the chunked fallback when Buffer has no from function', () => {
      vi.stubGlobal('Buffer', {});

      expect(
        convertUint8ArrayToBase64(new Uint8Array([72, 101, 108, 108, 111])),
      ).toBe('SGVsbG8=');
    });
  });
});

describe('convertBase64ToUint8Array', () => {
  it('converts base64 to a byte array', () => {
    expect(convertBase64ToUint8Array('SGVsbG8=')).toEqual(
      new Uint8Array([72, 101, 108, 108, 111]),
    );
  });

  it('supports base64url characters', () => {
    expect(convertBase64ToUint8Array('-_8=')).toEqual(
      new Uint8Array([251, 255]),
    );
  });

  it('handles an empty string', () => {
    expect(convertBase64ToUint8Array('')).toEqual(new Uint8Array());
  });
});

describe('convertToBase64', () => {
  it('returns base64 strings unchanged', () => {
    expect(convertToBase64('SGVsbG8=')).toBe('SGVsbG8=');
  });

  it('converts byte arrays to base64', () => {
    expect(convertToBase64(new Uint8Array([72, 101, 108, 108, 111]))).toBe(
      'SGVsbG8=',
    );
  });
});
