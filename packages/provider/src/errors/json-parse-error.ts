import { AISDKError } from './ai-sdk-error';
import { getErrorMessage } from './get-error-message';

const name = 'AI_JSONParseError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

export class JSONParseError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  readonly text: string;

  constructor({ text, cause }: { text: string; cause: unknown }) {
    super({
      name,
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
      error.name === name &&
      'text' in error &&
      typeof error.text === 'string'
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
