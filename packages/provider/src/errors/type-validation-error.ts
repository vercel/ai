import { AISDKError } from './ai-sdk-error';
import { getErrorMessage } from './get-error-message';

const name = 'AI_TypeValidationError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

export class TypeValidationError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  readonly value: unknown;

  constructor({ value, cause }: { value: unknown; cause: unknown }) {
    super({
      name,
      message:
        `Type validation failed: ` +
        `Value: ${JSON.stringify(value)}.\n` +
        `Error message: ${getErrorMessage(cause)}`,
      cause,
    });

    this.value = value;
  }

  static isInstance(error: unknown): error is TypeValidationError {
    return AISDKError.hasMarker(error, marker);
  }

  /**
   * Wraps an error into a TypeValidationError.
   * If the cause is already a TypeValidationError with the same value, it returns the cause.
   * Otherwise, it creates a new TypeValidationError.
   *
   * @param {Object} params - The parameters for wrapping the error.
   * @param {unknown} params.value - The value that failed validation.
   * @param {unknown} params.cause - The original error or cause of the validation failure.
   * @returns {TypeValidationError} A TypeValidationError instance.
   */
  static wrap({
    value,
    cause,
  }: {
    value: unknown;
    cause: unknown;
  }): TypeValidationError {
    return TypeValidationError.isInstance(cause) && cause.value === value
      ? cause
      : new TypeValidationError({ value, cause });
  }
}
