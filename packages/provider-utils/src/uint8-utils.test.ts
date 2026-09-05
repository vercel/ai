import { describe, expect, it } from 'vitest';
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

    expect(convertBase64ToUint8Array(convertUint8ArrayToBase64(bytes))).toEqual(
      bytes,
    );
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
