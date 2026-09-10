import { describe, expectTypeOf, it } from 'vitest';
import type { JSONArray, JSONObject, JSONValue } from './json-value';

describe('JSONValue', () => {
  it('should accept recursively readonly JSON values', () => {
    const readonlyObject = {
      null: null,
      string: 'value',
      number: 1,
      boolean: true,
      object: {
        nested: 'value',
      },
      array: [
        'value',
        {
          nested: [1, true, null],
        },
      ],
      undefined: undefined,
    } as const;

    expectTypeOf(readonlyObject).toMatchTypeOf<JSONValue>();
    expectTypeOf(readonlyObject.array).toMatchTypeOf<JSONValue>();
  });

  it('should preserve mutable object and array aliases', () => {
    const object: JSONObject = {};
    const array: JSONArray = [];

    object.value = 'value';
    array.push(object);

    expectTypeOf(object).toMatchTypeOf<JSONValue>();
    expectTypeOf(array).toMatchTypeOf<JSONValue>();
  });
});
