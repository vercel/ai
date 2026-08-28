import { UnsupportedFunctionalityError } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { normalizeJsonSchemaForMFJS } from './normalize-json-schema-for-mfjs';

describe('normalizeJsonSchemaForMFJS', () => {
  it('preserves compatible schemas', () => {
    const schema = {
      type: 'object',
      properties: { city: { type: 'string' } },
      required: ['city'],
      additionalProperties: false,
    };

    expect(normalizeJsonSchemaForMFJS(schema)).toEqual(schema);
  });

  it('rewrites tuple items to prefixItems recursively', () => {
    expect(
      normalizeJsonSchemaForMFJS({
        type: 'object',
        properties: {
          pair: {
            type: 'array',
            items: [{ type: 'string' }, { type: 'number' }],
            minItems: 2,
            maxItems: 2,
          },
        },
      }),
    ).toEqual({
      type: 'object',
      properties: {
        pair: {
          type: 'array',
          prefixItems: [{ type: 'string' }, { type: 'number' }],
          minItems: 2,
          maxItems: 2,
        },
      },
    });
  });

  it('moves a sibling type into anyOf branches that lack one', () => {
    expect(
      normalizeJsonSchemaForMFJS({
        type: 'object',
        anyOf: [
          { properties: { city: { type: 'string' } } },
          { type: 'string' },
        ],
      }),
    ).toEqual({
      anyOf: [
        { type: 'object', properties: { city: { type: 'string' } } },
        { type: 'string' },
      ],
    });
  });

  it.each([
    true,
    { type: 'array', items: { type: 'number' } },
    { properties: { value: { type: 'string' } } },
  ])('rejects a non-object root schema', schema => {
    expect(() => normalizeJsonSchemaForMFJS(schema)).toThrow(
      UnsupportedFunctionalityError,
    );
  });
});
