import type { HarnessV1NetworkSandboxSession } from '@ai-sdk/harness';
import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import {
  killProcessTree,
  LocalWorkspaceSandboxSession,
  type LocalWorkspaceSessionContext,
} from './local-workspace-sandbox-session';

/**
 * `HarnessV1NetworkSandboxSession` backed by the local machine. Extends
 * {@link LocalWorkspaceSandboxSession} with the infra surface the harness
 * framework needs: an id, a working directory, loopback ports, and lifecycle.
 *
 * Ports are real free TCP ports on `127.0.0.1`, allocated when the session is
 * created, so bridge-backed adapters work. `setNetworkPolicy` and `setPorts`
 * are deliberately **omitted** rather than stubbed: there is no local
 * enforcement primitive, and a no-op implementation would be a lie the
 * framework acts on.
 */
export class LocalWorkspaceNetworkSandboxSession
  extends LocalWorkspaceSandboxSession
  implements HarnessV1NetworkSandboxSession
{
  readonly id: string;
  readonly ports: ReadonlyArray<number>;

  /**
   * Reaps any surviving children if the orchestrator exits without calling
   * `stop()`. Retained so `stop()` can deregister it.
   */
  private readonly reapOnExit: () => void;

  constructor(input: {
    id: string;
    ports: ReadonlyArray<number>;
    context: LocalWorkspaceSessionContext;
  }) {
    super(input.context);
    this.id = input.id;
    this.ports = input.ports;

    this.reapOnExit = () => {
      for (const child of this.context.children) killProcessTree(child);
    };
    process.once('exit', this.reapOnExit);
  }

  /**
   * The parent of the project directory, not the project itself.
   *
   * `HarnessAgent` composes every session's work directory underneath this
   * path, and `normalizeSandboxWorkDir` rejects `'.'`, so rooting here is what
   * lets `sandboxConfig.workDir` name the project. Already realpath'd by the
   * provider.
   */
  get defaultWorkingDirectory(): string {
    return this.context.workingDirectory;
  }

  getPortUrl = async ({
    port,
    protocol = 'http',
  }: {
    port: number;
    protocol?: 'http' | 'https' | 'ws';
  }): Promise<string> => {
    if (!this.ports.includes(port)) {
      throw new Error(
        `Port ${port} is not in this session's loopback pool [${this.ports.join(', ')}]. ` +
          'Increase `portCount` if the harness needs more than one port.',
      );
    }
    return `${protocol}://127.0.0.1:${port}`;
  };

  /**
   * Kill every process this session spawned. Idempotent.
   *
   * There is no machine to shut down — the "sandbox" is the user's own
   * filesystem, which outlives the session by design. Leaving processes behind
   * is never a supported mode, so this is unconditional.
   */
  stop = async (): Promise<void> => {
    for (const child of this.context.children) killProcessTree(child);
    this.context.children.clear();
    process.off('exit', this.reapOnExit);
  };

  /**
   * Identical to {@link stop}. The project directory is the user's own and is
   * never deleted.
   */
  destroy = async (): Promise<void> => {
    await this.stop();
  };

  restricted(): SandboxSession {
    return new LocalWorkspaceSandboxSession(this.context);
  }
}
