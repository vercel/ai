import type { HarnessAuthenticationEnvironment } from '@ai-sdk/harness';
import { getAiGatewayAuthFromEnv } from '@ai-sdk/harness/utils';

export type ClineAuthenticationMode = 'auto' | 'direct' | 'ai-gateway';

export type ClineAuthOptions =
  | ClineAuthenticationMode
  | HarnessAuthenticationEnvironment;

export function resolveClineEnv({
  auth = 'auto',
  env = process.env,
}: {
  auth?: ClineAuthOptions;
  env?: Record<string, string | undefined>;
}): Record<string, string> {
  if (typeof auth !== 'string') {
    const gatewayAuth = getAiGatewayAuthFromEnv({ env: auth });
    return gatewayAuth.apiKey
      ? toGatewayClineEnv(gatewayAuth)
      : pickDirectClineEnv({ env: auth });
  }
  if (auth === 'direct') {
    return pickDirectClineEnv({ env });
  }

  const gatewayAuth = getAiGatewayAuthFromEnv({ env });
  if (auth === 'ai-gateway' || gatewayAuth.apiKey) {
    return toGatewayClineEnv(gatewayAuth);
  }

  return pickDirectClineEnv({ env });
}

function toGatewayClineEnv(
  gatewayAuth: ReturnType<typeof getAiGatewayAuthFromEnv>,
): Record<string, string> {
  return {
    ...(gatewayAuth.apiKey ? { AI_GATEWAY_API_KEY: gatewayAuth.apiKey } : {}),
    AI_GATEWAY_BASE_URL: gatewayAuth.baseUrl,
  };
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
