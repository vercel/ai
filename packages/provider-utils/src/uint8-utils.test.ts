import { describe, expect, it } from 'vitest';
import {
  convertBase64ToUint8Array,
  convertUint8ArrayToBase64,
  convertToBase64,
} from './uint8-utils';

// Creates a Uint8Array of the given length filled with cycling byte values
// (0, 1, 2, ..., 255, 0, 1, ...) to produce varied, non-trivial test data.
function makeBytes(length: number): Uint8Array {
  const array = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    array[i] = i % 256;
  }
  return array;
}

describe('convertUint8ArrayToBase64', () => {
  it('should convert a basic byte array to base64', () => {
    expect(
      convertUint8ArrayToBase64(new Uint8Array([72, 101, 108, 108, 111])),
    ).toBe('SGVsbG8=');
  });

  it('should handle empty array', () => {
    expect(convertUint8ArrayToBase64(new Uint8Array([]))).toBe('');
  });

  it('should handle all byte values (0-255)', () => {
    const allBytes = makeBytes(256);
    const result = convertUint8ArrayToBase64(allBytes);
    // round-trip should recover original bytes
    expect(convertBase64ToUint8Array(result)).toEqual(allBytes);
  });

  it('should correctly round-trip large arrays', () => {
    const large = makeBytes(100000);
    expect(convertBase64ToUint8Array(convertUint8ArrayToBase64(large))).toEqual(
      large,
    );
  });
});

describe('convertBase64ToUint8Array', () => {
  it('should convert a base64 string to a byte array', () => {
    expect(convertBase64ToUint8Array('SGVsbG8=')).toEqual(
      new Uint8Array([72, 101, 108, 108, 111]),
    );
  });

  it('should handle base64url encoding (- and _ characters)', () => {
    // [251, 255] encodes to '+/8=' in standard base64, '-_8=' in base64url
    expect(convertBase64ToUint8Array('-_8=')).toEqual(
      new Uint8Array([251, 255]),
    );
  });

  it('should handle empty string', () => {
    expect(convertBase64ToUint8Array('')).toEqual(new Uint8Array([]));
  });
});

describe('convertToBase64', () => {
  it('should pass through a string unchanged', () => {
    expect(convertToBase64('SGVsbG8=')).toBe('SGVsbG8=');
  });

  it('should convert a Uint8Array to base64', () => {
    expect(convertToBase64(new Uint8Array([72, 101, 108, 108, 111]))).toBe(
      'SGVsbG8=',
    );
  });
});
