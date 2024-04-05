export class NoTextGeneratedAIError extends Error {
  readonly cause: unknown;

  constructor() {
    super(`No text generated.`);

    this.name = 'NoTextGeneratedAIError';
  }

  static isNoTextGeneratedAIError(
    error: unknown,
  ): error is NoTextGeneratedAIError {
    return error instanceof Error && error.name === 'NoTextGeneratedAIError';
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
