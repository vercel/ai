import { describe, expect, it } from 'vitest';
import { isJSONSerializable } from './is-json-serializable';

class TestClass {}

describe('isJSONSerializable', () => {
  it('returns true for null and undefined', () => {
    expect(isJSONSerializable(null)).toBe(true);
    expect(isJSONSerializable(undefined)).toBe(true);
  });

  it('returns true for primitive JSON-compatible values', () => {
    expect(isJSONSerializable('test')).toBe(true);
    expect(isJSONSerializable(42)).toBe(true);
    expect(isJSONSerializable(true)).toBe(true);
    expect(isJSONSerializable(false)).toBe(true);
  });

  it('returns false for unsupported primitive values', () => {
    expect(isJSONSerializable(() => {})).toBe(false);
    expect(isJSONSerializable(Symbol('test'))).toBe(false);
    expect(isJSONSerializable(BigInt(1))).toBe(false);
  });

  it('returns true for arrays when all values are serializable', () => {
    expect(
      isJSONSerializable([
        'test',
        42,
        true,
        null,
        undefined,
        { nested: ['value'] },
      ]),
    ).toBe(true);
  });

  it('returns false for arrays containing non-serializable values', () => {
    expect(isJSONSerializable(['test', () => {}])).toBe(false);
  });

  it('returns true for plain objects when all values are serializable', () => {
    expect(
      isJSONSerializable({
        string: 'test',
        number: 42,
        boolean: true,
        nullValue: null,
        undefinedValue: undefined,
        nested: {
          array: ['value'],
        },
      }),
    ).toBe(true);
  });

  it('returns false for plain objects containing non-serializable values', () => {
    expect(
      isJSONSerializable({
        nested: {
          callback: () => {},
        },
      }),
    ).toBe(false);
  });

  it('returns false for non-plain objects', () => {
    expect(isJSONSerializable(new Date())).toBe(false);
    expect(isJSONSerializable(/test/u)).toBe(false);
    expect(isJSONSerializable(new TestClass())).toBe(false);
    expect(isJSONSerializable(Object.create(null))).toBe(false);
  });

  it('returns false for circular object references without crashing', () => {
    const cyclicObj: Record<string, unknown> = { key: 'value' };
    cyclicObj.self = cyclicObj;
    expect(isJSONSerializable(cyclicObj)).toBe(false);

    const indirectA: Record<string, unknown> = { name: 'A' };
    const indirectB: Record<string, unknown> = { name: 'B', ref: indirectA };
    indirectA.ref = indirectB;
    expect(isJSONSerializable(indirectA)).toBe(false);
  });

  it('returns false for circular array references without crashing', () => {
    const cyclicArr: unknown[] = [1, 2];
    cyclicArr.push(cyclicArr);
    expect(isJSONSerializable(cyclicArr)).toBe(false);
  });

  it('returns true for DAGs with shared non-circular references', () => {
    const sharedLeaf = { id: 1, name: 'leaf' };
    const dag = {
      left: sharedLeaf,
      right: sharedLeaf,
      items: [sharedLeaf, sharedLeaf],
    };
    expect(isJSONSerializable(dag)).toBe(true);
  });
});
