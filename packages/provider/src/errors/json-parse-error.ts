import { getErrorMessage } from './get-error-message';

export class JSONParseError extends Error {
  // note: property order determines debugging output
  readonly text: string;
  readonly cause: unknown;

  constructor({ text, cause }: { text: string; cause: unknown }) {
    super(
      `JSON parsing failed: ` +
        `Text: ${text}.\n` +
        `Error message: ${getErrorMessage(cause)}`,
    );

    this.name = 'AI_JSONParseError';

    this.cause = cause;
    this.text = text;
  }

  static isJSONParseError(error: unknown): error is JSONParseError {
    return (
      error instanceof Error &&
      error.name === 'AI_JSONParseError' &&
      typeof (error as JSONParseError).text === 'string' &&
      typeof (error as JSONParseError).cause === 'string'
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
