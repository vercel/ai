import { describe, expect, it } from 'vitest';
import { isObjectRootJsonSchema } from './is-object-root-json-schema';

describe('isObjectRootJsonSchema', () => {
  it('accepts an object root', () => {
    expect(
      isObjectRootJsonSchema({
        type: 'object',
        properties: { value: { type: 'string' } },
      }),
    ).toBe(true);
  });

  it('accepts a root without an explicit type', () => {
    expect(isObjectRootJsonSchema({ properties: {} })).toBe(true);
    expect(isObjectRootJsonSchema({ $ref: '#/definitions/response' })).toBe(
      true,
    );
    expect(isObjectRootJsonSchema(undefined)).toBe(true);
  });

  it('accepts a root type union that includes object', () => {
    expect(isObjectRootJsonSchema({ type: ['object', 'null'] })).toBe(true);
  });

  it.each(['array', 'string', 'number', 'integer', 'boolean', 'null'] as const)(
    'rejects the %s root',
    type => {
      expect(isObjectRootJsonSchema({ type })).toBe(false);
    },
  );
});
