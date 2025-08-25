import { z } from 'zod/v3';
import { zodToJsonSchema } from './zod-to-json-schema';
import { JSONSchema7 } from '@ai-sdk/provider';

describe('zod-to-json-schema', () => {
  it('should return the schema directly in the root if no name is passed', () => {
    expect(zodToJsonSchema(z.any())).toStrictEqual({
      $schema: 'http://json-schema.org/draft-07/schema#',
    } satisfies JSONSchema7);
  });

  it('should return the schema inside a named property in "definitions" if a name is passed', () => {
    expect(zodToJsonSchema(z.any(), 'MySchema')).toStrictEqual({
      $schema: 'http://json-schema.org/draft-07/schema#',
      $ref: `#/definitions/MySchema`,
      definitions: {
        MySchema: {},
      },
    } satisfies JSONSchema7);
  });

  it('should return the schema inside a named property in "$defs" if a name and definitionPath is passed in options', () => {
    expect(
      zodToJsonSchema(z.any(), { name: 'MySchema', definitionPath: '$defs' }),
    ).toStrictEqual({
      $schema: 'http://json-schema.org/draft-07/schema#',
      $ref: `#/$defs/MySchema`,
      $defs: {
        MySchema: {},
      },
    } satisfies JSONSchema7);
  });

  it("should not scrub 'any'-schemas from unions when strictUnions=false", () => {
    expect(
      zodToJsonSchema(
        z.union([z.any(), z.instanceof(String), z.string(), z.number()]),
        { strictUnions: false },
      ),
    ).toStrictEqual({
      $schema: 'http://json-schema.org/draft-07/schema#',
      anyOf: [{}, {}, { type: 'string' }, { type: 'number' }],
    } satisfies JSONSchema7);
  });

  it("should scrub 'any'-schemas from unions when strictUnions=true", () => {
    expect(
      zodToJsonSchema(
        z.union([z.any(), z.instanceof(String), z.string(), z.number()]),
        { strictUnions: true },
      ),
    ).toStrictEqual({
      $schema: 'http://json-schema.org/draft-07/schema#',
      anyOf: [{ type: 'string' }, { type: 'number' }],
    } satisfies JSONSchema7);
  });

  it("should scrub 'any'-schemas from unions when strictUnions=true in objects", () => {
    expect(
      zodToJsonSchema(
        z.object({
          field: z.union([
            z.any(),
            z.instanceof(String),
            z.string(),
            z.number(),
          ]),
        }),
        { strictUnions: true },
      ),
    ).toStrictEqual({
      $schema: 'http://json-schema.org/draft-07/schema#',
      additionalProperties: false,
      properties: {
        field: { anyOf: [{ type: 'string' }, { type: 'number' }] },
      },
      type: 'object',
    } satisfies JSONSchema7);
  });

  it('Definitions play nice with named schemas', () => {
    const MySpecialStringSchema = z.string();
    const MyArraySchema = z.array(MySpecialStringSchema);

    const result = zodToJsonSchema(MyArraySchema, {
      definitions: {
        MySpecialStringSchema,
        MyArraySchema,
      },
    });

    expect(result).toStrictEqual({
      $schema: 'http://json-schema.org/draft-07/schema#',
      $ref: '#/definitions/MyArraySchema',
      definitions: {
        MySpecialStringSchema: { type: 'string' },
        MyArraySchema: {
          type: 'array',
          items: {
            $ref: '#/definitions/MySpecialStringSchema',
          },
        },
      },
    } satisfies JSONSchema7);
  });

  it('should be possible to add name as title instead of as ref', () => {
    expect(
      zodToJsonSchema(z.string(), { name: 'hello', nameStrategy: 'title' }),
    ).toStrictEqual({
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'string',
      title: 'hello',
    } satisfies JSONSchema7);
  });
});
