import { AISDKError } from './ai-sdk-error';
import { getErrorMessage } from './get-error-message';

const marker = 'vercel.ai.error.json-parse-error';
const symbol = Symbol.for(marker);

export class JSONParseError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  // note: property order determines debugging output
  readonly text: string;
  readonly cause: unknown;

  constructor({ text, cause }: { text: string; cause: unknown }) {
    super({
      name: 'AI_JSONParseError',
      message:
        `JSON parsing failed: ` +
        `Text: ${text}.\n` +
        `Error message: ${getErrorMessage(cause)}`,
      cause,
    });

    this.text = text;
  }

  static isInstance(error: unknown): error is JSONParseError {
    return AISDKError.hasMarker(error, marker);
  }

  /**
   * @deprecated use `isInstance` instead
   */
  static isJSONParseError(error: unknown): error is JSONParseError {
    return (
      error instanceof Error &&
      error.name === 'AI_JSONParseError' &&
      typeof (error as JSONParseError).text === 'string' &&
      typeof (error as JSONParseError).cause === 'string'
    );
  }

  /**
   * @deprecated Do not use this method. It will be removed in the next major version.
   */
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
