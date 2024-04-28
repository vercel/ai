export class NoObjectGeneratedError extends Error {
  readonly cause: unknown;

  constructor() {
    super(`No object generated.`);

    this.name = 'AI_NoObjectGeneratedError';
  }

  static isNoTextGeneratedError(
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
