import { AISDKError } from './ai-sdk-error';
import type { ProviderFailureReason } from './provider-failure-reason';

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
   * recognizes the rejection. See {@link ProviderFailureReason}.
   */
  readonly failureReason?: ProviderFailureReason;

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
    failureReason,
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
    failureReason?: ProviderFailureReason;
    data?: unknown;
  }) {
    super({ name, message, cause });

    this.url = url;
    this.requestBodyValues = requestBodyValues;
    this.statusCode = statusCode;
    this.responseHeaders = responseHeaders;
    this.responseBody = responseBody;
    this.isRetryable = isRetryable;
    this.failureReason = failureReason;
    this.data = data;
  }

  static isInstance(error: unknown): error is APICallError {
    return AISDKError.hasMarker(error, marker);
  }
}
