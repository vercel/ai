import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
  convertDataContentToBase64String,
  convertDataContentToUint8Array,
} from './data-content';

describe('convertDataContentToBase64String', () => {
  it('passes through string as-is', () => {
    expect(convertDataContentToBase64String('SGVsbG8=')).toBe('SGVsbG8=');
  });

  it('converts Uint8Array to base64', () => {
    expect(
      convertDataContentToBase64String(new Uint8Array([72, 101, 108, 108, 111])),
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
    expect(convertDataContentToBase64String(realmBytes as unknown as Uint8Array)).toBe(
      'SGVsbG8=',
    );
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
    const realmBuffer = vm.runInNewContext(
      'new Uint8Array([1, 2, 3]).buffer',
    );
    const result = convertDataContentToUint8Array(
      realmBuffer as unknown as ArrayBuffer,
    );
    expect(result).toBeInstanceOf(Uint8Array);
    expect(Array.from(result)).toEqual([1, 2, 3]);
  });
});
