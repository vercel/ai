import type {
  HarnessAuthenticationEnvironment,
  HarnessV1RequestTransformation,
} from '@ai-sdk/harness';
import {
  createCredentialRequestTransformation,
  getAiGatewayAuthFromEnv,
  isHarnessAuthenticationEnvironment,
} from '@ai-sdk/harness/utils';

export const DEEPAGENTS_CREDENTIAL_ENVIRONMENT_VARIABLES = [
  'AI_GATEWAY_API_KEY',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
] as const;

export function createDeepAgentsRequestTransformations(
  env: Record<string, string>,
  auth: DeepAgentsResolvedAuthenticationMode,
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
            auth === 'ai-gateway'
              ? env.ANTHROPIC_BASE_URL
              : (env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com'),
          headers,
        }),
      ];
}

export type DeepAgentsResolvedAuthenticationMode = 'anthropic' | 'ai-gateway';

export type DeepAgentsAuthenticationMode =
  | DeepAgentsResolvedAuthenticationMode
  | 'auto';

/**
 * @deprecated Passing an object to auth options is deprecated. Use a `DeepAgentsAuthenticationMode` string value ("auto" | "anthropic" | "ai-gateway") instead, and pass credentials via environment variables.
 */
export type LegacyDeepAgentsAuthOptions = {
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

export type DeepAgentsAuthOptions =
  | DeepAgentsAuthenticationMode
  | HarnessAuthenticationEnvironment
  | LegacyDeepAgentsAuthOptions;

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
  const suppliedEnvironment = isHarnessAuthenticationEnvironment(auth);
  const authenticationEnvironment = suppliedEnvironment ? auth : processEnv;
  const normalizedAuth = suppliedEnvironment
    ? undefined
    : normalizeDeepAgentsAuthToLegacyAuth(auth);

  if (normalizedAuth?.anthropic) {
    return pickAnthropic({
      explicit: normalizedAuth.anthropic,
      processEnv: authenticationEnvironment,
    });
  }

  const gatewayAuthFromEnv = getAiGatewayAuthFromEnv({
    env: authenticationEnvironment,
  });
  if (normalizedAuth?.gateway) {
    return pickGateway({
      explicit: normalizedAuth.gateway,
      gatewayAuthFromEnv,
    });
  }
  if (gatewayAuthFromEnv.apiKey) {
    return pickGateway({ explicit: {}, gatewayAuthFromEnv });
  }

  return pickAnthropic({ processEnv: authenticationEnvironment });
}

export function resolveDeepAgentsAuthenticationMode({
  auth,
  processEnv = process.env,
}: {
  auth?: DeepAgentsAuthOptions;
  processEnv?: Record<string, string | undefined>;
}): DeepAgentsResolvedAuthenticationMode {
  if (isHarnessAuthenticationEnvironment(auth)) {
    return getAiGatewayAuthFromEnv({ env: auth }).apiKey
      ? 'ai-gateway'
      : 'anthropic';
  }
  if (auth === 'anthropic' || (typeof auth !== 'string' && auth?.anthropic)) {
    return 'anthropic';
  }
  if (auth === 'ai-gateway' || (typeof auth !== 'string' && auth?.gateway)) {
    return 'ai-gateway';
  }
  return getAiGatewayAuthFromEnv({ env: processEnv }).apiKey
    ? 'ai-gateway'
    : 'anthropic';
}

function normalizeDeepAgentsAuthToLegacyAuth(
  auth: DeepAgentsAuthOptions | undefined,
): LegacyDeepAgentsAuthOptions | undefined {
  if (auth == null || auth === 'auto') {
    return undefined;
  }
  if (typeof auth === 'string') {
    switch (auth) {
      case 'anthropic':
        return { anthropic: {} };
      case 'ai-gateway':
        return { gateway: {} };
      default:
        return undefined;
    }
  }

  console.warn(
    '[deepagents] Passing an object to auth options is deprecated. Use a string mode ("auto" | "anthropic" | "ai-gateway") instead, and pass credentials via environment variables.',
  );
  return auth;
}

function pickAnthropic({
  explicit,
  processEnv,
}: {
  explicit?: NonNullable<LegacyDeepAgentsAuthOptions['anthropic']>;
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
  explicit: NonNullable<LegacyDeepAgentsAuthOptions['gateway']>;
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
