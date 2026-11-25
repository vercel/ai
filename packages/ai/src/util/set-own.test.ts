import { describe, expect, it } from 'vitest';
import { setOwn } from './set-own';

describe('setOwn', () => {
  it.each(['__proto__', 'constructor', 'toString', 'normal'])(
    'writes and replaces an enumerable own property named %s',
    key => {
      const object: Record<string, { value: number }> = {};
      setOwn(object, key, { value: 1 });
      setOwn(object, key, { value: 2 });

      expect(Object.getPrototypeOf(object)).toBe(Object.prototype);
      expect(Object.getOwnPropertyDescriptor(object, key)).toEqual({
        value: { value: 2 },
        enumerable: true,
        configurable: true,
        writable: true,
      });
      expect(Object.entries({ ...object })).toStrictEqual([
        [key, { value: 2 }],
      ]);
    },
  );
});
