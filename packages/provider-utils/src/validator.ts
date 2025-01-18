import { z } from 'zod';

/**
 * Used to mark validator functions so we can support both Zod and custom schemas.
 */
export const validatorSymbol = Symbol.for('vercel.ai.validator');

export type ValidationResult<OUTPUT, INPUT = OUTPUT> =
  | { success: true; value: OUTPUT; rawValue: INPUT }
  | { success: false; error: Error };

export type Validator<OUTPUT = unknown, INPUT = OUTPUT> = {
  /**
   * Used to mark validator functions so we can support both Zod and custom schemas.
   */
  [validatorSymbol]: true;

  /**
   * Optional. Validates that the structure of a value matches this schema,
   * and returns a typed version of the value if it does.
   * @param value - The value to validate
   * @returns A validation result containing both the transformed value and original input
   */
  readonly validate?: (value: unknown) => ValidationResult<OUTPUT, INPUT>;
};

/**
 * Create a validator.
 *
 * @template OUTPUT - The output type after validation/transformation
 * @template INPUT - The input type before validation/transformation
 * @param validate A validation function for the schema.
 */
export function validator<OUTPUT, INPUT = OUTPUT>(
  validate?: undefined | ((value: unknown) => ValidationResult<OUTPUT, INPUT>),
): Validator<OUTPUT, INPUT> {
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

export function asValidator<OUTPUT, INPUT>(
  value: Validator<OUTPUT, INPUT> | z.Schema<OUTPUT, z.ZodTypeDef, INPUT>,
): Validator<OUTPUT, INPUT> {
  return isValidator(value) ? value : zodValidator(value);
}

export function zodValidator<OUTPUT, INPUT>(
  zodSchema: z.Schema<OUTPUT, z.ZodTypeDef, INPUT>,
): Validator<OUTPUT, INPUT> {
  return validator(value => {
    const result = zodSchema.safeParse(value);
    return result.success
      ? { success: true, value: result.data, rawValue: value as INPUT }
      : { success: false, error: result.error };
  });
}
