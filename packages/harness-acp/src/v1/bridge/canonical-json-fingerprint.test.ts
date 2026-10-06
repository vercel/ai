import { describe, expect, it } from 'vitest';
import { canonicalFingerprint } from './canonical-json-fingerprint';

describe('canonicalFingerprint', () => {
  it('sorts object keys recursively and omits undefined object properties', () => {
    const first = canonicalFingerprint({
      value: {
        nested: { z: 1, b: 2, omitted: undefined },
        city: 'Lima',
        omitted: undefined,
      },
    });
    const reordered = canonicalFingerprint({
      value: { city: 'Lima', nested: { b: 2, z: 1 } },
    });

    expect(first).toBe('{"city":"Lima","nested":{"b":2,"z":1}}');
    expect(reordered).toBe(first);
  });

  it('preserves array order and serializes undefined array entries as null', () => {
    expect(
      canonicalFingerprint({
        value: { items: [{ z: 1, a: 2 }, undefined] },
      }),
    ).toBe('{"items":[{"a":2,"z":1},null]}');
    expect(canonicalFingerprint({ value: [2, 1] })).not.toBe(
      canonicalFingerprint({ value: [1, 2] }),
    );
  });
});
