import { z } from 'zod/v4';
import { GatewayError } from './gateway-error';
import { lazySchema, zodSchema } from '@ai-sdk/provider-utils';

const name = 'GatewayForbiddenError';
const marker = `vercel.ai.gateway.error.${name}`;
const symbol = Symbol.for(marker);

export const forbiddenParamSchema = lazySchema(() =>
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
<<<<<<< HEAD
=======
    generationId,
    ruleId,
>>>>>>> 2bfb16aff2 (Backport: feat(gateway): expose ruleId on GatewayForbiddenError so callers can identify which routing rule denied a request (#16936))
  }: {
    message?: string;
    statusCode?: number;
    cause?: unknown;
<<<<<<< HEAD
  } = {}) {
    super({ message, statusCode, cause });
=======
    generationId?: string;
    ruleId?: string;
  } = {}) {
    super({ message, statusCode, cause, generationId });
    this.ruleId = ruleId;
>>>>>>> 2bfb16aff2 (Backport: feat(gateway): expose ruleId on GatewayForbiddenError so callers can identify which routing rule denied a request (#16936))
  }

  static isInstance(error: unknown): error is GatewayForbiddenError {
    return GatewayError.hasMarker(error) && symbol in error;
  }
}
