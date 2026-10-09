import type { APICallError } from '@ai-sdk/provider';
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
    generationId,
    reason,
  }: {
    message?: string;
    statusCode?: number;
    cause?: unknown;
    generationId?: string;
    reason?: APICallError['reason'];
  } = {}) {
    super({
      message,
      statusCode,
      cause,
      generationId,
      reason,
    });
  }

  static isInstance(error: unknown): error is GatewayInternalServerError {
    return GatewayError.hasMarker(error) && symbol in error;
  }
}
