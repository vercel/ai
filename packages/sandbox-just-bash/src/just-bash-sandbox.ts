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
import { ensureRealpath } from './utils';

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
