import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { HarnessV1RequestTransformation } from '@ai-sdk/harness';
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
  fetch,
}: {
  providerId: string;
  env?: Readonly<Record<string, string | undefined>>;
  homeDirectory?: string;
  fetch?: typeof globalThis.fetch;
}): Promise<OpenCodeSubscription | undefined> {
  if (!isSubscriptionProvider(providerId)) return undefined;
  const stored = await readStore({ env, homeDirectory });
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
}: {
  env: Readonly<Record<string, string | undefined>>;
  homeDirectory: string;
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
  const authPath = join(
    env.XDG_DATA_HOME ?? join(homeDirectory, '.local', 'share'),
    'opencode',
    'auth.json',
  );
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
