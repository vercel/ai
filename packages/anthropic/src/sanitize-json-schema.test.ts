import { describe, it, expect } from 'vitest';
import { sanitizeJsonSchema } from './sanitize-json-schema';

describe('sanitizeJsonSchema', () => {
  it('should strip unsupported string validation properties', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string' as const,
          minLength: 1,
          maxLength: 100,
          pattern: '^[a-z]+$',
          format: 'email',
        },
      },
      required: ['name'],
    };

    expect(sanitizeJsonSchema(schema)).toEqual({
      type: 'object',
      properties: {
        name: {
          type: 'string',
        },
      },
      required: ['name'],
    });
  });

  it('should strip unsupported number validation properties', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        count: {
          type: 'number' as const,
          minimum: 0,
          maximum: 10,
          exclusiveMinimum: 0,
          exclusiveMaximum: 11,
          multipleOf: 2,
        },
      },
    };

    expect(sanitizeJsonSchema(schema)).toEqual({
      type: 'object',
      properties: {
        count: {
          type: 'number',
        },
      },
    });
  });

  it('should strip unsupported array validation properties', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        items: {
          type: 'array' as const,
          items: { type: 'string' as const, minLength: 1 },
          minItems: 2,
          maxItems: 5,
          uniqueItems: true,
        },
      },
    };

    expect(sanitizeJsonSchema(schema)).toEqual({
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    });
  });

  it('should strip unsupported object validation properties', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        data: {
          type: 'object' as const,
          minProperties: 1,
          maxProperties: 10,
          properties: {
            key: { type: 'string' as const },
          },
        },
      },
    };

    expect(sanitizeJsonSchema(schema)).toEqual({
      type: 'object',
      properties: {
        data: {
          type: 'object',
          properties: {
            key: { type: 'string' },
          },
        },
      },
    });
  });

  it('should preserve supported properties', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        name: { type: 'string' as const, description: 'The name' },
        age: { type: 'integer' as const },
      },
      required: ['name', 'age'],
      additionalProperties: false,
      description: 'A person',
    };

    expect(sanitizeJsonSchema(schema)).toEqual(schema);
  });

  it('should handle nested schemas recursively', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        nested: {
          type: 'object' as const,
          properties: {
            deep: {
              type: 'string' as const,
              minLength: 1,
              maxLength: 50,
            },
          },
        },
      },
    };

    expect(sanitizeJsonSchema(schema)).toEqual({
      type: 'object',
      properties: {
        nested: {
          type: 'object',
          properties: {
            deep: {
              type: 'string',
            },
          },
        },
      },
    });
  });

  it('should handle allOf/anyOf/oneOf', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        value: {
          anyOf: [
            { type: 'string' as const, minLength: 1 },
            { type: 'number' as const, minimum: 0 },
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

  it('should not mutate the original schema', () => {
    const original = {
      type: 'object' as const,
      properties: {
        name: { type: 'string' as const, minLength: 1 },
      },
    };

    const originalCopy = JSON.parse(JSON.stringify(original));
    sanitizeJsonSchema(original);

    expect(original).toEqual(originalCopy);
  });

  it('should handle additionalProperties as a schema', () => {
    const schema = {
      type: 'object' as const,
      additionalProperties: {
        type: 'string' as const,
        minLength: 1,
      },
    };

    expect(sanitizeJsonSchema(schema)).toEqual({
      type: 'object',
      additionalProperties: {
        type: 'string',
      },
    });
  });
});
