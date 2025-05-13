import { TypeValidationError } from '@ai-sdk/provider';
import type { StandardSchemaV1 } from '@standard-schema/spec';
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
export async function validateTypes<T_OBJECT>({
  value,
  schema,
}: {
  value: T_OBJECT;
  schema: StandardSchemaV1<T_OBJECT> | Validator<T_OBJECT>;
}): Promise<T_OBJECT> {
  const result = await safeValidateTypes({ value, schema: schema });

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
export async function safeValidateTypes<T_OBJECT>({
  value,
  schema,
}: {
  value: T_OBJECT;
  schema: StandardSchemaV1<T_OBJECT> | Validator<T_OBJECT>;
}): Promise<
  | {
    success: true;
    value: T_OBJECT;
    rawValue: unknown;
  }
  | {
    success: false;
    error: TypeValidationError;
    rawValue: unknown;
  }
> {
  const validator = asValidator(schema);

  try {
    if (validator.validate == null) {
      return { success: true, value, rawValue: value };
    }

    const result = await validator.validate(value);

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
