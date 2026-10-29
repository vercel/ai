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

  it('preserves undefined array element positions', () => {
    expect(canonicalJSON([])).toBe('[]');
    expect(canonicalJSON([undefined])).toBe('[null]');
    expect(canonicalJSON({ values: [undefined] })).toBe('{"values":[null]}');
  });

  it('omits undefined, function, and symbol properties from objects', () => {
    expect(canonicalJSON({ a: 1, b: undefined })).toBe('{"a":1}');
    expect(canonicalJSON({ a: undefined })).toBe('{}');
    expect(canonicalJSON({ a: 1, fn: () => {} })).toBe('{"a":1}');
    expect(canonicalJSON({ a: 1, s: Symbol('test') })).toBe('{"a":1}');
  });

  it('censors functions and symbols to null in arrays', () => {
    expect(canonicalJSON([() => {}, Symbol('test'), 42])).toBe(
      '[null,null,42]',
    );
  });

  it('respects toJSON methods on objects', () => {
    const d = new Date('2026-01-01T00:00:00.000Z');
    expect(canonicalJSON(d)).toBe('"2026-01-01T00:00:00.000Z"');
  });

  it('serializes objects whose toJSON returns their receiver', () => {
    const value: Record<string, unknown> = { name: 'x' };
    value.toJSON = () => value;
    expect(canonicalJSON(value)).toBe('{"name":"x"}');
  });

  it('throws on circular structures instead of overflowing the stack', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => canonicalJSON(circular)).toThrow(TypeError);
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

  it('distinguishes empty arrays from arrays containing undefined', async () => {
    expect(await hashCanonical([])).not.toBe(await hashCanonical([undefined]));
    expect(await hashCanonical({ values: [] })).not.toBe(
      await hashCanonical({ values: [undefined] }),
    );
  });

  it('produces identical hashes for objects with omitted vs undefined properties', async () => {
    expect(await hashCanonical({ a: 1, b: undefined })).toBe(
      await hashCanonical({ a: 1 }),
    );
  });
});
