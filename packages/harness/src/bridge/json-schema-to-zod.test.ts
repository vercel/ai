import { describe, expect, it } from 'vitest';
import {
  jsonSchemaToZodObject,
  jsonSchemaToZodShape,
} from './json-schema-to-zod';

describe('jsonSchemaToZodObject', () => {
  it('handles flat scalar properties with required and optional fields', () => {
    const schema = jsonSchemaToZodObject({
      type: 'object',
      properties: { city: { type: 'string' }, days: { type: 'integer' } },
      required: ['city'],
    });

    expect(schema.safeParse({ city: 'Paris' }).success).toBe(true);
    expect(schema.safeParse({ city: 'Paris', days: 3 }).success).toBe(true);
    expect(schema.safeParse({ days: 3 }).success).toBe(false);
    expect(schema.safeParse({ city: 'Paris', days: 1.5 }).success).toBe(false);
  });

  it('preserves nested objects and array item types', () => {
    const schema = jsonSchemaToZodObject({
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: { id: { type: 'integer' } },
            required: ['id'],
          },
        },
      },
    });

    expect(schema.safeParse({ items: [{ id: 1 }] }).success).toBe(true);
    expect(schema.safeParse({ items: [{ id: 'x' }] }).success).toBe(false);
  });

  it('honors nullable schemas', () => {
    const schema = jsonSchemaToZodObject({
      type: 'object',
      properties: { note: { type: ['string', 'null'] } },
      required: ['note'],
    });

    expect(schema.safeParse({ note: null }).success).toBe(true);
    expect(schema.safeParse({ note: 'hi' }).success).toBe(true);
  });

  it('returns an empty object schema for missing input', () => {
    expect(jsonSchemaToZodObject(undefined).safeParse({}).success).toBe(true);
  });
});

describe('jsonSchemaToZodShape', () => {
  it('returns only the object shape', () => {
    const shape = jsonSchemaToZodShape({
      type: 'object',
      properties: { city: { type: 'string' } },
      required: ['city'],
    });

    expect(Object.keys(shape)).toEqual(['city']);
    expect(shape.city.safeParse('Paris').success).toBe(true);
    expect(shape.city.safeParse(3).success).toBe(false);
  });
});
