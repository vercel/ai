import { getErrorMessage } from '../../util/get-error-message';

export class ObjectParseError extends Error {
  readonly cause: unknown;
  readonly valueText: string;

  constructor({ valueText, cause }: { valueText: string; cause: unknown }) {
    super(
      `Object parsing failed. ` +
        `Value: ${valueText}.\n` +
        `Error message: ${getErrorMessage(cause)}`,
    );

    this.name = 'ObjectParseError';

    this.cause = cause;
    this.valueText = valueText;
  }

  toJSON() {
    return {
      name: this.name,
      cause: this.cause,
      message: this.message,
      stack: this.stack,

      valueText: this.valueText,
    };
  }
}
