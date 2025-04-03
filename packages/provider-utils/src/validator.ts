import { StandardSchemaV1 } from '@standard-schema/spec';
import { z } from 'zod';

/**
 * Used to mark validator functions so we can support both Zod and custom schemas.
 */
export const validatorSymbol = Symbol.for('vercel.ai.validator');

export type ValidationResult<OBJECT> =
  | { success: true; value: OBJECT }
  | { success: false; error: Error };

export type Validator<OBJECT = unknown> = {
  /**
   * Used to mark validator functions so we can support both Zod and custom schemas.
   */
  [validatorSymbol]: true;

  /**
   * Optional. Validates that the structure of a value matches this schema,
   * and returns a typed version of the value if it does.
   */
  readonly validate?: (value: unknown) => ValidationResult<OBJECT>;
};

/**
 * Create a validator.
 *
 * @param validate A validation function for the schema.
 */
export function validator<OBJECT>(
  validate?: undefined | ((value: unknown) => ValidationResult<OBJECT>),
): Validator<OBJECT> {
  return { [validatorSymbol]: true, validate };
}

export function isValidator(value: unknown): value is Validator {
  return (
    typeof value === 'object' &&
    value !== null &&
    validatorSymbol in value &&
    value[validatorSymbol] === true &&
    'validate' in value
  );
}

export function asValidator<OBJECT>(
  value:
    | Validator<OBJECT>
    | StandardSchemaV1<OBJECT>
    | z.Schema<OBJECT, z.ZodTypeDef, any>,
): Validator<OBJECT> {
  return isValidator(value) ? value : zodValidator(value);
}

export function zodValidator<OBJECT>(
  zodSchema: z.Schema<OBJECT, z.ZodTypeDef, any>,
): Validator<OBJECT> {
  return validator(value => {
    const result = zodSchema.safeParse(value);
    return result.success
      ? { success: true, value: result.data }
      : { success: false, error: result.error };
  });
}

export function standardSchemaValidator<OBJECT>(
  standardSchema: StandardSchemaV1<OBJECT>,
): Validator<OBJECT> {
  return validator(value => {
    let result = standardSchema['~standard'].validate(value);
    if (result instanceof Promise) result = await result;

    return result.success
      ? { success: true, value: result.data }
      : { success: false, error: result.error };
  });
}

export async function standardValidate<T extends StandardSchemaV1>(
  schema: T,
  input: StandardSchemaV1.InferInput<T>,
): Promise<StandardSchemaV1.InferOutput<T>> {
  let result = schema['~standard'].validate(input);
  if (result instanceof Promise) result = await result;

  // if the `issues` field exists, the validation failed
  if (result.issues) {
    throw new Error(JSON.stringify(result.issues, null, 2));
  }

  return result.value;
}
