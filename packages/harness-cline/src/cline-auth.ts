import { getAiGatewayAuthFromEnv } from '@ai-sdk/harness/utils';

export type ClineAuthenticationMode = 'auto' | 'direct' | 'ai-gateway';

export type ClineGatewayAuthenticationOptions = {
  readonly apiKey?: string;
  readonly baseUrl?: string;
};

export type ClineAuthOptions =
  | ClineAuthenticationMode
  | { readonly gateway: ClineGatewayAuthenticationOptions };

export function resolveClineEnv({
  auth = 'auto',
  env = process.env,
}: {
  auth?: ClineAuthOptions;
  env?: Record<string, string | undefined>;
}): Record<string, string> {
  if (typeof auth !== 'string') {
    return toGatewayClineEnv(
      getAiGatewayAuthFromEnv({
        env: {
          ...env,
          ...(auth.gateway.apiKey == null
            ? {}
            : { AI_GATEWAY_API_KEY: auth.gateway.apiKey }),
          ...(auth.gateway.baseUrl == null
            ? {}
            : { AI_GATEWAY_BASE_URL: auth.gateway.baseUrl }),
        },
      }),
    );
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
