export class NoTextGeneratedError extends Error {
  readonly cause: unknown;

  constructor() {
    super(`No text generated.`);

    this.name = 'NoTextGeneratedError';
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
