import type { ProviderFailureReason } from '@ai-sdk/provider';

const marker = 'vercel.ai.gateway.error';
const symbol = Symbol.for(marker);

export abstract class GatewayError extends Error {
  private readonly [symbol] = true; // used in isInstance

  abstract readonly name: string;
  abstract readonly type: string;
  readonly statusCode: number;
  readonly cause?: unknown;
  readonly generationId?: string;
  readonly isRetryable: boolean;

  /**
   * Why the upstream provider rejected the request, when the gateway reports
   * it. See `APICallError.failureReason`.
   */
  readonly failureReason?: ProviderFailureReason;

  constructor({
    message,
    statusCode = 500,
    cause,
    generationId,
    isRetryable = statusCode != null &&
      (statusCode === 408 || // request timeout
        statusCode === 409 || // conflict
        statusCode === 429 || // too many requests
        statusCode >= 500), // server error
    failureReason,
  }: {
    message: string;
    statusCode?: number;
    cause?: unknown;
    generationId?: string;
    isRetryable?: boolean;
    failureReason?: ProviderFailureReason;
  }) {
    super(generationId ? `${message} [${generationId}]` : message);
    this.statusCode = statusCode;
    this.cause = cause;
    this.generationId = generationId;
    this.isRetryable = isRetryable;
    this.failureReason = failureReason;
  }

  /**
   * Checks if the given error is a Gateway Error.
   * @param {unknown} error - The error to check.
   * @returns {boolean} True if the error is a Gateway Error, false otherwise.
   */
  static isInstance(error: unknown): error is GatewayError {
    return GatewayError.hasMarker(error);
  }

  static hasMarker(error: unknown): error is GatewayError {
    return (
      typeof error === 'object' &&
      error !== null &&
      symbol in error &&
      (error as any)[symbol] === true
    );
  }
}
