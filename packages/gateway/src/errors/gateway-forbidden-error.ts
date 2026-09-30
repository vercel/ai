import { z } from 'zod/v4';
import { GatewayError } from './gateway-error';
import { lazyValidator, zodSchema } from '@ai-sdk/provider-utils';

const name = 'GatewayForbiddenError';
const marker = `vercel.ai.gateway.error.${name}`;
const symbol = Symbol.for(marker);

export const forbiddenParamSchema = lazyValidator(() =>
  zodSchema(
    z.object({
      ruleId: z.string(),
    }),
  ),
);

/**
 * Forbidden - the request was rejected by policy (e.g. a routing rule),
 * not an authentication failure.
 */
export class GatewayForbiddenError extends GatewayError {
  private readonly [symbol] = true; // used in isInstance

  readonly name = name;
  readonly type = 'forbidden';
  readonly ruleId?: string;

  constructor({
    message = 'Forbidden',
    statusCode = 403,
    cause,
    ruleId,
  }: {
    message?: string;
    statusCode?: number;
    cause?: unknown;
    ruleId?: string;
  } = {}) {
    super({ message, statusCode, cause });
    this.ruleId = ruleId;
  }

  static isInstance(error: unknown): error is GatewayForbiddenError {
    return GatewayError.hasMarker(error) && symbol in error;
  }
}
