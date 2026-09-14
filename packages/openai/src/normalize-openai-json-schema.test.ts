import {
  UnsupportedFunctionalityError,
  type JSONSchema7,
} from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { normalizeOpenAIJsonSchema } from './normalize-openai-json-schema';

describe('normalizeOpenAIJsonSchema', () => {
  it('removes string propertyNames recursively and warns', () => {
    const schema: JSONSchema7 = {
      type: 'object',
      properties: {
        variables: {
          type: 'object',
          propertyNames: {
            type: 'string',
            format: 'uuid',
          },
          additionalProperties: {
            type: 'object',
            propertyNames: { type: 'string', pattern: '^[A-Z_]+$' },
          },
        },
      },
      definitions: {
        variable: {
          type: 'object',
          propertyNames: { type: 'string' },
        },
      },
      $defs: {
        conditional: {
          if: {
            type: 'object',
            propertyNames: { type: 'string' },
          },
        },
      },
    };

    expect(normalizeOpenAIJsonSchema(schema)).toStrictEqual({
      schema: {
        type: 'object',
        properties: {
          variables: {
            type: 'object',
            additionalProperties: {
              type: 'object',
            },
          },
        },
        definitions: {
          variable: {
            type: 'object',
          },
        },
        $defs: {
          conditional: {
            if: {
              type: 'object',
            },
          },
        },
      },
      warnings: [
        {
          type: 'compatibility',
          feature: 'JSON Schema propertyNames',
          details:
            'OpenAI does not support JSON Schema propertyNames. It was removed before sending the schema, so OpenAI will not enforce property-name constraints.',
        },
      ],
    });

    expect(schema.properties?.variables).toHaveProperty('propertyNames');
  });

  it('rejects non-string propertyNames schemas', () => {
    expect(() =>
      normalizeOpenAIJsonSchema({
        type: 'object',
        propertyNames: { type: 'number' },
      }),
    ).toThrow(UnsupportedFunctionalityError);
  });
});
