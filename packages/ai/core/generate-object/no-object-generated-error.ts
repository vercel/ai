import { AISDKError } from '@ai-sdk/provider';

const name = 'AI_NoObjectGeneratedError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

/**
Thrown when the AI provider fails to generate a parsable object.
 */
export class NoObjectGeneratedError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  constructor({ message = 'No object generated.' }: { message?: string } = {}) {
    super({ name, message });
  }

  static isInstance(error: unknown): error is NoObjectGeneratedError {
    return AISDKError.hasMarker(error, marker);
  }

  /**
   * @deprecated Use isInstance instead.
   */
  static isNoObjectGeneratedError(
    error: unknown,
  ): error is NoObjectGeneratedError {
    return error instanceof Error && error.name === name;
  }

  /**
   * @deprecated Do not use this method. It will be removed in the next major version.
   */
  toJSON() {
    return {
      name: this.name,
      cause: this.cause,
      message: this.message,
      stack: this.stack,
    };
  }
}
