import { UnsupportedFunctionalityError } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { normalizeJsonSchemaForMFJS } from './normalize-json-schema-for-mfjs';

describe('identity (no normalization needed)', () => {
  it('passes a plain object schema through unchanged', () => {
    const schema = {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'The city' },
        zip: { type: 'string', pattern: '^[0-9]{5}$' },
      },
      required: ['city'],
      additionalProperties: false,
    };

    expect(normalizeJsonSchemaForMFJS(schema)).toEqual(schema);
  });

  it('preserves keywords Moonshot accepts verbatim', () => {
    const schema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        a: { type: 'string', enum: ['x', 'y'], format: 'uri' },
        b: { type: ['string', 'null'] },
        c: { type: 'array', contains: { type: 'string' } },
        d: { $ref: '#/$defs/thing' },
      },
      $defs: { thing: { type: 'number' } },
      // A `then` key trips the no-thenable lint rule.
      not: { type: 'string' },
    };

    expect(normalizeJsonSchemaForMFJS(schema)).toEqual(schema);
  });

  it('passes anyOf without a sibling type through unchanged', () => {
    const schema = {
      type: 'object',
      properties: {
        location: {
          anyOf: [{ type: 'string' }, { type: 'number' }],
        },
      },
      required: ['location'],
    };

    expect(normalizeJsonSchemaForMFJS(schema)).toEqual(schema);
  });

  it('leaves oneOf next to type alone (accepted by MFJS)', () => {
    const schema = {
      type: 'object',
      oneOf: [
        { properties: { city: { type: 'string' } }, required: ['city'] },
        { properties: { lat: { type: 'number' } }, required: ['lat'] },
      ],
    };

    expect(normalizeJsonSchemaForMFJS(schema)).toEqual(schema);
  });

  it('leaves single-schema items alone', () => {
    const schema = {
      type: 'object',
      properties: {
        a: {
          type: 'array',
          items: { type: 'number' },
          minItems: 2,
          maxItems: 2,
        },
      },
    };

    expect(normalizeJsonSchemaForMFJS(schema)).toEqual(schema);
  });
});

describe('tuple items -> prefixItems', () => {
  it('rewrites a tuple items array to prefixItems and drops items', () => {
    const result = normalizeJsonSchemaForMFJS({
      type: 'object',
      properties: {
        a: {
          type: 'array',
          items: [{ type: 'number' }, { type: 'number' }],
        },
      },
      required: ['a'],
    });

    expect(result).toEqual({
      type: 'object',
      properties: {
        a: {
          type: 'array',
          prefixItems: [{ type: 'number' }, { type: 'number' }],
        },
      },
      required: ['a'],
    });
  });

  it('preserves minItems and maxItems when rewriting tuples', () => {
    const result = normalizeJsonSchemaForMFJS({
      type: 'object',
      properties: {
        a: {
          type: 'array',
          items: [{ type: 'string' }, { type: 'number' }],
          minItems: 2,
          maxItems: 2,
        },
      },
    });

    expect(result).toEqual({
      type: 'object',
      properties: {
        a: {
          type: 'array',
          prefixItems: [{ type: 'string' }, { type: 'number' }],
          minItems: 2,
          maxItems: 2,
        },
      },
    });
  });

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
      anyOf: [
        { properties: { city: { type: 'string' } }, required: ['city'] },
        {
          properties: { lat: { type: 'number' }, lon: { type: 'number' } },
          required: ['lat', 'lon'],
        },
      ],
    });

    expect(result).toEqual({
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
    });
  });

  it('keeps branch types when already present', () => {
    const result = normalizeJsonSchemaForMFJS({
      type: 'object',
      anyOf: [{ type: 'string' }, { properties: { lat: { type: 'number' } } }],
    });

    expect(result).toEqual({
      anyOf: [
        { type: 'string' },
        { type: 'object', properties: { lat: { type: 'number' } } },
      ],
    });
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
      'tool parameters must be a JSON Schema object with type "object" for moonshotai (MFJS)',
    );
  });
});
