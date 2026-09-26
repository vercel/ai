import { GatewayError } from './gateway-error';

const name = 'GatewayNotFoundError';
const marker = `vercel.ai.gateway.error.${name}`;
const symbol = Symbol.for(marker);

/**
 * Not found - the requested Gateway resource does not exist or is not
 * visible to the caller (e.g. an unknown async batch/video job id).
 * Distinct from `GatewayModelNotFoundError`, which is model-specific.
 */
export class GatewayNotFoundError extends GatewayError {
  private readonly [symbol] = true; // used in isInstance

  readonly name = name;
  readonly type = 'not_found';

  constructor({
    message = 'Resource not found',
    statusCode = 404,
    cause,
    generationId,
  }: {
    message?: string;
    statusCode?: number;
    cause?: unknown;
    generationId?: string;
  } = {}) {
    super({ message, statusCode, cause, generationId });
  }

  static isInstance(error: unknown): error is GatewayNotFoundError {
    return GatewayError.hasMarker(error) && symbol in error;
  }
}
