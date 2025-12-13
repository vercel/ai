import { JSONSchema7 } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { addAdditionalPropertiesToJsonSchema } from './add-additional-properties-to-json-schema';

describe('addAdditionalPropertiesToJsonSchema', () => {
  it('adds additionalProperties: false to objects recursively', () => {
    const schema: JSONSchema7 = {
      type: 'object',
      properties: {
        user: {
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
        },
        age: { type: 'number' },
      },
    };

    const result = addAdditionalPropertiesToJsonSchema(schema);

    expect(result).toEqual({
      type: 'object',
      additionalProperties: false,
      properties: {
        user: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string' },
          },
        },
        age: { type: 'number' },
      },
    });
  });

  it('adds additionalProperties: false to objects inside arrays', () => {
    const schema: JSONSchema7 = {
      type: 'object',
      properties: {
        ingredients: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              amount: { type: 'string' },
            },
            required: ['name', 'amount'],
          },
        },
      },
      required: ['ingredients'],
    };

    const result = addAdditionalPropertiesToJsonSchema(schema);

    expect(result).toEqual({
      type: 'object',
      additionalProperties: false,
      properties: {
        ingredients: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              name: { type: 'string' },
              amount: { type: 'string' },
            },
            required: ['name', 'amount'],
          },
        },
      },
      required: ['ingredients'],
    });
  });

  it('overwrites existing additionalProperties flags', () => {
    const schema: JSONSchema7 = {
      type: 'object',
      additionalProperties: true,
      properties: {
        meta: {
          type: 'object',
          additionalProperties: true,
          properties: {
            id: { type: 'string' },
          },
        },
      },
    };

    const result = addAdditionalPropertiesToJsonSchema(schema);

    expect(result).toEqual({
      type: 'object',
      additionalProperties: false,
      properties: {
        meta: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string' },
          },
        },
      },
    });
  });

  it('leaves non-object schemas unchanged', () => {
    const schema: JSONSchema7 = { type: 'string' };

    const result = addAdditionalPropertiesToJsonSchema(schema);

    expect(result).toBe(schema);
    expect(result).toEqual({ type: 'string' });
  });
});
