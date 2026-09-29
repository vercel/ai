import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ACPAuthenticationMode } from '@ai-sdk/harness-acp';
import {
  getJwtExpiresAt,
  isAccessTokenExpiringSoon,
  isHarnessAuthenticationEnvironment,
  isLinux,
  isMacOS,
  isWindows,
  readMacOSKeychainPassword,
  shouldResolveNativeSubscription,
} from '@ai-sdk/harness/utils';
import { isRecord, safeParseJSON } from '@ai-sdk/provider-utils';

export async function resolveCursorSubscriptionEnvironment({
  auth,
  env,
}: {
  auth: ACPAuthenticationMode | undefined;
  env: Readonly<Record<string, string | undefined>>;
}): Promise<Readonly<Record<string, string | undefined>>> {
  if (isHarnessAuthenticationEnvironment(auth)) return auth;
  if (
    !shouldResolveNativeSubscription({
      auth,
      env,
      hasDirectCredential: env.CURSOR_API_KEY != null,
    })
  ) {
    return env;
  }
  const subscription = await readCursorSubscription({ env });
  return subscription == null ? env : { ...env, CURSOR_API_KEY: subscription };
}

export async function readCursorSubscription({
  env = process.env,
  homeDirectory = homedir(),
  platform = process.platform,
}: {
  env?: Readonly<Record<string, string | undefined>>;
  homeDirectory?: string;
  platform?: NodeJS.Platform;
} = {}): Promise<string | undefined> {
  if (env.AGENT_CLI_CREDENTIAL_STORE === 'memory') return undefined;
  const authPath = resolveCursorAuthPath({ env, homeDirectory, platform });
  const text = await readFile(authPath, 'utf8').catch(() => undefined);
  const fileCredential =
    text == null ? undefined : await parseAccessToken(text);
  const accessToken =
    fileCredential ??
    (isMacOS(platform) && env.AGENT_CLI_CREDENTIAL_STORE !== 'file'
      ? await readMacOSKeychainPassword({
          service: 'cursor-access-token',
          account: 'cursor-user',
        })
      : undefined);
  if (accessToken == null) return undefined;

  const expiresAt = await getJwtExpiresAt({ token: accessToken });
  if (expiresAt != null && isAccessTokenExpiringSoon({ expiresAt })) {
    throw new Error(
      'Cursor subscription access token is expiring soon. Run Cursor login again.',
    );
  }
  return accessToken;
}

export function resolveCursorAuthPath({
  env,
  homeDirectory,
  platform,
}: {
  env: Readonly<Record<string, string | undefined>>;
  homeDirectory: string;
  platform: NodeJS.Platform;
}): string {
  if (isWindows(platform)) {
    return join(
      env.APPDATA ?? join(homeDirectory, 'AppData', 'Roaming'),
      'Cursor',
      'auth.json',
    );
  }
  if (isLinux(platform)) {
    return join(
      env.XDG_CONFIG_HOME ?? join(homeDirectory, '.config'),
      'cursor',
      'auth.json',
    );
  }
  return join(homeDirectory, '.cursor', 'auth.json');
}

async function parseAccessToken(text: string): Promise<string | undefined> {
  const parsed = await safeParseJSON({ text });
  if (!parsed.success || !isRecord(parsed.value)) return undefined;
  return typeof parsed.value.accessToken === 'string'
    ? parsed.value.accessToken
    : undefined;
}
