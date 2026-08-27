import type { TypeValidationError } from '@ai-sdk/provider';
import { GatewayError } from './gateway-error';

const name = 'GatewayResponseError';
const marker = `vercel.ai.gateway.error.${name}`;
const symbol = Symbol.for(marker);

/**
 * Gateway response parsing error
 */
export class GatewayResponseError extends GatewayError {
  private readonly [symbol] = true; // used in isInstance

  readonly name = name;
  readonly type = 'response_error';
  readonly response?: unknown;
  readonly validationError?: TypeValidationError;

  constructor({
    message = 'Invalid response from Gateway',
    statusCode = 502,
    response,
    validationError,
    cause,
<<<<<<< HEAD
=======
    generationId,
    isRetryable,
>>>>>>> cc23556703 (Backport: fix: mark response body network errors as retryable (#19896))
  }: {
    message?: string;
    statusCode?: number;
    response?: unknown;
    validationError?: TypeValidationError;
    cause?: unknown;
<<<<<<< HEAD
  } = {}) {
    super({ message, statusCode, cause });
=======
    generationId?: string;
    isRetryable?: boolean;
  } = {}) {
    super({ message, statusCode, cause, generationId, isRetryable });
>>>>>>> cc23556703 (Backport: fix: mark response body network errors as retryable (#19896))
    this.response = response;
    this.validationError = validationError;
  }

  static isInstance(error: unknown): error is GatewayResponseError {
    return GatewayError.hasMarker(error) && symbol in error;
  }
}
