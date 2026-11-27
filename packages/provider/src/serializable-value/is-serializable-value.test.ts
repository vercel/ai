import { describe, expect, test, vi } from 'vitest';
import { isSerializableValue } from './index';

describe('isSerializableValue', () => {
  test.each(
    [
      null,
      undefined,
      '',
      'value',
      false,
      true,
      0,
      -0,
      Number.NaN,
      Infinity,
      -Infinity,
      10n,
      new Date(0),
      new Date(Number.NaN),
      /value/gi,
      new URL('https://example.com'),
      new URLSearchParams('key=value'),
      new ArrayBuffer(4),
      new DataView(new ArrayBuffer(4)),
      new Int8Array([1]),
      new Uint8Array([1]),
      new Uint8ClampedArray([1]),
      new Int16Array([1]),
      new Uint16Array([1]),
      new Int32Array([1]),
      new Uint32Array([1]),
      new Float32Array([1]),
      new Float64Array([1]),
      new BigInt64Array([1n]),
      new BigUint64Array([1n]),
      [],
      {},
      Object.assign(Object.create(null), { value: undefined }),
      { nested: [new Date(0), undefined, { value: 10n }] },
      new Map([[new Date(0), new Set([1, 2])]]),
      new Set([new Map([['key', [undefined, 10n]]])]),
    ].map(value => ({ value })),
  )('accepts $value', ({ value }) => {
    expect(isSerializableValue(value)).toBe(true);
  });

  test.each(
    [
      () => {},
      Symbol('value'),
      new Error('value'),
      Promise.resolve('value'),
      new WeakMap(),
      new WeakSet(),
      Object.create({ value: 'inherited' }),
      { value: () => {} },
      [Symbol('value')],
      new Map([[() => {}, 'value']]),
      new Map([['key', () => {}]]),
      new Set([() => {}]),
    ].map(value => ({ value })),
  )('rejects $value', ({ value }) => {
    expect(isSerializableValue(value)).toBe(false);
  });

  test('rejects plain-object accessors without invoking them', () => {
    const getter = vi.fn(() => 'value');
    const value = Object.defineProperty({}, 'value', { get: getter });

    expect(isSerializableValue(value)).toBe(false);
    expect(getter).not.toHaveBeenCalled();
  });

  test('rejects symbol keys and unsupported non-enumerable properties', () => {
    expect(isSerializableValue({ [Symbol('key')]: 'value' })).toBe(false);
    expect(
      isSerializableValue(
        Object.defineProperty({}, 'value', {
          value: () => {},
          enumerable: false,
        }),
      ),
    ).toBe(false);
  });

  test('does not invoke custom serialization methods', () => {
    const toJSON = vi.fn(() => ({ value: 'serialized' }));

    expect(isSerializableValue({ toJSON })).toBe(false);
    expect(isSerializableValue(Object.create({ toJSON }))).toBe(false);
    expect(toJSON).not.toHaveBeenCalled();
  });

  test('rejects cycles in objects, arrays, map keys, map values, and sets', () => {
    const object: Record<string, unknown> = {};
    object.self = object;
    const array: unknown[] = [];
    array.push(array);
    const mapKey = new Map<unknown, unknown>();
    mapKey.set(mapKey, 'value');
    const mapValue = new Map<unknown, unknown>();
    mapValue.set('key', mapValue);
    const set = new Set<unknown>();
    set.add(set);
    const nested: Record<string, unknown> = {};
    nested.child = new Map([['key', [nested]]]);

    for (const value of [object, array, mapKey, mapValue, set, nested]) {
      expect(isSerializableValue(value)).toBe(false);
    }
  });

  test('accepts repeated references that do not form cycles', () => {
    const shared = { value: [undefined, new Date(0)] };

    expect(
      isSerializableValue({
        first: shared,
        second: shared,
        array: [shared, shared],
        map: new Map([[shared, shared]]),
        set: new Set([shared]),
      }),
    ).toBe(true);
  });
});
