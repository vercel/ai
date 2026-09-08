import { chmod, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import type { ACPAuthenticationMode } from '@ai-sdk/harness-acp';
import {
  getAiGatewayAuthFromEnv,
  isAccessTokenExpiringSoon,
  isHarnessAuthenticationEnvironment,
  refreshOAuthAccessToken,
} from '@ai-sdk/harness/utils';
import { isRecord, safeParseJSON } from '@ai-sdk/provider-utils';

const XAI_CLIENT_ID = 'b1a00492-073a-47ea-816f-4c329264a828';
const GROK_SUBSCRIPTION_BASE_URL = 'https://cli-chat-proxy.grok.com/v1';

export async function resolveGrokBuildSubscriptionEnvironment({
  auth,
  env,
}: {
  auth: ACPAuthenticationMode | undefined;
  env: Readonly<Record<string, string | undefined>>;
}): Promise<Readonly<Record<string, string | undefined>>> {
  if (isHarnessAuthenticationEnvironment(auth)) return auth;
  if (auth === 'ai-gateway') return env;
  if (auth !== 'direct' && getAiGatewayAuthFromEnv({ env }).apiKey != null) {
    return env;
  }
  if (env.XAI_API_KEY != null) return env;

  const subscription = await readGrokBuildSubscription({ env });
  return subscription == null ? env : { ...env, ...subscription };
}

export async function readGrokBuildSubscription({
  env = process.env,
  homeDirectory = homedir(),
  fetch,
}: {
  env?: Readonly<Record<string, string | undefined>>;
  homeDirectory?: string;
  fetch?: typeof globalThis.fetch;
} = {}): Promise<Record<string, string> | undefined> {
  const grokHome = resolve(env.GROK_HOME ?? join(homeDirectory, '.grok'));
  const authPath = join(grokHome, 'auth.json');
  const text = await readFile(authPath, 'utf8').catch(() => undefined);
  if (text == null) return undefined;
  const parsed = await safeParseJSON({ text });
  if (!parsed.success || !isRecord(parsed.value)) return undefined;

  const selected = selectOAuthRecord(parsed.value);
  if (selected == null) return undefined;
  let accessToken = selected.record.key;
  if (isAccessTokenExpiringSoon({ expiresAt: selected.record.expiresAt })) {
    const discoveryResponse = await (fetch ?? globalThis.fetch)(
      `${selected.issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`,
    );
    if (!discoveryResponse.ok) {
      throw new Error(
        `Grok OAuth discovery failed with status ${discoveryResponse.status}.`,
      );
    }
    const discovery = await safeParseJSON({
      text: await discoveryResponse.text(),
    });
    if (
      !discovery.success ||
      !isRecord(discovery.value) ||
      typeof discovery.value.token_endpoint !== 'string'
    ) {
      throw new Error('Grok OAuth discovery returned no token endpoint.');
    }
    const refreshed = await refreshOAuthAccessToken({
      tokenUrl: discovery.value.token_endpoint,
      clientId: XAI_CLIENT_ID,
      refreshToken: selected.record.refreshToken,
      ...(fetch == null ? {} : { fetch }),
    });
    accessToken = refreshed.accessToken;
    const originalRecord = parsed.value[selected.scope];
    parsed.value[selected.scope] = {
      ...(isRecord(originalRecord) ? originalRecord : {}),
      key: refreshed.accessToken,
      refresh_token: refreshed.refreshToken ?? selected.record.refreshToken,
      expires_at: refreshed.expiresAt,
    };
    const temporaryPath = `${authPath}.${process.pid}.tmp`;
    await writeFile(
      temporaryPath,
      `${JSON.stringify(parsed.value, null, 2)}\n`,
      {
        mode: 0o600,
      },
    );
    await chmod(temporaryPath, 0o600);
    await rename(temporaryPath, authPath);
  }

  return {
    XAI_API_KEY: accessToken,
    GROK_XAI_API_BASE_URL: GROK_SUBSCRIPTION_BASE_URL,
    GROK_MODELS_BASE_URL: GROK_SUBSCRIPTION_BASE_URL,
    GROK_CLI_CHAT_PROXY_BASE_URL: GROK_SUBSCRIPTION_BASE_URL,
  };
}

function selectOAuthRecord(value: Record<string, unknown>):
  | {
      scope: string;
      issuer: string;
      record: {
        key: string;
        refreshToken: string;
        expiresAt: number;
      };
    }
  | undefined {
  for (const [scope, candidate] of Object.entries(value)) {
    if (!isRecord(candidate)) continue;
    const key = candidate.key;
    const refreshToken = candidate.refresh_token;
    const expiresAt = normalizeExpiresAt(candidate.expires_at);
    const separator = scope.lastIndexOf('::');
    if (
      typeof key === 'string' &&
      typeof refreshToken === 'string' &&
      expiresAt != null &&
      separator > 0 &&
      scope.slice(separator + 2) === XAI_CLIENT_ID
    ) {
      return {
        scope,
        issuer: scope.slice(0, separator),
        record: { key, refreshToken, expiresAt },
      };
    }
  }
  return undefined;
}

function normalizeExpiresAt(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 10_000_000_000 ? value * 1000 : value;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}
