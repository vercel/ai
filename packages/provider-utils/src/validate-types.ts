import { TypeValidationError } from '@ai-sdk/provider';
import { z } from 'zod';
import { Validator, asValidator } from './validator';

/**
 * Validates the types of an unknown object using a schema and
 * return a strongly-typed object.
 *
 * @template OUTPUT - The output type after validation/transformation
 * @template INPUT - The input type before validation/transformation
 * @param {string} options.value - The object to validate.
 * @param {Validator<OUTPUT, INPUT> | z.Schema<OUTPUT, z.ZodTypeDef, INPUT>} options.schema - The schema to use for validating the JSON.
 * @returns {OUTPUT} - The typed object.
 */
export function validateTypes<OUTPUT, INPUT = OUTPUT>({
  value,
  schema: inputSchema,
}: {
  value: unknown;
  schema: z.Schema<OUTPUT, z.ZodTypeDef, INPUT> | Validator<OUTPUT, INPUT>;
}): OUTPUT {
  const result = safeValidateTypes({ value, schema: inputSchema });

  if (!result.success) {
    throw TypeValidationError.wrap({ value, cause: result.error });
  }

  return result.value;
}

/**
 * Safely validates the types of an unknown object using a schema and
 * return a strongly-typed object.
 *
 * @template OUTPUT - The output type after validation/transformation
 * @template INPUT - The input type before validation/transformation
 * @param {string} options.value - The JSON object to validate.
 * @param {Validator<OUTPUT, INPUT> | z.Schema<OUTPUT, z.ZodTypeDef, INPUT>} options.schema - The schema to use for validating the JSON.
 * @returns An object with either a `success` flag and the parsed and typed data, or a `success` flag and an error object.
 */
export function safeValidateTypes<OUTPUT, INPUT = OUTPUT>({
  value,
  schema,
}: {
  value: unknown;
  schema: z.Schema<OUTPUT, z.ZodTypeDef, INPUT> | Validator<OUTPUT, INPUT>;
}):
  | { success: true; value: OUTPUT; rawValue: INPUT }
  | { success: false; error: TypeValidationError } {
  const validator = asValidator(schema);

  try {
    if (validator.validate == null) {
      return {
        success: true,
        value: value as OUTPUT,
        rawValue: value as INPUT,
      };
    }

    const result = validator.validate(value);

    if (result.success) {
      return result;
    }

    return {
      success: false,
      error: TypeValidationError.wrap({ value, cause: result.error }),
    };
  } catch (error) {
    return {
      success: false,
      error: TypeValidationError.wrap({ value, cause: error }),
    };
  }
}
