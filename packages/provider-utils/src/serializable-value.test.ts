import type { JSONValue } from '@ai-sdk/provider';
import type { SerializableValue } from './types/serializable-value';
import {
  cloneSerializableValue,
  jsonDecodeSerializableValue,
  jsonEncodeSerializableValue,
} from './serializable-value';
import { describe, expect, test } from 'vitest';

describe('SerializableValue', () => {
  test('round-trips supported non-JSON values through JSON text', () => {
    const dataViewBuffer = new Uint8Array([1, 2, 3, 4]).buffer;
    const value = {
      undefined: undefined,
      bigint: 12345678901234567890n,
      nan: Number.NaN,
      positiveInfinity: Infinity,
      negativeInfinity: -Infinity,
      negativeZero: -0,
      date: new Date('2025-01-02T03:04:05.000Z'),
      invalidDate: new Date(Number.NaN),
      regexp: Object.assign(/test/gi, { lastIndex: 2 }),
      url: new URL('https://example.com/path?query=value'),
      urlSearchParams: new URLSearchParams('query=value&query=other'),
      arrayBuffer: new Uint8Array([5, 6, 7]).buffer,
      uint16Array: new Uint16Array([8, 9]),
      dataView: new DataView(dataViewBuffer, 1, 2),
      map: new Map<SerializableValue, SerializableValue>([
        ['key', new Set<SerializableValue>([undefined, 10n])],
      ]),
      set: new Set<SerializableValue>([1, 'value']),
      literalTag: {
        __ai_sdk_serializable_value__: 'undefined',
        value: 'ordinary object',
      },
      nullPrototype: Object.assign(Object.create(null), { value: 'value' }),
    } satisfies SerializableValue;

    const serialized = jsonEncodeSerializableValue({ value });
    const json = JSON.stringify(serialized);
    expect(json).toBeDefined();

    const restored = jsonDecodeSerializableValue({
      value: JSON.parse(json!) as JSONValue,
    });

    const restoredValue = restored as typeof value;
    expect(restoredValue).toEqual({
      ...value,
      dataView: new DataView(new Uint8Array([2, 3]).buffer),
    });
    expect(Object.is(restoredValue.negativeZero, -0)).toBe(true);
    expect(Object.getPrototypeOf(restoredValue.nullPrototype)).toBe(null);
    expect(restoredValue.dataView.byteOffset).toBe(0);
  });

  test('clones supported values without sharing mutable nested values', () => {
    const value: SerializableValue = {
      bytes: new Uint8Array([1, 2, 3]),
      map: new Map<SerializableValue, SerializableValue>([
        ['key', new Set<SerializableValue>([1])],
      ]),
    };

    const clone = cloneSerializableValue({ value }) as typeof value;
    (clone.bytes as Uint8Array)[0] = 9;
    (
      (clone.map as Map<SerializableValue, SerializableValue>).get(
        'key',
      ) as Set<SerializableValue>
    ).add(2);

    expect((value.bytes as Uint8Array)[0]).toBe(1);
    expect(
      Array.from(
        (value.map as Map<SerializableValue, SerializableValue>).get(
          'key',
        ) as Set<SerializableValue>,
      ),
    ).toEqual([1]);
  });

  test('rejects circular values and array accessors during JSON encoding', () => {
    const circular: { self?: SerializableValue } = {};
    circular.self = circular;

    const withAccessor = [] as SerializableValue[];
    Object.defineProperty(withAccessor, '0', {
      get: () => 'value',
      enumerable: true,
    });
    withAccessor.length = 1;

    expect(() =>
      jsonEncodeSerializableValue({ value: circular as SerializableValue }),
    ).toThrow('Circular values');
    expect(() => jsonEncodeSerializableValue({ value: withAccessor })).toThrow(
      'Accessor properties',
    );
    expect(() => cloneSerializableValue({ value: withAccessor })).toThrow(
      'Accessor properties',
    );
  });
});
