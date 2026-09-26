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

it('replaces const with enum in draft-07 definitions', () => {
  // zodSchema emits recursive schemas (z.lazy) with draft-07 `definitions`
  const schema: JSONSchema7 = {
    type: 'object',
    properties: {
      root: { $ref: '#/definitions/__schema0' },
    },
    definitions: {
      __schema0: {
        anyOf: [
          {
            type: 'object',
            properties: {
              kind: { type: 'string', const: 'folder' },
              children: {
                type: 'array',
                items: { $ref: '#/definitions/__schema0' },
              },
            },
          },
          {
            type: 'object',
            properties: {
              kind: { type: 'string', const: 'file' },
            },
          },
        ],
      },
    },
  };
  const original = structuredClone(schema);

  expect(sanitizeResponseJsonSchema(schema)).toEqual({
    type: 'object',
    properties: {
      root: { $ref: '#/definitions/__schema0' },
    },
    definitions: {
      __schema0: {
        anyOf: [
          {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: ['folder'] },
              children: {
                type: 'array',
                items: { $ref: '#/definitions/__schema0' },
              },
            },
          },
          {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: ['file'] },
            },
          },
        ],
      },
    },
  });

  expect(schema).toStrictEqual(original);
});

it('replaces const in nested definitions and keeps boolean definitions', () => {
  const schema: JSONSchema7 = {
    definitions: {
      anything: true,
      nothing: false,
      outer: {
        type: 'array',
        items: { additionalProperties: { const: 'deep' } },
        definitions: {
          inner: { const: 1 },
        },
      },
    },
    $defs: {
      label: { const: 'produce' },
    },
  };

  expect(sanitizeResponseJsonSchema(schema)).toEqual({
    definitions: {
      anything: true,
      nothing: false,
      outer: {
        type: 'array',
        items: { additionalProperties: { enum: ['deep'] } },
        definitions: {
          inner: { enum: [1] },
        },
      },
    },
    $defs: {
      label: { enum: ['produce'] },
    },
  });
});

it('returns an equal schema when there is no const', () => {
  const schema: JSONSchema7 = {
    type: 'object',
    properties: {
      root: { $ref: '#/definitions/node' },
    },
    required: ['root'],
    definitions: {
      node: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['folder', 'file'] },
          children: { type: 'array', items: { $ref: '#/definitions/node' } },
        },
      },
      anything: true,
    },
    $defs: {
      label: { type: 'string' },
    },
  };

  expect(sanitizeResponseJsonSchema(schema)).toStrictEqual(schema);
});

it('does not rewrite const under allOf, which Google does not support', () => {
  // e.g. z.object({ type: z.literal('a') }).and(z.object({ id: z.string() }))
  const schema: JSONSchema7 = {
    allOf: [
      { type: 'object', properties: { type: { const: 'a' } } },
      { type: 'object', properties: { id: { type: 'string' } } },
    ],
  };

  expect(sanitizeResponseJsonSchema(schema)).toStrictEqual(schema);
});
