/**
Thrown when the AI provider fails to generate any content.
 */
export class NoContentGeneratedError extends Error {
  readonly cause: unknown;

  constructor({
    message = 'No content generated.',
  }: { message?: string } = {}) {
    super(message);

    this.name = 'AI_NoContentGeneratedError';
  }

  static isNoContentGeneratedError(
    error: unknown,
  ): error is NoContentGeneratedError {
    return (
      error instanceof Error && error.name === 'AI_NoContentGeneratedError'
    );
  }

  /**
   * @deprecated Do not use this method. It will be removed in the next major version.
   */
  toJSON() {
    return {
      name: this.name,
      cause: this.cause,
      message: this.message,
      stack: this.stack,
    };
  }
}
