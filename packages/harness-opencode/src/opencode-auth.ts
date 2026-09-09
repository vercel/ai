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

export const OPENCODE_CREDENTIAL_ENVIRONMENT_VARIABLES = [
  'AI_GATEWAY_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
] as const;

export function createOpenCodeRequestTransformations({
  env: environment,
  sandboxEnv: sandboxEnvironment,
  auth: authenticationMode,
}: HarnessV1RequestTransformationSources<OpenCodeResolvedAuthenticationMode>): HarnessV1RequestTransformation[] {
  switch (authenticationMode) {
    case 'ai-gateway':
      return environment.AI_GATEWAY_API_KEY &&
        sandboxEnvironment.AI_GATEWAY_API_KEY
        ? [
            createCredentialRequestTransformation({
              matchUrl: environment.AI_GATEWAY_BASE_URL,
              matchHeaders: {
                'x-api-key': sandboxEnvironment.AI_GATEWAY_API_KEY,
              },
              transformHeaders: {
                Authorization: `Bearer ${environment.AI_GATEWAY_API_KEY}`,
              },
            }),
            createCredentialRequestTransformation({
              matchUrl: environment.AI_GATEWAY_BASE_URL,
              matchHeaders: {
                Authorization: `Bearer ${sandboxEnvironment.AI_GATEWAY_API_KEY}`,
              },
              transformHeaders: {
                Authorization: `Bearer ${environment.AI_GATEWAY_API_KEY}`,
              },
            }),
          ]
        : [];
    case 'openai':
      return environment.OPENAI_API_KEY && sandboxEnvironment.OPENAI_API_KEY
        ? [
            createCredentialRequestTransformation({
              matchUrl:
                environment.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
              matchHeaders: {
                Authorization: `Bearer ${sandboxEnvironment.OPENAI_API_KEY}`,
              },
              transformHeaders: {
                Authorization: `Bearer ${environment.OPENAI_API_KEY}`,
              },
            }),
          ]
        : [];
    case 'anthropic': {
      const matchUrl =
        environment.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com';
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
  }
}

export type OpenCodeResolvedAuthenticationMode =
  | 'anthropic'
  | 'openai'
  | 'ai-gateway';

export type OpenCodeAuthenticationMode = HarnessV1Authentication<
  'anthropic' | 'openai'
>;

export function resolveOpenCodeProvider({
  model,
  provider,
}: {
  model?: string;
  provider?: string;
}): 'anthropic' | 'openai' {
  if (provider === 'anthropic' || provider === 'openai') {
    return provider;
  }
  if (model?.includes('/')) {
    const [modelProvider] = model.split('/');
    if (modelProvider === 'anthropic' || modelProvider === 'openai') {
      return modelProvider;
    }
  }
  return 'anthropic';
}

export function splitOpenCodeModel(
  model: string | undefined,
  provider: string | undefined,
): { providerID?: string; modelID?: string; model?: string } {
  if (!model) return {};
  if (model.includes('/')) {
    const [providerID, ...rest] = model.split('/');
    return {
      providerID,
      modelID: rest.join('/'),
      model,
    };
  }
  return {
    providerID: provider,
    modelID: model,
    model: provider ? `${provider}/${model}` : model,
  };
}

export function resolveOpenCodeEnv({
  auth,
  model,
  provider,
  processEnv = process.env,
}: {
  auth: OpenCodeAuthenticationMode | undefined;
  model?: string;
  provider?: string;
  processEnv?: Record<string, string | undefined>;
}): Record<string, string> {
  const suppliedEnvironment = isHarnessAuthenticationEnvironment(auth);
  const authenticationEnvironment = suppliedEnvironment ? auth : processEnv;
  const selectedProvider = resolveOpenCodeProvider({ model, provider });
  if (selectedProvider === 'openai' && auth === 'openai') {
    return pickOpenAI({ processEnv: authenticationEnvironment });
  }
  if (selectedProvider === 'anthropic' && auth === 'anthropic') {
    return pickAnthropic({ processEnv: authenticationEnvironment });
  }

  const gatewayAuthFromEnv = getAiGatewayAuthFromEnv({
    env: authenticationEnvironment,
  });
  if (auth === 'ai-gateway' || gatewayAuthFromEnv.apiKey) {
    return pickGateway({ gatewayAuthFromEnv });
  }
  return selectedProvider === 'openai'
    ? pickOpenAI({ processEnv: authenticationEnvironment })
    : pickAnthropic({ processEnv: authenticationEnvironment });
}

export function resolveOpenCodeAuthenticationMode({
  auth,
  model,
  provider,
  processEnv = process.env,
}: {
  auth: OpenCodeAuthenticationMode | undefined;
  model?: string;
  provider?: string;
  processEnv?: Record<string, string | undefined>;
}): OpenCodeResolvedAuthenticationMode {
  if (isHarnessAuthenticationEnvironment(auth)) {
    return getAiGatewayAuthFromEnv({ env: auth }).apiKey
      ? 'ai-gateway'
      : resolveOpenCodeProvider({ model, provider });
  }
  const selectedProvider = resolveOpenCodeProvider({ model, provider });
  if (selectedProvider === 'openai' && auth === 'openai') {
    return 'openai';
  }
  if (selectedProvider === 'anthropic' && auth === 'anthropic') {
    return 'anthropic';
  }
  if (auth === 'ai-gateway') {
    return 'ai-gateway';
  }
  if (getAiGatewayAuthFromEnv({ env: processEnv }).apiKey) {
    return 'ai-gateway';
  }
  return selectedProvider;
}

function pickOpenAI({
  processEnv,
}: {
  processEnv: Record<string, string | undefined>;
}): Record<string, string> {
  const env: Record<string, string> = {};
  const apiKey = processEnv.OPENAI_API_KEY;
  if (apiKey) env.OPENAI_API_KEY = apiKey;
  const baseUrl = processEnv.OPENAI_BASE_URL;
  if (baseUrl) env.OPENAI_BASE_URL = baseUrl;
  const organization = processEnv.OPENAI_ORGANIZATION;
  if (organization) env.OPENAI_ORGANIZATION = organization;
  const project = processEnv.OPENAI_PROJECT;
  if (project) env.OPENAI_PROJECT = project;
  return env;
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
  const env: Record<string, string> = {};
  const apiKey = gatewayAuthFromEnv.apiKey;
  if (apiKey) env.AI_GATEWAY_API_KEY = apiKey;
  const baseUrl = toOpenCodeGatewayBaseUrl(gatewayAuthFromEnv.baseUrl);
  env.AI_GATEWAY_BASE_URL = baseUrl;
  return env;
}

export function toOpenCodeGatewayBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`;
}
