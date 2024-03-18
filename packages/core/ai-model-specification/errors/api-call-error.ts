export class APICallError extends Error {
  readonly url: string;
  readonly requestBodyValues: unknown;
  readonly statusCode?: number;
  readonly responseBody?: string;
  readonly cause?: unknown;
  readonly isRetryable: boolean;
  readonly data?: unknown;

  constructor({
    message,
    url,
    requestBodyValues,
    statusCode,
    responseBody,
    cause,
    isRetryable = statusCode != null &&
      (statusCode === 408 || // request timeout
        statusCode === 409 || // conflict
        statusCode === 429 || // too many requests
        statusCode >= 500), // server error
    data,
  }: {
    message: string;
    url: string;
    requestBodyValues: unknown;
    statusCode?: number;
    responseBody?: string;
    cause?: unknown;
    isRetryable?: boolean;
    data?: unknown;
  }) {
    super(message);

    this.name = 'AI_APICallError';

    this.url = url;
    this.requestBodyValues = requestBodyValues;
    this.statusCode = statusCode;
    this.responseBody = responseBody;
    this.cause = cause;
    this.isRetryable = isRetryable;
    this.data = data;
  }

  static isAPICallError(error: unknown): error is APICallError {
    return (
      error instanceof Error &&
      error.name === 'AI_APICallError' &&
      typeof (error as APICallError).url === 'string' &&
      typeof (error as APICallError).requestBodyValues === 'object' &&
      ((error as APICallError).statusCode == null ||
        typeof (error as APICallError).statusCode === 'number') &&
      ((error as APICallError).responseBody == null ||
        typeof (error as APICallError).responseBody === 'string') &&
      ((error as APICallError).cause == null ||
        typeof (error as APICallError).cause === 'object') &&
      typeof (error as APICallError).isRetryable === 'boolean' &&
      ((error as APICallError).data == null ||
        typeof (error as APICallError).data === 'object')
    );
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      url: this.url,
      requestBodyValues: this.requestBodyValues,
      statusCode: this.statusCode,
      responseBody: this.responseBody,
      cause: this.cause,
      isRetryable: this.isRetryable,
      data: this.data,
    };
  }
}
