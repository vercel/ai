export class EmptyResponseBodyError extends Error {
  constructor({ message = 'Empty response body' }: { message?: string } = {}) {
    super(message);

    this.name = 'AI_EmptyResponseBodyError';
  }

  static isEmptyResponseBodyError(
    error: unknown,
  ): error is EmptyResponseBodyError {
    return error instanceof Error && error.name === 'AI_EmptyResponseBodyError';
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      stack: this.stack,
    };
  }
}
