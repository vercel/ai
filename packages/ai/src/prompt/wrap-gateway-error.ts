import {
  GatewayAuthenticationError
} from '@ai-sdk/gateway';
import { AISDKError } from '@ai-sdk/provider';

export function wrapGatewayError(error: unknown): unknown {
  if (GatewayAuthenticationError.isInstance(error)) {
    return new AISDKError({
      name: 'GatewayError',
      message:
        'Unauthenticated. Configure AI_GATEWAY_API_KEY or configure and use a provider module. Learn more: https://vercel.link/unauthenticated-ai-gateway-v6',
    });
  }

  return error;
}
