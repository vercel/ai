import { AISDKError } from './ai-sdk-error';

const marker = 'vercel.ai.error.empty-response-body-error';
const symbol = Symbol.for(marker);

export class EmptyResponseBodyError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  constructor({ message = 'Empty response body' }: { message?: string } = {}) {
    super({
      name: 'AI_EmptyResponseBodyError',
      message,
    });
  }

  static isInstance(error: unknown): error is EmptyResponseBodyError {
    return AISDKError.hasMarker(error, marker);
  }

  /**
   * @deprecated use `isInstance` instead
   */
  static isEmptyResponseBodyError(
    error: unknown,
  ): error is EmptyResponseBodyError {
    return error instanceof Error && error.name === 'AI_EmptyResponseBodyError';
  }
}
