import { getErrorMessage } from './get-error-message';

export class TypeValidationError extends Error {
  readonly value: unknown;
  readonly cause: unknown;

  constructor({ value, cause }: { value: unknown; cause: unknown }) {
    super(
      `Type validation failed: ` +
        `Value: ${JSON.stringify(value)}.\n` +
        `Error message: ${getErrorMessage(cause)}`,
    );

    this.name = 'AI_TypeValidationError';

    this.cause = cause;
    this.value = value;
  }

  static isTypeValidationError(error: unknown): error is TypeValidationError {
    return (
      error instanceof Error &&
      error.name === 'AI_TypeValidationError' &&
      typeof (error as TypeValidationError).value === 'string' &&
      typeof (error as TypeValidationError).cause === 'string'
    );
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      cause: this.cause,
      stack: this.stack,

      value: this.value,
    };
  }
}
