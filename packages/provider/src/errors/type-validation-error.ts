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
   * @deprecated use `isInstance` instead
   */
  static isTypeValidationError(error: unknown): error is TypeValidationError {
    return error instanceof Error && error.name === name;
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

      value: this.value,
    };
  }
}
