import { chmod, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ACPAuthenticationMode } from '@ai-sdk/harness-acp';
import {
  getAiGatewayAuthFromEnv,
  isAccessTokenExpiringSoon,
  isHarnessAuthenticationEnvironment,
  refreshOAuthAccessToken,
} from '@ai-sdk/harness/utils';
import { isRecord, safeParseJSON } from '@ai-sdk/provider-utils';

const OPENAI_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const XAI_CLIENT_ID = 'b1a00492-073a-47ea-816f-4c329264a828';
const CHATGPT_BASE_URL = 'https://chatgpt.com/backend-api/codex';
const XAI_BASE_URL = 'https://api.x.ai/v1';

export async function resolveFxSubscriptionEnvironment({
  auth,
  env,
  model,
}: {
  auth: ACPAuthenticationMode | undefined;
  env: Readonly<Record<string, string | undefined>>;
  model?: string;
}): Promise<Readonly<Record<string, string | undefined>>> {
  if (isHarnessAuthenticationEnvironment(auth)) return auth;
  if (auth === 'ai-gateway') return env;
  if (auth !== 'direct' && getAiGatewayAuthFromEnv({ env }).apiKey != null) {
    return env;
  }
  if (env.OPENAI_API_KEY != null || env.XAI_API_KEY != null) return env;

  const subscription = await readFxSubscription({ env, model });
  return subscription == null ? env : { ...env, ...subscription };
}

export async function readFxSubscription({
  env = process.env,
  homeDirectory = homedir(),
  model,
  fetch,
}: {
  env?: Readonly<Record<string, string | undefined>>;
  homeDirectory?: string;
  model?: string;
  fetch?: typeof globalThis.fetch;
} = {}): Promise<Record<string, string> | undefined> {
  const fxDirectory = env.FX_HOME ?? join(homeDirectory, '.fx');
  const providers = providerOrder(model);
  for (const provider of providers) {
    const path = join(
      fxDirectory,
      provider === 'openai' ? 'chatgpt-auth.json' : 'grok-auth.json',
    );
    const text = await readFile(path, 'utf8').catch(() => undefined);
    if (text == null) continue;
    const parsed = await safeParseJSON({ text });
    if (!parsed.success || !isRecord(parsed.value)) continue;
    const credential = readCredential(parsed.value);
    if (credential == null) continue;

    let accessToken = credential.accessToken;
    if (isAccessTokenExpiringSoon({ expiresAt: credential.expiresAt })) {
      const refreshed = await refreshOAuthAccessToken({
        tokenUrl:
          provider === 'openai'
            ? 'https://auth.openai.com/oauth/token'
            : 'https://auth.x.ai/oauth2/token',
        clientId: provider === 'openai' ? OPENAI_CLIENT_ID : XAI_CLIENT_ID,
        refreshToken: credential.refreshToken,
        ...(fetch == null ? {} : { fetch }),
      });
      accessToken = refreshed.accessToken;
      setCredentialField({
        value: parsed.value,
        names: ['access_token', 'accessToken', 'access'],
        valueToSet: refreshed.accessToken,
      });
      setCredentialField({
        value: parsed.value,
        names: ['refresh_token', 'refreshToken', 'refresh'],
        valueToSet: refreshed.refreshToken ?? credential.refreshToken,
      });
      setCredentialField({
        value: parsed.value,
        names: ['expires_at', 'expiresAt', 'expires'],
        valueToSet: refreshed.expiresAt,
      });
      const temporaryPath = `${path}.${process.pid}.tmp`;
      await writeFile(
        temporaryPath,
        `${JSON.stringify(parsed.value, null, 2)}\n`,
        { mode: 0o600 },
      );
      await chmod(temporaryPath, 0o600);
      await rename(temporaryPath, path);
    }

    if (provider === 'openai') {
      return {
        OPENAI_API_KEY: accessToken,
        OPENAI_BASE_URL: CHATGPT_BASE_URL,
        ...(credential.accountId == null
          ? {}
          : { FX_CHATGPT_ACCOUNT_ID: credential.accountId }),
      };
    }
    return {
      XAI_API_KEY: accessToken,
      XAI_BASE_URL: XAI_BASE_URL,
    };
  }
  return undefined;
}

function providerOrder(model: string | undefined): Array<'openai' | 'xai'> {
  const normalized = model?.toLowerCase();
  if (normalized?.includes('grok') || normalized?.startsWith('xai/')) {
    return ['xai'];
  }
  if (
    normalized?.includes('gpt') ||
    normalized?.includes('codex') ||
    normalized?.startsWith('openai/')
  ) {
    return ['openai'];
  }
  return ['openai', 'xai'];
}

function readCredential(value: Record<string, unknown>):
  | {
      accessToken: string;
      refreshToken: string;
      expiresAt: number;
      accountId?: string;
    }
  | undefined {
  const accessToken = readString(value, [
    'access_token',
    'accessToken',
    'access',
  ]);
  const refreshToken = readString(value, [
    'refresh_token',
    'refreshToken',
    'refresh',
  ]);
  const expiresAt = normalizeExpiresAt(
    readValue(value, ['expires_at', 'expiresAt', 'expires']),
  );
  if (accessToken == null || refreshToken == null || expiresAt == null) {
    return undefined;
  }
  const accountId = readString(value, ['account_id', 'accountId']);
  return {
    accessToken,
    refreshToken,
    expiresAt,
    ...(accountId == null ? {} : { accountId }),
  };
}

function setCredentialField({
  value,
  names,
  valueToSet,
}: {
  value: Record<string, unknown>;
  names: readonly string[];
  valueToSet: string | number;
}): void {
  const name = names.find(candidate => candidate in value) ?? names[0];
  value[name] = valueToSet;
}

function readString(
  value: Record<string, unknown>,
  names: readonly string[],
): string | undefined {
  const result = readValue(value, names);
  return typeof result === 'string' && result.length > 0 ? result : undefined;
}

function readValue(
  value: Record<string, unknown>,
  names: readonly string[],
): unknown {
  for (const name of names) {
    if (name in value) return value[name];
  }
  return undefined;
}

function normalizeExpiresAt(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 10_000_000_000 ? value * 1000 : value;
  }
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}
