import { getAiGatewayAuthFromEnv } from '@ai-sdk/harness/utils';

export type OpenCodeAuthenticationMode =
  | 'auto'
  | 'anthropic'
  | 'openai'
  | 'ai-gateway';

/**
 * @deprecated Passing an object to auth options is deprecated. Use an `OpenCodeAuthenticationMode` string value ("auto" | "anthropic" | "openai" | "ai-gateway") instead, and pass credentials via environment variables.
 */
export type LegacyOpenCodeAuthOptions = {
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

export type OpenCodeAuthOptions =
  | OpenCodeAuthenticationMode
  | LegacyOpenCodeAuthOptions;

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
  const normalizedAuth = normalizeOpenCodeAuthToLegacyAuth(auth);
  const selectedProvider = resolveOpenCodeProvider({ model, provider });
  if (normalizedAuth?.openaiCompatible) {
    return pickOpenAICompatible(normalizedAuth.openaiCompatible, processEnv);
  }
  if (selectedProvider === 'openai') {
    if (normalizedAuth?.openai) {
      return pickOpenAI({ explicit: normalizedAuth.openai, processEnv });
    }
  } else if (normalizedAuth?.anthropic) {
    return pickAnthropic({ explicit: normalizedAuth.anthropic, processEnv });
  }

  const gatewayAuthFromEnv = getAiGatewayAuthFromEnv({ env: processEnv });
  if (normalizedAuth?.gateway) {
    return pickGateway({
      explicit: normalizedAuth.gateway,
      gatewayAuthFromEnv,
    });
  }
  if (gatewayAuthFromEnv.apiKey) {
    return pickGateway({ explicit: {}, gatewayAuthFromEnv });
  }
  return selectedProvider === 'openai'
    ? pickOpenAI({ processEnv })
    : pickAnthropic({ processEnv });
}

function normalizeOpenCodeAuthToLegacyAuth(
  auth: OpenCodeAuthOptions | undefined,
): LegacyOpenCodeAuthOptions | undefined {
  if (auth == null || auth === 'auto') {
    return undefined;
  }
  if (typeof auth === 'string') {
    switch (auth) {
      case 'anthropic':
        return { anthropic: {} };
      case 'openai':
        return { openai: {} };
      case 'ai-gateway':
        return { gateway: {} };
      default:
        return undefined;
    }
  }

  console.warn(
    '[opencode] Passing an object to auth options is deprecated. Use a string mode ("auto" | "anthropic" | "openai" | "ai-gateway") instead, and pass credentials via environment variables.',
  );
  return auth;
}

function pickOpenAICompatible(
  explicit: NonNullable<LegacyOpenCodeAuthOptions['openaiCompatible']>,
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
  explicit?: NonNullable<LegacyOpenCodeAuthOptions['openai']>;
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
  explicit?: NonNullable<LegacyOpenCodeAuthOptions['anthropic']>;
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
  explicit: NonNullable<LegacyOpenCodeAuthOptions['gateway']>;
  gatewayAuthFromEnv: ReturnType<typeof getAiGatewayAuthFromEnv>;
}): Record<string, string> {
  const env: Record<string, string> = {};
  const apiKey = explicit.apiKey ?? gatewayAuthFromEnv.apiKey;
  if (apiKey) env.AI_GATEWAY_API_KEY = apiKey;
  env.AI_GATEWAY_BASE_URL = toOpenCodeGatewayBaseUrl(
    explicit.baseUrl ?? gatewayAuthFromEnv.baseUrl,
  );
  return env;
}

export function toOpenCodeGatewayBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`;
}
