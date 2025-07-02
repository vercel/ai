import { z } from 'zod/v4';
import { GatewayError } from './gateway-error';

const name = 'GatewayModelNotFoundError';
const marker = `vercel.ai.gateway.error.${name}`;
const symbol = Symbol.for(marker);

export const modelNotFoundParamSchema = z.object({
  modelId: z.string(),
});

/**
 * Model not found or not available
 */
export class GatewayModelNotFoundError extends GatewayError {
  private readonly [symbol] = true; // used in isInstance

  readonly name = name;
  readonly type = 'model_not_found';
  readonly modelId?: string;

  constructor({
    message = 'Model not found',
    statusCode = 404,
    modelId,
    cause,
  }: {
    message?: string;
    statusCode?: number;
    modelId?: string;
    cause?: unknown;
  } = {}) {
    super({ message, statusCode, cause });
    this.modelId = modelId;
  }

  static isInstance(error: unknown): error is GatewayModelNotFoundError {
    return GatewayError.hasMarker(error) && symbol in error;
  }
}
