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
    };

    expect(sanitizeJsonSchema(schema)).toEqual(schema);
  });

  it('should strip exclusiveMinimum from number schemas', () => {
    const schema = {
      type: 'object',
      properties: {
        count: {
          type: 'number',
          exclusiveMinimum: 0,
        },
      },
      required: ['count'],
    };

    expect(sanitizeJsonSchema(schema)).toEqual({
      type: 'object',
      properties: {
        count: {
          type: 'number',
        },
      },
      required: ['count'],
    });
  });

  it('should strip minimum, maximum, and exclusiveMaximum', () => {
    const schema = {
      type: 'object',
      properties: {
        age: {
          type: 'integer',
          minimum: 0,
          maximum: 150,
          exclusiveMaximum: 200,
        },
      },
    };

    expect(sanitizeJsonSchema(schema)).toEqual({
      type: 'object',
      properties: {
        age: {
          type: 'integer',
        },
      },
    });
  });

  it('should strip pattern, minLength, maxLength from string schemas', () => {
    const schema = {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          pattern: '^[a-z]+@[a-z]+\\.[a-z]+$',
          minLength: 5,
          maxLength: 100,
          format: 'email',
        },
      },
    };

    expect(sanitizeJsonSchema(schema)).toEqual({
      type: 'object',
      properties: {
        email: {
          type: 'string',
        },
      },
    });
  });

  it('should strip not keyword', () => {
    const schema = {
      type: 'object',
      properties: {
        value: {
          type: 'string',
          not: { enum: ['forbidden'] },
        },
      },
    };

    expect(sanitizeJsonSchema(schema)).toEqual({
      type: 'object',
      properties: {
        value: {
          type: 'string',
        },
      },
    });
  });

  it('should strip minItems and maxItems from array schemas', () => {
    const schema = {
      type: 'object',
      properties: {
        tags: {
          type: 'array',
          items: { type: 'string', minLength: 1 },
          minItems: 1,
          maxItems: 10,
          uniqueItems: true,
        },
      },
    };

    expect(sanitizeJsonSchema(schema)).toEqual({
      type: 'object',
      properties: {
        tags: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    });
  });

  it('should recursively sanitize anyOf/oneOf/allOf', () => {
    const schema = {
      type: 'object',
      properties: {
        value: {
          anyOf: [
            { type: 'string', minLength: 1 },
            { type: 'number', minimum: 0 },
          ],
        },
      },
    };

    expect(sanitizeJsonSchema(schema)).toEqual({
      type: 'object',
      properties: {
        value: {
          anyOf: [{ type: 'string' }, { type: 'number' }],
        },
      },
    });
  });

  it('should sanitize $defs and definitions', () => {
    const schema = {
      type: 'object',
      $defs: {
        PositiveInt: {
          type: 'integer',
          exclusiveMinimum: 0,
          description: 'A positive integer',
        },
      },
      properties: {
        count: { $ref: '#/$defs/PositiveInt' },
      },
    };

    expect(sanitizeJsonSchema(schema)).toEqual({
      type: 'object',
      $defs: {
        PositiveInt: {
          type: 'integer',
          description: 'A positive integer',
        },
      },
      properties: {
        count: { $ref: '#/$defs/PositiveInt' },
      },
    });
  });

  it('should preserve enum and const', () => {
    const schema = {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['active', 'inactive'] },
        version: { const: 1 },
      },
    };

    expect(sanitizeJsonSchema(schema)).toEqual(schema);
  });

  it('should handle the reproduction case from issue #14342', () => {
    // z.number().positive() produces exclusiveMinimum: 0
    const schema = {
      type: 'object',
      properties: {
        recurringIntervalMinutes: {
          type: 'number',
          exclusiveMinimum: 0,
        },
      },
      required: ['recurringIntervalMinutes'],
      additionalProperties: false,
    };

    expect(sanitizeJsonSchema(schema)).toEqual({
      type: 'object',
      properties: {
        recurringIntervalMinutes: {
          type: 'number',
        },
      },
      required: ['recurringIntervalMinutes'],
      additionalProperties: false,
    });
  });
});
