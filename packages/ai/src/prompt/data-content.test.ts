import vm from 'node:vm';
import {
  dataContentSchema,
  convertDataContentToUint8Array,
  convertDataContentToBase64String,
  convertToLanguageModelV3DataContent,
} from './data-content';
import { describe, it, expect } from 'vitest';

describe('dataContentSchema', () => {
  it('should validate a Buffer', () => {
    const buffer = Buffer.from('Hello, world!');
    const result = dataContentSchema.parse(buffer);
    expect(result).toEqual(buffer);
  });

  it('should reject a non-matching object', () => {
    const nonMatchingObject = { foo: 'bar' };
    expect(() => dataContentSchema.parse(nonMatchingObject)).toThrow();
  });
});

describe('convertDataContentToBase64String', () => {
  it('passes through string as-is', () => {
    expect(convertDataContentToBase64String('SGVsbG8=')).toBe('SGVsbG8=');
  });

  it('converts Uint8Array to base64', () => {
    expect(
      convertDataContentToBase64String(
        new Uint8Array([72, 101, 108, 108, 111]),
      ),
    ).toBe('SGVsbG8=');
  });

  it('converts ArrayBuffer to base64', () => {
    const buffer = new Uint8Array([72, 101, 108, 108, 111]).buffer;
    expect(convertDataContentToBase64String(buffer)).toBe('SGVsbG8=');
  });

  it('converts cross-realm Uint8Array to base64', () => {
    const realmBytes = vm.runInNewContext(
      'new Uint8Array([72, 101, 108, 108, 111])',
    );
    expect(
      convertDataContentToBase64String(realmBytes as unknown as Uint8Array),
    ).toBe('SGVsbG8=');
  });

  it('converts cross-realm ArrayBuffer to base64', () => {
    const realmBuffer = vm.runInNewContext(
      'new Uint8Array([72, 101, 108, 108, 111]).buffer',
    );
    expect(
      convertDataContentToBase64String(realmBuffer as unknown as ArrayBuffer),
    ).toBe('SGVsbG8=');
  });
});

describe('convertDataContentToUint8Array', () => {
  it('preserves the bounds of a cross-realm subarray', () => {
    const bytes = vm.runInNewContext(
      'new Uint8Array([0, 1, 2, 3, 4]).subarray(1, 4)',
    );
    expect(convertDataContentToUint8Array(bytes)).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    expect(convertDataContentToBase64String(bytes)).toBe('AQID');
  });
  it('returns Uint8Array as-is', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    expect(convertDataContentToUint8Array(bytes)).toBe(bytes);
  });

  it('converts base64 string to Uint8Array', () => {
    expect(convertDataContentToUint8Array('SGVsbG8=')).toEqual(
      new Uint8Array([72, 101, 108, 108, 111]),
    );
  });

  it('converts ArrayBuffer to Uint8Array', () => {
    const buffer = new Uint8Array([1, 2, 3]).buffer;
    expect(convertDataContentToUint8Array(buffer)).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  it('converts cross-realm Uint8Array to Uint8Array', () => {
    const realmBytes = vm.runInNewContext('new Uint8Array([1, 2, 3])');
    const result = convertDataContentToUint8Array(
      realmBytes as unknown as Uint8Array,
    );
    expect(result).toBeInstanceOf(Uint8Array);
    expect(Array.from(result)).toEqual([1, 2, 3]);
  });

  it('converts cross-realm ArrayBuffer to Uint8Array', () => {
    const realmBuffer = vm.runInNewContext('new Uint8Array([1, 2, 3]).buffer');
    const result = convertDataContentToUint8Array(
      realmBuffer as unknown as ArrayBuffer,
    );
    expect(result).toBeInstanceOf(Uint8Array);
    expect(Array.from(result)).toEqual([1, 2, 3]);
  });
});

describe('cross-realm public data validation', () => {
  it.each([
    'new Uint8Array([0, 1, 2, 3, 4]).subarray(1, 4)',
    'new Uint8Array([1, 2, 3]).buffer',
  ])('validates and preserves byte bounds: %s', expression => {
    const data = vm.runInNewContext(expression);
    expect(dataContentSchema.safeParse(data).success).toBe(true);
    const result = convertToLanguageModelV3DataContent(data);
    expect(result.data).toBeInstanceOf(Uint8Array);
    expect(Array.from(result.data as Uint8Array)).toEqual([1, 2, 3]);
    expect(convertDataContentToBase64String(data)).toBe('AQID');
  });
  it('rejects spoofed tags and other typed arrays', () => {
    expect(
      dataContentSchema.safeParse({ [Symbol.toStringTag]: 'Uint8Array' })
        .success,
    ).toBe(false);
    expect(dataContentSchema.safeParse(new Uint16Array([1, 2])).success).toBe(
      false,
    );
  });
});
