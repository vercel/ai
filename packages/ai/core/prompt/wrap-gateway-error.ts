import {
  GatewayAuthenticationError,
  GatewayModelNotFoundError,
} from '@ai-sdk/gateway';
import { AISDKError } from '@ai-sdk/provider';

export function wrapGatewayError({
  error,
  isTextModelId,
}: {
  error: unknown;
  isTextModelId: boolean;
}): unknown {
  if (!isTextModelId) {
    return error;
  }

  if (
    GatewayAuthenticationError.isInstance(error) ||
    GatewayModelNotFoundError.isInstance(error)
  ) {
    return new AISDKError({
      name: 'GatewayError',
      message:
        'Vercel AI Gateway access failed. ' +
        'If you want to use AI SDK providers directly, use the providers, e.g. @ai-sdk/openai, ' +
        'or register a different global default provider.',
      cause: error,
    });
  }

  return error;
}
