import { JSONSchema7, TypeValidationError } from '@ai-sdk/provider';
import { StandardSchemaV1 } from '@standard-schema/spec';
import * as z3 from 'zod/v3';
import * as z4 from 'zod/v4';
import { arktypeToJsonSchema } from './to-json-schema/arktype-to-json-schema';
import { valibotToJsonSchema } from './to-json-schema/valibot-to-json-schema';
import { Validator, validatorSymbol, type ValidationResult } from './validator';
import zodToJsonSchema from './zod-to-json-schema';

/**
 * Used to mark schemas so we can support both Zod and custom schemas.
 */
const schemaSymbol = Symbol.for('vercel.ai.schema');

export type Schema<OBJECT = unknown> = Validator<OBJECT> & {
  /**
   * Used to mark schemas so we can support both Zod and custom schemas.
   */
  [schemaSymbol]: true;

  /**
   * Schema type for inference.
   */
  _type: OBJECT;

  /**
   * The JSON Schema for the schema. It is passed to the providers.
   */
  readonly jsonSchema: JSONSchema7 | PromiseLike<JSONSchema7>;
};

/**
 * Creates a schema with deferred creation.
 * This is important to reduce the startup time of the library
 * and to avoid initializing unused validators.
 *
 * @param createValidator A function that creates a schema.
 * @returns A function that returns a schema.
 */
export function lazySchema<SCHEMA>(
  createSchema: () => Schema<SCHEMA>,
): LazySchema<SCHEMA> {
  // cache the validator to avoid initializing it multiple times
  let schema: Schema<SCHEMA> | undefined;
  return () => {
    if (schema == null) {
      schema = createSchema();
    }
    return schema;
  };
}

export type LazySchema<SCHEMA> = () => Schema<SCHEMA>;

export type FlexibleSchema<SCHEMA = any> =
  | Schema<SCHEMA>
  | LazySchema<SCHEMA>
  | StandardSchemaV1<unknown, SCHEMA>;

export type InferSchema<SCHEMA> =
  SCHEMA extends StandardSchemaV1<unknown, infer T>
    ? T
    : SCHEMA extends LazySchema<infer T>
      ? T
      : SCHEMA extends Schema<infer T>
        ? T
        : never;

/**
 * Create a schema using a JSON Schema.
 *
 * @param jsonSchema The JSON Schema for the schema.
 * @param options.validate Optional. A validation function for the schema.
 */
// TODO rename to 'schema'
export function jsonSchema<OBJECT = unknown>(
  jsonSchema:
    | JSONSchema7
    | PromiseLike<JSONSchema7>
    | (() => JSONSchema7 | PromiseLike<JSONSchema7>),
  {
    validate,
  }: {
    validate?: (
      value: unknown,
    ) => ValidationResult<OBJECT> | PromiseLike<ValidationResult<OBJECT>>;
  } = {},
): Schema<OBJECT> {
  return {
    [schemaSymbol]: true,
    _type: undefined as OBJECT, // should never be used directly
    [validatorSymbol]: true,
    get jsonSchema() {
      if (typeof jsonSchema === 'function') {
        jsonSchema = jsonSchema(); // cache the function results
      }
      return jsonSchema;
    },
    validate,
  };
}

function isSchema(value: unknown): value is Schema {
  return (
    typeof value === 'object' &&
    value !== null &&
    schemaSymbol in value &&
    value[schemaSymbol] === true &&
    'jsonSchema' in value &&
    'validate' in value
  );
}

export function asSchema<OBJECT>(
  schema: FlexibleSchema<OBJECT> | undefined,
): Schema<OBJECT> {
  return schema == null
    ? jsonSchema({
        properties: {},
        additionalProperties: false,
      })
    : isSchema(schema)
      ? schema
      : '~standard' in schema
        ? standardSchema(schema)
        : schema();
}

export function standardSchema<OBJECT>(
  standardSchema: StandardSchemaV1<unknown, OBJECT>,
): Schema<OBJECT> {
  const vendor = standardSchema['~standard'].vendor;

  switch (vendor) {
    case 'zod': {
      return zodSchema(
        standardSchema as
          | z4.core.$ZodType<any, any>
          | z3.Schema<any, z3.ZodTypeDef, any>,
      );
    }

    case 'arktype': {
      return standardSchemaWithJsonSchemaResolver(
        standardSchema,
        arktypeToJsonSchema,
      );
    }

    case 'valibot': {
      return standardSchemaWithJsonSchemaResolver(
        standardSchema,
        valibotToJsonSchema,
      );
    }

    default: {
      return standardSchemaWithJsonSchemaResolver(standardSchema, () => {
        throw new Error(`Unsupported standard schema vendor: ${vendor}`);
      });
    }
  }
}

function standardSchemaWithJsonSchemaResolver<OBJECT>(
  standardSchema: StandardSchemaV1<unknown, OBJECT>,
  jsonSchemaResolver: (
    schema: StandardSchemaV1<unknown, OBJECT>,
  ) => JSONSchema7 | PromiseLike<JSONSchema7>,
): Schema<OBJECT> {
  return jsonSchema(jsonSchemaResolver(standardSchema), {
    validate: async value => {
      const result = await standardSchema['~standard'].validate(value);
      return 'value' in result
        ? { success: true, value: result.value }
        : {
            success: false,
            error: new TypeValidationError({
              value,
              cause: result.issues,
            }),
          };
    },
  });
}

export function zod3Schema<OBJECT>(
  zodSchema: z3.Schema<OBJECT, z3.ZodTypeDef, any>,
  options?: {
    /**
     * Enables support for references in the schema.
     * This is required for recursive schemas, e.g. with `z.lazy`.
     * However, not all language models and providers support such references.
     * Defaults to `false`.
     */
    useReferences?: boolean;
  },
): Schema<OBJECT> {
  // default to no references (to support openapi conversion for google)
  const useReferences = options?.useReferences ?? false;

  return jsonSchema(
    // defer json schema creation to avoid unnecessary computation when only validation is needed
    () =>
      zodToJsonSchema(zodSchema, {
        $refStrategy: useReferences ? 'root' : 'none',
      }) as JSONSchema7,
    {
      validate: async value => {
        const result = await zodSchema.safeParseAsync(value);
        return result.success
          ? { success: true, value: result.data }
          : { success: false, error: result.error };
      },
    },
  );
}

export function zod4Schema<OBJECT>(
  zodSchema: z4.core.$ZodType<OBJECT, any>,
  options?: {
    /**
     * Enables support for references in the schema.
     * This is required for recursive schemas, e.g. with `z.lazy`.
     * However, not all language models and providers support such references.
     * Defaults to `false`.
     */
    useReferences?: boolean;
  },
): Schema<OBJECT> {
  // default to no references (to support openapi conversion for google)
  const useReferences = options?.useReferences ?? false;

  return jsonSchema(
    // defer json schema creation to avoid unnecessary computation when only validation is needed
    () =>
      z4.toJSONSchema(zodSchema, {
        target: 'draft-7',
        io: 'output',
        reused: useReferences ? 'ref' : 'inline',
      }) as JSONSchema7,
    {
      validate: async value => {
        const result = await z4.safeParseAsync(zodSchema, value);
        return result.success
          ? { success: true, value: result.data }
          : { success: false, error: result.error };
      },
    },
  );
}

export function isZod4Schema(
  zodSchema: z4.core.$ZodType<any, any> | z3.Schema<any, z3.ZodTypeDef, any>,
): zodSchema is z4.core.$ZodType<any, any> {
  // https://zod.dev/library-authors?id=how-to-support-zod-3-and-zod-4-simultaneously
  return '_zod' in zodSchema;
}

export function zodSchema<OBJECT>(
  zodSchema:
    | z4.core.$ZodType<OBJECT, any>
    | z3.Schema<OBJECT, z3.ZodTypeDef, any>,
  options?: {
    /**
     * Enables support for references in the schema.
     * This is required for recursive schemas, e.g. with `z.lazy`.
     * However, not all language models and providers support such references.
     * Defaults to `false`.
     */
    useReferences?: boolean;
  },
): Schema<OBJECT> {
  if (isZod4Schema(zodSchema)) {
    return zod4Schema(zodSchema, options);
  } else {
    return zod3Schema(zodSchema, options);
  }
}
