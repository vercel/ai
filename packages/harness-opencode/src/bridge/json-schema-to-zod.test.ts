import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { jsonSchemaToZodShape } from './json-schema-to-zod';

describe('jsonSchemaToZodShape', () => {
  it('preserves enum constraints and default metadata without applying defaults', () => {
    const schema = z.object(
      jsonSchemaToZodShape({
        type: 'object',
        properties: {
          publishStatus: {
            type: 'string',
            enum: ['any', 'published', 'unpublished', 'unknown'],
            default: 'any',
            description: 'Publication filter; defaults to any.',
          },
        },
      }),
    );

    expect(z.toJSONSchema(schema)).toMatchObject({
      properties: {
        publishStatus: {
          type: 'string',
          enum: ['any', 'published', 'unpublished', 'unknown'],
          default: 'any',
          description: 'Publication filter; defaults to any.',
        },
      },
    });
    expect(
      schema.safeParse({ publishStatus: 'not-an-allowed-value' }).success,
    ).toBe(false);
    expect(schema.parse({})).toEqual({});
  });
});
