import { execFile, spawn } from 'node:child_process';
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
import type {
  HarnessV1RequestTransformation,
  HarnessV1RequestTransformationSources,
} from '@ai-sdk/harness';
import {
  getJwtExpiresAt,
  isAccessTokenExpiringSoon,
  isHarnessAuthenticationEnvironment,
  readMacOSKeychainGenericPassword,
  refreshOAuthAccessToken,
  shouldResolveNativeSubscription,
} from '@ai-sdk/harness/utils';
import { isRecord, safeParseJSON } from '@ai-sdk/provider-utils';
import {
  createCodexRequestTransformations,
  resolveCodexEnv,
  type CodexAuthenticationMode,
  type CodexResolvedAuthenticationMode,
} from './codex-auth';

const CHATGPT_CODEX_BASE_URL = 'https://chatgpt.com/backend-api/codex';
const OPENAI_TOKEN_URL = 'https://auth.openai.com/oauth/token';
const OPENAI_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const execFileAsync = promisify(execFile);

export type CodexResolvedAuthentication = {
  readonly environment: Record<string, string>;
  readonly requestHeaders?: Readonly<Record<string, string>>;
};

export function createCodexSubscriptionRequestTransformations({
  requestHeaders,
  ...sources
}: HarnessV1RequestTransformationSources<CodexResolvedAuthenticationMode> & {
  requestHeaders?: Readonly<Record<string, string>>;
}): HarnessV1RequestTransformation[] {
  const transformations = createCodexRequestTransformations(sources);
  if (requestHeaders == null) return transformations;

  return transformations.map(transformation => ({
    ...transformation,
    transform: {
      ...transformation.transform,
      headers: {
        ...transformation.transform.headers,
        ...requestHeaders,
      },
    },
  }));
}

type CodexAuthCredentialsStoreMode = 'file' | 'keyring' | 'auto' | 'ephemeral';

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
  authCredentialsStoreMode,
  readSubscription = readCodexSubscription,
}: {
  auth: CodexAuthenticationMode | undefined;
  processEnv?: Record<string, string | undefined>;
  authCredentialsStoreMode?: unknown;
  readSubscription?: (options?: {
    authCredentialsStoreMode?: unknown;
  }) => Promise<CodexResolvedAuthentication | undefined>;
}): Promise<CodexResolvedAuthentication> {
  const environment = resolveCodexEnv(auth, processEnv);
  if (isHarnessAuthenticationEnvironment(auth)) {
    return { environment };
  }
  if (
    !shouldResolveNativeSubscription({
      auth,
      env: environment,
      hasDirectCredential: environment.CODEX_API_KEY != null,
    })
  ) {
    return { environment };
  }

  return (
    (await readSubscription({ authCredentialsStoreMode })) ?? { environment }
  );
}

export async function readCodexSubscription({
  env = process.env,
  homeDirectory = homedir(),
  authCredentialsStoreMode,
  platform = process.platform,
  keyring,
  fetch,
}: {
  env?: Record<string, string | undefined>;
  homeDirectory?: string;
  authCredentialsStoreMode?: unknown;
  platform?: NodeJS.Platform;
  keyring?: CodexKeyring;
  fetch?: typeof globalThis.fetch;
} = {}): Promise<CodexResolvedAuthentication | undefined> {
  const codexHome = resolve(env.CODEX_HOME ?? join(homeDirectory, '.codex'));
  const authPath = join(codexHome, 'auth.json');
  const storageMode =
    toCodexAuthCredentialsStoreMode(authCredentialsStoreMode) ??
    (await readCodexAuthCredentialsStoreMode({ codexHome })) ??
    'file';
  const stored = await readCodexAuthStore({
    codexHome,
    authPath,
    storageMode,
    keyring: keyring ?? createCodexKeyring({ platform }),
  });
  if (stored == null) return undefined;

  const credential = await toCodexCredential(stored.value);
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
  storageMode,
  keyring,
}: {
  codexHome: string;
  authPath: string;
  storageMode: CodexAuthCredentialsStoreMode;
  keyring: CodexKeyring | undefined;
}): Promise<
  | {
      value: CodexAuthFile;
      write(value: CodexAuthFile): Promise<void>;
    }
  | undefined
> {
  if (storageMode === 'ephemeral') return undefined;

  const readFileStore = async () => {
    const value = await readCodexAuthFile(authPath);
    return value == null
      ? undefined
      : {
          value,
          write: (updated: CodexAuthFile) =>
            writeCodexAuthFile({ authPath, value: updated }),
        };
  };
  const readKeyringStore = async () => {
    if (keyring == null) return undefined;
    const canonicalHome = await realpath(codexHome).catch(() => codexHome);
    const account = `cli|${createHash('sha256')
      .update(canonicalHome)
      .digest('hex')
      .slice(0, 16)}`;
    const text = await keyring.read({ service: 'Codex Auth', account });
    if (text == null) return undefined;
    const value = await parseCodexAuthFile(text);
    return value == null
      ? undefined
      : {
          value,
          write: (updated: CodexAuthFile) =>
            keyring.write({
              service: 'Codex Auth',
              account,
              value: JSON.stringify(updated),
            }),
        };
  };

  if (storageMode === 'file') return readFileStore();
  if (storageMode === 'keyring') return readKeyringStore();
  return (await readKeyringStore()) ?? readFileStore();
}

async function readCodexAuthCredentialsStoreMode({
  codexHome,
}: {
  codexHome: string;
}): Promise<CodexAuthCredentialsStoreMode | undefined> {
  const text = await readFile(join(codexHome, 'config.toml'), 'utf8').catch(
    () => undefined,
  );
  if (text == null) return undefined;
  for (const line of text.split(/\r?\n/)) {
    if (line.trimStart().startsWith('[')) return undefined;
    const match =
      /^\s*cli_auth_credentials_store\s*=\s*["'](file|keyring|auto|ephemeral)["']\s*(?:#.*)?$/.exec(
        line,
      );
    if (match != null) {
      return toCodexAuthCredentialsStoreMode(match[1]);
    }
  }
  return undefined;
}

function toCodexAuthCredentialsStoreMode(
  value: unknown,
): CodexAuthCredentialsStoreMode | undefined {
  return value === 'file' ||
    value === 'keyring' ||
    value === 'auto' ||
    value === 'ephemeral'
    ? value
    : undefined;
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

async function toCodexCredential(value: CodexAuthFile): Promise<
  | {
      accessToken: string;
      refreshToken: string;
      expiresAt: number;
      accountId?: string;
    }
  | undefined
> {
  if (value.auth_mode !== 'chatgpt' || !isRecord(value.tokens)) {
    return undefined;
  }
  const accessToken = value.tokens.access_token;
  const refreshToken = value.tokens.refresh_token;
  if (typeof accessToken !== 'string' || typeof refreshToken !== 'string') {
    return undefined;
  }
  const expiresAt = await getJwtExpiresAt({ token: accessToken });
  if (expiresAt == null) return undefined;
  const accountId = value.tokens.account_id;
  return {
    accessToken,
    refreshToken,
    expiresAt,
    ...(typeof accountId === 'string' ? { accountId } : {}),
  };
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

function createCodexKeyring({
  platform,
}: {
  platform: NodeJS.Platform;
}): CodexKeyring | undefined {
  if (platform === 'darwin') {
    return {
      async read({ service, account }) {
        return readMacOSKeychainGenericPassword({ service, account });
      },
      async write({ service, account, value }) {
        const command = `add-generic-password -U -s ${shellQuoteForSecurity(service)} -a ${shellQuoteForSecurity(account)} -X ${Buffer.from(value, 'utf8').toString('hex')}\n`;
        await runCommandWithInput({
          command: '/usr/bin/security',
          args: ['-i'],
          input: command,
        });
      },
    };
  }
  if (platform === 'linux') {
    return {
      async read({ service, account }) {
        try {
          const result = await execFileAsync('secret-tool', [
            'lookup',
            'service',
            service,
            'username',
            account,
            'target',
            'default',
          ]);
          return result.stdout.trim() || undefined;
        } catch {
          return undefined;
        }
      },
      async write({ service, account, value }) {
        await runCommandWithInput({
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
        });
      },
    };
  }
  if (platform === 'win32') {
    return createWindowsCodexKeyring();
  }
  return undefined;
}

function shellQuoteForSecurity(value: string): string {
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
      stdio: ['pipe', 'ignore', 'pipe'],
      ...(env == null ? {} : { env }),
    });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', code => {
      if (code === 0) resolvePromise();
      else reject(new Error(stderr || `${command} exited with code ${code}.`));
    });
    child.stdin.end(input);
  });
}

function createWindowsCodexKeyring(): CodexKeyring {
  const source = `
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class CodexCredentialManager {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct Credential {
    public UInt32 Flags; public UInt32 Type; public string TargetName;
    public string Comment; public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public UInt32 CredentialBlobSize; public IntPtr CredentialBlob;
    public UInt32 Persist; public UInt32 AttributeCount; public IntPtr Attributes;
    public string TargetAlias; public string UserName;
  }
  [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool CredRead(string target, UInt32 type, UInt32 flags, out IntPtr credential);
  [DllImport("advapi32.dll", EntryPoint = "CredWriteW", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool CredWrite(ref Credential credential, UInt32 flags);
  [DllImport("advapi32.dll", SetLastError = true)] static extern void CredFree(IntPtr credential);
  public static string Read(string target) {
    IntPtr pointer;
    if (!CredRead(target, 1, 0, out pointer)) return null;
    try {
      Credential value = Marshal.PtrToStructure<Credential>(pointer);
      byte[] bytes = new byte[value.CredentialBlobSize];
      Marshal.Copy(value.CredentialBlob, bytes, 0, bytes.Length);
      return Encoding.Unicode.GetString(bytes);
    } finally { CredFree(pointer); }
  }
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
  return {
    async read({ service, account }) {
      try {
        const result = await execFileAsync(
          'powershell.exe',
          [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            `Add-Type -TypeDefinition $env:AI_SDK_CODEX_CREDENTIAL_SOURCE; [CodexCredentialManager]::Read($env:AI_SDK_CODEX_CREDENTIAL_TARGET)`,
          ],
          {
            env: {
              ...process.env,
              AI_SDK_CODEX_CREDENTIAL_SOURCE: source,
              AI_SDK_CODEX_CREDENTIAL_TARGET: `${account}.${service}`,
            },
          },
        );
        return result.stdout.trim() || undefined;
      } catch {
        return undefined;
      }
    },
    async write({ service, account, value }) {
      const script = `Add-Type -TypeDefinition $env:AI_SDK_CODEX_CREDENTIAL_SOURCE; $value = [Console]::In.ReadToEnd(); [CodexCredentialManager]::Write($env:AI_SDK_CODEX_CREDENTIAL_TARGET, $env:AI_SDK_CODEX_CREDENTIAL_USER, $value)`;
      await runCommandWithInput({
        command: 'powershell.exe',
        args: ['-NoProfile', '-NonInteractive', '-Command', script],
        input: value,
        env: {
          ...process.env,
          AI_SDK_CODEX_CREDENTIAL_SOURCE: source,
          AI_SDK_CODEX_CREDENTIAL_TARGET: `${account}.${service}`,
          AI_SDK_CODEX_CREDENTIAL_USER: account,
        },
      });
    },
  };
}
