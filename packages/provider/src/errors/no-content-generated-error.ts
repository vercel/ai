import { AISDKError } from './ai-sdk-error';

const marker = 'vercel.ai.error.no-content-generated-error';
const symbol = Symbol.for(marker);

/**
Thrown when the AI provider fails to generate any content.
 */
export class NoContentGeneratedError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  constructor({
    message = 'No content generated.',
  }: { message?: string } = {}) {
    super({
      name: 'AI_NoContentGeneratedError',
      message,
    });
  }

  static isInstance(error: unknown): error is NoContentGeneratedError {
    return AISDKError.hasMarker(error, marker);
  }

  /**
   * @deprecated Use isInstance instead.
   */
  static isNoContentGeneratedError(
    error: unknown,
  ): error is NoContentGeneratedError {
    return (
      error instanceof Error && error.name === 'AI_NoContentGeneratedError'
    );
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
