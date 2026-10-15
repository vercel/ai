import type { JSONSchema7 } from '@ai-sdk/provider';
import { jsonSchema } from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import { getOutputStrategy } from './output-strategy';

describe('array output strategy', () => {
  it.each(['definitions', '$defs'] as const)(
    'should preserve root-level %s when wrapping the element schema',
    async keyword => {
      const reference =
        keyword === 'definitions' ? '#/definitions/Shared' : '#/$defs/Shared';
      const strategy = getOutputStrategy({
        output: 'array',
        schema: jsonSchema({
          type: 'object',
          properties: {
            shared: { $ref: reference },
          },
          required: ['shared'],
          additionalProperties: false,
          [keyword]: {
            Shared: { type: 'string' },
          },
        } as JSONSchema7),
      });

      const result = await strategy.jsonSchema();

      expect(result).toMatchObject({
        [keyword]: {
          Shared: { type: 'string' },
        },
        properties: {
          elements: {
            items: {
              properties: {
                shared: { $ref: reference },
              },
            },
          },
        },
      });
      const elementsSchema = (result as JSONSchema7).properties
        ?.elements as JSONSchema7;
      const itemsSchema = elementsSchema.items as JSONSchema7;

      expect(itemsSchema).not.toHaveProperty(keyword);
    },
  );
});
