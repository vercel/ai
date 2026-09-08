import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  HarnessCapabilityUnsupportedError,
  type HarnessV1RequestTransformation,
} from '@ai-sdk/harness';
import {
  createCredentialRequestTransformation,
  isAccessTokenExpiringSoon,
  isHarnessAuthenticationEnvironment,
  refreshOAuthAccessToken,
} from '@ai-sdk/harness/utils';
import { isRecord, safeParseJSON } from '@ai-sdk/provider-utils';
import {
  hasOpenCodeCredential,
  OPENCODE_SUBSCRIPTION_ACCESS_TOKEN_ENVIRONMENT_VARIABLE,
  resolveOpenCodeAuthenticationMode,
  resolveOpenCodeEnv,
  type OpenCodeAuthenticationMode,
  type OpenCodeResolvedAuthenticationMode,
} from './opencode-auth';

const OPENAI_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const XAI_CLIENT_ID = 'b1a00492-073a-47ea-816f-4c329264a828';
const GITLAB_CLIENT_ID =
  '1d89f9fdb23ee96d4e603201f6861dab6e143c5c3c00469a018a2d94bdc03d4e';
const GITLAB_AI_GATEWAY_URL = 'https://cloud.gitlab.com';
const GITLAB_ANTHROPIC_PROVIDER_ID = 'ai-sdk-gitlab-anthropic';
const GITLAB_OPENAI_CHAT_PROVIDER_ID = 'ai-sdk-gitlab-openai-chat';
const GITLAB_OPENAI_RESPONSES_PROVIDER_ID = 'ai-sdk-gitlab-openai-responses';

type OpenCodeGitLabModel = {
  readonly providerId:
    | typeof GITLAB_ANTHROPIC_PROVIDER_ID
    | typeof GITLAB_OPENAI_CHAT_PROVIDER_ID
    | typeof GITLAB_OPENAI_RESPONSES_PROVIDER_ID
    | 'workflow';
  readonly modelId: string;
};

const OPEN_CODE_GITLAB_MODELS = {
  'duo-chat-fable-5': {
    providerId: GITLAB_ANTHROPIC_PROVIDER_ID,
    modelId: 'claude-fable-5',
  },
  'duo-chat-opus-5': {
    providerId: GITLAB_ANTHROPIC_PROVIDER_ID,
    modelId: 'claude-opus-5',
  },
  'duo-chat-opus-4-8': {
    providerId: GITLAB_ANTHROPIC_PROVIDER_ID,
    modelId: 'claude-opus-4-8',
  },
  'duo-chat-opus-4-7': {
    providerId: GITLAB_ANTHROPIC_PROVIDER_ID,
    modelId: 'claude-opus-4-7',
  },
  'duo-chat-opus-4-6': {
    providerId: GITLAB_ANTHROPIC_PROVIDER_ID,
    modelId: 'claude-opus-4-6',
  },
  'duo-chat-sonnet-5': {
    providerId: GITLAB_ANTHROPIC_PROVIDER_ID,
    modelId: 'claude-sonnet-5',
  },
  'duo-chat-sonnet-4-6': {
    providerId: GITLAB_ANTHROPIC_PROVIDER_ID,
    modelId: 'claude-sonnet-4-6',
  },
  'duo-chat-opus-4-5': {
    providerId: GITLAB_ANTHROPIC_PROVIDER_ID,
    modelId: 'claude-opus-4-5-20251101',
  },
  'duo-chat-sonnet-4-5': {
    providerId: GITLAB_ANTHROPIC_PROVIDER_ID,
    modelId: 'claude-sonnet-4-5-20250929',
  },
  'duo-chat-haiku-4-5': {
    providerId: GITLAB_ANTHROPIC_PROVIDER_ID,
    modelId: 'claude-haiku-4-5-20251001',
  },
  'duo-chat-gpt-5-1': {
    providerId: GITLAB_OPENAI_CHAT_PROVIDER_ID,
    modelId: 'gpt-5.1-2025-11-13',
  },
  'duo-chat-gpt-5-2': {
    providerId: GITLAB_OPENAI_CHAT_PROVIDER_ID,
    modelId: 'gpt-5.2-2025-12-11',
  },
  'duo-chat-gpt-5-4': {
    providerId: GITLAB_OPENAI_CHAT_PROVIDER_ID,
    modelId: 'gpt-5.4-2026-03-05',
  },
  'duo-chat-gpt-5-5': {
    providerId: GITLAB_OPENAI_CHAT_PROVIDER_ID,
    modelId: 'gpt-5.5-2026-04-23',
  },
  'duo-chat-gpt-5-mini': {
    providerId: GITLAB_OPENAI_CHAT_PROVIDER_ID,
    modelId: 'gpt-5-mini-2025-08-07',
  },
  'duo-chat-gpt-5-4-mini': {
    providerId: GITLAB_OPENAI_CHAT_PROVIDER_ID,
    modelId: 'gpt-5.4-mini',
  },
  'duo-chat-gpt-5-4-nano': {
    providerId: GITLAB_OPENAI_CHAT_PROVIDER_ID,
    modelId: 'gpt-5.4-nano',
  },
  'duo-chat-gpt-5-6-sol': {
    providerId: GITLAB_OPENAI_RESPONSES_PROVIDER_ID,
    modelId: 'gpt-5.6-sol',
  },
  'duo-chat-gpt-5-6-terra': {
    providerId: GITLAB_OPENAI_RESPONSES_PROVIDER_ID,
    modelId: 'gpt-5.6-terra',
  },
  'duo-chat-gpt-5-6-luna': {
    providerId: GITLAB_OPENAI_RESPONSES_PROVIDER_ID,
    modelId: 'gpt-5.6-luna',
  },
  'duo-chat-gpt-5-codex': {
    providerId: GITLAB_OPENAI_RESPONSES_PROVIDER_ID,
    modelId: 'gpt-5-codex',
  },
  'duo-chat-gpt-5-2-codex': {
    providerId: GITLAB_OPENAI_RESPONSES_PROVIDER_ID,
    modelId: 'gpt-5.2-codex',
  },
  'duo-chat-gpt-5-3-codex': {
    providerId: GITLAB_OPENAI_RESPONSES_PROVIDER_ID,
    modelId: 'gpt-5.3-codex',
  },
  'duo-workflow': { providerId: 'workflow', modelId: 'default' },
  'duo-workflow-default': { providerId: 'workflow', modelId: 'default' },
  'duo-workflow-sonnet-4-5': {
    providerId: 'workflow',
    modelId: 'anthropic/claude-sonnet-4-5-20250929',
  },
  'duo-workflow-sonnet-5': {
    providerId: 'workflow',
    modelId: 'claude_sonnet_5',
  },
  'duo-workflow-opus-5': {
    providerId: 'workflow',
    modelId: 'claude_opus_5',
  },
  'duo-workflow-sonnet-4-6': {
    providerId: 'workflow',
    modelId: 'claude_sonnet_4_6',
  },
  'duo-workflow-opus-4-5': {
    providerId: 'workflow',
    modelId: 'anthropic/claude-opus-4-5-20251101',
  },
  'duo-workflow-haiku-4-5': {
    providerId: 'workflow',
    modelId: 'claude_haiku_4_5_20251001',
  },
  'duo-workflow-opus-4-6': {
    providerId: 'workflow',
    modelId: 'claude_opus_4_6_20260205',
  },
} as const satisfies Record<string, OpenCodeGitLabModel>;

export type OpenCodeSubscriptionProvider =
  | 'openai'
  | 'xai'
  | 'github-copilot'
  | 'poe'
  | 'opencode-go'
  | 'gitlab';

export type OpenCodeSubscription = {
  readonly providerId: OpenCodeSubscriptionProvider;
  readonly accessToken: string;
  readonly accountId?: string;
  readonly enterpriseUrl?: string;
};

export type OpenCodeGitLabDirectAccess = {
  readonly accessToken: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly aiGatewayUrl: string;
};

export async function resolveOpenCodeAuthentication({
  auth,
  model,
  provider,
  processEnv = process.env,
  readSubscription = readOpenCodeSubscription,
}: {
  auth: OpenCodeAuthenticationMode | undefined;
  model?: string;
  provider?: string;
  processEnv?: Record<string, string | undefined>;
  readSubscription?: typeof readOpenCodeSubscription;
}): Promise<{
  environment: Record<string, string>;
  authenticationMode: OpenCodeResolvedAuthenticationMode;
  subscription?: OpenCodeSubscription;
}> {
  const environment = resolveOpenCodeEnv({
    auth,
    model,
    provider,
    processEnv,
  });
  const authenticationMode = resolveOpenCodeAuthenticationMode({
    auth,
    model,
    provider,
    processEnv,
  });
  if (
    isHarnessAuthenticationEnvironment(auth) ||
    auth === 'ai-gateway' ||
    authenticationMode === 'ai-gateway' ||
    hasOpenCodeCredential({ environment, authenticationMode })
  ) {
    return { environment, authenticationMode };
  }
  const subscription = await readSubscription({
    providerId: authenticationMode,
    env: processEnv,
  });
  return subscription == null
    ? { environment, authenticationMode }
    : {
        environment: {
          ...environment,
          [OPENCODE_SUBSCRIPTION_ACCESS_TOKEN_ENVIRONMENT_VARIABLE]:
            subscription.accessToken,
        },
        authenticationMode,
        subscription,
      };
}

export async function readOpenCodeSubscription({
  providerId,
  env = process.env,
  homeDirectory = homedir(),
  platform = process.platform,
  fetch,
}: {
  providerId: string;
  env?: Readonly<Record<string, string | undefined>>;
  homeDirectory?: string;
  platform?: NodeJS.Platform;
  fetch?: typeof globalThis.fetch;
}): Promise<OpenCodeSubscription | undefined> {
  if (!isSubscriptionProvider(providerId)) return undefined;
  const stored = await readStore({ env, homeDirectory, platform });
  if (stored == null) return undefined;
  const candidate = stored.value[providerId];
  if (!isRecord(candidate)) return undefined;

  if (candidate.type === 'api') {
    return typeof candidate.key === 'string' && candidate.key.length > 0
      ? { providerId, accessToken: candidate.key }
      : undefined;
  }
  if (candidate.type !== 'oauth') return undefined;
  if (providerId === 'opencode-go') return undefined;

  const access = candidate.access;
  const refresh = candidate.refresh;
  const expires = candidate.expires;
  if (
    typeof access !== 'string' ||
    typeof refresh !== 'string' ||
    typeof expires !== 'number'
  ) {
    return undefined;
  }

  if (providerId === 'github-copilot') {
    return {
      providerId,
      accessToken: refresh,
      ...(typeof candidate.enterpriseUrl === 'string'
        ? { enterpriseUrl: candidate.enterpriseUrl }
        : {}),
    };
  }
  if (providerId === 'poe') {
    if (isAccessTokenExpiringSoon({ expiresAt: expires })) {
      throw new Error(
        'OpenCode Poe subscription API key is expiring soon. Run OpenCode login again.',
      );
    }
    return { providerId, accessToken: access };
  }

  let accessToken = access;
  let accountId =
    typeof candidate.accountId === 'string'
      ? candidate.accountId
      : providerId === 'openai'
        ? await extractOpenAIAccountId(access)
        : undefined;
  if (isAccessTokenExpiringSoon({ expiresAt: expires })) {
    const refreshSettings = resolveRefreshSettings({
      providerId,
      candidate,
      env,
    });
    const refreshed = await refreshOAuthAccessToken({
      ...refreshSettings,
      refreshToken: refresh,
      ...(fetch == null ? {} : { fetch }),
    });
    accessToken = refreshed.accessToken;
    if (providerId === 'openai') {
      accountId =
        (await extractOpenAIAccountId(refreshed.accessToken)) ?? accountId;
    }
    stored.value[providerId] = {
      ...candidate,
      access: refreshed.accessToken,
      refresh: refreshed.refreshToken ?? refresh,
      expires: refreshed.expiresAt,
      ...(accountId == null ? {} : { accountId }),
    };
    await stored.write?.(stored.value);
  }

  return {
    providerId,
    accessToken,
    ...(accountId == null ? {} : { accountId }),
    ...(typeof candidate.enterpriseUrl === 'string'
      ? { enterpriseUrl: candidate.enterpriseUrl }
      : {}),
  };
}

export async function requestOpenCodeGitLabDirectAccess({
  accessToken,
  instanceUrl = 'https://gitlab.com',
  aiGatewayUrl = GITLAB_AI_GATEWAY_URL,
  fetch: fetchImplementation = globalThis.fetch,
}: {
  accessToken: string;
  instanceUrl?: string;
  aiGatewayUrl?: string;
  fetch?: typeof globalThis.fetch;
}): Promise<OpenCodeGitLabDirectAccess> {
  const response = await fetchImplementation(
    `${instanceUrl.replace(/\/+$/, '')}/api/v4/ai/third_party_agents/direct_access`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        feature_flags: { DuoAgentPlatformNext: true },
      }),
    },
  );
  if (!response.ok) {
    throw new Error(
      `OpenCode GitLab direct access request failed with status ${response.status}.`,
    );
  }

  const parsed = await safeParseJSON({ text: await response.text() });
  if (!parsed.success || !isRecord(parsed.value)) {
    throw new Error('OpenCode GitLab direct access returned invalid JSON.');
  }
  const token = parsed.value.token;
  const headers = parsed.value.headers;
  if (
    typeof token !== 'string' ||
    token.length === 0 ||
    !isRecord(headers) ||
    Object.values(headers).some(value => typeof value !== 'string')
  ) {
    throw new Error(
      'OpenCode GitLab direct access returned invalid credentials.',
    );
  }

  return {
    accessToken: token,
    headers: headers as Record<string, string>,
    aiGatewayUrl: aiGatewayUrl.replace(/\/+$/, ''),
  };
}

export function createOpenCodeGitLabSubscriptionRequestTransformations({
  directAccess,
  sandboxAccessToken,
}: {
  directAccess: OpenCodeGitLabDirectAccess;
  sandboxAccessToken: string;
}): HarnessV1RequestTransformation[] {
  const headers = Object.fromEntries(
    Object.entries(directAccess.headers).filter(
      ([name]) =>
        name.toLowerCase() !== 'authorization' &&
        name.toLowerCase() !== 'x-api-key',
    ),
  );
  const transformHeaders = {
    ...headers,
    Authorization: `Bearer ${directAccess.accessToken}`,
  };
  return [
    `${directAccess.aiGatewayUrl}/ai/v1/proxy/anthropic`,
    `${directAccess.aiGatewayUrl}/ai/v1/proxy/openai/v1`,
  ].map(matchUrl =>
    createCredentialRequestTransformation({
      matchUrl,
      matchHeaders: {
        Authorization: `Bearer ${sandboxAccessToken}`,
      },
      transformHeaders,
    }),
  );
}

export function createOpenCodeGitLabSubscriptionConfig({
  openCodeConfig,
  sandboxAccessToken,
  aiGatewayUrl,
  headers,
}: {
  openCodeConfig: Record<string, unknown> | undefined;
  sandboxAccessToken: string;
  aiGatewayUrl: string;
  headers?: Readonly<Record<string, string>>;
}): Record<string, unknown> {
  const providerOptions = headers == null ? {} : { headers };
  const providers = {
    [GITLAB_ANTHROPIC_PROVIDER_ID]: {
      name: 'GitLab Anthropic',
      npm: '@ai-sdk/anthropic',
      api: `${aiGatewayUrl}/ai/v1/proxy/anthropic/v1`,
      options: { authToken: sandboxAccessToken, ...providerOptions },
      models: createOpenCodeGitLabModels(GITLAB_ANTHROPIC_PROVIDER_ID),
    },
    [GITLAB_OPENAI_CHAT_PROVIDER_ID]: {
      name: 'GitLab OpenAI Chat',
      npm: '@ai-sdk/openai-compatible',
      api: `${aiGatewayUrl}/ai/v1/proxy/openai/v1`,
      options: { apiKey: sandboxAccessToken, ...providerOptions },
      models: createOpenCodeGitLabModels(GITLAB_OPENAI_CHAT_PROVIDER_ID),
    },
    [GITLAB_OPENAI_RESPONSES_PROVIDER_ID]: {
      name: 'GitLab OpenAI Responses',
      npm: '@ai-sdk/openai',
      api: `${aiGatewayUrl}/ai/v1/proxy/openai/v1`,
      options: { apiKey: sandboxAccessToken, ...providerOptions },
      models: createOpenCodeGitLabModels(GITLAB_OPENAI_RESPONSES_PROVIDER_ID),
    },
  };
  const configuredProviders = isRecord(openCodeConfig?.provider)
    ? openCodeConfig.provider
    : {};
  return {
    ...openCodeConfig,
    provider: { ...configuredProviders, ...providers },
  };
}

export function resolveOpenCodeGitLabSubscriptionModel({
  model,
  provider,
}: {
  model: string | undefined;
  provider: string | undefined;
}): string | undefined {
  if (model == null) {
    if (provider === 'gitlab') {
      throw new HarnessCapabilityUnsupportedError({
        harnessId: 'opencode',
        message:
          "Harness 'opencode' requires an explicit GitLab model when native GitLab subscription credentials are brokered.",
      });
    }
    return undefined;
  }
  const modelProvider = model.includes('/') ? model.split('/')[0] : provider;
  if (modelProvider !== 'gitlab') return model;
  const modelId = model.includes('/')
    ? model.slice(model.indexOf('/') + 1)
    : model;
  const mapping: OpenCodeGitLabModel | undefined =
    OPEN_CODE_GITLAB_MODELS[modelId as keyof typeof OPEN_CODE_GITLAB_MODELS];
  if (mapping == null) {
    throw new HarnessCapabilityUnsupportedError({
      harnessId: 'opencode',
      message: `Harness 'opencode' cannot broker native GitLab subscription credentials for unknown model '${modelId}'.`,
    });
  }
  if (mapping.providerId === 'workflow') {
    throw new HarnessCapabilityUnsupportedError({
      harnessId: 'opencode',
      message: `Harness 'opencode' cannot broker native GitLab subscription credentials for workflow model '${modelId}' because it authenticates over WebSocket. Use a sandbox without credential brokering to use the credential-forwarding fallback.`,
    });
  }
  return `${mapping.providerId}/${modelId}`;
}

function createOpenCodeGitLabModels(
  providerId: Exclude<OpenCodeGitLabModel['providerId'], 'workflow'>,
): Record<string, { id: string; name: string }> {
  return Object.fromEntries(
    Object.entries(OPEN_CODE_GITLAB_MODELS).flatMap(([id, model]) =>
      model.providerId === providerId
        ? [[id, { id: model.modelId, name: id }]]
        : [],
    ),
  );
}

export function createOpenCodeSubscriptionAuthContent({
  authentication,
  accessToken,
}: {
  authentication: OpenCodeSubscription;
  accessToken: string;
}): string {
  const { providerId } = authentication;
  const value =
    providerId === 'opencode-go'
      ? { type: 'api', key: accessToken }
      : {
          type: 'oauth',
          access: accessToken,
          refresh:
            providerId === 'github-copilot' ? accessToken : 'host-managed',
          expires: Number.MAX_SAFE_INTEGER,
          ...(authentication.accountId == null
            ? {}
            : { accountId: authentication.accountId }),
          ...(authentication.enterpriseUrl == null
            ? {}
            : { enterpriseUrl: authentication.enterpriseUrl }),
        };
  return JSON.stringify({ [providerId]: value });
}

export function createOpenCodeSubscriptionRequestTransformations({
  authentication,
  sandboxAccessToken,
}: {
  authentication: OpenCodeSubscription;
  sandboxAccessToken: string;
}): HarnessV1RequestTransformation[] {
  const matchUrl = resolveRequestUrl(authentication);
  const transformHeaders = {
    Authorization: `Bearer ${authentication.accessToken}`,
    ...(authentication.providerId === 'openai' && authentication.accountId
      ? { 'ChatGPT-Account-Id': authentication.accountId }
      : {}),
  };
  const transformations = [
    createCredentialRequestTransformation({
      matchUrl,
      matchHeaders: {
        Authorization: `Bearer ${sandboxAccessToken}`,
      },
      transformHeaders,
    }),
  ];
  if (
    authentication.providerId === 'poe' ||
    authentication.providerId === 'opencode-go'
  ) {
    transformations.push(
      createCredentialRequestTransformation({
        matchUrl,
        matchHeaders: { 'x-api-key': sandboxAccessToken },
        transformHeaders: { 'x-api-key': authentication.accessToken },
      }),
    );
  }
  return transformations;
}

function resolveRefreshSettings({
  providerId,
  candidate,
  env,
}: {
  providerId: Exclude<
    OpenCodeSubscriptionProvider,
    'github-copilot' | 'poe' | 'opencode-go'
  >;
  candidate: Record<string, unknown>;
  env: Readonly<Record<string, string | undefined>>;
}): {
  tokenUrl: string;
  clientId: string;
} {
  if (providerId === 'openai') {
    return {
      tokenUrl: 'https://auth.openai.com/oauth/token',
      clientId: OPENAI_CLIENT_ID,
    };
  }
  if (providerId === 'xai') {
    return {
      tokenUrl: 'https://auth.x.ai/oauth2/token',
      clientId: XAI_CLIENT_ID,
    };
  }
  const instanceUrl =
    (typeof candidate.enterpriseUrl === 'string'
      ? candidate.enterpriseUrl
      : env.GITLAB_INSTANCE_URL) ?? 'https://gitlab.com';
  return {
    tokenUrl: `${instanceUrl.replace(/\/+$/, '')}/oauth/token`,
    clientId: env.GITLAB_OAUTH_CLIENT_ID ?? GITLAB_CLIENT_ID,
  };
}

function resolveRequestUrl(authentication: OpenCodeSubscription): string {
  switch (authentication.providerId) {
    case 'openai':
      return 'https://chatgpt.com/backend-api/codex';
    case 'xai':
      return 'https://api.x.ai/v1';
    case 'github-copilot':
      return authentication.enterpriseUrl == null
        ? 'https://api.githubcopilot.com'
        : `https://copilot-api.${normalizeDomain(authentication.enterpriseUrl)}`;
    case 'poe':
      return 'https://api.poe.com';
    case 'opencode-go':
      return 'https://opencode.ai/zen/go/v1';
    case 'gitlab':
      return authentication.enterpriseUrl ?? 'https://gitlab.com';
  }
}

function normalizeDomain(value: string): string {
  try {
    return new URL(value.includes('://') ? value : `https://${value}`).host;
  } catch {
    return value.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  }
}

async function extractOpenAIAccountId(
  accessToken: string,
): Promise<string | undefined> {
  const payload = accessToken.split('.')[1];
  if (payload == null) return undefined;
  try {
    const parsed = await safeParseJSON({
      text: Buffer.from(payload, 'base64url').toString('utf8'),
    });
    if (!parsed.success || !isRecord(parsed.value)) return undefined;
    const auth = parsed.value['https://api.openai.com/auth'];
    if (!isRecord(auth)) return undefined;
    const accountId = auth.chatgpt_account_id;
    return typeof accountId === 'string' ? accountId : undefined;
  } catch {
    return undefined;
  }
}

async function readStore({
  env,
  homeDirectory,
  platform,
}: {
  env: Readonly<Record<string, string | undefined>>;
  homeDirectory: string;
  platform: NodeJS.Platform;
}): Promise<
  | {
      value: Record<string, unknown>;
      write?: (value: Record<string, unknown>) => Promise<void>;
    }
  | undefined
> {
  if (env.OPENCODE_AUTH_CONTENT != null) {
    const parsed = await safeParseJSON({ text: env.OPENCODE_AUTH_CONTENT });
    return parsed.success && isRecord(parsed.value)
      ? { value: parsed.value }
      : undefined;
  }
  const authPath =
    env.XDG_DATA_HOME != null
      ? join(env.XDG_DATA_HOME, 'opencode', 'auth.json')
      : platform === 'win32'
        ? join(homeDirectory, '.opencode', 'auth.json')
        : join(homeDirectory, '.local', 'share', 'opencode', 'auth.json');
  const text = await readFile(authPath, 'utf8').catch(() => undefined);
  if (text == null) return undefined;
  const parsed = await safeParseJSON({ text });
  if (!parsed.success || !isRecord(parsed.value)) return undefined;
  return {
    value: parsed.value,
    write: value => writeStore({ authPath, value }),
  };
}

async function writeStore({
  authPath,
  value,
}: {
  authPath: string;
  value: Record<string, unknown>;
}): Promise<void> {
  await mkdir(dirname(authPath), { recursive: true });
  const temporaryPath = `${authPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
  await chmod(temporaryPath, 0o600);
  await rename(temporaryPath, authPath);
}

function isSubscriptionProvider(
  value: string,
): value is OpenCodeSubscriptionProvider {
  return (
    value === 'openai' ||
    value === 'xai' ||
    value === 'github-copilot' ||
    value === 'poe' ||
    value === 'opencode-go' ||
    value === 'gitlab'
  );
}
