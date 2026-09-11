import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { ACPAuthenticationMode } from '@ai-sdk/harness-acp';
import {
  isHarnessAuthenticationEnvironment,
  readLinuxSecretServicePassword,
  readMacOSKeychainPassword,
  readWindowsCredentialManagerPassword,
  shouldResolveNativeSubscription,
} from '@ai-sdk/harness/utils';
import { isRecord } from '@ai-sdk/provider-utils';
import { parse, type ParseError } from 'jsonc-parser';

const COPILOT_KEYRING_SERVICE = 'copilot-cli';
const execFileAsync = promisify(execFile);

type GitHubCopilotAccount = {
  readonly host: string;
  readonly login: string;
};

export type GitHubCopilotSubscription = {
  readonly token: string;
  readonly host: string;
};

type ReadSecureCredential = (options: {
  service: string;
  account: string;
}) => Promise<string | undefined>;

type FindGitHubCliExecutable = (options: {
  env: Readonly<Record<string, string | undefined>>;
  platform: NodeJS.Platform;
}) => Promise<string | undefined>;

type ReadGitHubCliToken = (options: {
  executable: string;
  hostname: string;
  env: Readonly<Record<string, string | undefined>>;
}) => Promise<string | undefined>;

export async function resolveGitHubCopilotSubscriptionEnvironment({
  auth,
  env,
  readSubscription = readGitHubCopilotSubscription,
}: {
  auth: ACPAuthenticationMode | undefined;
  env: Readonly<Record<string, string | undefined>>;
  readSubscription?: (options: {
    env: Readonly<Record<string, string | undefined>>;
  }) => Promise<GitHubCopilotSubscription | undefined>;
}): Promise<Readonly<Record<string, string | undefined>>> {
  if (isHarnessAuthenticationEnvironment(auth)) return auth;
  if (
    !shouldResolveNativeSubscription({
      auth,
      env,
      hasDirectCredential:
        env.COPILOT_GITHUB_TOKEN != null ||
        env.GH_TOKEN != null ||
        env.GITHUB_TOKEN != null,
    })
  ) {
    return env;
  }

  const subscription = await readSubscription({ env });
  if (subscription == null) return env;

  return {
    ...env,
    COPILOT_GITHUB_TOKEN: subscription.token,
    COPILOT_GH_HOST: normalizeGitHubHost(subscription.host),
  };
}

export async function readGitHubCopilotSubscription({
  env = process.env,
  homeDirectory = homedir(),
  platform = process.platform,
  readSecureCredential,
  findGitHubCliExecutable = findHostGitHubCliExecutable,
  readGitHubCliToken = readHostGitHubCliToken,
}: {
  env?: Readonly<Record<string, string | undefined>>;
  homeDirectory?: string;
  platform?: NodeJS.Platform;
  readSecureCredential?: ReadSecureCredential;
  findGitHubCliExecutable?: FindGitHubCliExecutable;
  readGitHubCliToken?: ReadGitHubCliToken;
} = {}): Promise<GitHubCopilotSubscription | undefined> {
  const copilotHome = resolve(
    env.COPILOT_HOME ?? join(homeDirectory, '.copilot'),
  );
  const config = await readGitHubCopilotConfig({
    path: join(copilotHome, 'config.json'),
  });
  const account = selectGitHubCopilotAccount({ config });

  if (account != null) {
    const accountKey = `${account.host}:${account.login}`;
    const secureToken = await (
      readSecureCredential ??
      (options => readGitHubCopilotSecureCredential({ ...options, platform }))
    )({
      service: COPILOT_KEYRING_SERVICE,
      account: accountKey,
    }).catch(() => undefined);
    if (isNonEmptyString(secureToken)) {
      return { token: secureToken, host: account.host };
    }

    const plaintextToken = getPlaintextToken({ config, accountKey });
    if (plaintextToken != null) {
      return { token: plaintextToken, host: account.host };
    }
  }

  const host =
    account?.host ??
    normalizeGitHubOrigin(env.COPILOT_GH_HOST ?? env.GH_HOST ?? 'github.com');
  if (host == null) return undefined;

  const executable = await findGitHubCliExecutable({ env, platform });
  if (executable == null) return undefined;

  const token = await readGitHubCliToken({
    executable,
    hostname: normalizeGitHubHost(host),
    env,
  }).catch(() => undefined);
  return isNonEmptyString(token) ? { token: token.trim(), host } : undefined;
}

export async function findHostGitHubCliExecutable({
  env,
  platform,
}: {
  env: Readonly<Record<string, string | undefined>>;
  platform: NodeJS.Platform;
}): Promise<string | undefined> {
  const path = env.PATH ?? env.Path ?? env.path;
  if (path == null) return undefined;

  const separator = platform === 'win32' ? ';' : ':';
  const names =
    platform === 'win32'
      ? getWindowsGitHubCliExecutableNames({ pathExt: env.PATHEXT })
      : ['gh'];
  const mode = platform === 'win32' ? constants.F_OK : constants.X_OK;

  for (const directory of path.split(separator)) {
    const normalizedDirectory = directory.replace(/^"|"$/g, '');
    if (normalizedDirectory.length === 0) continue;
    for (const executableName of names) {
      const candidate = resolve(normalizedDirectory, executableName);
      try {
        await access(candidate, mode);
        return candidate;
      } catch {}
    }
  }

  return undefined;
}

async function readGitHubCopilotConfig({
  path,
}: {
  path: string;
}): Promise<Record<string, unknown> | undefined> {
  const text = await readFile(path, 'utf8').catch(() => undefined);
  if (text == null) return undefined;

  const errors: ParseError[] = [];
  const value = parse(text, errors, { allowTrailingComma: true });
  return errors.length === 0 && isRecord(value) ? value : undefined;
}

function selectGitHubCopilotAccount({
  config,
}: {
  config: Record<string, unknown> | undefined;
}): GitHubCopilotAccount | undefined {
  if (config == null) return undefined;

  const lastLoggedInUser = toGitHubCopilotAccount(config.lastLoggedInUser);
  if (lastLoggedInUser != null) return lastLoggedInUser;

  if (!Array.isArray(config.loggedInUsers)) return undefined;
  for (const value of config.loggedInUsers) {
    const account = toGitHubCopilotAccount(value);
    if (account != null) return account;
  }
  return undefined;
}

function toGitHubCopilotAccount(
  value: unknown,
): GitHubCopilotAccount | undefined {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.host) ||
    !isNonEmptyString(value.login)
  ) {
    return undefined;
  }
  const host = normalizeGitHubOrigin(value.host);
  return host == null ? undefined : { host, login: value.login };
}

function getPlaintextToken({
  config,
  accountKey,
}: {
  config: Record<string, unknown> | undefined;
  accountKey: string;
}): string | undefined {
  if (config == null || !isRecord(config.copilotTokens)) return undefined;
  const token = config.copilotTokens[accountKey];
  return isNonEmptyString(token) ? token : undefined;
}

async function readGitHubCopilotSecureCredential({
  service,
  account,
  platform,
}: {
  service: string;
  account: string;
  platform: NodeJS.Platform;
}): Promise<string | undefined> {
  if (platform === 'darwin') {
    return readMacOSKeychainPassword({ service, account });
  }
  if (platform === 'linux') {
    return readLinuxSecretServicePassword({
      attributes: { service, username: account },
    });
  }
  if (platform === 'win32') {
    return readWindowsCredentialManagerPassword({
      targetName: `${account}.${service}`,
    });
  }
  return undefined;
}

async function readHostGitHubCliToken({
  executable,
  hostname,
  env,
}: {
  executable: string;
  hostname: string;
  env: Readonly<Record<string, string | undefined>>;
}): Promise<string | undefined> {
  try {
    const result = await execFileAsync(
      executable,
      ['auth', 'token', '--hostname', hostname],
      {
        env: { ...env },
        timeout: 10_000,
        windowsHide: true,
      },
    );
    return isNonEmptyString(result.stdout) ? result.stdout.trim() : undefined;
  } catch {
    return undefined;
  }
}

function getWindowsGitHubCliExecutableNames({
  pathExt,
}: {
  pathExt: string | undefined;
}): ReadonlyArray<string> {
  const extensions = (pathExt ?? '.COM;.EXE;.BAT;.CMD')
    .split(';')
    .filter(isNonEmptyString);
  return ['gh', ...extensions.map(extension => `gh${extension}`)];
}

function normalizeGitHubOrigin(host: string): string | undefined {
  try {
    return new URL(host.includes('://') ? host : `https://${host}`).origin;
  } catch {
    return undefined;
  }
}

export function normalizeGitHubHost(host: string): string {
  return new URL(host.includes('://') ? host : `https://${host}`).hostname;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
