/**
Server returned a response with invalid data content. This should be thrown by providers when they
cannot parse the response from the API.
 */
export class InvalidResponseDataAIError extends Error {
  readonly data: unknown;

  constructor({
    data,
    message = `Invalid response data: ${JSON.stringify(data)}.`,
  }: {
    data: unknown;
    message?: string;
  }) {
    super(message);

    this.name = 'InvalidResponseDataAIError';

    this.data = data;
  }

  static isInvalidResponseDataAIError(
    error: unknown,
  ): error is InvalidResponseDataAIError {
    return (
      error instanceof Error &&
      error.name === 'InvalidResponseDataAIError' &&
      (error as InvalidResponseDataAIError).data != null
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
