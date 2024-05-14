export class InvalidDataContentError extends Error {
  readonly content: unknown;
  readonly cause?: unknown;

  constructor({
    content,
    cause,
    message = `Invalid data content. Expected a base64 string, Uint8Array, ArrayBuffer, or Buffer, but got ${typeof content}.`,
  }: {
    content: unknown;
    cause?: unknown;
    message?: string;
  }) {
    super(message);

    this.name = 'AI_InvalidDataContentError';

    this.cause = cause;
    this.content = content;
  }

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
