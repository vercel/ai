import { UnsupportedFunctionalityError } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { normalizeJsonSchemaForMFJS } from './normalize-json-schema-for-mfjs';

const city = {
  type: 'object',
  properties: { city: { type: 'string' } },
  required: ['city'],
};
const coords = {
  properties: { lat: { type: 'number' } },
  required: ['lat'],
};

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
        properties: {
          value: {
            type: 'object',
            anyOf: [
              { properties: { city: { type: 'string' } } },
              { type: 'string' },
            ],
          },
        },
      }),
    ).toEqual({
      type: 'object',
      properties: {
        value: {
          anyOf: [
            { type: 'object', properties: { city: { type: 'string' } } },
            { type: 'string' },
          ],
        },
      },
    });
  });

  it('keeps type "object" at the root beside anyOf', () => {
    const schema = {
      type: 'object',
      anyOf: [
        { properties: { city: { type: 'string' } }, required: ['city'] },
        { properties: { lat: { type: 'number' } }, required: ['lat'] },
      ],
    };

    expect(normalizeJsonSchemaForMFJS(schema)).toEqual(schema);
  });

  it('passes an object root with anyOf nested in allOf through unchanged', () => {
    const schema = { type: 'object', allOf: [{ anyOf: [city, coords] }] };

    expect(normalizeJsonSchemaForMFJS(schema)).toEqual(schema);
  });

  it.each(['anyOf', 'oneOf'])(
    'types a root %s of objects as an object',
    key => {
      expect(normalizeJsonSchemaForMFJS({ [key]: [city, coords] })).toEqual({
        type: 'object',
        [key]: [city, coords],
      });
    },
  );

  it('resolves local $ref branches', () => {
    const schema = {
      $defs: { City: city, Coords: coords },
      anyOf: [{ $ref: '#/$defs/City' }, { $ref: '#/definitions/Coords' }],
      definitions: { Coords: coords },
    };

    expect(normalizeJsonSchemaForMFJS(schema)).toEqual({
      type: 'object',
      ...schema,
    });
  });

  it.each([
    { anyOf: [city, { type: 'string' }] },
    { anyOf: [city, { $ref: 'https://example.com/coords.json' }] },
    { anyOf: [city, coords], oneOf: [city, { type: 'string' }] },
    { anyOf: [city, { type: ['object', 'null'], properties: {} }] },
  ])('rejects a root union that is not all objects', schema => {
    expect(() => normalizeJsonSchemaForMFJS(schema)).toThrow(
      UnsupportedFunctionalityError,
    );
  });

  it('produces a clear error message', () => {
    expect(() => normalizeJsonSchemaForMFJS({ type: 'array' })).toThrow(
      'tool and response schemas must be a JSON Schema object with type "object" for moonshotai (MFJS)',
    );
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
