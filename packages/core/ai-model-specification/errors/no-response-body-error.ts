export class NoResponseBodyError extends Error {
  constructor({ message = 'No response body' }: { message?: string } = {}) {
    super(message);

    this.name = 'AI_NoResponseBodyError';
  }

  static isNoResponseBodyError(error: unknown): error is NoResponseBodyError {
    return error instanceof Error && error.name === 'AI_NoResponseBodyError';
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      stack: this.stack,
    };
  }
}
