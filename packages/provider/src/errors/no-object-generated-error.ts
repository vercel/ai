/**
Thrown when the AI provider fails to generate a parsable object.
 */
export class NoObjectGeneratedError extends Error {
  readonly cause: unknown;

  constructor({ message = 'No object generated.' }: { message?: string } = {}) {
    super(message);

    this.name = 'AI_NoObjectGeneratedError';
  }

  static isNoObjectGeneratedError(
    error: unknown,
  ): error is NoObjectGeneratedError {
    return error instanceof Error && error.name === 'AI_NoObjectGeneratedError';
  }

  toJSON() {
    return {
      name: this.name,
      cause: this.cause,
      message: this.message,
      stack: this.stack,
    };
  }
}
