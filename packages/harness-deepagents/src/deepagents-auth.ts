import type {
  HarnessV1Authentication,
  HarnessV1RequestTransformation,
  HarnessV1RequestTransformationSources,
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

export function createDeepAgentsRequestTransformations({
  env: environment,
  sandboxEnv: sandboxEnvironment,
  auth: authenticationMode,
}: HarnessV1RequestTransformationSources<DeepAgentsResolvedAuthenticationMode>): HarnessV1RequestTransformation[] {
  const matchUrl =
    authenticationMode === 'ai-gateway'
      ? environment.ANTHROPIC_BASE_URL
      : (environment.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com');
  const transformations: HarnessV1RequestTransformation[] = [];

  if (
    environment.ANTHROPIC_API_KEY != null &&
    sandboxEnvironment.ANTHROPIC_API_KEY != null
  ) {
    transformations.push(
      createCredentialRequestTransformation({
        matchUrl,
        matchHeaders: {
          'x-api-key': sandboxEnvironment.ANTHROPIC_API_KEY,
        },
        transformHeaders: {
          'x-api-key': environment.ANTHROPIC_API_KEY,
        },
      }),
    );
  }

  if (
    environment.ANTHROPIC_AUTH_TOKEN != null &&
    sandboxEnvironment.ANTHROPIC_AUTH_TOKEN != null
  ) {
    transformations.push(
      createCredentialRequestTransformation({
        matchUrl,
        matchHeaders: {
          Authorization: `Bearer ${sandboxEnvironment.ANTHROPIC_AUTH_TOKEN}`,
        },
        transformHeaders: {
          Authorization: `Bearer ${environment.ANTHROPIC_AUTH_TOKEN}`,
        },
      }),
    );
  }

  return transformations;
}

export type DeepAgentsResolvedAuthenticationMode = 'anthropic' | 'ai-gateway';

export type DeepAgentsAuthenticationMode = HarnessV1Authentication<'anthropic'>;

// DeepAgents always drives the Anthropic client. Non-Anthropic models reach it
// through AI Gateway's Anthropic-compatible endpoint, which translates to any
// model (Gemini, OpenAI, etc.), tool calls included.
export function resolveDeepAgentsEnv({
  auth,
  processEnv = process.env,
}: {
  auth?: DeepAgentsAuthenticationMode;
  processEnv?: Record<string, string | undefined>;
}): Record<string, string> {
  const suppliedEnvironment = isHarnessAuthenticationEnvironment(auth);
  const authenticationEnvironment = suppliedEnvironment ? auth : processEnv;

  if (auth === 'anthropic') {
    return pickAnthropic({ processEnv: authenticationEnvironment });
  }

  const gatewayAuthFromEnv = getAiGatewayAuthFromEnv({
    env: authenticationEnvironment,
  });
  if (auth === 'ai-gateway' || gatewayAuthFromEnv.apiKey) {
    return pickGateway({ gatewayAuthFromEnv });
  }

  return pickAnthropic({ processEnv: authenticationEnvironment });
}

export function resolveDeepAgentsAuthenticationMode({
  auth,
  processEnv = process.env,
}: {
  auth?: DeepAgentsAuthenticationMode;
  processEnv?: Record<string, string | undefined>;
}): DeepAgentsResolvedAuthenticationMode {
  if (isHarnessAuthenticationEnvironment(auth)) {
    return getAiGatewayAuthFromEnv({ env: auth }).apiKey
      ? 'ai-gateway'
      : 'anthropic';
  }
  if (auth === 'anthropic') {
    return 'anthropic';
  }
  if (auth === 'ai-gateway') {
    return 'ai-gateway';
  }
  return getAiGatewayAuthFromEnv({ env: processEnv }).apiKey
    ? 'ai-gateway'
    : 'anthropic';
}

function pickAnthropic({
  processEnv,
}: {
  processEnv: Record<string, string | undefined>;
}): Record<string, string> {
  const env: Record<string, string> = {};
  const apiKey = processEnv.ANTHROPIC_API_KEY;
  if (apiKey) env.ANTHROPIC_API_KEY = apiKey;
  const authToken = processEnv.ANTHROPIC_AUTH_TOKEN;
  if (authToken) env.ANTHROPIC_AUTH_TOKEN = authToken;
  const baseUrl = processEnv.ANTHROPIC_BASE_URL;
  if (baseUrl) env.ANTHROPIC_BASE_URL = baseUrl;
  return env;
}

function pickGateway({
  gatewayAuthFromEnv,
}: {
  gatewayAuthFromEnv: ReturnType<typeof getAiGatewayAuthFromEnv>;
}): Record<string, string> {
  const apiKey = gatewayAuthFromEnv.apiKey;
  // The Anthropic SDK appends `/v1/messages`, so the gateway base stays at its root.
  const baseUrl = gatewayAuthFromEnv.baseUrl.replace(/\/+$/, '');
  const env: Record<string, string> = {};
  if (apiKey) {
    env.AI_GATEWAY_API_KEY = apiKey;
    env.ANTHROPIC_API_KEY = apiKey;
  }
  env.ANTHROPIC_BASE_URL = baseUrl;
  return env;
}
