import {
  GatewayAuthenticationError,
  GatewayModelNotFoundError,
} from '@ai-sdk/gateway';
import { AISDKError } from '@ai-sdk/provider';

export function wrapGatewayError(error: unknown): unknown {
  if (
    GatewayAuthenticationError.isInstance(error) ||
    GatewayModelNotFoundError.isInstance(error)
  ) {
    return new AISDKError({
      name: 'GatewayError',
      message:
        'Missing AI Gateway Key. Get one here: https://vercel.link/4rcaGME',
      cause: error,
    });
  }

  return error;
}
