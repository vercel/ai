import { describe, it, expect } from 'vitest';
import { mergeObjects } from './merge-objects';

describe('mergeObjects', () => {
  it('should merge two flat objects', () => {
    const target = { a: 1, b: 2 };
    const source = { b: 3, c: 4 };
    const result = mergeObjects(target, source);

    expect(result).toEqual({ a: 1, b: 3, c: 4 });
    // Original objects should not be modified
    expect(target).toEqual({ a: 1, b: 2 });
    expect(source).toEqual({ b: 3, c: 4 });
  });

  it('should deeply merge nested objects', () => {
    const target = { a: 1, b: { c: 2, d: 3 } };
    const source = { b: { c: 4, e: 5 } };
    const result = mergeObjects(target, source);

    expect(result).toEqual({ a: 1, b: { c: 4, d: 3, e: 5 } });
  });

  it('should replace arrays instead of merging them', () => {
    const target = { a: [1, 2, 3], b: 2 };
    const source = { a: [4, 5] };
    const result = mergeObjects(target, source);

    expect(result).toEqual({ a: [4, 5], b: 2 });
  });

  it('should handle null and undefined values', () => {
    const target = { a: 1, b: null, c: undefined };
    const source = { a: null, b: 2, d: undefined };
    const result = mergeObjects(target, source);

    expect(result).toEqual({ a: null, b: 2, c: undefined, d: undefined });
  });

  it('should handle complex nested structures', () => {
    const target = {
      a: 1,
      b: {
        c: [1, 2, 3],
        d: {
          e: 4,
          f: 5,
        },
      },
    };
    const source = {
      b: {
        c: [4, 5],
        d: {
          f: 6,
          g: 7,
        },
      },
      h: 8,
    };

    const result = mergeObjects(target, source);

    expect(result).toEqual({
      a: 1,
      b: {
        c: [4, 5],
        d: {
          e: 4,
          f: 6,
          g: 7,
        },
      },
      h: 8,
    });
  });

  it('should handle Date objects', () => {
    const date1 = new Date('2023-01-01');
    const date2 = new Date('2023-02-01');

    const target = { a: date1 };
    const source = { a: date2 };
    const result = mergeObjects(target, source);

    expect(result?.a).toBe(date2);
  });

  it('should handle RegExp objects', () => {
    const regex1 = /abc/;
    const regex2 = /def/;

    const target = { a: regex1 };
    const source = { a: regex2 };
    const result = mergeObjects(target, source);

    expect(result?.a).toBe(regex2);
  });

  it('should handle empty objects', () => {
    const target = {};
    const source = { a: 1 };
    expect(mergeObjects(target, source)).toEqual({ a: 1 });

    const target2 = { a: 1 };
    const source2 = {};
    expect(mergeObjects(target2, source2)).toEqual({ a: 1 });
  });

  it('should handle undefined inputs', () => {
    // Both inputs undefined
    expect(mergeObjects(undefined, undefined)).toBeUndefined();

    // One input undefined
    expect(mergeObjects({ a: 1 }, undefined)).toEqual({ a: 1 });
    expect(mergeObjects(undefined, { b: 2 })).toEqual({ b: 2 });
  });
});

describe('mergeObjects prototype pollution protection', () => {
  it('should not allow __proto__ key', () => {
    const base = { a: 1 };
    const overrides = JSON.parse('{"__proto__": {"polluted": true}}');
    const result = mergeObjects(base, overrides);

    expect(result).toEqual({ a: 1 });
    expect(({} as any).polluted).toBeUndefined();
  });

  it('should not allow constructor key', () => {
    const base = { a: 1 };
    const overrides = JSON.parse('{"constructor": {"prototype": {"polluted": true}}}');
    const result = mergeObjects(base, overrides);

    expect(result).toEqual({ a: 1 });
    expect(({} as any).polluted).toBeUndefined();
  });

  it('should not allow prototype key', () => {
    const base = { a: 1 };
    const overrides = JSON.parse('{"prototype": {"polluted": true}}');
    const result = mergeObjects(base, overrides);

    expect(result).toEqual({ a: 1 });
    expect(({} as any).polluted).toBeUndefined();
  });

  it('should filter dangerous keys in nested merges', () => {
    const base = { a: { b: 1 } };
    const overrides = { a: JSON.parse('{"__proto__": {"polluted": true}, "c": 2}') };
    const result = mergeObjects(base, overrides);

    expect(result).toEqual({ a: { b: 1, c: 2 } });
    expect(({} as any).polluted).toBeUndefined();
  });

  it('should still merge normal keys alongside filtered keys', () => {
    const base = { x: 1 };
    const overrides = JSON.parse('{"__proto__": {"bad": true}, "y": 2}');
    const result = mergeObjects(base, overrides);

    expect(result).toEqual({ x: 1, y: 2 });
    expect(({} as any).bad).toBeUndefined();
  });
});
