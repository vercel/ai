import vm from 'node:vm';
import { UnsupportedFunctionalityError } from '@ai-sdk/provider';
import { describe, expect, it, vi } from 'vitest';
import { convertInlineFileDataToUint8Array } from './convert-inline-file-data-to-uint8-array';

describe('convertInlineFileDataToUint8Array', () => {
  it('converts text data to UTF-8 bytes', () => {
    expect(
      convertInlineFileDataToUint8Array({ type: 'text', text: 'abc' }),
    ).toEqual(new TextEncoder().encode('abc'));
  });

  it('returns Uint8Array data as-is', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    expect(
      convertInlineFileDataToUint8Array({ type: 'data', data: bytes }),
    ).toBe(bytes);
  });

  it('converts cross-realm Uint8Array data', () => {
    const realmBytes = vm.runInNewContext('new Uint8Array([1, 2, 3])');
    expect(realmBytes instanceof Uint8Array).toBe(false);
    expect(
      convertInlineFileDataToUint8Array({
        type: 'data',
        data: realmBytes as unknown as Uint8Array,
      }),
    ).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('converts ArrayBuffer data', () => {
    const buffer = new Uint8Array([1, 2, 3]).buffer;
    expect(
      convertInlineFileDataToUint8Array({
        type: 'data',
        data: buffer as unknown as Uint8Array,
      }),
    ).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('converts cross-realm ArrayBuffer data', () => {
    const realmBuffer = vm.runInNewContext('new Uint8Array([1, 2, 3]).buffer');
    expect(realmBuffer instanceof ArrayBuffer).toBe(false);
    expect(
      convertInlineFileDataToUint8Array({
        type: 'data',
        data: realmBuffer as unknown as Uint8Array,
      }),
    ).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('decodes base64 string data', () => {
    expect(
      convertInlineFileDataToUint8Array({
        type: 'data',
        data: Buffer.from('abc').toString('base64'),
      }),
    ).toEqual(new TextEncoder().encode('abc'));
  });

  it('rejects stream data with UnsupportedFunctionalityError and cancels the stream', async () => {
    const cancelSpy = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel: cancelSpy });

    expect(() =>
      convertInlineFileDataToUint8Array({ type: 'stream', stream }),
    ).toThrow(UnsupportedFunctionalityError);

    await vi.waitFor(() => expect(cancelSpy).toHaveBeenCalled());
  });
});
