import { TypeValidationError } from '@ai-sdk/provider';
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { Validator, asValidator } from './validator';

type MyObject = { ok: boolean }
type Schema = StandardSchemaV1<MyObject>;
type Funk = StandardSchemaV1.InferOutput<Schema>

/**
 * Validates the types of an unknown object using a schema and
 * return a strongly-typed object.
 *
 * @template T - The type of the object to validate.
 * @param {string} options.value - The object to validate.
 * @param {Validator<T>} options.schema - The schema to use for validating the JSON.
 * @returns {Promise<T>} - The typed object.
 */
export async function validateTypes<T extends StandardSchemaV1>({
  value,
  schema,
}: {
  value: unknown;
  schema: StandardSchemaV1<T> | Validator<T>;
}): Promise<StandardSchemaV1.InferOutput<T>> {
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
export async function safeValidateTypes<T extends StandardSchemaV1>({
  value,
  schema,
}: {
  value: unknown;
  schema: StandardSchemaV1<T> | Validator<T>;
}): Promise<
  | { success: true; value: StandardSchemaV1.InferOutput<T>; rawValue: unknown }
  | { success: false; error: TypeValidationError; rawValue: unknown }
> {
  const validator = asValidator(schema);

  try {
    if (validator.validate == null) {
      return { success: true, value: value as T, rawValue: value };
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
