import { TypeValidationError } from '@ai-sdk/provider';
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
  }: {
    message?: string;
    statusCode?: number;
    response?: unknown;
    validationError?: TypeValidationError;
    cause?: unknown;
  } = {}) {
    super({ message, statusCode, cause });
    this.response = response;
    this.validationError = validationError;
  }

  static isInstance(error: unknown): error is GatewayResponseError {
    return GatewayError.hasMarker(error) && symbol in error;
  }
}
