import type { JSONSchema7 } from '@ai-sdk/provider';
import { expect, it } from 'vitest';
import { sanitizeResponseJsonSchema } from './sanitize-response-json-schema';

it('replaces const with enum while preserving JSON Schema', () => {
  const schema = {
    type: 'object',
    properties: {
      response: {
        oneOf: [
          {
            type: 'object',
            properties: {
              type: { type: 'string', const: 'fruit' },
            },
            required: ['type'],
            additionalProperties: false,
          },
        ],
      },
    },
    required: ['response'],
    additionalProperties: false,
    $defs: {
      label: { type: 'string', const: 'produce' },
    },
  } satisfies JSONSchema7;

  expect(sanitizeResponseJsonSchema(schema)).toEqual({
    type: 'object',
    properties: {
      response: {
        oneOf: [
          {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['fruit'] },
            },
            required: ['type'],
            additionalProperties: false,
          },
        ],
      },
    },
    required: ['response'],
    additionalProperties: false,
    $defs: {
      label: { type: 'string', enum: ['produce'] },
    },
  });

  expect(schema).toMatchObject({
    properties: {
      response: {
        oneOf: [
          {
            properties: {
              type: { type: 'string', const: 'fruit' },
            },
          },
        ],
      },
    },
  });
});

it('replaces const with enum in allOf and definitions', () => {
  const schema: JSONSchema7 = {
    type: 'object',
    allOf: [
      {
        type: 'object',
        properties: {
          kind: { type: 'string', const: 'dog' },
        },
      },
    ],
    definitions: {
      Role: {
        type: 'string',
        const: 'admin',
      },
    },
  };

  expect(sanitizeResponseJsonSchema(schema)).toEqual({
    type: 'object',
    allOf: [
      {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['dog'] },
        },
      },
    ],
    definitions: {
      Role: {
        type: 'string',
        enum: ['admin'],
      },
    },
  });
});

it('handles circular schemas without call stack overflow', () => {
  const circularSchema: JSONSchema7 = {
    type: 'object',
    properties: {},
  };
  circularSchema.properties!.self = circularSchema;

  expect(() => sanitizeResponseJsonSchema(circularSchema)).not.toThrow();
});
