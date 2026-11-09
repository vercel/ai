import { UnsupportedFunctionalityError } from '@ai-sdk/provider';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

describe('schema traversal', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([false, true])(
    'normalizes nested array children once (tuple items: %s)',
    tuple => {
      const leaf = {
        type: 'object',
        properties: {
          label: { type: 'string', anyOf: [{ minLength: 1 }, { const: '' }] },
        },
      };
      const row = { type: 'array', items: leaf };
      const schema = {
        type: 'object',
        properties: {
          rows: { type: 'array', items: tuple ? [row] : row },
        },
      };
      // Count visits to the leaf's property map, including normalized copies.
      // Two array levels are enough to detect repeated child traversal.
      const entries = vi.spyOn(Object, 'entries');

      const result = normalizeJsonSchemaForMFJS(schema);
      const leafVisits = entries.mock.calls.filter(([value]) =>
        Object.prototype.hasOwnProperty.call(value, 'label'),
      ).length;
      entries.mockRestore();

      const normalizedRow = {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            label: {
              anyOf: [
                { type: 'string', minLength: 1 },
                { type: 'string', const: '' },
              ],
            },
          },
        },
      };
      expect(result).toEqual({
        type: 'object',
        properties: {
          rows: {
            type: 'array',
            ...(tuple
              ? { prefixItems: [normalizedRow] }
              : { items: normalizedRow }),
          },
        },
      });
      expect(leafVisits).toBe(1);
      expect(leaf.properties.label.type).toBe('string');
      expect(schema.properties.rows.items).toEqual(tuple ? [row] : row);
    },
  );

  it('normalizes existing prefixItems and tuple children in positional order', () => {
    const schema = {
      type: 'object',
      properties: {
        row: {
          type: 'array',
          prefixItems: [{ type: 'string', anyOf: [{ minLength: 1 }] }, true],
          items: [{ type: 'array', items: [{ type: 'number' }, false] }],
        },
        flags: { type: 'array', items: false },
      },
    };

    expect(normalizeJsonSchemaForMFJS(schema)).toEqual({
      type: 'object',
      properties: {
        row: {
          type: 'array',
          prefixItems: [
            { anyOf: [{ type: 'string', minLength: 1 }] },
            true,
            { type: 'array', prefixItems: [{ type: 'number' }, false] },
          ],
        },
        flags: { type: 'array', items: false },
      },
    });
    expect(schema.properties.row.items).toEqual([
      { type: 'array', items: [{ type: 'number' }, false] },
    ]);
  });
});
