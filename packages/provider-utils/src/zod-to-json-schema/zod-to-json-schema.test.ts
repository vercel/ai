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

  it('should produce valid json schema for all parsers', () => {
    enum nativeEnum {
      'a',
      'b',
      'c',
    }

    const allParsersSchema = z
      .object({
        any: z.any(),
        array: z.array(z.any()),
        arrayMin: z.array(z.any()).min(1),
        arrayMax: z.array(z.any()).max(1),
        arrayMinMax: z.array(z.any()).min(1).max(1),
        bigInt: z.bigint(),
        boolean: z.boolean(),
        date: z.date(),
        default: z.any().default(42),
        effectRefine: z.string().refine(x => x + x),
        effectTransform: z.string().transform(x => !!x),
        effectPreprocess: z.preprocess(x => {
          try {
            return JSON.stringify(x);
          } catch {
            return 'wahh';
          }
        }, z.string()),
        enum: z.enum(['hej', 'svejs']),
        intersection: z.intersection(z.string().min(1), z.string().max(4)),
        literal: z.literal('hej'),
        map: z.map(z.string().uuid(), z.boolean()),
        nativeEnum: z.nativeEnum(nativeEnum),
        never: z.never() as any,
        null: z.null(),
        nullablePrimitive: z.string().nullable(),
        nullableObject: z.object({ hello: z.string() }).nullable(),
        number: z.number(),
        numberGt: z.number().gt(1),
        numberLt: z.number().lt(1),
        numberGtLt: z.number().gt(1).lt(1),
        numberGte: z.number().gte(1),
        numberLte: z.number().lte(1),
        numberGteLte: z.number().gte(1).lte(1),
        numberMultipleOf: z.number().multipleOf(2),
        numberInt: z.number().int(),
        objectPasstrough: z
          .object({ foo: z.string(), bar: z.number().optional() })
          .passthrough(),
        objectCatchall: z
          .object({ foo: z.string(), bar: z.number().optional() })
          .catchall(z.boolean()),
        objectStrict: z
          .object({ foo: z.string(), bar: z.number().optional() })
          .strict(),
        objectStrip: z
          .object({ foo: z.string(), bar: z.number().optional() })
          .strip(),
        promise: z.promise(z.string()),
        recordStringBoolean: z.record(z.string(), z.boolean()),
        recordUuidBoolean: z.record(z.string().uuid(), z.boolean()),
        recordBooleanBoolean: z.record(z.boolean(), z.boolean()),
        set: z.set(z.string()),
        string: z.string(),
        stringMin: z.string().min(1),
        stringMax: z.string().max(1),
        stringEmail: z.string().email(),
        stringEmoji: z.string().emoji(),
        stringUrl: z.string().url(),
        stringUuid: z.string().uuid(),
        stringRegEx: z.string().regex(new RegExp('abc')),
        stringCuid: z.string().cuid(),
        tuple: z.tuple([z.string(), z.number(), z.boolean()]),
        undefined: z.undefined(),
        unionPrimitives: z.union([
          z.string(),
          z.number(),
          z.boolean(),
          z.bigint(),
          z.null(),
        ]),
        unionPrimitiveLiterals: z.union([
          z.literal(123),
          z.literal('abc'),
          z.literal(null),
          z.literal(true),
          // z.literal(1n), // target es2020
        ]),
        unionNonPrimitives: z.union([
          z.string(),
          z.object({
            foo: z.string(),
            bar: z.number().optional(),
          }),
        ]),
        unknown: z.unknown(),
      })
      .partial()
      .default({ string: 'hello' })
      .describe('watup');

    expect(zodToJsonSchema(allParsersSchema)).toStrictEqual({
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        any: {},
        array: {
          type: 'array',
        },
        arrayMin: {
          type: 'array',
          minItems: 1,
        },
        arrayMax: {
          type: 'array',
          maxItems: 1,
        },
        arrayMinMax: {
          type: 'array',
          minItems: 1,
          maxItems: 1,
        },
        bigInt: {
          type: 'integer',
          format: 'int64',
        },
        boolean: {
          type: 'boolean',
        },
        date: {
          type: 'string',
          format: 'date-time',
        },
        default: {
          default: 42,
        },
        effectRefine: {
          type: 'string',
        },
        effectTransform: {
          type: 'string',
        },
        effectPreprocess: {
          type: 'string',
        },
        enum: {
          type: 'string',
          enum: ['hej', 'svejs'],
        },
        intersection: {
          allOf: [
            {
              type: 'string',
              minLength: 1,
            },
            {
              type: 'string',
              maxLength: 4,
            },
          ],
        },
        literal: {
          type: 'string',
          const: 'hej',
        },
        map: {
          type: 'array',
          maxItems: 125,
          items: {
            type: 'array',
            items: [
              {
                type: 'string',
                format: 'uuid',
              },
              {
                type: 'boolean',
              },
            ],
            minItems: 2,
            maxItems: 2,
          },
        },
        nativeEnum: {
          type: 'number',
          enum: [0, 1, 2],
        },
        never: {
          not: {},
        },
        null: {
          type: 'null',
        },
        nullablePrimitive: {
          type: ['string', 'null'],
        },
        nullableObject: {
          anyOf: [
            {
              type: 'object',
              properties: {
                hello: {
                  type: 'string',
                },
              },
              required: ['hello'],
              additionalProperties: false,
            },
            {
              type: 'null',
            },
          ],
        },
        number: {
          type: 'number',
        },
        numberGt: {
          type: 'number',
          exclusiveMinimum: 1,
        },
        numberLt: {
          type: 'number',
          exclusiveMaximum: 1,
        },
        numberGtLt: {
          type: 'number',
          exclusiveMinimum: 1,
          exclusiveMaximum: 1,
        },
        numberGte: {
          type: 'number',
          minimum: 1,
        },
        numberLte: {
          type: 'number',
          maximum: 1,
        },
        numberGteLte: {
          type: 'number',
          minimum: 1,
          maximum: 1,
        },
        numberMultipleOf: {
          type: 'number',
          multipleOf: 2,
        },
        numberInt: {
          type: 'integer',
        },
        objectPasstrough: {
          type: 'object',
          properties: {
            foo: {
              type: 'string',
            },
            bar: {
              type: 'number',
            },
          },
          required: ['foo'],
          additionalProperties: true,
        },
        objectCatchall: {
          type: 'object',
          properties: {
            foo: {
              type: 'string',
            },
            bar: {
              type: 'number',
            },
          },
          required: ['foo'],
          additionalProperties: {
            type: 'boolean',
          },
        },
        objectStrict: {
          type: 'object',
          properties: {
            foo: {
              type: 'string',
            },
            bar: {
              type: 'number',
            },
          },
          required: ['foo'],
          additionalProperties: false,
        },
        objectStrip: {
          type: 'object',
          properties: {
            foo: {
              type: 'string',
            },
            bar: {
              type: 'number',
            },
          },
          required: ['foo'],
          additionalProperties: false,
        },
        promise: {
          type: 'string',
        },
        recordStringBoolean: {
          type: 'object',
          additionalProperties: {
            type: 'boolean',
          },
        },
        recordUuidBoolean: {
          type: 'object',
          additionalProperties: {
            type: 'boolean',
          },
          propertyNames: {
            format: 'uuid',
          },
        },
        recordBooleanBoolean: {
          type: 'object',
          additionalProperties: {
            type: 'boolean',
          },
        },
        set: {
          type: 'array',
          uniqueItems: true,
          items: {
            type: 'string',
          },
        },
        string: {
          type: 'string',
        },
        stringMin: {
          type: 'string',
          minLength: 1,
        },
        stringMax: {
          type: 'string',
          maxLength: 1,
        },
        stringEmail: {
          type: 'string',
          format: 'email',
        },
        stringEmoji: {
          type: 'string',
          pattern: '^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$',
        },
        stringUrl: {
          type: 'string',
          format: 'uri',
        },
        stringUuid: {
          type: 'string',
          format: 'uuid',
        },
        stringRegEx: {
          type: 'string',
          pattern: 'abc',
        },
        stringCuid: {
          type: 'string',
          pattern: '^[cC][^\\s-]{8,}$',
        },
        tuple: {
          type: 'array',
          minItems: 3,
          maxItems: 3,
          items: [
            {
              type: 'string',
            },
            {
              type: 'number',
            },
            {
              type: 'boolean',
            },
          ],
        },
        undefined: {
          not: {},
        },
        unionPrimitives: {
          type: ['string', 'number', 'boolean', 'integer', 'null'],
        },
        unionPrimitiveLiterals: {
          type: ['number', 'string', 'null', 'boolean'],
          enum: [123, 'abc', null, true],
        },
        unionNonPrimitives: {
          anyOf: [
            {
              type: 'string',
            },
            {
              type: 'object',
              properties: {
                foo: {
                  type: 'string',
                },
                bar: {
                  type: 'number',
                },
              },
              required: ['foo'],
              additionalProperties: false,
            },
          ],
        },
        unknown: {},
      },
      additionalProperties: false,
      default: {
        string: 'hello',
      },
      description: 'watup',
    });
  });
});
