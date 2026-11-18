import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { convertInlineFileDataToUint8Array } from './convert-inline-file-data-to-uint8-array';
import { isProviderReference } from './is-provider-reference';

describe('cross-realm file data', () => {
  it('distinguishes foreign byte views and buffers from provider references', () => {
    const bytes: Uint8Array = vm.runInNewContext('new Uint8Array([1, 2, 3])');
    expect(isProviderReference(bytes)).toBe(false);
    expect(isProviderReference(bytes.buffer)).toBe(false);
    expect(isProviderReference({ openai: 'file-123' })).toBe(true);
  });

  it('preserves the bounds of a foreign inline byte view', () => {
    const bytes: Uint8Array = vm.runInNewContext(
      'new Uint8Array([0, 1, 2, 3, 4]).subarray(1, 4)',
    );
    expect(
      convertInlineFileDataToUint8Array({ type: 'data', data: bytes }),
    ).toEqual(new Uint8Array([1, 2, 3]));
  });
});
