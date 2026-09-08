import { chmod, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type {
  ACPAuthenticationFile,
  ACPAuthenticationMode,
} from '@ai-sdk/harness-acp';
import {
  getAiGatewayAuthFromEnv,
  isAccessTokenExpiringSoon,
  isHarnessAuthenticationEnvironment,
  refreshOAuthAccessToken,
} from '@ai-sdk/harness/utils';
import { isRecord, safeParseJSON } from '@ai-sdk/provider-utils';

const CHATGPT_ACCESS_TOKEN_ENVIRONMENT_VARIABLE =
  'AI_SDK_FX_CHATGPT_ACCESS_TOKEN';
const CHATGPT_ACCOUNT_ID_ENVIRONMENT_VARIABLE = 'AI_SDK_FX_CHATGPT_ACCOUNT_ID';
const GROK_ACCESS_TOKEN_ENVIRONMENT_VARIABLE = 'AI_SDK_FX_GROK_ACCESS_TOKEN';
const GROK_ACCOUNT_ID_ENVIRONMENT_VARIABLE = 'AI_SDK_FX_GROK_ACCOUNT_ID';
const OPENAI_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const XAI_CLIENT_ID = 'b1a00492-073a-47ea-816f-4c329264a828';
const SANDBOX_REFRESH_TOKEN = 'ai-sdk-harness-brokered';

type FxSubscriptionProvider = 'chatgpt' | 'grok';

type FxSubscriptionCredential = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  accountId: string;
};

export const FX_SUBSCRIPTION_ENVIRONMENT_VARIABLES = [
  CHATGPT_ACCESS_TOKEN_ENVIRONMENT_VARIABLE,
  CHATGPT_ACCOUNT_ID_ENVIRONMENT_VARIABLE,
  GROK_ACCESS_TOKEN_ENVIRONMENT_VARIABLE,
  GROK_ACCOUNT_ID_ENVIRONMENT_VARIABLE,
] as const;

export async function resolveFxSubscriptionEnvironment({
  auth,
  env,
  homeDirectory,
  fetch,
}: {
  auth: ACPAuthenticationMode | undefined;
  env: Readonly<Record<string, string | undefined>>;
  homeDirectory?: string;
  fetch?: typeof globalThis.fetch;
}): Promise<Readonly<Record<string, string | undefined>>> {
  if (isHarnessAuthenticationEnvironment(auth)) return auth;
  if (auth === 'ai-gateway') return env;
  if (auth !== 'direct' && getAiGatewayAuthFromEnv({ env }).apiKey != null) {
    return env;
  }

  const subscriptions = await readFxSubscriptions({
    ...(homeDirectory == null ? {} : { homeDirectory }),
    ...(fetch == null ? {} : { fetch }),
  });
  return subscriptions == null ? env : { ...env, ...subscriptions };
}

export async function readFxSubscriptions({
  homeDirectory = homedir(),
  fetch,
}: {
  homeDirectory?: string;
  fetch?: typeof globalThis.fetch;
} = {}): Promise<Record<string, string> | undefined> {
  const fxDirectory = join(homeDirectory, '.fx');
  const environment: Record<string, string> = {};

  for (const provider of ['chatgpt', 'grok'] as const) {
    const credential = await readFxSubscription({
      provider,
      fxDirectory,
      ...(fetch == null ? {} : { fetch }),
    });
    if (credential == null) continue;
    environment[getAccessTokenEnvironmentVariable({ provider })] =
      credential.accessToken;
    environment[getAccountIdEnvironmentVariable({ provider })] =
      credential.accountId;
  }

  return Object.keys(environment).length === 0 ? undefined : environment;
}

export function createFxSubscriptionAuthenticationFiles({
  env,
  sandboxEnv,
  credentialBrokeringAvailable,
}: {
  env: Readonly<Record<string, string>>;
  sandboxEnv: Readonly<Record<string, string>>;
  credentialBrokeringAvailable: boolean;
}): ReadonlyArray<ACPAuthenticationFile> {
  const files: ACPAuthenticationFile[] = [];

  for (const provider of ['chatgpt', 'grok'] as const) {
    const environmentVariable = getAccessTokenEnvironmentVariable({ provider });
    const hostAccessToken = env[environmentVariable];
    const sandboxAccessToken = sandboxEnv[environmentVariable];
    const accountId = env[getAccountIdEnvironmentVariable({ provider })];
    if (
      hostAccessToken == null ||
      sandboxAccessToken == null ||
      accountId == null
    ) {
      continue;
    }
    const accessToken =
      provider === 'chatgpt' && credentialBrokeringAvailable
        ? createChatGptSandboxAccessToken({
            credential: sandboxAccessToken,
            accountId,
          })
        : sandboxAccessToken;
    files.push({
      path:
        provider === 'chatgpt' ? '.fx/chatgpt-auth.json' : '.fx/grok-auth.json',
      content: `${JSON.stringify({
        version: 1,
        access_token: accessToken,
        refresh_token: SANDBOX_REFRESH_TOKEN,
        expires_at_ms: Number.MAX_SAFE_INTEGER,
        account_id: accountId,
      })}\n`,
    });
  }

  return files;
}

export function getFxSubscriptionRequestCredentials({
  env,
  sandboxEnv,
}: {
  env: Readonly<Record<string, string>>;
  sandboxEnv: Readonly<Record<string, string>>;
}): ReadonlyArray<{
  provider: FxSubscriptionProvider;
  accessToken: string;
  sandboxAccessToken: string;
}> {
  const credentials: Array<{
    provider: FxSubscriptionProvider;
    accessToken: string;
    sandboxAccessToken: string;
  }> = [];

  for (const provider of ['chatgpt', 'grok'] as const) {
    const environmentVariable = getAccessTokenEnvironmentVariable({ provider });
    const accessToken = env[environmentVariable];
    const sandboxCredential = sandboxEnv[environmentVariable];
    const accountId = env[getAccountIdEnvironmentVariable({ provider })];
    if (accessToken == null || sandboxCredential == null || accountId == null) {
      continue;
    }
    credentials.push({
      provider,
      accessToken,
      sandboxAccessToken:
        provider === 'chatgpt'
          ? createChatGptSandboxAccessToken({
              credential: sandboxCredential,
              accountId,
            })
          : sandboxCredential,
    });
  }

  return credentials;
}

async function readFxSubscription({
  provider,
  fxDirectory,
  fetch: fetchImplementation = globalThis.fetch,
}: {
  provider: FxSubscriptionProvider;
  fxDirectory: string;
  fetch?: typeof globalThis.fetch;
}): Promise<FxSubscriptionCredential | undefined> {
  const path = join(
    fxDirectory,
    provider === 'chatgpt' ? 'chatgpt-auth.json' : 'grok-auth.json',
  );
  const fileStat = await stat(path).catch(() => undefined);
  if (fileStat == null || !fileStat.isFile() || (fileStat.mode & 0o077) !== 0) {
    return undefined;
  }
  const text = await readFile(path, 'utf8').catch(() => undefined);
  if (text == null) return undefined;
  const parsed = await safeParseJSON({ text });
  if (!parsed.success || !isRecord(parsed.value)) return undefined;
  const credential = readCredential({ value: parsed.value });
  if (credential == null) return undefined;
  if (
    provider === 'chatgpt' &&
    (await extractChatGptAccountId({ accessToken: credential.accessToken })) !==
      credential.accountId
  ) {
    return undefined;
  }
  if (!isAccessTokenExpiringSoon({ expiresAt: credential.expiresAt })) {
    return credential;
  }

  const refreshed = await refreshOAuthAccessToken({
    tokenUrl:
      provider === 'chatgpt'
        ? 'https://auth.openai.com/oauth/token'
        : 'https://auth.x.ai/oauth2/token',
    clientId: provider === 'chatgpt' ? OPENAI_CLIENT_ID : XAI_CLIENT_ID,
    refreshToken: credential.refreshToken,
    requestFormat: provider === 'chatgpt' ? 'json' : 'form',
    fetch: fetchImplementation,
  });
  const refreshedAccountId =
    provider === 'chatgpt'
      ? await extractChatGptAccountId({ accessToken: refreshed.accessToken })
      : await fetchGrokAccountId({
          accessToken: refreshed.accessToken,
          fetch: fetchImplementation,
        });
  if (refreshedAccountId !== credential.accountId) {
    throw new Error(`fx ${provider} OAuth refresh changed accounts.`);
  }

  const nextCredential = {
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken ?? credential.refreshToken,
    expiresAt: refreshed.expiresAt,
    accountId: refreshedAccountId,
  };
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(
    temporaryPath,
    `${JSON.stringify({
      version: 1,
      access_token: nextCredential.accessToken,
      refresh_token: nextCredential.refreshToken,
      expires_at_ms: nextCredential.expiresAt,
      account_id: nextCredential.accountId,
    })}\n`,
    { mode: 0o600 },
  );
  await chmod(temporaryPath, 0o600);
  await rename(temporaryPath, path);
  return nextCredential;
}

function readCredential({
  value,
}: {
  value: Record<string, unknown>;
}): FxSubscriptionCredential | undefined {
  if (
    value.version !== 1 ||
    typeof value.access_token !== 'string' ||
    value.access_token.length === 0 ||
    typeof value.refresh_token !== 'string' ||
    value.refresh_token.length === 0 ||
    typeof value.expires_at_ms !== 'number' ||
    !Number.isSafeInteger(value.expires_at_ms) ||
    typeof value.account_id !== 'string' ||
    value.account_id.length === 0
  ) {
    return undefined;
  }
  return {
    accessToken: value.access_token,
    refreshToken: value.refresh_token,
    expiresAt: value.expires_at_ms,
    accountId: value.account_id,
  };
}

async function fetchGrokAccountId({
  accessToken,
  fetch: fetchImplementation,
}: {
  accessToken: string;
  fetch: typeof globalThis.fetch;
}): Promise<string> {
  const response = await fetchImplementation(
    'https://auth.x.ai/oauth2/userinfo',
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) {
    throw new Error(
      `fx Grok user info request failed with status ${response.status}.`,
    );
  }
  const parsed = await safeParseJSON({ text: await response.text() });
  if (
    !parsed.success ||
    !isRecord(parsed.value) ||
    typeof parsed.value.sub !== 'string' ||
    parsed.value.sub.length === 0
  ) {
    throw new Error('fx Grok user info request returned an invalid account.');
  }
  return parsed.value.sub;
}

async function extractChatGptAccountId({
  accessToken,
}: {
  accessToken: string;
}): Promise<string> {
  const segments = accessToken.split('.');
  if (segments.length === 3) {
    try {
      const payload = Buffer.from(segments[1], 'base64url').toString('utf8');
      const parsed = await safeParseJSON({ text: payload });
      if (parsed.success && isRecord(parsed.value)) {
        const auth = parsed.value['https://api.openai.com/auth'];
        if (
          isRecord(auth) &&
          typeof auth.chatgpt_account_id === 'string' &&
          auth.chatgpt_account_id.length > 0
        ) {
          return auth.chatgpt_account_id;
        }
      }
    } catch {}
  }
  throw new Error('fx ChatGPT access token does not contain an account ID.');
}

function createChatGptSandboxAccessToken({
  credential,
  accountId,
}: {
  credential: string;
  accountId: string;
}): string {
  const header = Buffer.from(
    JSON.stringify({ alg: 'none', typ: 'JWT' }),
  ).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      'https://api.openai.com/auth': { chatgpt_account_id: accountId },
    }),
  ).toString('base64url');
  return `${header}.${payload}.${credential}`;
}

function getAccessTokenEnvironmentVariable({
  provider,
}: {
  provider: FxSubscriptionProvider;
}): string {
  return provider === 'chatgpt'
    ? CHATGPT_ACCESS_TOKEN_ENVIRONMENT_VARIABLE
    : GROK_ACCESS_TOKEN_ENVIRONMENT_VARIABLE;
}

function getAccountIdEnvironmentVariable({
  provider,
}: {
  provider: FxSubscriptionProvider;
}): string {
  return provider === 'chatgpt'
    ? CHATGPT_ACCOUNT_ID_ENVIRONMENT_VARIABLE
    : GROK_ACCOUNT_ID_ENVIRONMENT_VARIABLE;
}
