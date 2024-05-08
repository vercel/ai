import { TypeValidationError } from '@ai-sdk/provider';
import { ZodSchema } from 'zod';

/**
 * Validates the types of an unknown object using a schema and
 * return a strongly-typed object.
 *
 * @template T - The type of the object to validate.
 * @param {string} options.value - The object to validate.
 * @param {Schema<T>} options.schema - The schema to use for validating the JSON.
 * @returns {T} - The typed object.
 */
export function validateTypes<T>({
  value,
  schema,
}: {
  value: unknown;
  schema: ZodSchema<T>;
}): T {
  try {
    return schema.parse(value);
  } catch (error) {
    throw new TypeValidationError({ value, cause: error });
  }
}

/**
 * Safely validates the types of an unknown object using a schema and
 * return a strongly-typed object.
 *
 * @template T - The type of the object to validate.
 * @param {string} options.value - The JSON object to validate.
 * @param {Schema<T>} options.schema - The schema to use for validating the JSON.
 * @returns An object with either a `success` flag and the parsed and typed data, or a `success` flag and an error object.
 */
export function safeValidateTypes<T>({
  value,
  schema,
}: {
  value: unknown;
  schema: ZodSchema<T>;
}):
  | { success: true; value: T }
  | { success: false; error: TypeValidationError } {
  try {
    const validationResult = schema.safeParse(value);

    if (validationResult.success) {
      return {
        success: true,
        value: validationResult.data,
      };
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
