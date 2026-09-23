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

  it('removes regex lookaround patterns recursively and warns', () => {
    const schema: JSONSchema7 = {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          format: 'email',
          pattern: '^(?!\\.)(?!.*\\.\\.).+@.+$',
        },
        username: {
          type: 'string',
          pattern: '^@[a-zA-Z0-9_]+$',
        },
        contacts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              value: {
                type: 'string',
                pattern: '(?<=prefix)value',
              },
            },
          },
        },
      },
      $defs: {
        value: {
          type: 'string',
          pattern: 'value(?=suffix)',
        },
      },
    };

    expect(normalizeOpenAIJsonSchema(schema)).toStrictEqual({
      schema: {
        type: 'object',
        properties: {
          email: {
            type: 'string',
            format: 'email',
          },
          username: {
            type: 'string',
            pattern: '^@[a-zA-Z0-9_]+$',
          },
          contacts: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                value: {
                  type: 'string',
                },
              },
            },
          },
        },
        $defs: {
          value: {
            type: 'string',
          },
        },
      },
      warnings: [
        {
          type: 'compatibility',
          feature: 'JSON Schema pattern with regex lookaround',
          details:
            'OpenAI does not support regex lookaround in JSON Schema patterns. The pattern was removed before sending the schema, so OpenAI will not enforce that constraint.',
        },
      ],
    });

    expect(schema.properties?.email).toHaveProperty('pattern');
  });

  it('preserves escaped and character-class lookaround-like text', () => {
    const schema: JSONSchema7 = {
      type: 'object',
      properties: {
        escaped: {
          type: 'string',
          pattern: '\\(\\?=literal\\)',
        },
        characterClass: {
          type: 'string',
          pattern: '[(?=!)]',
        },
      },
    };

    expect(normalizeOpenAIJsonSchema(schema)).toStrictEqual({
      schema,
      warnings: [],
    });
  });
});
