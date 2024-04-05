export type RetryErrorReason =
  | 'maxRetriesExceeded'
  | 'errorNotRetryable'
  | 'abort';

export class RetryAIError extends Error {
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

    this.name = 'RetryAIError';
    this.reason = reason;
    this.errors = errors;

    // separate our last error to make debugging via log easier:
    this.lastError = errors[errors.length - 1];
  }

  static isRetryAIError(error: unknown): error is RetryAIError {
    return (
      error instanceof Error &&
      error.name === 'RetryAIError' &&
      typeof (error as RetryAIError).reason === 'string' &&
      Array.isArray((error as RetryAIError).errors)
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
