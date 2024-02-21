import { getErrorMessage } from '../util/get-error-message';

export class TypeValidationError extends Error {
  readonly value: unknown;
  readonly cause: unknown;

  constructor({ value, cause }: { value: unknown; cause: unknown }) {
    super(
      `Type validation failed: ` +
        `Value: ${JSON.stringify(value)}.\n` +
        `Error message: ${getErrorMessage(cause)}`,
    );

    this.name = 'TypeValidationError';

    this.cause = cause;
    this.value = value;
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
