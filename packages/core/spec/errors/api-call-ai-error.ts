export class APICallAIError extends Error {
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

    this.name = 'APICallAIError';

    this.url = url;
    this.requestBodyValues = requestBodyValues;
    this.statusCode = statusCode;
    this.responseBody = responseBody;
    this.cause = cause;
    this.isRetryable = isRetryable;
    this.data = data;
  }

  static isAPICallAIError(error: unknown): error is APICallAIError {
    return (
      error instanceof Error &&
      error.name === 'APICallAIError' &&
      'url' in error &&
      typeof error.url === 'string' &&
      typeof (error as APICallAIError).requestBodyValues === 'object' &&
      ((error as APICallAIError).statusCode == null ||
        typeof (error as APICallAIError).statusCode === 'number') &&
      ((error as APICallAIError).responseBody == null ||
        typeof (error as APICallAIError).responseBody === 'string') &&
      ((error as APICallAIError).cause == null ||
        typeof (error as APICallAIError).cause === 'object') &&
      typeof (error as APICallAIError).isRetryable === 'boolean' &&
      ((error as APICallAIError).data == null ||
        typeof (error as APICallAIError).data === 'object')
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
