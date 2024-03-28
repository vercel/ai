export class NoTextGeneratedError extends Error {
  readonly cause: unknown;

  constructor() {
    super(`No text generated.`);

    this.name = 'AI_NoTextGeneratedError';
  }

  static isNoTextGeneratedError(error: unknown): error is NoTextGeneratedError {
    return error instanceof Error && error.name === 'AI_NoTextGeneratedError';
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
