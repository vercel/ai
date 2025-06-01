import { GatewayError } from './gateway-error';

const name = 'GatewayInternalServerError';
const marker = `vercel.ai.gateway.error.${name}`;
const symbol = Symbol.for(marker);

/**
 * Internal server error from the Gateway
 */
export class GatewayInternalServerError extends GatewayError {
  private readonly [symbol] = true; // used in isInstance

  readonly name = name;
  readonly type = 'internal_server_error';

  constructor({
    message = 'Internal server error',
    statusCode = 500,
    cause,
  }: {
    message?: string;
    statusCode?: number;
    cause?: unknown;
  } = {}) {
    super({ message, statusCode, cause });
  }

  static isInstance(error: unknown): error is GatewayInternalServerError {
    return GatewayError.hasMarker(error) && symbol in error;
  }
}
