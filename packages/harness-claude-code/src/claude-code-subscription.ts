import { execFileSync } from 'node:child_process';
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type {
  HarnessV1RequestTransformation,
  HarnessV1RequestTransformationSources,
} from '@ai-sdk/harness';
import {
  createCredentialRequestTransformation,
  isAccessTokenExpiringSoon,
  isHarnessAuthenticationEnvironment,
  isMacOS,
  readMacOSKeychainPassword,
  refreshOAuthAccessToken,
  shouldResolveNativeSubscription,
} from '@ai-sdk/harness/utils';
import { isRecord, safeParseJSON } from '@ai-sdk/provider-utils';
import {
  resolveClaudeCodeEnv,
  type ClaudeCodeAuthenticationMode,
  type ClaudeCodeResolvedAuthenticationMode,
  type ResolveClaudeCodeEnvOptions,
} from './claude-code-auth';

const CLAUDE_TOKEN_URL = 'https://platform.claude.com/v1/oauth/token';
const CLAUDE_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';

export function createClaudeCodeSubscriptionRequestTransformations({
  env: environment,
  sandboxEnv: sandboxEnvironment,
  auth: authenticationMode,
}: HarnessV1RequestTransformationSources<ClaudeCodeResolvedAuthenticationMode>): HarnessV1RequestTransformation[] {
  if (
    environment.CLAUDE_CODE_OAUTH_TOKEN == null ||
    sandboxEnvironment.CLAUDE_CODE_OAUTH_TOKEN == null
  ) {
    return [];
  }
  return [
    createCredentialRequestTransformation({
      matchUrl:
        authenticationMode === 'ai-gateway'
          ? environment.ANTHROPIC_BASE_URL
          : (environment.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com'),
      matchHeaders: {
        Authorization: `Bearer ${sandboxEnvironment.CLAUDE_CODE_OAUTH_TOKEN}`,
      },
      transformHeaders: {
        Authorization: `Bearer ${environment.CLAUDE_CODE_OAUTH_TOKEN}`,
      },
    }),
  ];
}

export async function resolveClaudeCodeAuthentication({
  auth,
  processEnv = process.env,
  options = {},
  readSubscription = readClaudeCodeSubscription,
}: {
  auth: ClaudeCodeAuthenticationMode | undefined;
  processEnv?: Record<string, string | undefined>;
  options?: ResolveClaudeCodeEnvOptions;
  readSubscription?: () => Promise<Record<string, string> | undefined>;
}): Promise<Record<string, string>> {
  const environmentWithoutHelper = resolveClaudeCodeEnv(auth, processEnv, {
    readApiKeyHelper: () => undefined,
  });
  if (isHarnessAuthenticationEnvironment(auth)) {
    return environmentWithoutHelper;
  }
  if (
    !shouldResolveNativeSubscription({
      auth,
      env: environmentWithoutHelper,
      hasDirectCredential:
        environmentWithoutHelper.ANTHROPIC_API_KEY != null ||
        environmentWithoutHelper.ANTHROPIC_AUTH_TOKEN != null ||
        environmentWithoutHelper.CLAUDE_CODE_OAUTH_TOKEN != null,
    })
  ) {
    return environmentWithoutHelper;
  }

  return (
    (await readSubscription()) ??
    resolveClaudeCodeEnv(auth, processEnv, options)
  );
}

export async function readClaudeCodeSubscription({
  env = process.env,
  homeDirectory = homedir(),
  platform = process.platform,
  fetch,
}: {
  env?: Record<string, string | undefined>;
  homeDirectory?: string;
  platform?: NodeJS.Platform;
  fetch?: typeof globalThis.fetch;
} = {}): Promise<Record<string, string> | undefined> {
  const configDirectory = resolve(
    env.CLAUDE_CONFIG_DIR ?? join(homeDirectory, '.claude'),
  );
  const credentialPath = join(configDirectory, '.credentials.json');
  const stored = await readClaudeCredentialStore({
    credentialPath,
    homeDirectory,
    configDirectory,
    platform,
  });
  if (stored == null) return undefined;
  const oauth = getClaudeOAuthCredential({ value: stored.value });
  if (oauth == null) return undefined;
  const { accessToken, refreshToken, expiresAt } = oauth;

  let resolvedAccessToken = accessToken;
  if (isAccessTokenExpiringSoon({ expiresAt })) {
    const refreshed = await refreshOAuthAccessToken({
      tokenUrl: CLAUDE_TOKEN_URL,
      clientId: CLAUDE_CLIENT_ID,
      refreshToken,
      requestFormat: 'json',
      ...(fetch == null ? {} : { fetch }),
    });
    resolvedAccessToken = refreshed.accessToken;
    await stored.write({
      ...stored.value,
      claudeAiOauth: {
        ...oauth,
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken ?? refreshToken,
        expiresAt: refreshed.expiresAt,
      },
    });
  }

  return {
    CLAUDE_CODE_OAUTH_TOKEN: resolvedAccessToken,
    ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
  };
}

type ClaudeCredentialFile = {
  readonly claudeAiOauth?: unknown;
  readonly [key: string]: unknown;
};

type ClaudeOAuthCredential = Record<string, unknown> & {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: number;
};

async function readClaudeCredentialStore({
  credentialPath,
  homeDirectory,
  configDirectory,
  platform,
}: {
  credentialPath: string;
  homeDirectory: string;
  configDirectory: string;
  platform: NodeJS.Platform;
}): Promise<
  | {
      value: ClaudeCredentialFile;
      write(value: ClaudeCredentialFile): Promise<void>;
    }
  | undefined
> {
  const text = await readFile(credentialPath, 'utf8').catch(() => undefined);
  if (text != null) {
    const value = await parseClaudeCredentialFile(text);
    if (value != null && getClaudeOAuthCredential({ value }) != null) {
      return {
        value,
        write: updated =>
          writeClaudeCredentialFile({ credentialPath, value: updated }),
      };
    }
  }

  if (!isMacOS(platform)) return undefined;
  if (configDirectory !== resolve(join(homeDirectory, '.claude'))) {
    return undefined;
  }
  const service = 'Claude Code-credentials';
  const keychainText = await readMacOSKeychainPassword({
    service,
    account: process.env.USER ?? '',
  });
  if (keychainText == null) return undefined;
  const value = await parseClaudeCredentialFile(keychainText);
  if (value == null) return undefined;
  return {
    value,
    write: async updated => {
      execFileSync(
        '/usr/bin/security',
        [
          'add-generic-password',
          '-U',
          '-s',
          service,
          '-a',
          process.env.USER ?? '',
          '-w',
          JSON.stringify(updated),
        ],
        { stdio: 'ignore' },
      );
    },
  };
}

function getClaudeOAuthCredential({
  value,
}: {
  value: ClaudeCredentialFile;
}): ClaudeOAuthCredential | undefined {
  const oauth = value.claudeAiOauth;
  if (
    !isRecord(oauth) ||
    typeof oauth.accessToken !== 'string' ||
    typeof oauth.refreshToken !== 'string' ||
    typeof oauth.expiresAt !== 'number'
  ) {
    return undefined;
  }
  return oauth as ClaudeOAuthCredential;
}

async function parseClaudeCredentialFile(
  text: string,
): Promise<ClaudeCredentialFile | undefined> {
  const parsed = await safeParseJSON({ text });
  return parsed.success && isRecord(parsed.value)
    ? (parsed.value as ClaudeCredentialFile)
    : undefined;
}

async function writeClaudeCredentialFile({
  credentialPath,
  value,
}: {
  credentialPath: string;
  value: ClaudeCredentialFile;
}): Promise<void> {
  await mkdir(dirname(credentialPath), { recursive: true });
  const temporaryPath = `${credentialPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
  await chmod(temporaryPath, 0o600);
  await rename(temporaryPath, credentialPath);
}
