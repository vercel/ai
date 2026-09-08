import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { ACPAuthenticationMode } from '@ai-sdk/harness-acp';
import {
  getAiGatewayAuthFromEnv,
  isAccessTokenExpiringSoon,
  isHarnessAuthenticationEnvironment,
} from '@ai-sdk/harness/utils';
import { isRecord, safeParseJSON } from '@ai-sdk/provider-utils';

const execFileAsync = promisify(execFile);

export async function resolveCursorSubscriptionEnvironment({
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
  if (env.CURSOR_API_KEY != null) return env;
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
    (platform === 'darwin' && env.AGENT_CLI_CREDENTIAL_STORE !== 'file'
      ? await readMacOSCursorAccessToken()
      : undefined);
  if (accessToken == null) return undefined;

  const expiresAt = getJwtExpiry(accessToken);
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
  if (platform === 'win32') {
    return join(
      env.APPDATA ?? join(homeDirectory, 'AppData', 'Roaming'),
      'Cursor',
      'auth.json',
    );
  }
  if (platform === 'linux') {
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

async function readMacOSCursorAccessToken(): Promise<string | undefined> {
  try {
    const result = await execFileAsync('/usr/bin/security', [
      'find-generic-password',
      '-s',
      'cursor-access-token',
      '-a',
      'cursor-user',
      '-w',
    ]);
    return result.stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

function getJwtExpiry(token: string): number | undefined {
  const payload = token.split('.')[1];
  if (payload == null) return undefined;
  try {
    const decoded = Buffer.from(payload, 'base64url').toString('utf8');
    const match = /(?:^|[,{}])\s*"exp"\s*:\s*(\d+)/.exec(decoded);
    return match == null ? undefined : Number(match[1]) * 1000;
  } catch {
    return undefined;
  }
}
