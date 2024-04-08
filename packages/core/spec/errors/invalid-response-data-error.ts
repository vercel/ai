/**
Server returned a response with invalid data content. This should be thrown by providers when they
cannot parse the response from the API.
 */
export class InvalidResponseDataError extends Error {
  readonly data: unknown;

  constructor({
    data,
    message = `Invalid response data: ${JSON.stringify(data)}.`,
  }: {
    data: unknown;
    message?: string;
  }) {
    super(message);

    this.name = 'AI_InvalidResponseDataError';

    this.data = data;
  }

  static isInvalidResponseDataError(
    error: unknown,
  ): error is InvalidResponseDataError {
    return (
      error instanceof Error &&
      error.name === 'AI_InvalidResponseDataError' &&
      (error as InvalidResponseDataError).data != null
    );
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      stack: this.stack,

      data: this.data,
    };
  }
}
