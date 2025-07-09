import { TypeValidationError } from '@ai-sdk/provider';
import { StandardSchemaV1 } from '@standard-schema/spec';

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
  readonly validate?: (
    value: unknown,
  ) => ValidationResult<OBJECT> | PromiseLike<ValidationResult<OBJECT>>;
};

/**
 * Create a validator.
 *
 * @param validate A validation function for the schema.
 */
export function validator<OBJECT>(
  validate?:
    | undefined
    | ((
        value: unknown,
      ) => ValidationResult<OBJECT> | PromiseLike<ValidationResult<OBJECT>>),
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
  value: Validator<OBJECT> | StandardSchemaV1<unknown, OBJECT>,
): Validator<OBJECT> {
  return isValidator(value) ? value : standardSchemaValidator(value);
}

export function standardSchemaValidator<OBJECT>(
  standardSchema: StandardSchemaV1<unknown, OBJECT>,
): Validator<OBJECT> {
  return validator(async value => {
    const result = await standardSchema['~standard'].validate(value);

    return result.issues == null
      ? { success: true, value: result.value }
      : {
          success: false,
          error: new TypeValidationError({
            value,
            cause: result.issues,
          }),
        };
  });
}
