import {
  UnsupportedFunctionalityError,
  type JSONSchema7,
} from '@ai-sdk/provider';
import {
  collectJSONSchemaWarnings,
  convertJSONSchemaToOpenAPISchema,
  type GoogleConvertedSchemaTarget,
} from './convert-json-schema-to-openapi-schema';
import { it, expect } from 'vitest';

it('should remove additionalProperties and $schema', () => {
  const input: JSONSchema7 = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    properties: {
      name: { type: 'string' },
      age: { type: 'number' },
    },
    additionalProperties: false,
  };

  const expected = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      age: { type: 'number' },
    },
  };

  expect(convertJSONSchemaToOpenAPISchema(input)).toEqual(expected);
});

it('should inline direct references to root-level $defs', () => {
  const input = {
    type: 'object',
    properties: {
      locale: {
        $ref: '#/$defs/Locale',
        description: 'Locale for formatting',
      },
    },
    required: ['locale'],
    $defs: {
      Locale: { type: 'string', enum: ['de', 'en'] },
    },
  } as JSONSchema7 & { $defs: Record<string, JSONSchema7> };

  expect(convertJSONSchemaToOpenAPISchema(input)).toEqual({
    type: 'object',
    properties: {
      locale: {
        type: 'string',
        enum: ['de', 'en'],
        description: 'Locale for formatting',
      },
    },
    required: ['locale'],
  });
});

it('should inline a root reference before checking for an empty object', () => {
  const input = {
    type: 'object',
    $ref: '#/$defs/Parameters',
    $defs: {
      Parameters: {
        type: 'object',
        properties: { value: { type: 'string' } },
      },
    },
  } as JSONSchema7 & { $defs: Record<string, JSONSchema7> };

  expect(convertJSONSchemaToOpenAPISchema(input)).toEqual({
    type: 'object',
    properties: { value: { type: 'string' } },
  });
});

it('should inline nested references between root-level definitions', () => {
  const input = {
    type: 'object',
    properties: {
      settings: { $ref: '#/$defs/Settings' },
    },
    $defs: {
      Locale: { type: 'string', enum: ['de', 'en'] },
      Settings: {
        type: 'object',
        properties: {
          locale: { $ref: '#/$defs/Locale' },
        },
        required: ['locale'],
      },
    },
  } as JSONSchema7 & { $defs: Record<string, JSONSchema7> };

  expect(convertJSONSchemaToOpenAPISchema(input)).toEqual({
    type: 'object',
    properties: {
      settings: {
        type: 'object',
        properties: {
          locale: { type: 'string', enum: ['de', 'en'] },
        },
        required: ['locale'],
      },
    },
  });
});

it('should inline references to legacy root-level definitions', () => {
  const input: JSONSchema7 = {
    type: 'object',
    properties: {
      locale: { $ref: '#/definitions/Locale' },
    },
    definitions: {
      Locale: { type: 'string', enum: ['de', 'en'] },
    },
  };

  expect(convertJSONSchemaToOpenAPISchema(input)).toEqual({
    type: 'object',
    properties: {
      locale: { type: 'string', enum: ['de', 'en'] },
    },
  });
});

it('should reject unsupported or missing references', () => {
  expect(() =>
    convertJSONSchemaToOpenAPISchema({ $ref: '#/properties/value' }),
  ).toThrow(UnsupportedFunctionalityError);

  expect(() =>
    convertJSONSchemaToOpenAPISchema({
      $ref: '#/$defs/Missing',
    } as JSONSchema7),
  ).toThrow(UnsupportedFunctionalityError);
});

it('should reject recursive references', () => {
  const input = {
    type: 'object',
    properties: {
      node: { $ref: '#/$defs/Node' },
    },
    $defs: {
      Node: {
        type: 'object',
        properties: {
          child: { $ref: '#/$defs/Node' },
        },
      },
    },
  } as JSONSchema7 & { $defs: Record<string, JSONSchema7> };

  expect(() => convertJSONSchemaToOpenAPISchema(input)).toThrow(
    UnsupportedFunctionalityError,
  );
});

it('should remove additionalProperties object from nested object schemas', function () {
  const input: JSONSchema7 = {
    type: 'object',
    properties: {
      keys: {
        type: 'object',
        additionalProperties: { type: 'string' },
        description: 'Description for the key',
      },
    },
    additionalProperties: false,
    $schema: 'http://json-schema.org/draft-07/schema#',
  };

  const expected = {
    type: 'object',
    properties: {
      keys: {
        type: 'object',
        description: 'Description for the key',
      },
    },
  };

  expect(convertJSONSchemaToOpenAPISchema(input)).toEqual(expected);
});

it('should handle nested objects and arrays', () => {
  const input: JSONSchema7 = {
    type: 'object',
    properties: {
      users: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'number' },
            name: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
    },
    additionalProperties: false,
  };

  const expected = {
    type: 'object',
    properties: {
      users: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'number' },
            name: { type: 'string' },
          },
        },
      },
    },
  };

  expect(convertJSONSchemaToOpenAPISchema(input)).toEqual(expected);
});

it('should convert "const" to "enum" with a single value', () => {
  const input: JSONSchema7 = {
    type: 'object',
    properties: {
      status: { const: 'active' },
    },
  };

  const expected = {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['active'] },
    },
  };

  expect(convertJSONSchemaToOpenAPISchema(input)).toEqual(expected);
});

it('should handle allOf, anyOf, and oneOf', () => {
  const input: JSONSchema7 = {
    type: 'object',
    properties: {
      allOfProp: { allOf: [{ type: 'string' }, { minLength: 5 }] },
      anyOfProp: { anyOf: [{ type: 'string' }, { type: 'number' }] },
      oneOfProp: { oneOf: [{ type: 'boolean' }, { type: 'null' }] },
    },
  };

  const expected = {
    type: 'object',
    properties: {
      allOfProp: {
        allOf: [{ type: 'string' }, { minLength: 5 }],
      },
      anyOfProp: {
        anyOf: [{ type: 'string' }, { type: 'number' }],
      },
      oneOfProp: {
        oneOf: [{ type: 'boolean' }, { type: 'null' }],
      },
    },
  };

  expect(convertJSONSchemaToOpenAPISchema(input)).toEqual(expected);
});

it('should convert "format: date-time" to "format: date-time"', () => {
  const input: JSONSchema7 = {
    type: 'object',
    properties: {
      timestamp: { type: 'string', format: 'date-time' },
    },
  };

  const expected = {
    type: 'object',
    properties: {
      timestamp: { type: 'string', format: 'date-time' },
    },
  };

  expect(convertJSONSchemaToOpenAPISchema(input)).toEqual(expected);
});

it('should handle required properties', () => {
  const input: JSONSchema7 = {
    type: 'object',
    properties: {
      id: { type: 'number' },
      name: { type: 'string' },
    },
    required: ['id'],
  };

  const expected = {
    type: 'object',
    properties: {
      id: { type: 'number' },
      name: { type: 'string' },
    },
    required: ['id'],
  };

  expect(convertJSONSchemaToOpenAPISchema(input)).toEqual(expected);
});

it('should convert deeply nested "const" to "enum"', () => {
  const input: JSONSchema7 = {
    type: 'object',
    properties: {
      nested: {
        type: 'object',
        properties: {
          deeplyNested: {
            anyOf: [
              {
                type: 'object',
                properties: {
                  value: {
                    const: 'specific value',
                  },
                },
              },
              {
                type: 'string',
              },
            ],
          },
        },
      },
    },
  };

  const expected = {
    type: 'object',
    properties: {
      nested: {
        type: 'object',
        properties: {
          deeplyNested: {
            anyOf: [
              {
                type: 'object',
                properties: {
                  value: {
                    type: 'string',
                    enum: ['specific value'],
                  },
                },
              },
              {
                type: 'string',
              },
            ],
          },
        },
      },
    },
  };

  expect(convertJSONSchemaToOpenAPISchema(input)).toEqual(expected);
});

it('should correctly convert a complex schema with nested const and anyOf', () => {
  const input: JSONSchema7 = {
    type: 'object',
    properties: {
      name: {
        type: 'string',
      },
      age: {
        type: 'number',
      },
      contact: {
        anyOf: [
          {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                const: 'email',
              },
              value: {
                type: 'string',
              },
            },
            required: ['type', 'value'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                const: 'phone',
              },
              value: {
                type: 'string',
              },
            },
            required: ['type', 'value'],
            additionalProperties: false,
          },
        ],
      },
      occupation: {
        anyOf: [
          {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                const: 'employed',
              },
              company: {
                type: 'string',
              },
              position: {
                type: 'string',
              },
            },
            required: ['type', 'company', 'position'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                const: 'student',
              },
              school: {
                type: 'string',
              },
              grade: {
                type: 'number',
              },
            },
            required: ['type', 'school', 'grade'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                const: 'unemployed',
              },
            },
            required: ['type'],
            additionalProperties: false,
          },
        ],
      },
    },
    required: ['name', 'age', 'contact', 'occupation'],
    additionalProperties: false,
    $schema: 'http://json-schema.org/draft-07/schema#',
  };

  const expected = {
    type: 'object',
    properties: {
      name: {
        type: 'string',
      },
      age: {
        type: 'number',
      },
      contact: {
        anyOf: [
          {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['email'],
              },
              value: {
                type: 'string',
              },
            },
            required: ['type', 'value'],
          },
          {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['phone'],
              },
              value: {
                type: 'string',
              },
            },
            required: ['type', 'value'],
          },
        ],
      },
      occupation: {
        anyOf: [
          {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['employed'],
              },
              company: {
                type: 'string',
              },
              position: {
                type: 'string',
              },
            },
            required: ['type', 'company', 'position'],
          },
          {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['student'],
              },
              school: {
                type: 'string',
              },
              grade: {
                type: 'number',
              },
            },
            required: ['type', 'school', 'grade'],
          },
          {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['unemployed'],
              },
            },
            required: ['type'],
          },
        ],
      },
    },
    required: ['name', 'age', 'contact', 'occupation'],
  };

  expect(convertJSONSchemaToOpenAPISchema(input)).toEqual(expected);
});

it('should handle null type correctly', () => {
  const input: JSONSchema7 = {
    type: 'object',
    properties: {
      nullableField: {
        type: ['string', 'null'],
      },
      explicitNullField: {
        type: 'null',
      },
    },
  };

  const expected = {
    type: 'object',
    properties: {
      nullableField: {
        anyOf: [{ type: 'string' }],
        nullable: true,
      },
      explicitNullField: {
        type: 'null',
      },
    },
  };

  expect(convertJSONSchemaToOpenAPISchema(input)).toEqual(expected);
});

it('should handle descriptions', () => {
  const input: JSONSchema7 = {
    type: 'object',
    description: 'A user object',
    properties: {
      id: {
        type: 'number',
        description: 'The user ID',
      },
      name: {
        type: 'string',
        description: "The user's full name",
      },
      email: {
        type: 'string',
        format: 'email',
        description: "The user's email address",
      },
    },
    required: ['id', 'name'],
  };

  const expected = {
    type: 'object',
    description: 'A user object',
    properties: {
      id: {
        type: 'number',
        description: 'The user ID',
      },
      name: {
        type: 'string',
        description: "The user's full name",
      },
      email: {
        type: 'string',
        format: 'email',
        description: "The user's email address",
      },
    },
    required: ['id', 'name'],
  };

  expect(convertJSONSchemaToOpenAPISchema(input)).toEqual(expected);
});

it('should return undefined for empty object schemas at root level', () => {
  const emptyObjectSchemas = [
    { type: 'object' },
    { type: 'object', properties: {} },
  ] as const;

  emptyObjectSchemas.forEach(schema => {
    expect(convertJSONSchemaToOpenAPISchema(schema)).toBeUndefined();
  });
});

it('should preserve nested empty object schemas to avoid breaking required array validation', () => {
  const input: JSONSchema7 = {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL to navigate to' },
      launchOptions: {
        type: 'object',
        description: 'PuppeteerJS LaunchOptions',
      },
      allowDangerous: {
        type: 'boolean',
        description: 'Allow dangerous options',
      },
    },
    required: ['url', 'launchOptions'],
  };

  const expected = {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL to navigate to' },
      launchOptions: {
        type: 'object',
        description: 'PuppeteerJS LaunchOptions',
      },
      allowDangerous: {
        type: 'boolean',
        description: 'Allow dangerous options',
      },
    },
    required: ['url', 'launchOptions'],
  };

  expect(convertJSONSchemaToOpenAPISchema(input)).toEqual(expected);
});

it('should preserve nested empty object schemas without descriptions', () => {
  const input: JSONSchema7 = {
    type: 'object',
    properties: {
      options: { type: 'object' },
    },
    required: ['options'],
  };

  const expected = {
    type: 'object',
    properties: {
      options: { type: 'object' },
    },
    required: ['options'],
  };

  expect(convertJSONSchemaToOpenAPISchema(input)).toEqual(expected);
});

it('should handle non-empty object schemas', () => {
  const nonEmptySchema: JSONSchema7 = {
    type: 'object',
    properties: {
      name: { type: 'string' },
    },
  };

  expect(convertJSONSchemaToOpenAPISchema(nonEmptySchema)).toEqual({
    type: 'object',
    properties: {
      name: { type: 'string' },
    },
  });
});

it('should convert string enum properties', () => {
  const schemaWithEnumProperty: JSONSchema7 = {
    type: 'object',
    properties: {
      kind: {
        type: 'string',
        enum: ['text', 'code', 'image'],
      },
    },
    required: ['kind'],
    additionalProperties: false,
    $schema: 'http://json-schema.org/draft-07/schema#',
  };

  expect(convertJSONSchemaToOpenAPISchema(schemaWithEnumProperty)).toEqual({
    type: 'object',
    properties: {
      kind: {
        type: 'string',
        enum: ['text', 'code', 'image'],
      },
    },
    required: ['kind'],
  });
});

it('should infer the type of an untyped string enum', () => {
  expect(
    convertJSONSchemaToOpenAPISchema({ enum: ['text', 'code', 'image'] }),
  ).toEqual({
    type: 'string',
    enum: ['text', 'code', 'image'],
  });
});

it('should convert non-string enum values to the Google enum format', () => {
  const input: JSONSchema7 = {
    type: 'object',
    properties: {
      numberValue: { type: 'number', const: 15 },
      integerValue: { type: 'integer', enum: [1, 2] },
      booleanValue: { type: 'boolean', const: true },
      nullValue: { const: null },
    },
  };

  expect(convertJSONSchemaToOpenAPISchema(input)).toEqual({
    type: 'object',
    properties: {
      numberValue: { type: 'number', format: 'enum', enum: ['15'] },
      integerValue: {
        type: 'integer',
        format: 'enum',
        enum: ['1', '2'],
      },
      booleanValue: { type: 'boolean', format: 'enum', enum: ['true'] },
      nullValue: { type: 'null' },
    },
  });
});

it('should convert nullable type-array and untyped primitive enums', () => {
  const input: JSONSchema7 = {
    type: 'object',
    properties: {
      nullableString: {
        type: ['string', 'null'],
        enum: ['a', 'b'],
      },
      nullableNumber: {
        type: ['number', 'null'],
        enum: [1, 2],
      },
      nullableBoolean: {
        type: ['boolean', 'null'],
        enum: [true, null],
      },
      untypedNumber: { enum: [1, 2] },
      untypedBoolean: { enum: [true, false] },
    },
  };

  expect(convertJSONSchemaToOpenAPISchema(input)).toEqual({
    type: 'object',
    properties: {
      nullableString: {
        type: 'string',
        nullable: true,
        enum: ['a', 'b'],
      },
      nullableNumber: {
        type: 'number',
        nullable: true,
        format: 'enum',
        enum: ['1', '2'],
      },
      nullableBoolean: {
        type: 'boolean',
        nullable: true,
        format: 'enum',
        enum: ['true'],
      },
      untypedNumber: {
        type: 'number',
        format: 'enum',
        enum: ['1', '2'],
      },
      untypedBoolean: {
        type: 'boolean',
        format: 'enum',
        enum: ['true', 'false'],
      },
    },
  });
});

it('should reject enum values with mixed types', () => {
  expect(() => convertJSONSchemaToOpenAPISchema({ enum: ['text', 1] })).toThrow(
    UnsupportedFunctionalityError,
  );
});

it('should report removed constraints with their JSON Pointer paths', () => {
  const warnings: Array<{
    type: string;
    feature?: string;
    details?: string;
  }> = [];
  const input: JSONSchema7 = {
    type: 'object',
    properties: {
      'code/name~value': {
        type: 'string',
        pattern: '^[A-Z]{2}$',
        maxLength: 2,
      },
      price: {
        type: 'number',
        exclusiveMinimum: 0,
        multipleOf: 0.5,
      },
      ids: {
        type: 'array',
        items: {
          type: 'integer',
          maximum: 10,
        },
        uniqueItems: true,
      },
    },
    additionalProperties: false,
  };

  const converted = convertJSONSchemaToOpenAPISchema(input, {
    onWarning: warning => warnings.push(warning),
  });

  expect(warnings).toEqual([
    {
      type: 'unsupported',
      feature: 'JSON Schema constraint "additionalProperties"',
      details:
        'The constraint at "/additionalProperties" is not supported by the Google function parameter schema surface and was removed from the schema sent to the model.',
    },
    {
      type: 'unsupported',
      feature: 'JSON Schema constraint "exclusiveMinimum"',
      details:
        'The constraint at "/properties/price/exclusiveMinimum" is not supported by the Google function parameter schema surface and was removed from the schema sent to the model.',
    },
    {
      type: 'unsupported',
      feature: 'JSON Schema constraint "multipleOf"',
      details:
        'The constraint at "/properties/price/multipleOf" is not supported by the Google function parameter schema surface and was removed from the schema sent to the model.',
    },
    {
      type: 'unsupported',
      feature: 'JSON Schema constraint "uniqueItems"',
      details:
        'The constraint at "/properties/ids/uniqueItems" is not supported by the Google function parameter schema surface and was removed from the schema sent to the model.',
    },
  ]);
  expect(converted).toMatchObject({
    properties: {
      'code/name~value': {
        maxLength: 2,
        pattern: '^[A-Z]{2}$',
      },
      ids: {
        items: {
          maximum: 10,
        },
      },
    },
  });
});

it('should report constraints from referenced definitions at their source paths', () => {
  const warnings: unknown[] = [];
  const input = {
    type: 'object',
    properties: {
      value: { $ref: '#/$defs/value~1type' },
    },
    $defs: {
      'value/type': {
        type: 'number',
        multipleOf: 0.5,
      },
    },
  } as JSONSchema7 & { $defs: Record<string, JSONSchema7> };

  convertJSONSchemaToOpenAPISchema(input, {
    onWarning: warning => warnings.push(warning),
  });

  expect(warnings).toEqual([
    {
      type: 'unsupported',
      feature: 'JSON Schema constraint "multipleOf"',
      details:
        'The constraint at "/$defs/value~1type/multipleOf" is not supported by the Google function parameter schema surface and was removed from the schema sent to the model.',
    },
  ]);
});

it('should report oneOf compatibility without warning for preserved constraints', () => {
  const warnings: unknown[] = [];

  convertJSONSchemaToOpenAPISchema(
    {
      oneOf: [
        { type: 'string', minLength: 2 },
        { type: 'string', const: 'invoice' },
      ],
    },
    {
      onWarning: warning => warnings.push(warning),
    },
  );

  expect(warnings).toEqual([
    {
      type: 'compatibility',
      feature: 'JSON Schema constraint "oneOf"',
      details:
        'The Google function parameter schema surface treats "oneOf" as "anyOf" at "/oneOf". Values matching multiple branches may be accepted.',
    },
  ]);
});

it('should report false schemas that widen during conversion', () => {
  const warnings: unknown[] = [];

  expect(
    convertJSONSchemaToOpenAPISchema(false, {
      onWarning: warning => warnings.push(warning),
      target: 'responseSchema',
    }),
  ).toEqual({ type: 'boolean', properties: {} });

  expect(warnings).toEqual([
    {
      type: 'unsupported',
      feature: 'JSON Schema boolean schema "false"',
      details:
        'The Google response schema surface cannot represent the root schema as always invalid. It was converted to a boolean schema that accepts values.',
    },
  ]);
});

it('should report repeated nullable anyOf schema instances at each source index', () => {
  const warnings: unknown[] = [];
  const repeatedSchema = {
    type: 'number',
    multipleOf: 0.5,
  } satisfies JSONSchema7;

  convertJSONSchemaToOpenAPISchema(
    {
      anyOf: [repeatedSchema, repeatedSchema, { type: 'null' }],
    },
    {
      onWarning: warning => warnings.push(warning),
    },
  );

  expect(warnings).toEqual([
    {
      type: 'unsupported',
      feature: 'JSON Schema constraint "multipleOf"',
      details:
        'The constraint at "/anyOf/0/multipleOf" is not supported by the Google function parameter schema surface and was removed from the schema sent to the model.',
    },
    {
      type: 'unsupported',
      feature: 'JSON Schema constraint "multipleOf"',
      details:
        'The constraint at "/anyOf/1/multipleOf" is not supported by the Google function parameter schema surface and was removed from the schema sent to the model.',
    },
  ]);
});

it('should inspect recursive parameter JSON Schemas without resolving references', () => {
  const warnings: unknown[] = [];
  const input = {
    type: 'object',
    properties: {
      condition: { $ref: '#/$defs/Condition' },
      code: { type: 'string', pattern: '^[A-Z]{2}$' },
      choice: {
        oneOf: [{ type: 'string' }, { type: 'number' }],
      },
      price: { type: 'number', minimum: 0, multipleOf: 0.5 },
    },
    additionalProperties: false,
    $defs: {
      Condition: {
        type: 'object',
        properties: {
          children: {
            type: 'array',
            items: { $ref: '#/$defs/Condition' },
          },
        },
      },
    },
  } as JSONSchema7 & { $defs: Record<string, JSONSchema7> };

  collectJSONSchemaWarnings(input, {
    onWarning: warning => warnings.push(warning),
    target: 'functionParametersJsonSchema',
  });

  expect(warnings).toEqual([
    {
      type: 'unsupported',
      feature: 'JSON Schema constraint "pattern"',
      details:
        'The constraint at "/properties/code/pattern" is not supported by the Google function parameter JSON Schema surface. The schema is sent unchanged, but this constraint may not restrict values generated by the model.',
    },
    {
      type: 'compatibility',
      feature: 'JSON Schema constraint "oneOf"',
      details:
        'The Google function parameter JSON Schema surface treats "oneOf" as "anyOf" at "/properties/choice/oneOf". Values matching multiple branches may be accepted.',
    },
    {
      type: 'unsupported',
      feature: 'JSON Schema constraint "multipleOf"',
      details:
        'The constraint at "/properties/price/multipleOf" is not supported by the Google function parameter JSON Schema surface. The schema is sent unchanged, but this constraint may not restrict values generated by the model.',
    },
  ]);
});

const schemaTargets: GoogleConvertedSchemaTarget[] = [
  'functionParameters',
  'realtimeFunctionParameters',
  'responseSchema',
];

it.each(schemaTargets)(
  'should preserve constraints supported by the %s surface',
  target => {
    const input = {
      type: 'array',
      minItems: 1,
      maxItems: 4,
      items: {
        type: 'object',
        minProperties: 1,
        maxProperties: 3,
        properties: {
          label: {
            type: 'string',
            minLength: 2,
            maxLength: 8,
            pattern: '^[a-z]+$',
          },
          score: {
            type: 'number',
            minimum: 0,
            maximum: 10,
          },
        },
      },
    } satisfies JSONSchema7;
    const warnings: unknown[] = [];

    expect(
      convertJSONSchemaToOpenAPISchema(input, {
        onWarning: warning => warnings.push(warning),
        target,
      }),
    ).toEqual(input);
    expect(warnings).toEqual([]);
  },
);

it.each(schemaTargets)(
  'should report every removed constraint for the %s surface',
  target => {
    const input = {
      ...Object.fromEntries([
        // oxlint-disable-next-line unicorn/no-thenable -- JSON Schema defines a "then" keyword.
        ['then', { required: ['thenValue'] }],
        ['else', { required: ['elseValue'] }],
      ]),
      type: 'object',
      properties: {
        value: { type: 'string' },
      },
      additionalItems: false,
      additionalProperties: false,
      contains: { type: 'string' },
      dependencies: { value: ['other'] },
      exclusiveMaximum: 10,
      exclusiveMinimum: 0,
      if: { required: ['value'] },
      multipleOf: 0.5,
      not: { type: 'null' },
      patternProperties: { '^x-': { type: 'string' } },
      propertyNames: { pattern: '^[a-z]+$' },
      uniqueItems: true,
    } satisfies JSONSchema7;
    const warnings: unknown[] = [];

    const converted = convertJSONSchemaToOpenAPISchema(input, {
      onWarning: warning => warnings.push(warning),
      target,
    }) as Record<string, unknown>;

    expect(
      warnings.map(warning => (warning as { feature?: string }).feature),
    ).toEqual([
      'JSON Schema constraint "additionalItems"',
      'JSON Schema constraint "additionalProperties"',
      'JSON Schema constraint "contains"',
      'JSON Schema constraint "dependencies"',
      'JSON Schema constraint "exclusiveMaximum"',
      'JSON Schema constraint "exclusiveMinimum"',
      'JSON Schema constraint "if"',
      'JSON Schema constraint "multipleOf"',
      'JSON Schema constraint "not"',
      'JSON Schema constraint "patternProperties"',
      'JSON Schema constraint "propertyNames"',
      'JSON Schema constraint "then"',
      'JSON Schema constraint "else"',
      'JSON Schema constraint "uniqueItems"',
    ]);
    for (const keyword of [
      'additionalItems',
      'additionalProperties',
      'contains',
      'dependencies',
      'exclusiveMaximum',
      'exclusiveMinimum',
      'if',
      'multipleOf',
      'not',
      'patternProperties',
      'propertyNames',
      'then',
      'else',
      'uniqueItems',
    ]) {
      expect(converted).not.toHaveProperty(keyword);
    }
  },
);

it('should convert nullable string enum', () => {
  const schemaWithEnumProperty: JSONSchema7 = {
    type: 'object',
    properties: {
      fieldD: {
        anyOf: [
          {
            type: 'string',
            enum: ['a', 'b', 'c'],
          },
          {
            type: 'null',
          },
        ],
      },
    },
    required: ['fieldD'],
    additionalProperties: false,
    $schema: 'http://json-schema.org/draft-07/schema#',
  };

  expect(convertJSONSchemaToOpenAPISchema(schemaWithEnumProperty)).toEqual({
    required: ['fieldD'],
    type: 'object',
    properties: {
      fieldD: {
        nullable: true,
        type: 'string',
        enum: ['a', 'b', 'c'],
      },
    },
  });
});

it('should handle type arrays with multiple non-null types plus null', () => {
  const input: JSONSchema7 = {
    type: 'object',
    properties: {
      multiTypeField: {
        type: ['string', 'number', 'null'],
      },
    },
  };

  const expected = {
    type: 'object',
    properties: {
      multiTypeField: {
        anyOf: [{ type: 'string' }, { type: 'number' }],
        nullable: true,
      },
    },
  };

  expect(convertJSONSchemaToOpenAPISchema(input)).toEqual(expected);
});

it('should convert type arrays without null to anyOf', () => {
  const input: JSONSchema7 = {
    type: 'object',
    properties: {
      multiTypeField: {
        type: ['string', 'number'],
      },
    },
  };

  const expected = {
    type: 'object',
    properties: {
      multiTypeField: {
        anyOf: [{ type: 'string' }, { type: 'number' }],
      },
    },
  };

  expect(convertJSONSchemaToOpenAPISchema(input)).toEqual(expected);
});
