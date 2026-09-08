import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmod,
  mkdir,
  readFile,
  realpath,
  rename,
  writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import {
  isAccessTokenExpiringSoon,
  isHarnessAuthenticationEnvironment,
  refreshOAuthAccessToken,
} from '@ai-sdk/harness/utils';
import { isRecord, safeParseJSON } from '@ai-sdk/provider-utils';
import { resolveCodexEnv, type CodexAuthenticationMode } from './codex-auth';

const CHATGPT_CODEX_BASE_URL = 'https://chatgpt.com/backend-api/codex';
const OPENAI_TOKEN_URL = 'https://auth.openai.com/oauth/token';
const OPENAI_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const execFileAsync = promisify(execFile);

export type CodexResolvedAuthentication = {
  readonly environment: Record<string, string>;
  readonly requestHeaders?: Readonly<Record<string, string>>;
};

type CodexAuthFile = {
  readonly auth_mode?: unknown;
  readonly tokens?: {
    readonly access_token?: unknown;
    readonly refresh_token?: unknown;
    readonly account_id?: unknown;
  };
  readonly [key: string]: unknown;
};

export async function resolveCodexAuthentication({
  auth,
  processEnv = process.env,
  readSubscription = readCodexSubscription,
}: {
  auth: CodexAuthenticationMode | undefined;
  processEnv?: Record<string, string | undefined>;
  readSubscription?: () => Promise<CodexResolvedAuthentication | undefined>;
}): Promise<CodexResolvedAuthentication> {
  const environment = resolveCodexEnv(auth, processEnv);
  if (
    isHarnessAuthenticationEnvironment(auth) ||
    auth === 'ai-gateway' ||
    environment.AI_GATEWAY_API_KEY != null ||
    environment.CODEX_API_KEY != null
  ) {
    return { environment };
  }

  return (await readSubscription()) ?? { environment };
}

export async function readCodexSubscription({
  env = process.env,
  homeDirectory = homedir(),
  fetch,
}: {
  env?: Record<string, string | undefined>;
  homeDirectory?: string;
  fetch?: typeof globalThis.fetch;
} = {}): Promise<CodexResolvedAuthentication | undefined> {
  const codexHome = resolve(env.CODEX_HOME ?? join(homeDirectory, '.codex'));
  const authPath = join(codexHome, 'auth.json');
  const stored = await readCodexAuthStore({ codexHome, authPath });
  if (stored == null) return undefined;

  const credential = toCodexCredential(stored.value);
  if (credential == null) return undefined;

  let accessToken = credential.accessToken;
  if (isAccessTokenExpiringSoon({ expiresAt: credential.expiresAt })) {
    const refreshed = await refreshOAuthAccessToken({
      tokenUrl: OPENAI_TOKEN_URL,
      clientId: OPENAI_CLIENT_ID,
      refreshToken: credential.refreshToken,
      requestFormat: 'json',
      ...(fetch == null ? {} : { fetch }),
    });
    accessToken = refreshed.accessToken;
    await stored.write({
      ...stored.value,
      last_refresh: new Date().toISOString(),
      tokens: {
        ...stored.value.tokens,
        access_token: refreshed.accessToken,
        refresh_token: refreshed.refreshToken ?? credential.refreshToken,
      },
    });
  }

  return {
    environment: {
      CODEX_API_KEY: accessToken,
      OPENAI_BASE_URL: CHATGPT_CODEX_BASE_URL,
    },
    ...(credential.accountId == null
      ? {}
      : {
          requestHeaders: {
            'ChatGPT-Account-ID': credential.accountId,
          },
        }),
  };
}

async function readCodexAuthStore({
  codexHome,
  authPath,
}: {
  codexHome: string;
  authPath: string;
}): Promise<
  | {
      value: CodexAuthFile;
      write(value: CodexAuthFile): Promise<void>;
    }
  | undefined
> {
  const fileValue = await readCodexAuthFile(authPath);
  if (fileValue != null) {
    return {
      value: fileValue,
      write: value => writeCodexAuthFile({ authPath, value }),
    };
  }

  if (process.platform !== 'darwin') return undefined;
  const canonicalHome = await realpath(codexHome).catch(() => codexHome);
  const account = `cli|${createHash('sha256')
    .update(canonicalHome)
    .digest('hex')
    .slice(0, 16)}`;
  const keychainValue = await readMacOSKeychain({
    service: 'Codex Auth',
    account,
  });
  if (keychainValue == null) return undefined;
  const parsed = await parseCodexAuthFile(keychainValue);
  if (parsed == null) return undefined;
  return {
    value: parsed,
    write: value =>
      writeMacOSKeychain({
        service: 'Codex Auth',
        account,
        value: JSON.stringify(value),
      }),
  };
}

async function readCodexAuthFile(
  authPath: string,
): Promise<CodexAuthFile | undefined> {
  const text = await readFile(authPath, 'utf8').catch(() => undefined);
  return text == null ? undefined : parseCodexAuthFile(text);
}

async function parseCodexAuthFile(
  text: string,
): Promise<CodexAuthFile | undefined> {
  const parsed = await safeParseJSON({ text });
  return parsed.success && isRecord(parsed.value)
    ? (parsed.value as CodexAuthFile)
    : undefined;
}

function toCodexCredential(value: CodexAuthFile):
  | {
      accessToken: string;
      refreshToken: string;
      expiresAt: number;
      accountId?: string;
    }
  | undefined {
  if (value.auth_mode !== 'chatgpt' || !isRecord(value.tokens)) {
    return undefined;
  }
  const accessToken = value.tokens.access_token;
  const refreshToken = value.tokens.refresh_token;
  if (typeof accessToken !== 'string' || typeof refreshToken !== 'string') {
    return undefined;
  }
  const expiresAt = getJwtExpiry(accessToken);
  if (expiresAt == null) return undefined;
  const accountId = value.tokens.account_id;
  return {
    accessToken,
    refreshToken,
    expiresAt,
    ...(typeof accountId === 'string' ? { accountId } : {}),
  };
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

async function writeCodexAuthFile({
  authPath,
  value,
}: {
  authPath: string;
  value: CodexAuthFile;
}): Promise<void> {
  await mkdir(dirname(authPath), { recursive: true });
  const temporaryPath = `${authPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
  await chmod(temporaryPath, 0o600);
  await rename(temporaryPath, authPath);
}

async function readMacOSKeychain({
  service,
  account,
}: {
  service: string;
  account: string;
}): Promise<string | undefined> {
  try {
    const result = await execFileAsync('/usr/bin/security', [
      'find-generic-password',
      '-s',
      service,
      '-a',
      account,
      '-w',
    ]);
    return result.stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

async function writeMacOSKeychain({
  service,
  account,
  value,
}: {
  service: string;
  account: string;
  value: string;
}): Promise<void> {
  await execFileAsync('/usr/bin/security', [
    'add-generic-password',
    '-U',
    '-s',
    service,
    '-a',
    account,
    '-w',
    value,
  ]);
}
