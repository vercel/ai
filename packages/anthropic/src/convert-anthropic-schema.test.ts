import { describe, it, expect } from 'vitest';
import { replaceOneOfWithAnyOf } from './convert-anthropic-schema';

describe('replaceOneOfWithAnyOf', () => {
  it('should return primitives unchanged', () => {
    expect(replaceOneOfWithAnyOf(null)).toBeNull();
    expect(replaceOneOfWithAnyOf(undefined)).toBeUndefined();
    expect(replaceOneOfWithAnyOf('string')).toBe('string');
    expect(replaceOneOfWithAnyOf(42)).toBe(42);
  });

  it('should replace top-level oneOf with anyOf', () => {
    const schema = {
      oneOf: [
        { type: 'object', properties: { brand: { const: 'BMW' } } },
        { type: 'object', properties: { brand: { const: 'Mercedes' } } },
      ],
    };
    expect(replaceOneOfWithAnyOf(schema)).toEqual({
      anyOf: [
        { type: 'object', properties: { brand: { const: 'BMW' } } },
        { type: 'object', properties: { brand: { const: 'Mercedes' } } },
      ],
    });
  });

  it('should recursively replace nested oneOf', () => {
    const schema = {
      type: 'object',
      properties: {
        cars: {
          oneOf: [
            { type: 'object', properties: { brand: { const: 'BMW' } } },
            { type: 'object', properties: { brand: { const: 'Mercedes' } } },
          ],
        },
      },
    };
    expect(replaceOneOfWithAnyOf(schema)).toEqual({
      type: 'object',
      properties: {
        cars: {
          anyOf: [
            { type: 'object', properties: { brand: { const: 'BMW' } } },
            { type: 'object', properties: { brand: { const: 'Mercedes' } } },
          ],
        },
      },
    });
  });

  it('should leave anyOf unchanged', () => {
    const schema = {
      anyOf: [{ type: 'string' }, { type: 'number' }],
    };
    expect(replaceOneOfWithAnyOf(schema)).toEqual(schema);
  });

  it('should handle arrays', () => {
    const schema = [{ oneOf: [{ type: 'string' }] }, { type: 'number' }];
    expect(replaceOneOfWithAnyOf(schema)).toEqual([
      { anyOf: [{ type: 'string' }] },
      { type: 'number' },
    ]);
  });

  it('should recurse into allOf sub-schemas', () => {
    const schema = {
      allOf: [
        {
          oneOf: [{ type: 'string' }, { type: 'number' }],
        },
      ],
    };
    expect(replaceOneOfWithAnyOf(schema)).toEqual({
      allOf: [
        {
          anyOf: [{ type: 'string' }, { type: 'number' }],
        },
      ],
    });
  });

  it('should recurse into anyOf sub-schemas', () => {
    const schema = {
      anyOf: [
        {
          oneOf: [{ type: 'string' }, { type: 'number' }],
        },
        { type: 'boolean' },
      ],
    };
    expect(replaceOneOfWithAnyOf(schema)).toEqual({
      anyOf: [
        {
          anyOf: [{ type: 'string' }, { type: 'number' }],
        },
        { type: 'boolean' },
      ],
    });
  });

  it('should handle typical Zod discriminatedUnion schema', () => {
    // Simulates what z.object({ cars: z.discriminatedUnion('brand', [...]) })
    // produces in JSON Schema when serialised.
    const schema = {
      type: 'object',
      properties: {
        cars: {
          oneOf: [
            {
              type: 'object',
              properties: {
                brand: { type: 'string', const: 'BMW' },
              },
              required: ['brand'],
            },
            {
              type: 'object',
              properties: {
                brand: { type: 'string', const: 'Mercedes' },
              },
              required: ['brand'],
            },
          ],
        },
      },
      required: ['cars'],
    };

    const result = replaceOneOfWithAnyOf(schema) as Record<string, unknown>;
    const cars = (result.properties as Record<string, unknown>).cars as Record<
      string,
      unknown
    >;

    expect(cars).toHaveProperty('anyOf');
    expect(cars).not.toHaveProperty('oneOf');
    expect((cars.anyOf as unknown[]).length).toBe(2);
  });
});
