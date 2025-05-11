import { TypeValidationError } from '@ai-sdk/provider';
import { z } from 'zod';
import { Validator, asValidator } from './validator';

/**
 * Validates the types of an unknown object using a schema and
 * return a strongly-typed object.
 *
 * @template T - The type of the object to validate.
 * @param {string} options.value - The object to validate.
 * @param {Validator<T>} options.schema - The schema to use for validating the JSON.
 * @returns {Promise<T>} - The typed object.
 */
export async function validateTypes<T>({
  value,
  schema: inputSchema,
}: {
  value: unknown;
  schema: z.Schema<T, z.ZodTypeDef, any> | Validator<T>;
}): Promise<T> {
  const result = await safeValidateTypes({ value, schema: inputSchema });

  if (!result.success) {
    throw TypeValidationError.wrap({ value, cause: result.error });
  }

  return result.value;
}

/**
 * Safely validates the types of an unknown object using a schema and
 * return a strongly-typed object.
 *
 * @template T - The type of the object to validate.
 * @param {string} options.value - The JSON object to validate.
 * @param {Validator<T>} options.schema - The schema to use for validating the JSON.
 * @returns An object with either a `success` flag and the parsed and typed data, or a `success` flag and an error object.
 */
export async function safeValidateTypes<T>({
  value,
  schema,
}: {
  value: unknown;
  schema: z.Schema<T, z.ZodTypeDef, any> | Validator<T>;
}): Promise<
  | { success: true; value: T; rawValue: unknown }
  | { success: false; error: TypeValidationError; rawValue: unknown }
> {
  const validator = asValidator(schema);

  try {
    if (validator.validate == null) {
      return { success: true, value: value as T, rawValue: value };
    }

    const result = validator.validate(value);

    if (result.success) {
      return { success: true, value: result.value, rawValue: value };
    }

    return {
      success: false,
      error: TypeValidationError.wrap({ value, cause: result.error }),
      rawValue: value,
    };
  } catch (error) {
    return {
      success: false,
      error: TypeValidationError.wrap({ value, cause: error }),
      rawValue: value,
    };
  }
}
