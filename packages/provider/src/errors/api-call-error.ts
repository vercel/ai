import { AISDKError } from './ai-sdk-error';

const name = 'AI_APICallError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

export class APICallError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  readonly url: string;
  readonly requestBodyValues: unknown;
  readonly statusCode?: number;

  readonly responseHeaders?: Record<string, string>;
  readonly responseBody?: string;

  readonly isRetryable: boolean;

  /**
   * Why the provider rejected the request, when the provider adapter
   * recognizes the rejection:
   *
   * - `context-length-exceeded`: the input plus the reserved output tokens
   *   exceed the model's context window. Retrying the same request will not
   *   succeed; shortening the input or lowering `maxOutputTokens` may.
   */
  readonly reason?: 'context-length-exceeded';

  readonly data?: unknown;

  constructor({
    message,
    url,
    requestBodyValues,
    statusCode,
    responseHeaders,
    responseBody,
    cause,
    isRetryable = statusCode != null &&
      (statusCode === 408 || // request timeout
        statusCode === 409 || // conflict
        statusCode === 429 || // too many requests
        statusCode >= 500), // server error
    reason,
    data,
  }: {
    message: string;
    url: string;
    requestBodyValues: unknown;
    statusCode?: number;
    responseHeaders?: Record<string, string>;
    responseBody?: string;
    cause?: unknown;
    isRetryable?: boolean;
    reason?: 'context-length-exceeded';
    data?: unknown;
  }) {
    super({ name, message, cause });

    this.url = url;
    this.requestBodyValues = requestBodyValues;
    this.statusCode = statusCode;
    this.responseHeaders = responseHeaders;
    this.responseBody = responseBody;
    this.isRetryable = isRetryable;
    this.reason = reason;
    this.data = data;
  }

  static isInstance(error: unknown): error is APICallError {
    return AISDKError.hasMarker(error, marker);
  }
}
