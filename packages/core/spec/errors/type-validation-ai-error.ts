import { getErrorMessage } from '../util/get-error-message';

export class TypeValidationAIError extends Error {
  readonly value: unknown;
  readonly cause: unknown;

  constructor({ value, cause }: { value: unknown; cause: unknown }) {
    super(
      `Type validation failed: ` +
        `Value: ${JSON.stringify(value)}.\n` +
        `Error message: ${getErrorMessage(cause)}`,
    );

    this.name = 'TypeValidationAIError';

    this.cause = cause;
    this.value = value;
  }

  static isTypeValidationAIError(
    error: unknown,
  ): error is TypeValidationAIError {
    return (
      error instanceof Error &&
      error.name === 'TypeValidationAIError' &&
      typeof (error as TypeValidationAIError).value === 'string' &&
      typeof (error as TypeValidationAIError).cause === 'string'
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
