import { Validator, validatorSymbol, type ValidationResult } from './validator';
import { JSONSchema7 } from '@ai-sdk/provider';
import * as z3 from 'zod/v3';
import * as z4 from 'zod/v4';
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

export type FlexibleSchema<T> = z4.core.$ZodType<T> | z3.Schema<T> | Schema<T>;

export type InferSchema<SCHEMA> = SCHEMA extends z3.Schema
  ? z3.infer<SCHEMA>
  : SCHEMA extends z4.core.$ZodType
    ? z4.infer<SCHEMA>
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
  jsonSchema: JSONSchema7,
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
    jsonSchema,
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
  schema:
    | z4.core.$ZodType<OBJECT, any>
    | z3.Schema<OBJECT, z3.ZodTypeDef, any>
    | Schema<OBJECT>
    | undefined,
): Schema<OBJECT> {
  return schema == null
    ? jsonSchema({
        properties: {},
        additionalProperties: false,
      })
    : isSchema(schema)
      ? schema
      : zodSchema(schema);
}
