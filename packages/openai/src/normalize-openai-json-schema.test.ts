import {
  UnsupportedFunctionalityError,
  type JSONSchema7,
  type JSONSchema7Definition,
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

  it.each<[string, JSONSchema7Definition]>([
    ['string enum values', { enum: ['a', 'b'] }],
    ['a pattern', { pattern: '^[A-Z_]+$' }],
    [
      'string literals in anyOf',
      {
        anyOf: [
          { type: 'string', const: 'a' },
          { type: 'string', const: 'b' },
        ],
      },
    ],
    [
      'a not: {} branch in anyOf',
      { anyOf: [{ type: 'string', enum: ['a', 'b'] }, { not: {} }] },
    ],
    ['a nullable string type', { type: ['string', 'null'] }],
    ['a true schema', true],
  ])('removes propertyNames with %s and warns', (_, propertyNames) => {
    const record: JSONSchema7 = {
      type: 'object',
      propertyNames,
      additionalProperties: { type: 'string' },
    };

    expect(
      normalizeOpenAIJsonSchema({
        type: 'object',
        properties: {
          records: { type: 'array', items: record },
        },
        $defs: { record },
      }),
    ).toStrictEqual({
      schema: {
        type: 'object',
        properties: {
          records: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: { type: 'string' },
            },
          },
        },
        $defs: {
          record: {
            type: 'object',
            additionalProperties: { type: 'string' },
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
  });

  it('removes propertyNames with a $ref and warns', () => {
    expect(
      normalizeOpenAIJsonSchema({
        type: 'object',
        propertyNames: { $ref: '#/$defs/key' },
        additionalProperties: { type: 'integer' },
        $defs: {
          key: { type: 'string', enum: ['a', 'b'] },
        },
      }),
    ).toStrictEqual({
      schema: {
        type: 'object',
        additionalProperties: { type: 'integer' },
        $defs: {
          key: { type: 'string', enum: ['a', 'b'] },
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
  });

  it.each<[string, JSONSchema7Definition]>([
    ['a false schema', false],
    ['not: {}', { not: {} }],
    ['non-string types', { type: ['number', 'integer'] }],
    ['a non-string const', { const: 1 }],
    ['non-string enum values', { enum: [1, 2] }],
    [
      'number literals in anyOf',
      {
        anyOf: [
          { type: 'number', const: 1 },
          { type: 'number', const: 2 },
        ],
      },
    ],
    [
      'a non-string type in allOf',
      { allOf: [{ pattern: '^[0-9]+$' }, { type: 'integer' }] },
    ],
  ])('rejects propertyNames with %s', (_, propertyNames) => {
    expect(() =>
      normalizeOpenAIJsonSchema({ type: 'object', propertyNames }),
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
