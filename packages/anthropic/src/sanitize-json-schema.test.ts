import { describe, expect, it } from 'vitest';
import { sanitizeJsonSchema } from './sanitize-json-schema';

describe('sanitizeJsonSchema', () => {
  it('should preserve supported keywords', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The name' },
      },
      required: ['name'],
      additionalProperties: false,
    };

    expect(sanitizeJsonSchema(schema)).toEqual(schema);
  });

  it('should strip exclusiveMinimum and move to description', () => {
    const result = sanitizeJsonSchema({
      type: 'object',
      properties: {
        count: {
          type: 'number',
          exclusiveMinimum: 0,
        },
      },
      required: ['count'],
    });

    expect(result.properties.count.type).toBe('number');
    expect(result.properties.count.exclusiveMinimum).toBeUndefined();
    expect(result.properties.count.description).toContain('exclusiveMinimum');
  });

  it('should strip minimum and maximum', () => {
    const result = sanitizeJsonSchema({
      type: 'object',
      properties: {
        age: {
          type: 'integer',
          minimum: 0,
          maximum: 150,
        },
      },
    });

    expect(result.properties.age.type).toBe('integer');
    expect(result.properties.age.minimum).toBeUndefined();
    expect(result.properties.age.maximum).toBeUndefined();
    expect(result.properties.age.description).toContain('minimum');
    expect(result.properties.age.description).toContain('maximum');
  });

  it('should strip pattern and minLength from string schemas', () => {
    const result = sanitizeJsonSchema({
      type: 'object',
      properties: {
        email: {
          type: 'string',
          pattern: '^[a-z]+@[a-z]+\\.[a-z]+$',
          minLength: 5,
          maxLength: 100,
        },
      },
    });

    expect(result.properties.email.type).toBe('string');
    expect(result.properties.email.pattern).toBeUndefined();
    expect(result.properties.email.minLength).toBeUndefined();
    expect(result.properties.email.description).toContain('pattern');
  });

  it('should enforce additionalProperties: false on objects', () => {
    const result = sanitizeJsonSchema({
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
    });

    expect(result.additionalProperties).toBe(false);
  });

  it('should recursively sanitize nested schemas', () => {
    const result = sanitizeJsonSchema({
      type: 'object',
      properties: {
        tags: {
          type: 'array',
          items: { type: 'string', minLength: 1 },
        },
      },
    });

    expect(result.properties.tags.items.minLength).toBeUndefined();
    expect(result.properties.tags.items.type).toBe('string');
  });

  it('should handle the reproduction case from issue #14342', () => {
    // z.number().positive() produces exclusiveMinimum: 0
    const result = sanitizeJsonSchema({
      type: 'object',
      properties: {
        recurringIntervalMinutes: {
          type: 'number',
          exclusiveMinimum: 0,
        },
      },
      required: ['recurringIntervalMinutes'],
      additionalProperties: false,
    });

    expect(result.type).toBe('object');
    expect(result.required).toEqual(['recurringIntervalMinutes']);
    expect(result.additionalProperties).toBe(false);
    expect(
      result.properties.recurringIntervalMinutes.exclusiveMinimum,
    ).toBeUndefined();
    expect(result.properties.recurringIntervalMinutes.type).toBe('number');
  });
});
