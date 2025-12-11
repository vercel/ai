import { GatewayAuthenticationError } from '@ai-sdk/gateway';
import { AISDKError } from '@ai-sdk/provider';

export function wrapGatewayError(error: unknown): unknown {
  if (!GatewayAuthenticationError.isInstance(error)) return error;

  const isProductionEnv = process?.env.NODE_ENV === 'production';

  if (isProductionEnv) {
    return new AISDKError({
      name: 'GatewayError',
      message:
        'Unauthenticated. Configure AI_GATEWAY_API_KEY or configure and use a provider module. Learn more: https://vercel.link/unauthenticated-ai-gateway-v6',
    });
  }

  console.log('\n\u001b[1m\u001b[31mError: Unauthenticated request to AI Gateway.\u001b[0m\n');
  console.log(
    'To authenticate, set the \u001b[33mAI_GATEWAY_API_KEY\u001b[0m environment variable with your API key.\n',
  );
  console.log('Alternatively, you can configure and use a provider module instead of the AI Gateway.\n');
  console.log(
    'Learn more: \u001b[34mhttps://vercel.link/unauthenticated-ai-gateway-v6\u001b[0m\n',
  );

  process.exit(1);
}
