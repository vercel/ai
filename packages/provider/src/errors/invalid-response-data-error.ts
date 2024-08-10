import { AISDKError } from './ai-sdk-error';

const name = 'AI_InvalidResponseDataError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

/**
 * Server returned a response with invalid data content.
 * This should be thrown by providers when they cannot parse the response from the API.
 */
export class InvalidResponseDataError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  readonly data: unknown;

  constructor({
    data,
    message = `Invalid response data: ${JSON.stringify(data)}.`,
  }: {
    data: unknown;
    message?: string;
  }) {
    super({ name, message });

    this.data = data;
  }

  static isInstance(error: unknown): error is InvalidResponseDataError {
    return AISDKError.hasMarker(error, marker);
  }

  /**
   * @deprecated use `isInstance` instead
   */
  static isInvalidResponseDataError(
    error: unknown,
  ): error is InvalidResponseDataError {
    return (
      error instanceof Error &&
      error.name === name &&
      (error as InvalidResponseDataError).data != null
    );
  }

  /**
   * @deprecated Do not use this method. It will be removed in the next major version.
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      stack: this.stack,

      data: this.data,
    };
  }
}
