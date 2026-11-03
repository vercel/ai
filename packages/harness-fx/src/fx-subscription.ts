import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  chmod,
  readFile,
  realpath,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  getJwtExpiresAt,
  isHarnessAuthenticationEnvironment,
  isLinux,
  isMacOS,
  isWindows,
  readLinuxSecretServicePassword,
  readMacOSKeychainPassword,
  readWindowsCredentialManagerPassword,
  shouldResolveNativeSubscription,
} from '@ai-sdk/harness/utils';
import { isRecord, safeParseJSON } from '@ai-sdk/provider-utils';
import { resolveFxEnv, type FxAuthenticationMode } from './fx-auth';

export type FxProvider = 'gateway' | 'codex' | 'grok';
export type FxProviderCredentials = {
  accessToken: string;
  refreshToken?: string;
  accountId?: string;
  expiresAt?: number;
};
export type FxSubscription = {
  provider: 'codex' | 'grok';
  read(): Promise<FxProviderCredentials>;
  write(options: { credentials: FxProviderCredentials }): Promise<void>;
};
export type FxResolvedAuthentication =
  | { provider: 'gateway'; apiKey: string; baseUrl: string }
  | { provider: 'codex' | 'grok'; subscription: FxSubscription };

type CredentialStore = {
  read(): Promise<Record<string, unknown> | undefined>;
  write(options: { value: Record<string, unknown> }): Promise<void>;
};
type CodexKeyring = {
  read(options: {
    service: string;
    account: string;
  }): Promise<string | undefined>;
  write(options: {
    service: string;
    account: string;
    value: string;
  }): Promise<void>;
};
type CredentialFormat = 'fx' | 'codex' | 'grok';
const grokScope = 'https://auth.x.ai::b1a00492-073a-47ea-816f-4c329264a828';

export async function resolveFxAuthentication({
  auth,
  env = process.env,
  homeDirectory = homedir(),
  platform = process.platform,
  requiredProvider,
  keyring,
}: {
  auth?: FxAuthenticationMode;
  env?: Readonly<Record<string, string | undefined>>;
  homeDirectory?: string;
  platform?: NodeJS.Platform;
  requiredProvider?: FxProvider;
  keyring?: CodexKeyring;
} = {}): Promise<FxResolvedAuthentication> {
  const environment = resolveFxEnv({ auth, env });
  const isolated = isHarnessAuthenticationEnvironment(auth);
  const nativeRequired =
    requiredProvider != null && requiredProvider !== 'gateway';
  if (nativeRequired && (isolated || auth === 'ai-gateway')) {
    throw new Error(
      'Cannot resume fx: authentication does not allow the saved subscription provider.',
    );
  }
  if (
    !isolated &&
    requiredProvider !== 'gateway' &&
    shouldResolveNativeSubscription({
      auth: nativeRequired ? 'direct' : auth,
      env: environment,
      hasDirectCredential: false,
    })
  ) {
    for (const provider of ['codex', 'grok'] as const) {
      if (requiredProvider != null && provider !== requiredProvider) continue;
      const subscription = await bindSubscription({
        provider,
        format: 'fx',
        store: fileStore({
          filePath: join(
            homeDirectory,
            '.fx',
            provider === 'codex' ? 'chatgpt-auth.json' : 'grok-auth.json',
          ),
        }),
      });
      if (subscription) return { provider, subscription };
    }
    if (requiredProvider == null || requiredProvider === 'codex') {
      const codexHome = resolve(
        env.CODEX_HOME ?? join(homeDirectory, '.codex'),
      );
      const config = await readFile(
        join(codexHome, 'config.toml'),
        'utf8',
      ).catch(() => '');
      let mode = 'file';
      for (const line of config.split(/\r?\n/)) {
        if (line.trimStart().startsWith('[')) break;
        const match =
          /^\s*cli_auth_credentials_store\s*=\s*["'](file|keyring|auto|ephemeral)["']\s*(?:#.*)?$/.exec(
            line,
          );
        if (match) {
          mode = match[1];
          break;
        }
      }
      if (mode === 'keyring' || mode === 'auto') {
        const selectedKeyring = keyring ?? createCodexKeyring({ platform });
        if (selectedKeyring) {
          const canonicalHome = await realpath(codexHome).catch(
            () => codexHome,
          );
          const account = `cli|${createHash('sha256').update(canonicalHome).digest('hex').slice(0, 16)}`;
          const subscription = await bindSubscription({
            provider: 'codex',
            format: 'codex',
            store: {
              async read() {
                const text = await selectedKeyring.read({
                  service: 'Codex Auth',
                  account,
                });
                return text == null ? undefined : parseCredentialDocument(text);
              },
              write: ({ value }) =>
                selectedKeyring.write({
                  service: 'Codex Auth',
                  account,
                  value: JSON.stringify(value),
                }),
            },
          });
          if (subscription) return { provider: 'codex', subscription };
        }
      }
      if (mode === 'file' || mode === 'auto') {
        const subscription = await bindSubscription({
          provider: 'codex',
          format: 'codex',
          store: fileStore({ filePath: join(codexHome, 'auth.json') }),
        });
        if (subscription) return { provider: 'codex', subscription };
      }
    }
    if (requiredProvider == null || requiredProvider === 'grok') {
      const subscription = await bindSubscription({
        provider: 'grok',
        format: 'grok',
        store: fileStore({
          filePath: join(
            resolve(env.GROK_HOME ?? join(homeDirectory, '.grok')),
            'auth.json',
          ),
        }),
      });
      if (subscription) return { provider: 'grok', subscription };
    }
  }
  if (nativeRequired)
    throw new Error(
      `Cannot resume fx: no ${requiredProvider} subscription credentials are available.`,
    );
  if (!environment.AI_GATEWAY_API_KEY) {
    throw new Error(
      'fx requires AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN in the host environment or an explicit authentication environment. No subscription credentials were available.',
    );
  }
  return {
    provider: 'gateway',
    apiKey: environment.AI_GATEWAY_API_KEY,
    baseUrl: environment.AI_GATEWAY_BASE_URL,
  };
}

async function bindSubscription({
  provider,
  format,
  store,
}: {
  provider: 'codex' | 'grok';
  format: CredentialFormat;
  store: CredentialStore;
}): Promise<FxSubscription | undefined> {
  const value = await store.read();
  if (
    value == null ||
    (await credentialsFromDocument({ value, format })) == null
  )
    return undefined;
  return {
    provider,
    async read() {
      const value = await store.read();
      const credentials =
        value == null
          ? undefined
          : await credentialsFromDocument({ value, format });
      if (credentials == null)
        throw new Error(
          `The selected fx ${provider} subscription credentials are no longer available.`,
        );
      return credentials;
    },
    async write({ credentials }) {
      const value = await store.read();
      if (
        value == null ||
        (await credentialsFromDocument({ value, format })) == null
      )
        throw new Error(
          'Cannot update the selected fx subscription credential store.',
        );
      const record = credentialRecord({ value, format })!;
      const next = {
        ...record,
        [format === 'grok' ? 'key' : 'access_token']: credentials.accessToken,
        ...(credentials.refreshToken == null
          ? {}
          : { refresh_token: credentials.refreshToken }),
        ...(credentials.accountId == null
          ? {}
          : {
              [format === 'grok' ? 'user_id' : 'account_id']:
                credentials.accountId,
            }),
        ...(format === 'fx' && credentials.expiresAt != null
          ? { expires_at_ms: credentials.expiresAt }
          : {}),
        ...(format === 'grok' && credentials.expiresAt != null
          ? { expires_at: new Date(credentials.expiresAt).toISOString() }
          : {}),
      };
      await store.write({
        value:
          format === 'fx'
            ? next
            : format === 'codex'
              ? {
                  ...value,
                  tokens: next,
                  last_refresh: new Date().toISOString(),
                }
              : { ...value, [grokScope]: next },
      });
    },
  };
}

function credentialRecord({
  value,
  format,
}: {
  value: Record<string, unknown>;
  format: CredentialFormat;
}): Record<string, unknown> | undefined {
  if (format === 'fx') return value.version === 1 ? value : undefined;
  const record =
    format === 'codex'
      ? value.auth_mode === 'chatgpt'
        ? value.tokens
        : undefined
      : value[grokScope];
  return isRecord(record) ? record : undefined;
}

async function credentialsFromDocument({
  value,
  format,
}: {
  value: Record<string, unknown>;
  format: CredentialFormat;
}): Promise<FxProviderCredentials | undefined> {
  const record = credentialRecord({ value, format });
  if (!record) return undefined;
  const accessToken = format === 'grok' ? record.key : record.access_token;
  if (typeof accessToken !== 'string' || accessToken.length === 0)
    return undefined;
  const refreshToken = record.refresh_token;
  const accountId = format === 'grok' ? record.user_id : record.account_id;
  let expiresAt: number | undefined;
  if (format === 'fx') {
    if (
      typeof refreshToken !== 'string' ||
      refreshToken.length === 0 ||
      typeof accountId !== 'string' ||
      accountId.length === 0 ||
      typeof record.expires_at_ms !== 'number' ||
      !Number.isFinite(record.expires_at_ms)
    )
      return undefined;
    expiresAt = record.expires_at_ms;
  } else if (format === 'codex') {
    expiresAt = await getJwtExpiresAt({ token: accessToken });
  } else if (typeof record.expires_at === 'string') {
    const parsed = Date.parse(record.expires_at);
    if (Number.isFinite(parsed)) expiresAt = parsed;
  } else if (
    typeof record.expires_at === 'number' &&
    Number.isFinite(record.expires_at)
  ) {
    expiresAt =
      record.expires_at < 10_000_000_000
        ? record.expires_at * 1000
        : record.expires_at;
  }
  return {
    accessToken,
    ...(typeof refreshToken === 'string' && refreshToken.length > 0
      ? { refreshToken }
      : {}),
    ...(typeof accountId === 'string' && accountId.length > 0
      ? { accountId }
      : {}),
    ...(expiresAt == null ? {} : { expiresAt }),
  };
}

async function parseCredentialDocument(
  text: string,
): Promise<Record<string, unknown> | undefined> {
  const parsed = await safeParseJSON({ text });
  return parsed.success && isRecord(parsed.value) ? parsed.value : undefined;
}

function fileStore({ filePath }: { filePath: string }): CredentialStore {
  return {
    async read() {
      const text = await readFile(filePath, 'utf8').catch(() => undefined);
      return text == null ? undefined : parseCredentialDocument(text);
    },
    async write({ value }) {
      const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
          mode: 0o600,
          flag: 'wx',
        });
        await chmod(temporaryPath, 0o600);
        await rename(temporaryPath, filePath);
      } finally {
        await unlink(temporaryPath).catch(() => {});
      }
    },
  };
}

function createCodexKeyring({
  platform,
}: {
  platform: NodeJS.Platform;
}): CodexKeyring | undefined {
  if (isMacOS(platform))
    return {
      read: options => readMacOSKeychainPassword(options),
      write: ({ service, account, value }) =>
        runCommandWithInput({
          command: '/usr/bin/security',
          args: ['-i'],
          input: `add-generic-password -U -s ${securityQuote(service)} -a ${securityQuote(account)} -X ${Buffer.from(value, 'utf8').toString('hex')}\n`,
        }),
    };
  if (isLinux(platform))
    return {
      read: ({ service, account }) =>
        readLinuxSecretServicePassword({
          attributes: { service, username: account, target: 'default' },
        }),
      write: ({ service, account, value }) =>
        runCommandWithInput({
          command: 'secret-tool',
          args: [
            'store',
            '--label',
            `${account}@${service}:default`,
            'service',
            service,
            'username',
            account,
            'target',
            'default',
            'application',
            'rust-keyring',
          ],
          input: value,
        }),
    };
  if (isWindows(platform))
    return {
      read: ({ service, account }) =>
        readWindowsCredentialManagerPassword({
          targetName: `${account}.${service}`,
        }),
      async write({ service, account, value }) {
        const source = `
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class FxCodexCredentialManager {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct Credential {
    public UInt32 Flags; public UInt32 Type; public string TargetName;
    public string Comment; public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public UInt32 CredentialBlobSize; public IntPtr CredentialBlob;
    public UInt32 Persist; public UInt32 AttributeCount; public IntPtr Attributes;
    public string TargetAlias; public string UserName;
  }
  [DllImport("advapi32.dll", EntryPoint = "CredWriteW", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool CredWrite(ref Credential credential, UInt32 flags);
  public static void Write(string target, string userName, string value) {
    byte[] bytes = Encoding.Unicode.GetBytes(value);
    IntPtr blob = Marshal.AllocHGlobal(bytes.Length);
    try {
      Marshal.Copy(bytes, 0, blob, bytes.Length);
      Credential credential = new Credential {
        Type = 1, TargetName = target, CredentialBlobSize = (UInt32)bytes.Length,
        CredentialBlob = blob, Persist = 3, UserName = userName
      };
      if (!CredWrite(ref credential, 0)) throw new System.ComponentModel.Win32Exception();
    } finally { Marshal.FreeHGlobal(blob); }
  }
}`;
        await runCommandWithInput({
          command: 'powershell.exe',
          args: [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            'Add-Type -TypeDefinition $env:AI_SDK_FX_CREDENTIAL_SOURCE; $value = [Console]::In.ReadToEnd(); [FxCodexCredentialManager]::Write($env:AI_SDK_FX_CREDENTIAL_TARGET, $env:AI_SDK_FX_CREDENTIAL_USER, $value)',
          ],
          input: value,
          env: {
            ...process.env,
            AI_SDK_FX_CREDENTIAL_SOURCE: source,
            AI_SDK_FX_CREDENTIAL_TARGET: `${account}.${service}`,
            AI_SDK_FX_CREDENTIAL_USER: account,
          },
        });
      },
    };
}

function securityQuote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

async function runCommandWithInput({
  command,
  args,
  input,
  env,
}: {
  command: string;
  args: string[];
  input: string;
  env?: NodeJS.ProcessEnv;
}): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, {
      stdio: ['pipe', 'ignore', 'ignore'],
      ...(env == null ? {} : { env }),
    });
    child.once('error', () =>
      reject(new Error('Unable to access the Codex credential store.')),
    );
    child.once('close', code => {
      if (code !== 0) {
        reject(new Error('Unable to update the Codex credential store.'));
        return;
      }
      resolvePromise();
    });
    child.stdin.on('error', () =>
      reject(new Error('Unable to update the Codex credential store.')),
    );
    child.stdin.end(input);
  });
}
