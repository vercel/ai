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
export async function validateTypes<OBJECT>({
  value,
  schema,
}: {
  value: unknown;
  schema: StandardSchemaV1<unknown, OBJECT> | Validator<OBJECT>;
}): Promise<OBJECT> {
  const result = await safeValidateTypes({ value, schema });

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
export async function safeValidateTypes<OBJECT>({
  value,
  schema,
}: {
  value: unknown;
  schema: StandardSchemaV1<unknown, OBJECT> | Validator<OBJECT>;
}): Promise<
  | {
      success: true;
      value: OBJECT;
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
      return { success: true, value: value as OBJECT, rawValue: value };
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
