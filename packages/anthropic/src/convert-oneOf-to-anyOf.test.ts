import { convertOneOfToAnyOf } from './convert-oneOf-to-anyOf';
import { describe, it, expect } from 'vitest';

describe('convertOneOfToAnyOf', () => {
  it('should convert top-level oneOf to anyOf', () => {
    const schema = {
      oneOf: [
        { type: 'object' as const, properties: { brand: { const: 'BMW' } } },
        {
          type: 'object' as const,
          properties: { brand: { const: 'Mercedes' } },
        },
      ],
    };
    const result = convertOneOfToAnyOf(schema);
    expect(result).toEqual({
      anyOf: [
        { type: 'object', properties: { brand: { const: 'BMW' } } },
        { type: 'object', properties: { brand: { const: 'Mercedes' } } },
      ],
    });
    expect(result).not.toHaveProperty('oneOf');
  });

  it('should convert nested oneOf inside properties', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        cars: {
          oneOf: [
            {
              type: 'object' as const,
              properties: { brand: { const: 'BMW' } },
            },
            {
              type: 'object' as const,
              properties: { brand: { const: 'Mercedes' } },
            },
          ],
        },
      },
    };
    const result = convertOneOfToAnyOf(schema);
    expect((result as any).properties.cars).toEqual({
      anyOf: [
        { type: 'object', properties: { brand: { const: 'BMW' } } },
        { type: 'object', properties: { brand: { const: 'Mercedes' } } },
      ],
    });
    expect((result as any).properties.cars).not.toHaveProperty('oneOf');
  });

  it('should handle deeply nested oneOf in $defs', () => {
    const schema = {
      type: 'object' as const,
      $defs: {
        Vehicle: {
          oneOf: [
            {
              type: 'object' as const,
              properties: { kind: { const: 'car' } },
            },
            {
              type: 'object' as const,
              properties: { kind: { const: 'truck' } },
            },
          ],
        },
      },
      properties: {
        vehicle: { $ref: '#/$defs/Vehicle' },
      },
    };
    const result = convertOneOfToAnyOf(schema);
    expect((result as any).$defs.Vehicle).toEqual({
      anyOf: [
        { type: 'object', properties: { kind: { const: 'car' } } },
        { type: 'object', properties: { kind: { const: 'truck' } } },
      ],
    });
  });

  it('should convert oneOf in items (array)', () => {
    const schema = {
      type: 'array' as const,
      items: {
        oneOf: [{ type: 'string' as const }, { type: 'number' as const }],
      },
    };
    const result = convertOneOfToAnyOf(schema);
    expect((result as any).items).toEqual({
      anyOf: [{ type: 'string' }, { type: 'number' }],
    });
  });

  it('should preserve schemas without oneOf', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        name: { type: 'string' as const },
        age: { type: 'number' as const },
      },
      required: ['name'],
    };
    const result = convertOneOfToAnyOf(schema);
    expect(result).toEqual(schema);
  });

  it('should preserve existing anyOf and recurse into it', () => {
    const schema = {
      anyOf: [
        {
          type: 'object' as const,
          properties: {
            sub: {
              oneOf: [{ type: 'string' as const }, { type: 'number' as const }],
            },
          },
        },
      ],
    };
    const result = convertOneOfToAnyOf(schema);
    expect((result as any).anyOf[0].properties.sub).toEqual({
      anyOf: [{ type: 'string' }, { type: 'number' }],
    });
  });

  it('should handle null/primitive schemas', () => {
    expect(convertOneOfToAnyOf(null as any)).toBe(null);
    expect(convertOneOfToAnyOf(true as any)).toBe(true);
  });
});
