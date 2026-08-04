import type { HarnessV1NetworkSandboxSession } from '../../../v1';
import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import {
  killProcessTree,
  LocalSandboxSession,
  type LocalSandboxSessionContext,
  reapChildSetOnExit,
  stopReapingChildSet,
} from './local-sandbox-session';

/**
 * `HarnessV1NetworkSandboxSession` backed by the local machine. Extends
 * {@link LocalSandboxSession} with the infra surface the harness
 * framework needs: an id, a working directory, loopback ports, and lifecycle.
 *
 * Ports are real free TCP ports on `127.0.0.1`, allocated when the session is
 * created, so bridge-backed adapters work. `setNetworkPolicy` and `setPorts`
 * are deliberately **omitted** rather than stubbed: there is no local
 * enforcement primitive, and a no-op implementation would be a lie the
 * framework acts on.
 */
export class LocalNetworkSandboxSession
  extends LocalSandboxSession
  implements HarnessV1NetworkSandboxSession
{
  readonly id: string;
  readonly ports: ReadonlyArray<number>;

  constructor(input: {
    id: string;
    ports: ReadonlyArray<number>;
    context: LocalSandboxSessionContext;
  }) {
    super(input.context);
    this.id = input.id;
    this.ports = input.ports;
    reapChildSetOnExit(this.context.children);
  }

  /** The project directory. Already realpath'd by the provider. */
  get defaultWorkingDirectory(): string {
    return this.context.workingDirectory;
  }

  /**
   * Resolve any loopback port to a URL.
   *
   * Deliberately does not check {@link ports}, which lists the free ports
   * allocated for this session's bridge to *bind*, not what is addressable.
   * Everything on `127.0.0.1` is.
   *
   * Rejecting unknown ports breaks reattach: a detached bridge's coordinates
   * name the port it is still listening on, and a resumed session has a fresh
   * pool. Adapters read the failure as "bridge unreachable" and quietly
   * respawn, orphaning the bridge that detaching meant to preserve.
   */
  getPortUrl = async ({
    port,
    protocol = 'http',
  }: {
    port: number;
    protocol?: 'http' | 'https' | 'ws';
  }): Promise<string> => `${protocol}://127.0.0.1:${port}`;

  /**
   * Kill every process this session spawned. Idempotent.
   *
   * There is no machine to shut down: the "sandbox" is the user's own
   * filesystem, which outlives the session by design.
   */
  stop = async (): Promise<void> => {
    for (const child of this.context.children) killProcessTree(child);
    this.context.children.clear();
    stopReapingChildSet(this.context.children);
  };

  /**
   * Identical to {@link stop}. The project directory is the user's own and is
   * never deleted.
   */
  destroy = async (): Promise<void> => {
    await this.stop();
  };

  restricted(): SandboxSession {
    return new LocalSandboxSession(this.context);
  }
}
