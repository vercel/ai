export class InvalidDataContentError extends Error {
  readonly content: unknown;

  constructor({
    content,
    message = `Invalid data content. Expected a string, Uint8Array, ArrayBuffer, or Buffer, but got ${typeof content}.`,
  }: {
    content: unknown;
    message?: string;
  }) {
    super(message);

    this.name = 'AI_InvalidDataContentError';

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

      content: this.content,
    };
  }
}
