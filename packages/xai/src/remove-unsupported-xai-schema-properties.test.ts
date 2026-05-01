import { describe, expect, it } from 'vitest';
import { removeUnsupportedXaiSchemaProperties } from './remove-unsupported-xai-schema-properties';

describe('removeUnsupportedXaiSchemaProperties', () => {
  it('should remove additionalProperties false recursively', () => {
    expect(
      removeUnsupportedXaiSchemaProperties({
        type: 'object',
        additionalProperties: false,
        properties: {
          nested: {
            type: 'object',
            additionalProperties: false,
            properties: {
              value: { type: 'string' },
            },
          },
          items: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                label: { type: 'string' },
              },
            },
          },
        },
      }),
    ).toMatchInlineSnapshot(`
      {
        "properties": {
          "items": {
            "items": {
              "properties": {
                "label": {
                  "type": "string",
                },
              },
              "type": "object",
            },
            "type": "array",
          },
          "nested": {
            "properties": {
              "value": {
                "type": "string",
              },
            },
            "type": "object",
          },
        },
        "type": "object",
      }
    `);
  });

  it('should preserve non-boolean additionalProperties schemas', () => {
    const schema = {
      type: 'object',
      additionalProperties: {
        type: 'string',
      },
    };

    expect(removeUnsupportedXaiSchemaProperties(schema)).toEqual(schema);
  });
});
