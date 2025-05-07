import type { StandardSchemaV1 } from '@standard-schema/spec'

/**
 * Used to mark validator functions so we can support both Zod and custom schemas.
 */
export const validatorSymbol = Symbol.for('vercel.ai.validator');

export type ValidationResult<T extends StandardSchemaV1> =
  | { success: true; value: StandardSchemaV1.SuccessResult<T>["value"] }
  | { success: false; error: Error };

export type Validator<T extends StandardSchemaV1> = {
  /**
   * Used to mark validator functions so we can support both Zod and custom schemas.
   */
  [validatorSymbol]: true;

  /**
   * Optional. Validates that the structure of a value matches this schema,
   * and returns a typed version of the value if it does.
   */
  readonly validate?: (value: StandardSchemaV1.InferInput<T>) => PromiseLike<ValidationResult<T>> | ValidationResult<T>;
};

/**
 * Create a validator.
 *
 * @param validate A validation function for the schema.
 */
export function validator<T extends StandardSchemaV1>(
  validate?: undefined | ((value: StandardSchemaV1.InferInput<T>) => PromiseLike<ValidationResult<T>> | ValidationResult<T>),
): Validator<T> {
  return { [validatorSymbol]: true, validate };
}

export function isValidator<T extends StandardSchemaV1>(value: unknown): value is Validator<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    validatorSymbol in value &&
    value[validatorSymbol] === true &&
    'validate' in value
  );
}

export function asValidator<T extends StandardSchemaV1>(
  schema: Validator<T> | T,
): Validator<T> {
  return isValidator<T>(schema) ? schema : standardSchemaValidator<T>(schema);
}

export function standardSchemaValidator<T extends StandardSchemaV1>(
  schema: T,
): Validator<T> {
  // @ts-expect-error
  return validator<T>(function validate(value: StandardSchemaV1.InferInput<T>) {
    const result = schema['~standard'].validate(value);
    // @ts-expect-error
    return result instanceof Promise ? result.then(toValidationResult) : toValidationResult(result)
  });
}

export function toValidationResult<T extends StandardSchemaV1>(
  result: StandardSchemaV1.Result<T>,
): ValidationResult<T> {
  if (result.issues) {
    return {
      success: false,
      error: Object.assign(new Error('validation error'), { issues: result.issues }),
    };
  }

  return { success: true, value: result.value };
}