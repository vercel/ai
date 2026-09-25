import {
  HarnessCapabilityUnsupportedError,
  type HarnessV1NetworkSandboxSession,
  type HarnessV1SandboxSessionCreateOptions,
  type HarnessV1SandboxSessionResumeOptions,
} from '@ai-sdk/harness';
import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import { defineCommand, Sandbox, type CommandContext } from 'just-bash';
import { JustBashNetworkSandboxSession } from './just-bash-network-sandbox-session';
import { JustBashSandboxSession } from './just-bash-sandbox-session';

/**
 * Flattens an intersection of object types into a single object type so the
 * resolved shape displays as its named properties rather than a chain of
 * `A & B & C`.
 */
type Prettify<T> = { [K in keyof T]: T[K] } & {};

export type JustBashNativeSandboxSession = Sandbox;

/**
 * Parameters forwarded to `just-bash`'s `Sandbox.create` when creating a
 * sandbox from scratch. Aliased directly from the underlying SDK so the full
 * surface is available without us re-declaring it.
 */
type JustBashSandboxCreateParams = NonNullable<
  Parameters<typeof Sandbox.create>[0]
>;

type JustBashCreationSettings = Omit<JustBashSandboxCreateParams, 'sandbox'>;

export type JustBashNetworkSandboxSessionCreateOptions = Prettify<
  HarnessV1SandboxSessionCreateOptions<JustBashCreationSettings> & {
    sandbox?: never;
  }
>;

type JustBashLookupSettings = Record<never, never>;

export type JustBashNetworkSandboxSessionResumeOptions =
  HarnessV1SandboxSessionResumeOptions<JustBashLookupSettings>;

export async function ensureRealpath(sandbox: Sandbox): Promise<void> {
  const realpathType = await sandbox.bashEnvInstance.exec('type realpath');
  if (realpathType.exitCode === 0) {
    return;
  }

  sandbox.bashEnvInstance.registerCommand(
    defineCommand('realpath', executeRealpath),
  );
}

async function executeRealpath(
  args: string[],
  context: CommandContext,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  if (args.length === 0 || args[0] === '') {
    return {
      stdout: '',
      stderr: 'realpath: missing operand\n',
      exitCode: 1,
    };
  }

  let pending = args[0].startsWith('/') ? args[0] : `${context.cwd}/${args[0]}`;
  let resolved = '';
  let linkCount = 0;

  while (pending.length > 0) {
    pending = pending.replace(/^\//, '');
    if (pending.length === 0) {
      break;
    }

    const separatorIndex = pending.indexOf('/');
    const component =
      separatorIndex === -1 ? pending : pending.slice(0, separatorIndex);
    pending = separatorIndex === -1 ? '' : pending.slice(separatorIndex + 1);

    if (component === '' || component === '.') {
      continue;
    }
    if (component === '..') {
      resolved = resolved.slice(0, resolved.lastIndexOf('/'));
      continue;
    }

    const candidate = `${resolved}/${component}`;
    let isSymbolicLink = false;
    try {
      isSymbolicLink = (await context.fs.lstat(candidate)).isSymbolicLink;
    } catch (error) {
      if (!isFileNotFoundError(error)) {
        throw error;
      }
    }

    if (!isSymbolicLink) {
      resolved = candidate;
      continue;
    }

    linkCount += 1;
    if (linkCount > 64) {
      return { stdout: '', stderr: '', exitCode: 1 };
    }

    let target: string;
    try {
      target = await context.fs.readlink(candidate);
    } catch {
      return { stdout: '', stderr: '', exitCode: 1 };
    }

    const remainder = pending.length > 0 ? `/${pending}` : '';
    pending = target.startsWith('/')
      ? `${target}${remainder}`
      : `${candidate.slice(0, candidate.lastIndexOf('/'))}/${target}${remainder}`;
    resolved = '';
  }

  return {
    stdout: `${resolved || '/'}\n`,
    stderr: '',
    exitCode: 0,
  };
}

function isFileNotFoundError(error: unknown): boolean {
  if (error == null || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  if (code === 'ENOENT') return true;
  const message = (error as { message?: unknown }).message;
  return (
    typeof message === 'string' &&
    /no such file|not found|ENOENT/i.test(message)
  );
}

export async function createJustBashNetworkSandboxSession(
  options: JustBashNetworkSandboxSessionCreateOptions = {},
): Promise<HarnessV1NetworkSandboxSession> {
  if ('sandbox' in options) {
    throw new Error(
      'createJustBashNetworkSandboxSession: use createJustBashNetworkSandboxSessionFromNativeSandbox for an existing sandbox.',
    );
  }
  const {
    template,
    abortSignal,
    sandboxId,
    sandbox: _sandbox,
    ...nativeOptions
  } = options;
  abortSignal?.throwIfAborted();
  const nativeSandbox = await Sandbox.create(nativeOptions);
  try {
    await ensureRealpath(nativeSandbox);
    const session = new JustBashNetworkSandboxSession({
      sandbox: nativeSandbox,
      sandboxId,
    });
    await template?.prepare({ session: session.restricted(), abortSignal });
    return session;
  } catch (error) {
    await nativeSandbox.stop().catch(() => {});
    throw error;
  }
}

export async function resumeJustBashNetworkSandboxSession(
  options: JustBashNetworkSandboxSessionResumeOptions,
): Promise<HarnessV1NetworkSandboxSession> {
  options.abortSignal?.throwIfAborted();
  throw new HarnessCapabilityUnsupportedError({
    message:
      'just-bash sandboxes run in-process and cannot be resumed by sandboxId.',
  });
}

export function createJustBashSandboxSessionFromNativeSandbox(
  nativeSandbox: JustBashNativeSandboxSession,
): SandboxSession {
  return new JustBashSandboxSession(nativeSandbox);
}

export function createJustBashNetworkSandboxSessionFromNativeSandbox(
  nativeSandbox: JustBashNativeSandboxSession,
): HarnessV1NetworkSandboxSession {
  return new JustBashNetworkSandboxSession({ sandbox: nativeSandbox });
}
