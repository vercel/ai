import { z } from '../zod';
import { GatewayError } from './gateway-error';
import { lazySchema, zodSchema } from '@ai-sdk/provider-utils';

const name = 'GatewayAccessPolicyDeniedError';
const marker = `vercel.ai.gateway.error.${name}`;
const symbol = Symbol.for(marker);

// Unknown keys in `param` are ignored, and each field may be absent.
export const accessPolicyDeniedParamSchema = lazySchema(() =>
  zodSchema(
    z.object({
      policyIds: z.optional(z.array(z.string())),
      removedModels: z.optional(z.array(z.string())),
      removedProviders: z.optional(z.array(z.string())),
    }),
  ),
);

/**
 * Access policy denied - an AI Gateway access policy that applies to the
 * request does not allow the requested model or provider.
 */
export class GatewayAccessPolicyDeniedError extends GatewayError {
  private readonly [symbol] = true; // used in isInstance

  readonly name = name;
  readonly type = 'access_policy_denied';

  /**
   * IDs of the access policies that denied the request, when the gateway
   * includes them.
   */
  readonly policyIds?: string[];

  /**
   * Models the access policies removed, when the gateway includes them.
   */
  readonly removedModels?: string[];

  /**
   * Providers the access policies removed, when the gateway includes them.
   */
  readonly removedProviders?: string[];

  constructor({
    message = 'Access policy denied',
    statusCode = 403,
    cause,
    generationId,
    policyIds,
    removedModels,
    removedProviders,
  }: {
    message?: string;
    statusCode?: number;
    cause?: unknown;
    generationId?: string;
    policyIds?: string[];
    removedModels?: string[];
    removedProviders?: string[];
  } = {}) {
    super({ message, statusCode, cause, generationId });
    this.policyIds = policyIds;
    this.removedModels = removedModels;
    this.removedProviders = removedProviders;
  }

  static isInstance(error: unknown): error is GatewayAccessPolicyDeniedError {
    return GatewayError.hasMarker(error) && symbol in error;
  }
}
