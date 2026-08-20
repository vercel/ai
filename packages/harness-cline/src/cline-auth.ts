import { getAiGatewayAuthFromEnv } from '@ai-sdk/harness/utils';

export type ClineAuthenticationMode = 'auto' | 'direct' | 'ai-gateway';

export type ClineAuthOptions = ClineAuthenticationMode;

export function resolveClineEnv({
  auth = 'auto',
  env = process.env,
}: {
  auth?: ClineAuthOptions;
  env?: Record<string, string | undefined>;
}): Record<string, string> {
  if (auth === 'direct') {
    return pickDirectClineEnv({ env });
  }

  const gatewayAuth = getAiGatewayAuthFromEnv({ env });
  if (auth === 'ai-gateway' || gatewayAuth.apiKey) {
    return {
      ...(gatewayAuth.apiKey ? { AI_GATEWAY_API_KEY: gatewayAuth.apiKey } : {}),
      AI_GATEWAY_BASE_URL: gatewayAuth.baseUrl,
    };
  }

  return pickDirectClineEnv({ env });
}

function pickDirectClineEnv({
  env,
}: {
  env: Record<string, string | undefined>;
}): Record<string, string> {
  return {
    ...(env.CLINE_API_KEY ? { CLINE_API_KEY: env.CLINE_API_KEY } : {}),
    ...(env.CLINE_API_BASE_URL
      ? { CLINE_API_BASE_URL: env.CLINE_API_BASE_URL }
      : {}),
  };
}
