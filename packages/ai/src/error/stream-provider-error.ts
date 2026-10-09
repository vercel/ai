import { AISDKError, type APICallError } from '@ai-sdk/provider';

const name = 'AI_StreamProviderError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

/**
 * Error reported by a provider after a model response stream has started.
 */
export class StreamProviderError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  /**
   * Provider-defined error type, when supplied by the provider.
   */
  readonly type?: string;

  /**
   * Provider-defined error code, when supplied by the provider.
   */
  readonly code?: string | number;

  /**
   * HTTP-equivalent status code, when supplied by or inferable from the
   * provider error metadata.
   */
  readonly statusCode?: number;

  /**
   * Whether retrying the model call may succeed.
   */
  readonly isRetryable: boolean;

  /**
   * Why the provider rejected the request, when the provider adapter
   * recognizes the rejection. See `APICallError.reason`.
   */
  readonly reason?: APICallError['reason'];

  /**
   * Original provider error payload.
   */
  readonly data?: unknown;

  constructor({
    message,
    type,
    code,
    statusCode,
    isRetryable = isRetryableStatusCode(statusCode),
    reason,
    data,
    cause,
  }: {
    message: string;
    type?: string;
    code?: string | number;
    statusCode?: number;
    isRetryable?: boolean;
    reason?: APICallError['reason'];
    data?: unknown;
    cause?: unknown;
  }) {
    super({ name, message, cause });

    this.type = type;
    this.code = code;
    this.statusCode = statusCode;
    this.isRetryable = isRetryable;
    this.reason = reason;
    this.data = data;
  }

  static isInstance(error: unknown): error is StreamProviderError {
    return AISDKError.hasMarker(error, marker);
  }
}

function isRetryableStatusCode(statusCode: number | undefined): boolean {
  return (
    statusCode != null &&
    (statusCode === 408 ||
      statusCode === 409 ||
      statusCode === 429 ||
      statusCode >= 500)
  );
}
