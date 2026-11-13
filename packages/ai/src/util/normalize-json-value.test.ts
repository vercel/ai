import { describe, expect, it } from 'vitest';
import { normalizeJsonValue } from './normalize-json-value';

function nestInArrays(value: unknown, depth: number) {
  let nested = value;
  for (let i = 0; i < depth; i++) {
    nested = [nested];
  }
  return nested;
}

describe('normalizeJsonValue', () => {
  describe('valid JSON values', () => {
    it.each([
      ['null', null],
      ['a string', 'text'],
      ['a finite number', 1.5],
      ['a boolean', false],
      ['an empty array', []],
      ['an empty object', {}],
    ])('should accept %s', (_, value) => {
      expect(normalizeJsonValue(value)).toStrictEqual({ success: true, value });
    });

    it('should return arrays and objects without copying them', () => {
      const array = [1, 'two', null, [true]];
      const object = { array, nested: { key: 'value' } };
      const value = { object, list: [object] };

      const result = normalizeJsonValue(value);

      expect(result).toStrictEqual({ success: true, value });
      expect(result.success && result.value).toBe(value);
      expect(value.object).toBe(object);
      expect(value.object.array).toBe(array);
    });

    it('should accept a value that is referenced more than once', () => {
      const shared = { key: 'value' };
      const value = [shared, { nested: shared }];

      const result = normalizeJsonValue(value);

      expect(result.success && result.value).toBe(value);
    });

    it('should accept deeply nested arrays', () => {
      const value = nestInArrays([], 500);

      const result = normalizeJsonValue(value);

      expect(result.success && result.value).toBe(value);
    });

    it('should read each object property once', () => {
      let readCount = 0;
      const value = {
        get property() {
          readCount++;
          return [1, 2, 3];
        },
      };

      expect(normalizeJsonValue(value).success).toBe(true);
      expect(readCount).toBe(1);
    });

    it('should accept undefined object properties', () => {
      const value = { defined: 1, missing: undefined };

      const result = normalizeJsonValue(value);

      expect(result.success && result.value).toBe(value);
    });

    it('should accept objects without a prototype', () => {
      const value = Object.assign(Object.create(null), { key: 'value' });

      const result = normalizeJsonValue(value);

      expect(result.success && result.value).toBe(value);
    });

    it('should accept objects with a constructor property', () => {
      const value = JSON.parse('{"constructor":{"prototype":null}}');

      const result = normalizeJsonValue(value);

      expect(result.success && result.value).toBe(value);
    });

    it('should accept objects with non-enumerable properties', () => {
      const value = Object.defineProperty({ key: 'value' }, 'hidden', {
        value: () => {},
        enumerable: false,
      });

      const result = normalizeJsonValue(value);

      expect(result.success && result.value).toBe(value);
    });
  });

  describe('__proto__ keys', () => {
    it('should remove an own __proto__ key', () => {
      const value = JSON.parse('{"a":1,"__proto__":{"polluted":true},"b":2}');

      const result = normalizeJsonValue(value);

      expect(result).toStrictEqual({ success: true, value: { a: 1, b: 2 } });
      expect(Object.keys(result.success && (result.value as object))).toEqual([
        'a',
        'b',
      ]);
      expect((result.success && result.value) as object).not.toHaveProperty(
        'polluted',
      );
    });

    it('should not validate the value of a removed __proto__ key', () => {
      const value = JSON.parse('{"a":1,"__proto__":[1e999]}');

      expect(normalizeJsonValue(value)).toStrictEqual({
        success: true,
        value: { a: 1 },
      });
    });

    it('should not change the input', () => {
      const json = '{"list":[{"__proto__":{"polluted":true},"a":1}]}';
      const value = JSON.parse(json);

      normalizeJsonValue(value);

      expect(JSON.stringify(value)).toBe(json);
    });

    it('should only copy the arrays and objects that contain the key', () => {
      const unchanged = { key: ['value'] };
      const value = {
        before: unchanged,
        list: [unchanged, JSON.parse('{"__proto__":{},"a":1}'), unchanged],
        after: unchanged,
      };

      const result = normalizeJsonValue(value);

      expect(result).toStrictEqual({
        success: true,
        value: {
          before: unchanged,
          list: [unchanged, { a: 1 }, unchanged],
          after: unchanged,
        },
      });

      const normalized = (result.success && result.value) as typeof value;
      expect(normalized).not.toBe(value);
      expect(normalized.list).not.toBe(value.list);
      expect(normalized.before).toBe(unchanged);
      expect(normalized.list[0]).toBe(unchanged);
      expect(normalized.list[2]).toBe(unchanged);
      expect(normalized.after).toBe(unchanged);
    });
  });

  describe('invalid JSON values', () => {
    it.each([
      ['undefined', undefined],
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
      ['a bigint', 1n],
      ['a symbol', Symbol('symbol')],
      ['a function', () => {}],
      ['a date', new Date(0)],
      ['a map', new Map()],
      ['a class instance', new (class Example {})()],
      ['an object with a symbol key', { [Symbol('symbol')]: 1 }],
    ])('should reject %s', (_, value) => {
      expect(normalizeJsonValue(value)).toStrictEqual({
        success: false,
        path: [],
      });
      expect(normalizeJsonValue({ list: [null, value] })).toStrictEqual({
        success: false,
        path: ['list', 1],
      });
    });

    it('should reject array holes', () => {
      // oxlint-disable-next-line no-sparse-arrays
      expect(normalizeJsonValue({ list: [1, , 3] })).toStrictEqual({
        success: false,
        path: ['list', 1],
      });
    });

    it('should return the path to the first invalid value', () => {
      const value = {
        valid: [1, 2],
        first: { list: [0, nestInArrays(Number.NaN, 3)] },
        second: Number.NaN,
      };

      expect(normalizeJsonValue(value)).toStrictEqual({
        success: false,
        path: ['first', 'list', 1, 0, 0, 0],
      });
    });

    it('should reject an object that contains itself', () => {
      const value: Record<string, unknown> = { key: 'value' };
      value.list = [{ self: value }];

      expect(normalizeJsonValue(value)).toStrictEqual({
        success: false,
        path: ['list', 0, 'self'],
      });
    });

    it('should reject an array that contains itself', () => {
      const value: unknown[] = [1];
      value.push(value);

      expect(normalizeJsonValue(value)).toStrictEqual({
        success: false,
        path: [1],
      });
    });
  });
});
