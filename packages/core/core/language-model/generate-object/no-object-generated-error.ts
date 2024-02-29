export class NoObjectGeneratedError extends Error {
  readonly cause: unknown;

  constructor() {
    super(`No object generated.`);

    this.name = 'NoObjectGeneratedError';
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
