import type { HarnessV1RequestTransformation } from '@ai-sdk/harness';
import {
  createCredentialRequestTransformation,
  getAiGatewayAuthFromEnv,
} from '@ai-sdk/harness/utils';

export const OPENCODE_CREDENTIAL_ENVIRONMENT_VARIABLES = [
  'AI_GATEWAY_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
] as const;

export function createOpenCodeRequestTransformations(
  env: Record<string, string>,
  auth: OpenCodeAuthMethod,
): HarnessV1RequestTransformation[] {
  switch (auth) {
    case 'gateway':
      return env.AI_GATEWAY_API_KEY
        ? [
            createCredentialRequestTransformation({
              baseUrl: env.AI_GATEWAY_BASE_URL,
              headers: {
                Authorization: `Bearer ${env.AI_GATEWAY_API_KEY}`,
              },
            }),
          ]
        : [];
    case 'openai':
    case 'openaiCompatible':
      return env.OPENAI_API_KEY
        ? [
            createCredentialRequestTransformation({
              baseUrl: env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
              headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
            }),
          ]
        : [];
    case 'anthropic': {
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
              baseUrl: env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com',
              headers,
            }),
          ];
    }
  }
}

export type OpenCodeAuthOptions = {
  readonly gateway?: {
    readonly apiKey?: string;
    readonly baseUrl?: string;
  };
  readonly anthropic?: {
    readonly apiKey?: string;
    readonly authToken?: string;
    readonly baseUrl?: string;
  };
  readonly openai?: {
    readonly apiKey?: string;
    readonly baseUrl?: string;
    readonly organization?: string;
    readonly project?: string;
  };
  readonly openaiCompatible?: {
    readonly apiKey?: string;
    readonly baseUrl?: string;
    readonly name?: string;
    readonly queryParams?: Record<string, string>;
  };
};

export type OpenCodeAuthMethod = keyof OpenCodeAuthOptions;

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
  auth: OpenCodeAuthOptions | undefined;
  model?: string;
  provider?: string;
  processEnv?: Record<string, string | undefined>;
}): Record<string, string> {
  const authMethod = resolveOpenCodeAuthMethod({
    auth,
    model,
    provider,
    processEnv,
  });
  switch (authMethod) {
    case 'openaiCompatible':
      return pickOpenAICompatible(auth?.openaiCompatible ?? {}, processEnv);
    case 'openai':
      return pickOpenAI({ explicit: auth?.openai, processEnv });
    case 'anthropic':
      return pickAnthropic({ explicit: auth?.anthropic, processEnv });
    case 'gateway':
      return pickGateway({
        explicit: auth?.gateway ?? {},
        gatewayAuthFromEnv: getAiGatewayAuthFromEnv({ env: processEnv }),
      });
  }
}

export function resolveOpenCodeAuthMethod({
  auth,
  model,
  provider,
  processEnv = process.env,
}: {
  auth: OpenCodeAuthOptions | undefined;
  model?: string;
  provider?: string;
  processEnv?: Record<string, string | undefined>;
}): OpenCodeAuthMethod {
  if (auth?.openaiCompatible) return 'openaiCompatible';
  const selectedProvider = resolveOpenCodeProvider({ model, provider });
  if (selectedProvider === 'openai' && auth?.openai) return 'openai';
  if (selectedProvider === 'anthropic' && auth?.anthropic) return 'anthropic';
  if (auth?.gateway) return 'gateway';
  if (getAiGatewayAuthFromEnv({ env: processEnv }).apiKey) return 'gateway';
  return selectedProvider;
}

function pickOpenAICompatible(
  explicit: NonNullable<OpenCodeAuthOptions['openaiCompatible']>,
  processEnv: Record<string, string | undefined>,
): Record<string, string> {
  const env: Record<string, string> = {};
  const apiKey = explicit.apiKey ?? processEnv.OPENAI_API_KEY;
  if (apiKey) env.OPENAI_API_KEY = apiKey;
  const baseUrl = explicit.baseUrl ?? processEnv.OPENAI_BASE_URL;
  if (baseUrl) env.OPENAI_BASE_URL = baseUrl;
  const name = explicit.name ?? processEnv.OPENAI_NAME;
  if (name) env.OPENAI_NAME = name;
  if (explicit.queryParams && Object.keys(explicit.queryParams).length > 0) {
    env.OPENAI_QUERY_PARAMS_JSON = JSON.stringify(explicit.queryParams);
  } else if (processEnv.OPENAI_QUERY_PARAMS_JSON) {
    env.OPENAI_QUERY_PARAMS_JSON = processEnv.OPENAI_QUERY_PARAMS_JSON;
  }
  return env;
}

function pickOpenAI({
  explicit,
  processEnv,
}: {
  explicit?: NonNullable<OpenCodeAuthOptions['openai']>;
  processEnv: Record<string, string | undefined>;
}): Record<string, string> {
  const env: Record<string, string> = {};
  const apiKey = explicit?.apiKey ?? processEnv.OPENAI_API_KEY;
  if (apiKey) env.OPENAI_API_KEY = apiKey;
  const baseUrl = explicit?.baseUrl ?? processEnv.OPENAI_BASE_URL;
  if (baseUrl) env.OPENAI_BASE_URL = baseUrl;
  const organization = explicit?.organization ?? processEnv.OPENAI_ORGANIZATION;
  if (organization) env.OPENAI_ORGANIZATION = organization;
  const project = explicit?.project ?? processEnv.OPENAI_PROJECT;
  if (project) env.OPENAI_PROJECT = project;
  return env;
}

function pickAnthropic({
  explicit,
  processEnv,
}: {
  explicit?: NonNullable<OpenCodeAuthOptions['anthropic']>;
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
  explicit: NonNullable<OpenCodeAuthOptions['gateway']>;
  gatewayAuthFromEnv: ReturnType<typeof getAiGatewayAuthFromEnv>;
}): Record<string, string> {
  const env: Record<string, string> = {};
  const apiKey = explicit.apiKey ?? gatewayAuthFromEnv.apiKey;
  if (apiKey) env.AI_GATEWAY_API_KEY = apiKey;
  const baseUrl = toOpenCodeGatewayBaseUrl(
    explicit.baseUrl ?? gatewayAuthFromEnv.baseUrl,
  );
  env.AI_GATEWAY_BASE_URL = baseUrl;
  return env;
}

export function toOpenCodeGatewayBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`;
}
