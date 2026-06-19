import { getAiGatewayAuthFromEnv } from '@ai-sdk/harness/utils';

export type DeepAgentsAuthOptions = {
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
  readonly gateway?: {
    readonly apiKey?: string;
    readonly baseUrl?: string;
  };
};

type Provider = 'anthropic' | 'openai';

// Pick the provider LangChain will resolve from the model string (or explicit auth); default anthropic.
export function resolveDeepAgentsProvider({
  model,
  auth,
}: {
  model?: string;
  auth?: DeepAgentsAuthOptions;
}): Provider {
  if (model) {
    const head = model.includes('/')
      ? model.split('/')[0]
      : model.includes(':')
        ? model.split(':')[0]
        : '';
    if (head === 'openai') return 'openai';
    if (head === 'anthropic') return 'anthropic';
  }
  if (auth?.openai && !auth?.anthropic) return 'openai';
  return 'anthropic';
}

// Resolve the bridge env vars for the model's provider: explicit provider auth, else gateway, else ambient.
export function resolveDeepAgentsEnv({
  auth,
  model,
  processEnv = process.env,
}: {
  auth?: DeepAgentsAuthOptions;
  model?: string;
  processEnv?: Record<string, string | undefined>;
}): Record<string, string> {
  const provider = resolveDeepAgentsProvider({ model, auth });

  if (provider === 'openai' && auth?.openai) {
    return pickOpenAI({ explicit: auth.openai, processEnv });
  }
  if (provider === 'anthropic' && auth?.anthropic) {
    return pickAnthropic({ explicit: auth.anthropic, processEnv });
  }

  const gatewayAuthFromEnv = getAiGatewayAuthFromEnv({ env: processEnv });
  if (auth?.gateway) {
    return pickGateway({
      provider,
      explicit: auth.gateway,
      gatewayAuthFromEnv,
    });
  }
  if (gatewayAuthFromEnv.apiKey) {
    return pickGateway({ provider, explicit: {}, gatewayAuthFromEnv });
  }

  return provider === 'openai'
    ? pickOpenAI({ processEnv })
    : pickAnthropic({ processEnv });
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

function pickOpenAI({
  explicit,
  processEnv,
}: {
  explicit?: NonNullable<DeepAgentsAuthOptions['openai']>;
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

// The Anthropic SDK appends `/v1/messages` to its base URL; the OpenAI SDK appends `/chat/completions` to a `/v1` base.
function gatewayBaseUrl(baseUrl: string, provider: Provider): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  if (provider === 'openai') {
    return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`;
  }
  return trimmed;
}

function pickGateway({
  provider,
  explicit,
  gatewayAuthFromEnv,
}: {
  provider: Provider;
  explicit: NonNullable<DeepAgentsAuthOptions['gateway']>;
  gatewayAuthFromEnv: ReturnType<typeof getAiGatewayAuthFromEnv>;
}): Record<string, string> {
  const apiKey = explicit.apiKey ?? gatewayAuthFromEnv.apiKey;
  const baseUrl = gatewayBaseUrl(
    explicit.baseUrl ?? gatewayAuthFromEnv.baseUrl,
    provider,
  );
  const env: Record<string, string> = {};
  if (apiKey) env.AI_GATEWAY_API_KEY = apiKey;
  if (provider === 'openai') {
    if (apiKey) env.OPENAI_API_KEY = apiKey;
    env.OPENAI_BASE_URL = baseUrl;
  } else {
    if (apiKey) env.ANTHROPIC_API_KEY = apiKey;
    env.ANTHROPIC_BASE_URL = baseUrl;
  }
  return env;
}
