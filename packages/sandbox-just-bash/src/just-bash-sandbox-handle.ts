import {
  HarnessCapabilityUnsupportedError,
  type HarnessV1SandboxHandle,
} from '@ai-sdk/harness';
import type { Sandbox } from 'just-bash';
import { JustBashSandboxSession } from './just-bash-sandbox-session';

const JUST_BASH_PROVIDER_ID = 'just-bash-sandbox';

/**
 * `HarnessV1SandboxHandle` backed by a `just-bash` `Sandbox`. Exposes no
 * ports — there is no network namespace and no way to publish an HTTP
 * endpoint reachable from outside the host process. Bridge-backed harness
 * adapters that need `getPortUrl` will fail with
 * `HarnessCapabilityUnsupportedError` at start.
 *
 * Network policy is not implementable locally either — `setNetworkPolicy` is
 * omitted on this handle.
 */
export class JustBashSandboxHandle implements HarnessV1SandboxHandle {
  readonly session: JustBashSandboxSession;
  private readonly sandbox: Sandbox;
  private readonly ownsLifecycle: boolean;

  constructor(input: { sandbox: Sandbox; ownsLifecycle: boolean }) {
    this.sandbox = input.sandbox;
    this.ownsLifecycle = input.ownsLifecycle;
    this.session = new JustBashSandboxSession(input.sandbox);
  }

  readonly ports: ReadonlyArray<number> = [];

  getPortUrl = async (_options: {
    port: number;
    protocol?: 'http' | 'https' | 'ws';
  }): Promise<string> => {
    throw new HarnessCapabilityUnsupportedError({
      harnessId: JUST_BASH_PROVIDER_ID,
      message:
        'just-bash sandboxes run in-process and cannot expose a port URL. ' +
        'Use a hosted sandbox (e.g. @ai-sdk/sandbox-vercel) for bridge-backed harness adapters.',
    });
  };

  stop = async (): Promise<void> => {
    if (!this.ownsLifecycle) return;
    // just-bash has no explicit shutdown; the sandbox is garbage-collected
    // along with its in-memory filesystem once references drop.
  };
}
