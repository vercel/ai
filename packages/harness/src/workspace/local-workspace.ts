import { homedir } from 'node:os';
import { parse, resolve } from 'node:path';
import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import type {
  HarnessV1NetworkSandboxSession,
  HarnessV1SandboxProvider,
} from '../v1';

/**
 * Settings for {@link localWorkspace}.
 *
 * Deliberately small. The workspace's job is to get out of the way of the
 * harness: it supplies no tools, no tool filtering, and no permission-mode
 * opinions, so each harness keeps its own optimized tools, skills, and user
 * configuration.
 */
export type LocalWorkspaceSettings = {
  /**
   * Project directory the harness works in. Defaults to `process.cwd()`.
   * Resolved to an absolute path, and created if it does not exist.
   *
   * This scopes where the harness *works*, not what it can reach.
   */
  path?: string;

  /**
   * Overlay applied on top of the inherited process environment.
   *
   * The inherited environment is the credential and configuration reuse
   * mechanism, since `HOME`, `PATH`, and every harness's own config file are
   * found through it, so it is never filtered. Use this for additions such as
   * registry pins or proxy settings.
   */
  env?: Record<string, string>;
};

/**
 * A local project directory the harness works in, for `HarnessAgent`'s
 * `workspace` setting.
 *
 * The harness runs on the local machine as the current user, reusing the CLI
 * configuration and credentials already there, with the project directory as
 * its working directory. Harness SDK state (bootstrap dependencies,
 * per-session run state) lives in `~/.ai-sdk/harness/projects/…`, never
 * inside the project. Conversations belong to the runtime's own store, so
 * they can be continued directly in the agent's own CLI too.
 *
 * **This provides no isolation.** The harness has every permission the
 * current user has, the same trust level as running `claude` or `codex` in a
 * terminal. Use a sandbox provider for untrusted input or output.
 */
export type LocalWorkspace = {
  /** Discriminates workspaces from sandbox providers in agent settings. */
  readonly type: 'local-workspace';
  /** @internal The provider the agent runs sessions through. */
  readonly provider: HarnessV1SandboxProvider;
};

/**
 * Create a {@link LocalWorkspace} rooted at a project directory.
 *
 * ```ts
 * const agent = new HarnessAgent({
 *   harness: claudeCode,
 *   workspace: localWorkspace({ path: '/path/to/project' }),
 * });
 * ```
 *
 * Synchronous and side-effect free; no filesystem or process work happens
 * until a session is created. The implementation is loaded lazily so that
 * importing `HarnessAgent` does not pull `node:child_process` and `node:net`
 * into the module graph of consumers who pass their own sandbox provider.
 */
export function localWorkspace(
  settings: LocalWorkspaceSettings = {},
): LocalWorkspace {
  // Fails fast on the obvious mistake, without touching the filesystem. The
  // provider repeats the check against the symlink-resolved path when a
  // session is created.
  assertUsableProjectPath(resolve(settings.path ?? process.cwd()));

  return {
    type: 'local-workspace',
    provider: new LazyLocalWorkspaceProvider(settings),
  };
}

/**
 * Reject paths that are never a deliberate choice of project directory.
 *
 * A guard against a scoping mistake, not a security boundary: the workspace
 * provides no isolation, and every harness ships a shell tool that reaches
 * anywhere the user can. It prevents handing the harness an enormous tree by
 * accident.
 */
export function assertUsableProjectPath(
  projectPath: string,
  describe: (message: string) => string = message => message,
): void {
  if (projectPath === parse(projectPath).root) {
    throw new Error(
      describe('localWorkspace: `path` must not be the filesystem root'),
    );
  }
  if (projectPath === resolve(homedir())) {
    throw new Error(
      describe(
        'localWorkspace: `path` must not be the home directory. ' +
          'Point it at a specific project directory',
      ),
    );
  }
}

/**
 * Defers loading the process-spawning implementation until a session is
 * actually created, while still validating settings eagerly at construction
 * through the real provider's constructor once loaded.
 */
class LazyLocalWorkspaceProvider implements HarnessV1SandboxProvider {
  readonly specificationVersion = 'harness-sandbox-v1' as const;
  readonly providerId = 'local-workspace';

  private readonly settings: LocalWorkspaceSettings;
  private delegate: Promise<HarnessV1SandboxProvider> | undefined;

  constructor(settings: LocalWorkspaceSettings) {
    this.settings = settings;
  }

  private resolveDelegate(): Promise<HarnessV1SandboxProvider> {
    this.delegate ??= import('./local-workspace-provider').then(
      module => new module.LocalWorkspaceProvider(this.settings),
    );
    return this.delegate;
  }

  createSession = async (options?: {
    sessionId?: string;
    abortSignal?: AbortSignal;
    identity?: string;
    onFirstCreate?: (
      session: SandboxSession,
      opts: { abortSignal?: AbortSignal },
    ) => Promise<void>;
  }): Promise<HarnessV1NetworkSandboxSession> => {
    const delegate = await this.resolveDelegate();
    return await delegate.createSession(options);
  };

  resumeSession = async (options: {
    sessionId: string;
    abortSignal?: AbortSignal;
  }): Promise<HarnessV1NetworkSandboxSession> => {
    const delegate = await this.resolveDelegate();
    if (delegate.resumeSession == null) {
      throw new Error('localWorkspace: resumeSession is not available.');
    }
    return await delegate.resumeSession(options);
  };
}
