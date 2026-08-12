import type { HarnessV1RequestTransformation } from '@ai-sdk/harness';
import {
  createCredentialRequestTransformation,
  getAiGatewayAuthFromEnv,
} from '@ai-sdk/harness/utils';

export const DEEPAGENTS_CREDENTIAL_ENVIRONMENT_VARIABLES = [
  'AI_GATEWAY_API_KEY',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
] as const;

export function createDeepAgentsRequestTransformations(
  env: Record<string, string>,
  auth: DeepAgentsAuthMethod,
): HarnessV1RequestTransformation[] {
  const headers: Record<string, string> = {};
  if (env.ANTHROPIC_API_KEY) {
    headers['x-api-key'] = env.ANTHROPIC_API_KEY;
  }
  if (env.ANTHROPIC_AUTH_TOKEN) {
    headers.Authorization = `Bearer ${env.ANTHROPIC_AUTH_TOKEN}`;
  }
  return Object.keys(headers).length === 0
    ? []
    : [
        createCredentialRequestTransformation({
          baseUrl:
            auth === 'gateway'
              ? env.ANTHROPIC_BASE_URL
              : (env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com'),
          headers,
        }),
      ];
}

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

export type DeepAgentsAuthMethod = keyof DeepAgentsAuthOptions;

// DeepAgents always drives the Anthropic client. Non-Anthropic models reach it
// through AI Gateway's Anthropic-compatible endpoint, which translates to any
// model (Gemini, OpenAI, etc.), tool calls included.
export function resolveDeepAgentsEnv({
  auth,
  processEnv = process.env,
}: {
  auth?: DeepAgentsAuthOptions;
  processEnv?: Record<string, string | undefined>;
}): Record<string, string> {
  const authMethod = resolveDeepAgentsAuthMethod({ auth, processEnv });
  switch (authMethod) {
    case 'anthropic':
      return pickAnthropic({ explicit: auth?.anthropic, processEnv });
    case 'gateway':
      return pickGateway({
        explicit: auth?.gateway ?? {},
        gatewayAuthFromEnv: getAiGatewayAuthFromEnv({ env: processEnv }),
      });
  }
}

export function resolveDeepAgentsAuthMethod({
  auth,
  processEnv = process.env,
}: {
  auth?: DeepAgentsAuthOptions;
  processEnv?: Record<string, string | undefined>;
}): DeepAgentsAuthMethod {
  if (auth?.anthropic) return 'anthropic';
  if (auth?.gateway) return 'gateway';
  return getAiGatewayAuthFromEnv({ env: processEnv }).apiKey
    ? 'gateway'
    : 'anthropic';
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
  // The Anthropic SDK appends `/v1/messages`, so the gateway base stays at its root.
  const baseUrl = (explicit.baseUrl ?? gatewayAuthFromEnv.baseUrl).replace(
    /\/+$/,
    '',
  );
  const env: Record<string, string> = {};
  if (apiKey) {
    env.AI_GATEWAY_API_KEY = apiKey;
    env.ANTHROPIC_API_KEY = apiKey;
  }
  env.ANTHROPIC_BASE_URL = baseUrl;
  return env;
}
