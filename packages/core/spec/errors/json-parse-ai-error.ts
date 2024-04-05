import { getErrorMessage } from '../util/get-error-message';

export class JSONParseAIError extends Error {
  // note: property order determines debugging output
  readonly text: string;
  readonly cause: unknown;

  constructor({ text, cause }: { text: string; cause: unknown }) {
    super(
      `JSON parsing failed: ` +
        `Text: ${text}.\n` +
        `Error message: ${getErrorMessage(cause)}`,
    );

    this.name = 'JSONParseAIError';

    this.cause = cause;
    this.text = text;
  }

  static isJSONParseAIError(error: unknown): error is JSONParseAIError {
    return (
      error instanceof Error &&
      error.name === 'JSONParseAIError' &&
      typeof (error as JSONParseAIError).text === 'string' &&
      typeof (error as JSONParseAIError).cause === 'string'
    );
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      cause: this.cause,
      stack: this.stack,

      valueText: this.text,
    };
  }
}
