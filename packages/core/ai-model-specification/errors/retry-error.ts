export type RetryErrorReason =
  | 'maxRetriesExceeded'
  | 'errorNotRetryable'
  | 'abort';

export class RetryError extends Error {
  // note: property order determines debugging output
  readonly reason: RetryErrorReason;
  readonly lastError: unknown;
  readonly errors: Array<unknown>;

  constructor({
    message,
    reason,
    errors,
  }: {
    message: string;
    reason: RetryErrorReason;
    errors: Array<unknown>;
  }) {
    super(message);

    this.name = 'AI_RetryError';
    this.reason = reason;
    this.errors = errors;

    // separate our last error to make debugging via log easier:
    this.lastError = errors[errors.length - 1];
  }

  static isRetryError(error: unknown): error is RetryError {
    return (
      error instanceof Error &&
      error.name === 'AI_RetryError' &&
      typeof (error as RetryError).reason === 'string' &&
      Array.isArray((error as RetryError).errors)
    );
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      reason: this.reason,
      lastError: this.lastError,
      errors: this.errors,
    };
  }
}
