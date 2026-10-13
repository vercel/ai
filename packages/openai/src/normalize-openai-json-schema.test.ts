import type { JSONSchema7 } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { normalizeOpenAIJsonSchema } from './normalize-openai-json-schema';

describe('normalizeOpenAIJsonSchema', () => {
  it('rewrites nested singleton reference allOf schemas', () => {
    const schema: JSONSchema7 = {
      type: 'object',
      properties: {
        relatives: {
          type: 'array',
          items: { allOf: [{ $ref: '#/definitions/person' }] },
        },
      },
      definitions: {
        person: {
          type: 'object',
          properties: { firstName: { type: 'string' } },
          required: ['firstName'],
          additionalProperties: false,
        },
      },
      required: ['relatives'],
      additionalProperties: false,
    };

    expect(normalizeOpenAIJsonSchema(schema)).toStrictEqual({
      ...schema,
      properties: {
        relatives: {
          type: 'array',
          items: { $ref: '#/definitions/person' },
        },
      },
    });
  });

  it('expands a singleton local reference at the root', () => {
    const schema: JSONSchema7 = {
      default: { firstName: 'John' },
      allOf: [{ $ref: '#/definitions/person' }],
      definitions: {
        person: {
          type: 'object',
          properties: {
            firstName: { type: 'string' },
            relatives: {
              type: 'array',
              items: { allOf: [{ $ref: '#/definitions/person' }] },
            },
          },
          required: ['firstName', 'relatives'],
          additionalProperties: false,
        },
      },
    };

    expect(normalizeOpenAIJsonSchema(schema)).toStrictEqual({
      type: 'object',
      properties: {
        firstName: { type: 'string' },
        relatives: {
          type: 'array',
          items: { $ref: '#/definitions/person' },
        },
      },
      required: ['firstName', 'relatives'],
      additionalProperties: false,
      default: { firstName: 'John' },
      definitions: {
        person: {
          type: 'object',
          properties: {
            firstName: { type: 'string' },
            relatives: {
              type: 'array',
              items: { $ref: '#/definitions/person' },
            },
          },
          required: ['firstName', 'relatives'],
          additionalProperties: false,
        },
      },
    });
  });
});
