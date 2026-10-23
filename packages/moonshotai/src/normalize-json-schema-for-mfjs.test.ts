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

<<<<<<< HEAD
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
=======
  it('appends tuple items after existing prefixItems', () => {
    const result = normalizeJsonSchemaForMFJS({
      type: 'object',
      properties: {
        a: {
          type: 'array',
          prefixItems: [{ type: 'string' }],
          items: [{ type: 'number' }],
        },
      },
    });

    expect(result).toEqual({
      type: 'object',
      properties: {
        a: {
          type: 'array',
          prefixItems: [{ type: 'string' }, { type: 'number' }],
        },
      },
    });
  });

  it('rewrites tuples nested in anyOf branches', () => {
    const result = normalizeJsonSchemaForMFJS({
      type: 'object',
      properties: {
        a: {
          anyOf: [
            {
              type: 'array',
              items: [{ type: 'string' }, { type: 'number' }],
            },
            { type: 'string' },
          ],
        },
      },
    });

    expect(result).toEqual({
      type: 'object',
      properties: {
        a: {
          anyOf: [
            {
              type: 'array',
              prefixItems: [{ type: 'string' }, { type: 'number' }],
            },
            { type: 'string' },
          ],
        },
      },
    });
  });
});

describe('type + anyOf on the same node', () => {
  it('moves type into anyOf branches that lack one', () => {
    const result = normalizeJsonSchemaForMFJS({
      type: 'object',
      properties: {
        location: {
          type: 'object',
          anyOf: [
            { properties: { city: { type: 'string' } }, required: ['city'] },
            {
              properties: { lat: { type: 'number' }, lon: { type: 'number' } },
              required: ['lat', 'lon'],
            },
          ],
        },
      },
    });

    expect(result).toEqual({
      type: 'object',
      properties: {
        location: {
          anyOf: [
            {
              type: 'object',
              properties: { city: { type: 'string' } },
              required: ['city'],
            },
            {
              type: 'object',
              properties: { lat: { type: 'number' }, lon: { type: 'number' } },
              required: ['lat', 'lon'],
            },
          ],
        },
      },
    });
  });

  it('keeps branch types when already present', () => {
    const result = normalizeJsonSchemaForMFJS({
      type: 'object',
      properties: {
        value: {
          type: 'object',
          anyOf: [
            { type: 'string' },
            { properties: { lat: { type: 'number' } } },
          ],
        },
      },
    });

    expect(result).toEqual({
      type: 'object',
      properties: {
        value: {
          anyOf: [
            { type: 'string' },
            { type: 'object', properties: { lat: { type: 'number' } } },
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

  it('splits type at nested levels, not just the root', () => {
    const result = normalizeJsonSchemaForMFJS({
      type: 'object',
      properties: {
        a: {
          type: 'object',
          anyOf: [
            { properties: { city: { type: 'string' } }, required: ['city'] },
            { properties: { lat: { type: 'number' } }, required: ['lat'] },
          ],
        },
      },
      required: ['a'],
    });

    expect(result).toEqual({
      type: 'object',
      properties: {
        a: {
          anyOf: [
            {
              type: 'object',
              properties: { city: { type: 'string' } },
              required: ['city'],
            },
            {
              type: 'object',
              properties: { lat: { type: 'number' } },
              required: ['lat'],
            },
          ],
        },
      },
      required: ['a'],
    });
  });
});

describe('root unions of objects', () => {
  const city = {
    type: 'object',
    properties: { city: { type: 'string' } },
    required: ['city'],
  };
  const coords = {
    properties: { lat: { type: 'number' } },
    required: ['lat'],
  };

  it('types a root anyOf of objects as an object', () => {
    expect(normalizeJsonSchemaForMFJS({ anyOf: [city, coords] })).toEqual({
      type: 'object',
      anyOf: [city, coords],
    });
  });

  it('types a root oneOf of objects as an object', () => {
    expect(normalizeJsonSchemaForMFJS({ oneOf: [city, coords] })).toEqual({
      type: 'object',
      oneOf: [city, coords],
    });
  });

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

  it('throws for a non-local $ref branch', () => {
    expect(() =>
      normalizeJsonSchemaForMFJS({
        anyOf: [city, { $ref: 'https://example.com/coords.json' }],
      }),
    ).toThrow(UnsupportedFunctionalityError);
  });

  it('requires every root union to be objects', () => {
    expect(() =>
      normalizeJsonSchemaForMFJS({
        anyOf: [city, coords],
        oneOf: [city, { type: 'string' }],
      }),
    ).toThrow(UnsupportedFunctionalityError);
  });

  it('throws for a nullable object branch', () => {
    expect(() =>
      normalizeJsonSchemaForMFJS({
        anyOf: [city, { type: ['object', 'null'], properties: {} }],
      }),
    ).toThrow(UnsupportedFunctionalityError);
  });

  it('passes an object root with anyOf nested in allOf through unchanged', () => {
    const schema = {
      type: 'object',
      allOf: [{ anyOf: [city, coords] }],
    };

    expect(normalizeJsonSchemaForMFJS(schema)).toEqual(schema);
  });

  it('still throws for a root union with a non-object branch', () => {
    expect(() =>
      normalizeJsonSchemaForMFJS({ anyOf: [city, { type: 'string' }] }),
    ).toThrow(UnsupportedFunctionalityError);
  });
});

describe('root guard', () => {
  it('throws for a non-object root type', () => {
    expect(() =>
      normalizeJsonSchemaForMFJS({ type: 'array', items: { type: 'number' } }),
    ).toThrow(UnsupportedFunctionalityError);
  });

  it('throws for a missing root type', () => {
    expect(() =>
      normalizeJsonSchemaForMFJS({ properties: { a: { type: 'string' } } }),
    ).toThrow(UnsupportedFunctionalityError);
  });

  it('throws for a boolean root schema', () => {
    expect(() => normalizeJsonSchemaForMFJS(true)).toThrow(
      UnsupportedFunctionalityError,
    );
  });

  it('produces a clear error message', () => {
    expect(() => normalizeJsonSchemaForMFJS({ type: 'array' })).toThrow(
      'tool and response schemas must be a JSON Schema object with type "object" for moonshotai (MFJS)',
    );
  });
>>>>>>> 4ce782671f (Backport: fix(moonshotai): accept root unions of objects in tool and response schemas (#23884))
});
