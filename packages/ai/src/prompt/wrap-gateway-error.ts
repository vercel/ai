import { GatewayAuthenticationError } from '@ai-sdk/gateway';
import { AISDKError } from '@ai-sdk/provider';

const moreInfoURL = 'https://ai-sdk.dev/unauthenticated-ai-gateway';
const createApiKeyURL =
  'https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%2Fapi-keys%3FshowCreateKeyModal%3Dtrue&title=Create+an+AI+Gateway+API+key';

export function wrapGatewayError(error: unknown): unknown {
  if (!GatewayAuthenticationError.isInstance(error)) return error;

  // An invalid OIDC token only happens on Vercel, where the gateway's own
  // message (link the project, pull the token) is the right guidance.
  if (error.credentialStatus === 'invalid_oidc_token') return error;

  const isInvalidApiKey = error.credentialStatus === 'invalid_api_key';
  const isProductionEnv = process?.env.NODE_ENV === 'production';

  if (isProductionEnv) {
    return new AISDKError({
      name: 'GatewayError',
      message: isInvalidApiKey
        ? `AI Gateway rejected the API key in AI_GATEWAY_API_KEY. Create a new key: ${createApiKeyURL}`
        : `AI Gateway API key not found. Set AI_GATEWAY_API_KEY. Create a key: ${createApiKeyURL}`,
      cause: error,
    });
  }

  const message = isInvalidApiKey
    ? `\u001b[1m\u001b[31mAI Gateway rejected your API key.\u001b[0m

The key in \u001b[33mAI_GATEWAY_API_KEY\u001b[0m is invalid or has been revoked.
Create a new key and update the variable:
\u001b[34m${createApiKeyURL}\u001b[0m

`
    : `\u001b[1m\u001b[31mAI Gateway API key not found.\u001b[0m

1. Create a key: \u001b[34m${createApiKeyURL}\u001b[0m
2. Add it to your environment, for example in .env.local:
   \u001b[33mAI_GATEWAY_API_KEY=your_api_key\u001b[0m

Learn more: \u001b[34m${moreInfoURL}\u001b[0m

`;

  return Object.assign(new Error(message), {
    name: 'GatewayAuthenticationError',
    cause: error,
  });
}
