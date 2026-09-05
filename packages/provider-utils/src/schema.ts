import { TypeValidationError, type JSONSchema7 } from '@ai-sdk/provider';
import type {
  StandardSchemaV1,
  StandardJSONSchemaV1,
} from '@standard-schema/spec';
import type * as z3 from 'zod/v3';
import { safeParse, safeParseAsync } from 'zod/v4';
import * as z4Core from 'zod/v4/core';
import { toJSONSchema, type $ZodType } from 'zod/v4/core';
import { addAdditionalPropertiesToJsonSchema } from './add-additional-properties-to-json-schema';
import { zod3ToJsonSchema } from './to-json-schema/zod3-to-json-schema';

/**
 * Used to mark schemas so we can support both Zod and custom schemas.
 */
const schemaSymbol = Symbol.for('vercel.ai.schema');

export type ValidationResult<OBJECT> =
  | { success: true; value: OBJECT }
  | { success: false; error: Error };

export type Schema<OBJECT = unknown> = {
  /**
   * Used to mark schemas so we can support both Zod and custom schemas.
   */
  [schemaSymbol]: true;

  /**
   * Schema type for inference.
   */
  _type: OBJECT;

  /**
   * Optional. Validates that the structure of a value matches this schema,
   * and returns a typed version of the value if it does.
   */
  readonly validate?: (
    value: unknown,
  ) => ValidationResult<OBJECT> | PromiseLike<ValidationResult<OBJECT>>;

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

export type ZodSchema<SCHEMA = any> =
  | z3.Schema<SCHEMA, z3.ZodTypeDef, any>
  | $ZodType<SCHEMA, any>;

export type StandardSchema<SCHEMA = any> = StandardSchemaV1<unknown, SCHEMA> & {
  readonly '~standard': StandardSchemaV1.Props<unknown, SCHEMA> & {
    readonly jsonSchema?: StandardJSONSchemaV1.Converter;
  };
};

type StandardSchemaWithJsonSchema<SCHEMA = any> = StandardSchema<SCHEMA> &
  StandardJSONSchemaV1<unknown, SCHEMA>;

export type FlexibleSchema<SCHEMA = any> =
  | Schema<SCHEMA>
  | LazySchema<SCHEMA>
  | ZodSchema<SCHEMA>
  | StandardSchema<SCHEMA>;

export type InferSchema<SCHEMA> =
  SCHEMA extends ZodSchema<infer T>
    ? T
    : SCHEMA extends StandardSchema<infer T>
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
        type: 'object',
        properties: {},
        additionalProperties: false,
      })
    : isSchema(schema)
      ? schema
      : '~standard' in schema
        ? schema['~standard'].vendor === 'zod'
          ? zodSchema(schema as ZodSchema<OBJECT>)
          : standardSchema(schema as StandardSchema<OBJECT>)
        : schema();
}

function standardSchema<OBJECT>(
  standardSchema: StandardSchema<OBJECT>,
): Schema<OBJECT> {
  return jsonSchema(
    () => {
      if (!hasStandardJsonSchema(standardSchema)) {
        throw new Error(
          `Standard schema vendor '${standardSchema['~standard'].vendor}' does not support JSON Schema conversion.`,
        );
      }

      return addAdditionalPropertiesToJsonSchema(
        standardSchema['~standard'].jsonSchema.input({
          target: 'draft-07',
        }) as JSONSchema7,
      );
    },
    {
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
    },
  );
}

function hasStandardJsonSchema<OBJECT>(
  schema: StandardSchema<OBJECT>,
): schema is StandardSchemaWithJsonSchema<OBJECT> {
  return schema['~standard'].jsonSchema != null;
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
      zod3ToJsonSchema(zodSchema, {
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

// Ahead-of-time schema compilation is available from zod 4.5. Accessed via the
// namespace so peers on older zod versions (which lack the export) still load.
const compileZod4Schema:
  | (<T extends $ZodType>(schema: T, options: { strict: boolean }) => T)
  | undefined =
  typeof (z4Core as { compile?: unknown }).compile === 'function'
    ? (
        z4Core as unknown as {
          compile: <T extends $ZodType>(
            schema: T,
            options: { strict: boolean },
          ) => T;
        }
      ).compile
    : undefined;

// Compiled clones for provably-synchronous schemas (null = must parse async).
// Strict compilation doubles as the classifier: it throws on async
// refinements, transforms, and pipes, so success proves a sync parse is safe.
// The sync parser alone cannot be trusted for this: on async constructs it
// may throw non-signal errors or return incorrect failures instead of
// signaling asynchrony.
const syncParseTargets = new WeakMap<$ZodType, $ZodType | null>();

function getSyncParseTarget<SCHEMA extends $ZodType>(
  schema: SCHEMA,
): SCHEMA | null {
  if (compileZod4Schema == null) {
    return null;
  }
  let target = syncParseTargets.get(schema);
  if (target === undefined) {
    try {
      target = compileZod4Schema(schema, { strict: true });
    } catch {
      target = null;
    }
    syncParseTargets.set(schema, target);
  }
  // compiled clones preserve the source schema type
  return target as SCHEMA | null;
}

export function zod4Schema<OBJECT>(
  zodSchema: $ZodType<OBJECT, any>,
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
      addAdditionalPropertiesToJsonSchema(
        toJSONSchema(zodSchema, {
          target: 'draft-7',
          io: 'input',
          reused: useReferences ? 'ref' : 'inline',
        }) as JSONSchema7,
      ),
    {
      validate: async value => {
        // Provably-sync schemas validate through their compiled clone: keeps
        // hot paths (per-chunk stream validation) off the promise machinery
        // and on zod's compiled fast path. The original schema is kept for
        // JSON schema conversion and introspection.
        const syncParseTarget = getSyncParseTarget(zodSchema);
        if (syncParseTarget != null) {
          const result = safeParse(syncParseTarget, value);
          return result.success
            ? { success: true, value: result.data }
            : { success: false, error: result.error };
        }

        const result = await safeParseAsync(zodSchema, value);
        return result.success
          ? { success: true, value: result.data }
          : { success: false, error: result.error };
      },
    },
  );
}

export function isZod4Schema(
  zodSchema: $ZodType<any, any> | z3.Schema<any, z3.ZodTypeDef, any>,
): zodSchema is $ZodType<any, any> {
  // https://zod.dev/library-authors?id=how-to-support-zod-3-and-zod-4-simultaneously
  return '_zod' in zodSchema;
}

export function zodSchema<OBJECT>(
  zodSchema: $ZodType<OBJECT, any> | z3.Schema<OBJECT, z3.ZodTypeDef, any>,
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
