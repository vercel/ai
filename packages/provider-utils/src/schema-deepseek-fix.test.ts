import { describe, expect, it } from 'vitest';
import { asSchema, jsonSchema } from './schema';

describe('DeepSeek/OpenAI-compatible schema fix', () => {
  it('should add type: object to default empty schema in asSchema(undefined)', async () => {
    const schema = asSchema(undefined);
    expect(await schema.jsonSchema).toStrictEqual({
      type: 'object',
      properties: {},
      additionalProperties: false,
    });
  });

  it('should add type: object when properties are present but type is missing in jsonSchema', async () => {
    const schema = jsonSchema({
      properties: {
        test: { type: 'string' },
      },
    });
    expect(await schema.jsonSchema).toStrictEqual({
      type: 'object',
      properties: {
        test: { type: 'string' },
      },
    });
  });
});
