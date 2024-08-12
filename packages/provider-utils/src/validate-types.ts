import { TypeValidationError } from '@ai-sdk/provider';
import { z } from 'zod';
import { NoValidatorError } from './no-validator-error';
import { Validator, asValidator } from './validator';

/**
 * Validates the types of an unknown object using a schema and
 * return a strongly-typed object.
 *
 * @template T - The type of the object to validate.
 * @param {string} options.value - The object to validate.
 * @param {Validator<T>} options.schema - The schema to use for validating the JSON.
 * @param {boolean} options.throwIfNoValidator - Whether to throw an error if no validator is defined.
 * @returns {T} - The typed object.
 */
export function validateTypes<T>({
  value,
  schema,
  throwIfNoValidator,
}: {
  value: unknown;
  schema: z.Schema<T, z.ZodTypeDef, any> | Validator<T>;
  throwIfNoValidator?: boolean;
}): T {
  const result = safeValidateTypes({ value, schema, throwIfNoValidator });

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
 * @param {boolean} options.throwIfNoValidator - Whether to throw an error if no validator is defined.
 * @returns An object with either a `success` flag and the parsed and typed data, or a `success` flag and an error object.
 */
export function safeValidateTypes<T>({
  value,
  schema,
  throwIfNoValidator = false,
}: {
  value: unknown;
  schema: z.Schema<T, z.ZodTypeDef, any> | Validator<T>;
  throwIfNoValidator?: boolean;
}):
  | { success: true; value: T }
  | { success: false; error: TypeValidationError } {
  const validator = asValidator(schema);

  if (validator.validate == null) {
    if (throwIfNoValidator) {
      throw new NoValidatorError({ value, validator });
    }

    return { success: true, value: value as T };
  }

  try {
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
