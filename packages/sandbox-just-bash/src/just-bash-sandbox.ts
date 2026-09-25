import {
  HarnessCapabilityUnsupportedError,
  type HarnessV1NetworkSandboxSession,
  type HarnessV1SandboxSessionCreateOptions,
  type HarnessV1SandboxSessionResumeOptions,
} from '@ai-sdk/harness';
import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import { Sandbox } from 'just-bash';
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

const REALPATH_PATH = '/usr/bin/realpath';
const REALPATH_SCRIPT = `#!/usr/bin/env bash
pending=\${1:?}
resolved=
link_count=0
link_marker=__AI_SDK_REALPATH_LINK_END__
case "$pending" in
  /*) ;;
  *) pending=$PWD/$pending ;;
esac
while [ -n "$pending" ]; do
  pending=\${pending#/}
  [ -n "$pending" ] || break
  component=\${pending%%/*}
  if [ "$pending" = "$component" ]; then
    pending=
  else
    pending=\${pending#*/}
  fi
  case "$component" in
    ""|.) continue ;;
    ..)
      resolved=\${resolved%/*}
      continue
      ;;
  esac
  candidate=$resolved/$component
  if [ -L "$candidate" ]; then
    link_count=$((link_count + 1))
    [ "$link_count" -le 64 ] || exit 1
    link_target_framed=$(readlink "$candidate"; readlink_status=$?; printf '%s' "$link_marker"; exit "$readlink_status")
    readlink_status=$?
    [ "$readlink_status" -eq 0 ] || exit 1
    target=\${link_target_framed%$link_marker}
    target=\${target%$'\n'}
    case "$target" in
      /*) pending=$target\${pending:+/$pending} ;;
      *) pending=\${candidate%/*}/$target\${pending:+/$pending} ;;
    esac
    resolved=
  else
    resolved=$candidate
  fi
done
printf '%s\n' "\${resolved:-/}"
`;

export async function ensureRealpath(sandbox: Sandbox): Promise<void> {
  const fs = sandbox.bashEnvInstance.fs;
  try {
    await fs.lstat(REALPATH_PATH);
    return;
  } catch (error) {
    if (!isFileNotFoundError(error)) {
      throw error;
    }
  }

  await sandbox.writeFiles({ [REALPATH_PATH]: REALPATH_SCRIPT });
  await fs.chmod(REALPATH_PATH, 0o755);
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
