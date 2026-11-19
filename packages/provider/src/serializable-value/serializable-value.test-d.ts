import { expectTypeOf, test } from 'vitest';
import { isSerializableValue, type SerializableValue } from './index';
import type { JSONValue } from '../json-value';

test('accepts JSON values and recursively readonly extended values', () => {
  expectTypeOf<JSONValue>().toMatchTypeOf<SerializableValue>();
  expectTypeOf({
    date: new Date(0),
    array: [undefined, 10n, new URL('https://example.com')],
    map: new Map([['key', new Set([1, 2])]]) as ReadonlyMap<
      string,
      ReadonlySet<number>
    >,
  } as const).toMatchTypeOf<SerializableValue>();
});

test('narrows an unknown value with a unary guard', () => {
  expectTypeOf<Parameters<typeof isSerializableValue>>().toEqualTypeOf<
    [unknown]
  >();
  const value: unknown = undefined;
  if (isSerializableValue(value)) {
    expectTypeOf(value).toEqualTypeOf<SerializableValue>();
  }
});
