export class InvalidDataContentAIError extends Error {
  readonly content: unknown;

  constructor({
    content,
    message = `Invalid data content. Expected a string, Uint8Array, ArrayBuffer, or Buffer, but got ${typeof content}.`,
  }: {
    content: unknown;
    message?: string;
  }) {
    super(message);

    this.name = 'InvalidDataContentAIError';

    this.content = content;
  }

  static isInvalidDataContentAIError(
    error: unknown,
  ): error is InvalidDataContentAIError {
    return (
      error instanceof Error &&
      error.name === 'InvalidDataContentAIError' &&
      (error as InvalidDataContentAIError).content != null
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
