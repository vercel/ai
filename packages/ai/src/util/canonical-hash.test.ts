import { describe, expect, it } from 'vitest';
import { canonicalJSON, hashCanonical } from './canonical-hash';

describe('canonicalJSON', () => {
  it('is independent of key insertion order', () => {
    expect(canonicalJSON({ a: 1, b: 2 })).toBe(canonicalJSON({ b: 2, a: 1 }));
  });

  it('sorts keys recursively', () => {
    expect(canonicalJSON({ b: { y: 1, x: 2 }, a: [3, { d: 1, c: 2 }] })).toBe(
      '{"a":[3,{"c":2,"d":1}],"b":{"x":2,"y":1}}',
    );
  });

  it('serializes primitives and null/undefined', () => {
    expect(canonicalJSON(null)).toBe('null');
    expect(canonicalJSON(undefined)).toBe(undefined);
    expect(canonicalJSON('x')).toBe('"x"');
    expect(canonicalJSON(42)).toBe('42');
  });

  it('distinguishes [] from [undefined]', () => {
    expect(canonicalJSON([])).toBe('[]');
    expect(canonicalJSON([undefined])).toBe('[null]');
  });

  it('serializes undefined array elements as null, matching JSON.stringify', () => {
    expect(canonicalJSON([undefined])).toBe(JSON.stringify([undefined]));
    expect(canonicalJSON([null])).toBe('[null]');
    expect(canonicalJSON([1, undefined, 2])).toBe('[1,null,2]');
    expect(canonicalJSON([1, undefined, 2])).toBe(
      JSON.stringify([1, undefined, 2]),
    );
  });
});

describe('hashCanonical', () => {
  it('produces a stable base64url digest', async () => {
    const digest = await hashCanonical({ a: 1, b: 2 });
    expect(digest).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await hashCanonical({ a: 1, b: 2 })).toBe(digest);
  });

  it('is independent of key order', async () => {
    expect(await hashCanonical({ a: 1, b: 2 })).toBe(
      await hashCanonical({ b: 2, a: 1 }),
    );
  });

  it('changes when the value changes', async () => {
    expect(await hashCanonical({ a: 1 })).not.toBe(
      await hashCanonical({ a: 2 }),
    );
  });

  it('produces different digests for [] and [undefined]', async () => {
    expect(await hashCanonical([])).not.toBe(await hashCanonical([undefined]));
  });

  it('produces the same digest for [null] and [undefined]', async () => {
    expect(await hashCanonical([null])).toBe(await hashCanonical([undefined]));
  });
});
