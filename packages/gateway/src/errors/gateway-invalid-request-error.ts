import { GatewayError } from './gateway-error';

const name = 'GatewayInvalidRequestError';
const marker = `vercel.ai.gateway.error.${name}`;
const symbol = Symbol.for(marker);

/**
 * Invalid request - missing headers, malformed data, etc.
 */
export class GatewayInvalidRequestError extends GatewayError {
  private readonly [symbol] = true; // used in isInstance

  readonly name = name;
  readonly type = 'invalid_request_error';

  constructor({
    message = 'Invalid request',
    statusCode = 400,
    cause,
  }: {
    message?: string;
    statusCode?: number;
    cause?: unknown;
  } = {}) {
    super({ message, statusCode, cause });
  }

  static isInstance(error: unknown): error is GatewayInvalidRequestError {
    return GatewayError.hasMarker(error) && symbol in error;
  }
}
