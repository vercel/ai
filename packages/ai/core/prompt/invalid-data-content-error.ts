import { AISDKError } from '@ai-sdk/provider';

const marker = 'vercel.ai.error.invalid-data-content-error';
const symbol = Symbol.for(marker);

export class InvalidDataContentError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  readonly content: unknown;

  constructor({
    content,
    cause,
    message = `Invalid data content. Expected a base64 string, Uint8Array, ArrayBuffer, or Buffer, but got ${typeof content}.`,
  }: {
    content: unknown;
    cause?: unknown;
    message?: string;
  }) {
    super({
      name: 'AI_InvalidDataContentError',
      message,
      cause,
    });

    this.content = content;
  }

  static isInstance(error: unknown): error is InvalidDataContentError {
    return AISDKError.hasMarker(error, marker);
  }

  /**
   * @deprecated use `isInstance` instead
   */
  static isInvalidDataContentError(
    error: unknown,
  ): error is InvalidDataContentError {
    return (
      error instanceof Error &&
      error.name === 'AI_InvalidDataContentError' &&
      (error as InvalidDataContentError).content != null
    );
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      stack: this.stack,
      cause: this.cause,
      content: this.content,
    };
  }
}
