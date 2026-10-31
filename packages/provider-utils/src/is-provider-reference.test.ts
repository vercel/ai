import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

import { isProviderReference } from './is-provider-reference';

describe('isProviderReference', () => {
  it('returns true for a plain record of provider ids', () => {
    expect(isProviderReference({ openai: 'file-abc123' })).toBe(true);
  });

  it('returns true for a record with a single fileId-like key', () => {
    expect(isProviderReference({ fileId: 'abc' })).toBe(true);
  });

  it('returns false for an object carrying a type property (tagged reference)', () => {
    expect(
      isProviderReference({
        type: 'reference',
        reference: { fileId: 'abc' },
      } as never),
    ).toBe(false);
  });

  it('returns false for a tagged data object with type: "data"', () => {
    expect(isProviderReference({ type: 'data', data: 'x' } as never)).toBe(
      false,
    );
  });

  it('returns false for a Uint8Array', () => {
    expect(isProviderReference(new Uint8Array([1, 2, 3]))).toBe(false);
  });

  it('returns false for a URL instance', () => {
    expect(isProviderReference(new URL('https://example.com/file'))).toBe(
      false,
    );
  });

  it('returns false for null', () => {
    expect(isProviderReference(null as never)).toBe(false);
  });

  it('returns false for a string primitive', () => {
    expect(isProviderReference('some-string' as never)).toBe(false);
  });

  it('returns false for a number primitive', () => {
    expect(isProviderReference(42 as never)).toBe(false);
  });

  it('returns false for an array', () => {
    expect(isProviderReference([])).toBe(false);
    expect(isProviderReference([1, 2, 3])).toBe(false);
  });

  it('returns false for a cross-realm Uint8Array', () => {
    const realmBytes = vm.runInNewContext('new Uint8Array([1, 2, 3])');
    expect(realmBytes instanceof Uint8Array).toBe(false);
    expect(isProviderReference(realmBytes)).toBe(false);
  });

  it('returns false for a cross-realm ArrayBuffer', () => {
    const realmBuffer = vm.runInNewContext('new Uint8Array([1, 2, 3]).buffer');
    expect(realmBuffer instanceof ArrayBuffer).toBe(false);
    expect(isProviderReference(realmBuffer)).toBe(false);
  });

  it('returns false for a cross-realm URL', () => {
    const realmUrl = vm.runInNewContext(
      'new URL("https://example.com/file")',
      { URL },
    );
    expect(isProviderReference(realmUrl)).toBe(false);
  });

  it('returns false for built-in objects (Date, Map, Set, RegExp)', () => {
    expect(isProviderReference(new Date())).toBe(false);
    expect(isProviderReference(new Map())).toBe(false);
    expect(isProviderReference(new Set())).toBe(false);
    expect(isProviderReference(/test/)).toBe(false);
  });

  it('returns true for Object.create(null) dictionary', () => {
    const dict = Object.create(null);
    dict.openai = 'file-xyz';
    expect(isProviderReference(dict)).toBe(true);
  });
});
