import {
  Validator,
  validatorSymbol,
  ValidationResult,
} from '@ai-sdk/provider-utils';
import { JSONSchema7 } from 'json-schema';
import { z } from 'zod';
import { zodSchema } from './zod-schema';

/**
 * Used to mark schemas so we can support both Zod and custom schemas.
 */
const schemaSymbol = Symbol.for('vercel.ai.schema');

export type Schema<OUTPUT = unknown, INPUT = OUTPUT> = Validator<
  OUTPUT,
  INPUT
> & {
  /**
   * Used to mark schemas so we can support both Zod and custom schemas.
   */
  [schemaSymbol]: true;

  /**
   * Schema type for inference.
   */
  _type: OUTPUT;

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
export function jsonSchema<OUTPUT = unknown, INPUT = OUTPUT>(
  jsonSchema: JSONSchema7,
  {
    validate,
  }: {
    validate?: (value: unknown) => ValidationResult<OUTPUT, INPUT>;
  } = {},
): Schema<OUTPUT, INPUT> {
  return {
    [schemaSymbol]: true,
    _type: undefined as OUTPUT, // should never be used directly
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
