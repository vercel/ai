import { JSONSchema7 } from '@ai-sdk/provider';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { Validator, validatorSymbol } from './validator';

/**
 * Used to mark schemas so we can support both Zod and custom schemas.
 */
const schemaSymbol = Symbol.for('vercel.ai.schema');

export type Schema<OBJECT> =
  Validator<OBJECT> & {
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
 * Create a schema using a JSON Schema.
 *
 * @param jsonSchema The JSON Schema for the schema.
 * @param options.validate Optional. A validation function for the schema.
 */
export function jsonSchema<T extends StandardSchemaV1 = StandardSchemaV1>(
  jsonSchema: JSONSchema7,
  {
    validate,
  }: {
    validate?: (
      value: unknown,
    ) => PromiseLike<
      { success: true; value: T } | { success: false; error: Error }
    >;
  } = {},
): Schema<T> {
  return {
    [schemaSymbol]: true,
    _type: undefined as unknown as T, // should never be used directly
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

export function asSchema<T_OBJECT>(
  schema: Schema<StandardSchemaV1<T_OBJECT>> | undefined,
): Schema<T_OBJECT> {
  if (schema == null) {
    return jsonSchema({
      properties: {},
      additionalProperties: false,
    });
  }

  if (isSchema(schema)) {
    return jsonSchema({
      properties: {},
      additionalProperties: false,
    });
  }

  throw new Error('TODO: implement standard schema to JSON Schema');
}
