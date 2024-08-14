import { TypeValidationError } from '@ai-sdk/provider';
import { z } from 'zod';
import { Validator, isValidator, zodValidator } from './validator';

/**
 * Validates the types of an unknown object using a schema and
 * return a strongly-typed object.
 *
 * @template T - The type of the object to validate.
 * @param {string} options.value - The object to validate.
 * @param {Validator<T>} options.schema - The schema to use for validating the JSON.
 * @returns {T} - The typed object.
 */
export function validateTypes<T>({
  value,
  schema: inputSchema,
}: {
  value: unknown;
  schema: z.Schema<T, z.ZodTypeDef, any> | Validator<T>;
}): T {
  const result = safeValidateTypes({ value, schema: inputSchema });

  if (!result.success) {
    throw new TypeValidationError({ value, cause: result.error });
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
export function safeValidateTypes<T>({
  value,
  schema: inputSchema,
}: {
  value: unknown;
  schema: z.Schema<T, z.ZodTypeDef, any> | Validator<T>;
}):
  | { success: true; value: T }
  | { success: false; error: TypeValidationError } {
  const schema = isValidator(inputSchema)
    ? inputSchema
    : zodValidator(inputSchema);

  try {
    if (schema.validate == null) {
      return { success: true, value: value as T };
    }

    const validationResult = schema.validate(value);

    if (validationResult.success) {
      return validationResult;
    }

    return {
      success: false,
      error: new TypeValidationError({
        value,
        cause: validationResult.error,
      }),
    };
  } catch (error) {
    return {
      success: false,
      error: TypeValidationError.isTypeValidationError(error)
        ? error
        : new TypeValidationError({ value, cause: error }),
    };
  }
}
