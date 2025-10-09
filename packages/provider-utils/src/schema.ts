import { JSONSchema7 } from '@ai-sdk/provider';
import { StandardSchemaV1 } from '@standard-schema/spec';
import { Validator, validatorSymbol, type ValidationResult } from './validator';
import { zodSchema } from './zod-schema';

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
  readonly jsonSchema: JSONSchema7;
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

export type FlexibleSchema<SCHEMA> =
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
export function jsonSchema<OBJECT = unknown>(
  jsonSchema: JSONSchema7 | (() => JSONSchema7),
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
      : typeof schema === 'function'
        ? schema()
        : standardSchema(schema);
}

export function standardSchema<OBJECT>(
  standardSchema: StandardSchemaV1<unknown, OBJECT>,
): Schema<OBJECT> {
  const vendor = standardSchema['~standard'].vendor;

  if (vendor === 'zod') {
    return zodSchema(standardSchema as any);
  }

  throw new Error(`Unsupported standard schema vendor: ${vendor}`);
}
