export class NoResponseBodyAIError extends Error {
  constructor({ message = 'No response body' }: { message?: string } = {}) {
    super(message);

    this.name = 'NoResponseBodyAIError';
  }

  static isNoResponseBodyAIError(
    error: unknown,
  ): error is NoResponseBodyAIError {
    return error instanceof Error && error.name === 'NoResponseBodyAIError';
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      stack: this.stack,
    };
  }
}
