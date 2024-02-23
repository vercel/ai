import { getErrorMessage } from '../../util/get-error-message';

export class ObjectValidationError extends Error {
  readonly cause: unknown;
  readonly valueText: string;
  readonly value: unknown;

  constructor({
    value,
    valueText,
    cause,
  }: {
    value: unknown;
    valueText: string;
    cause: unknown;
  }) {
    super(
      `Object validation failed. ` +
        `Value: ${valueText}.\n` +
        `Error message: ${getErrorMessage(cause)}`,
    );

    this.name = 'ObjectValidationError';

    this.cause = cause;
    this.value = value;
    this.valueText = valueText;
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      cause: this.cause,
      stack: this.stack,

      value: this.value,
      valueText: this.valueText,
    };
  }
}
