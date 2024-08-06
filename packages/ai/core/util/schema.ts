import { Validator, validatorSymbol } from '@ai-sdk/provider-utils';
import { JSONSchema7 } from 'json-schema';
import { z } from 'zod';
import zodToJsonSchema from 'zod-to-json-schema';

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
    ) => { success: true; value: OBJECT } | { success: false; error: Error };
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
  schema: z.Schema<OBJECT, z.ZodTypeDef, any> | Schema<OBJECT>,
): Schema<OBJECT> {
  return isSchema(schema) ? schema : zodSchema(schema);
}

export function zodSchema<OBJECT>(
  zodSchema: z.Schema<OBJECT, z.ZodTypeDef, any>,
): Schema<OBJECT> {
  return jsonSchema(
    // we assume that zodToJsonSchema will return a valid JSONSchema7:
    zodToJsonSchema(zodSchema) as JSONSchema7,
    {
      validate: value => {
        const result = zodSchema.safeParse(value);
        return result.success
          ? { success: true, value: result.data }
          : { success: false, error: result.error };
      },
    },
  );
}
