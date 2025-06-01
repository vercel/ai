import { GatewayError } from './gateway-error';

const name = 'GatewayRateLimitError';
const marker = `vercel.ai.gateway.error.${name}`;
const symbol = Symbol.for(marker);

/**
 * Rate limit exceeded.
 */
export class GatewayRateLimitError extends GatewayError {
  private readonly [symbol] = true; // used in isInstance

  readonly name = name;
  readonly type = 'rate_limit_exceeded';

  constructor({
    message = 'Rate limit exceeded',
    statusCode = 429,
    cause,
  }: {
    message?: string;
    statusCode?: number;
    cause?: unknown;
  } = {}) {
    super({ message, statusCode, cause });
  }

  static isInstance(error: unknown): error is GatewayRateLimitError {
    return GatewayError.hasMarker(error) && symbol in error;
  }
}
