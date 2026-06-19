import { getAiGatewayAuthFromEnv } from '@ai-sdk/harness/utils';

export type DeepAgentsAuthOptions = {
  readonly anthropic?: {
    readonly apiKey?: string;
    readonly authToken?: string;
    readonly baseUrl?: string;
  };
  readonly gateway?: {
    readonly apiKey?: string;
    readonly baseUrl?: string;
  };
};

const DEFAULT_ANTHROPIC_BASE_URL = 'https://api.anthropic.com';

// Resolve bridge env vars: explicit anthropic/gateway, else ambient gateway then anthropic.
export function resolveDeepAgentsEnv(
  auth: DeepAgentsAuthOptions | undefined,
  processEnv: Record<string, string | undefined> = process.env,
): Record<string, string> {
  if (auth?.anthropic) {
    return pickAnthropic({ explicit: auth.anthropic, processEnv });
  }

  const gatewayAuthFromEnv = getAiGatewayAuthFromEnv({ env: processEnv });

  if (auth?.gateway) {
    return pickGateway({ explicit: auth.gateway, gatewayAuthFromEnv });
  }
  if (gatewayAuthFromEnv.apiKey) {
    return pickGateway({ explicit: {}, gatewayAuthFromEnv });
  }
  return pickAnthropic({ processEnv });
}

function pickAnthropic({
  explicit,
  processEnv,
}: {
  explicit?: NonNullable<DeepAgentsAuthOptions['anthropic']>;
  processEnv: Record<string, string | undefined>;
}): Record<string, string> {
  const env: Record<string, string> = {};
  const apiKey = explicit?.apiKey ?? processEnv.ANTHROPIC_API_KEY;
  if (apiKey) env.ANTHROPIC_API_KEY = apiKey;
  const authToken = explicit?.authToken ?? processEnv.ANTHROPIC_AUTH_TOKEN;
  if (authToken) env.ANTHROPIC_AUTH_TOKEN = authToken;
  const baseUrl = explicit?.baseUrl ?? processEnv.ANTHROPIC_BASE_URL;
  if (baseUrl) env.ANTHROPIC_BASE_URL = baseUrl;
  return env;
}

function pickGateway({
  explicit,
  gatewayAuthFromEnv,
}: {
  explicit: NonNullable<DeepAgentsAuthOptions['gateway']>;
  gatewayAuthFromEnv: ReturnType<typeof getAiGatewayAuthFromEnv>;
}): Record<string, string> {
  const apiKey = explicit.apiKey ?? gatewayAuthFromEnv.apiKey;
  const baseUrl = explicit.baseUrl ?? gatewayAuthFromEnv.baseUrl;
  const env: Record<string, string> = {};
  if (apiKey) {
    env.AI_GATEWAY_API_KEY = apiKey;
    env.ANTHROPIC_API_KEY = apiKey;
  }
  env.AI_GATEWAY_BASE_URL = baseUrl;
  env.ANTHROPIC_BASE_URL = baseUrl;
  return env;
}

export { DEFAULT_ANTHROPIC_BASE_URL };
