import { GatewayError } from './gateway-error';

const name = 'GatewayAuthenticationError';
const marker = `vercel.ai.gateway.error.${name}`;
const symbol = Symbol.for(marker);

/**
 * Authentication failed - invalid API key or OIDC token
 */
export class GatewayAuthenticationError extends GatewayError {
  private readonly [symbol] = true; // used in isInstance

  readonly name = name;
  readonly type = 'authentication_error';

  constructor({
    message = 'Authentication failed',
    statusCode = 401,
    cause,
  }: {
    message?: string;
    statusCode?: number;
    cause?: unknown;
  } = {}) {
    super({ message, statusCode, cause });
  }

  static isInstance(error: unknown): error is GatewayAuthenticationError {
    return GatewayError.hasMarker(error) && symbol in error;
  }
}
