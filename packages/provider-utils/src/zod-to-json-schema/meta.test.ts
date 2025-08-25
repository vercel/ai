import { z } from 'zod/v3';
import { zodToJsonSchema } from './zod-to-json-schema';
import { JSONSchema7 } from '@ai-sdk/provider';

describe('meta', () => {
  it('should be possible to use description', () => {
    const parsedSchema = zodToJsonSchema(z.string().describe('My neat string'));

    expect(parsedSchema).toStrictEqual({
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'string',
      description: 'My neat string',
    } satisfies JSONSchema7);
  });

  it('should handle optional schemas with different descriptions', () => {
    const recurringSchema = z.object({});
    const zodSchema = z
      .object({
        p1: recurringSchema.optional().describe('aaaaaaaaa'),
        p2: recurringSchema.optional().describe('bbbbbbbbb'),
        p3: recurringSchema.optional().describe('ccccccccc'),
      })
      .describe('sssssssss');

    const jsonSchema = zodToJsonSchema(zodSchema, {
      target: 'openApi3',
      $refStrategy: 'none',
    });

    expect(jsonSchema).toStrictEqual({
      $schema: 'http://json-schema.org/draft-07/schema#',
      additionalProperties: false,
      description: 'sssssssss',
      properties: {
        p1: {
          additionalProperties: false,
          description: 'aaaaaaaaa',
          properties: {},
          type: 'object',
        },
        p2: {
          additionalProperties: false,
          description: 'bbbbbbbbb',
          properties: {},
          type: 'object',
        },
        p3: {
          additionalProperties: false,
          description: 'ccccccccc',
          properties: {},
          type: 'object',
        },
      },
      type: 'object',
    } satisfies JSONSchema7);
  });
});
