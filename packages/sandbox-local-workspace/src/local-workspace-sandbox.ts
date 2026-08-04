import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import { basename, dirname, join, parse, resolve } from 'node:path';
import type {
  HarnessV1NetworkSandboxSession,
  HarnessV1SandboxProvider,
} from '@ai-sdk/harness';
import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import { LocalWorkspaceNetworkSandboxSession } from './local-workspace-network-sandbox-session';
import { realpathAllowingMissing } from './local-workspace-sandbox-session';

/**
 * Settings for {@link localWorkspace} and {@link createLocalWorkspaceSandbox}.
 *
 * Deliberately small. This provider's job is to get out of the way of the
 * harness: it supplies no tools, no tool filtering, and no permission-mode
 * opinions, so each harness keeps its own optimized tools, skills and user
 * configuration.
 */
export type LocalWorkspaceSandboxSettings = {
  /**
   * Project directory the harness works in. Resolved to an absolute path.
   * Created if it does not exist.
   *
   * This scopes where the harness *works*, not what it can reach.
   */
  path: string;

  /**
   * Number of loopback ports to allocate for the session. Defaults to 1.
   *
   * Bridge-backed adapters take `ports[0]`. Raise this only if you need
   * several concurrent sessions against one provider instance.
   */
  portCount?: number;

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
 * The provider and the `sandboxConfig` that has to accompany it.
 *
 * ```ts
 * const workspace = localWorkspace({ path: '/Users/me/repos/myapp' });
 *
 * const agent = new HarnessAgent({
 *   harness: createClaudeCode(),
 *   sandbox: workspace.sandbox,
 *   sandboxConfig: workspace.sandboxConfig,
 * });
 * ```
 *
 * Unlike other sandbox providers, this one cannot be configured by
 * `sandbox:` alone. `HarnessAgent` composes each session's directory as
 * `<defaultWorkingDirectory>/<workDir>`, and this provider reports the
 * project's parent as its default working directory, so it needs `workDir` to
 * name the project. Deriving that by hand is easy to get subtly wrong, and a
 * mismatch is silent: the harness runs in an empty sibling directory and
 * reports that the project is empty. Returning both from one call keeps them
 * in agreement.
 *
 * Add to `sandboxConfig` by merging, never by replacing:
 *
 * ```ts
 * sandboxConfig: { ...workspace.sandboxConfig, onSession },
 * ```
 *
 * Do **not** spread this into the agent settings. `{ ...localWorkspace(...),
 * sandboxConfig: { onSession } }` silently discards `workDir` and reintroduces
 * exactly the failure this helper exists to prevent.
 */
export function localWorkspace(settings: LocalWorkspaceSandboxSettings): {
  readonly sandbox: HarnessV1SandboxProvider;
  readonly sandboxConfig: { readonly workDir: string };
} {
  return {
    sandbox: createLocalWorkspaceSandbox(settings),
    sandboxConfig: { workDir: basename(resolve(settings.path)) },
  };
}

const LOCAL_WORKSPACE_PROVIDER_ID = 'local-workspace-sandbox';

/**
 * Directory holding the one-time-setup markers that stand in for the snapshots
 * a hosted provider would use. Lives beside the project, never inside it.
 */
const FIRST_CREATE_MARKER_DIR = '.harness-local';

/**
 * Create a `HarnessV1SandboxProvider` that runs harnesses on the local machine,
 * scoped to a project directory.
 *
 * Prefer {@link localWorkspace}, which also supplies the matching
 * `sandboxConfig.workDir`. Use this directly only when you are wiring the
 * provider into something other than `HarnessAgent`.
 *
 * The provider is stable and synchronous; no filesystem or process work happens
 * until `createSession()` is called.
 *
 * **This provides no isolation.** See the package README.
 */
export function createLocalWorkspaceSandbox(
  settings: LocalWorkspaceSandboxSettings,
): HarnessV1SandboxProvider {
  return new LocalWorkspaceSandboxProvider(settings);
}

/**
 * `HarnessV1SandboxProvider` implementation backed by the user's own machine.
 *
 * Construct one via {@link createLocalWorkspaceSandbox} and pass it to a
 * `HarnessAgent`, together with
 * `sandboxConfig: { workDir: localWorkspaceWorkDir(path) }`.
 *
 * Unlike hosted providers there is no machine to create: sessions bind to a
 * directory that already exists and outlives them. `resumeSession` therefore
 * just rebinds to the same root.
 */
export class LocalWorkspaceSandboxProvider implements HarnessV1SandboxProvider {
  readonly specificationVersion = 'harness-sandbox-v1' as const;
  readonly providerId = LOCAL_WORKSPACE_PROVIDER_ID;

  private readonly projectPath: string;
  private readonly parentPath: string;
  private readonly portCount: number;
  private readonly env: Record<string, string>;

  /**
   * In-flight `onFirstCreate` runs, keyed by identity.
   *
   * A marker file alone is not enough: two concurrent `createSession()` calls
   * both see it missing and both run the hook, which for a bridge-backed
   * adapter means two `pnpm install` processes writing the same
   * `node_modules`. Sessions on sibling projects share a parent, so they share
   * an identity and hit this readily.
   */
  private readonly firstCreateRuns = new Map<string, Promise<void>>();

  constructor(settings: LocalWorkspaceSandboxSettings) {
    const projectPath = resolve(settings.path);

    // Fails fast on the obvious mistake. The provider contract forbids I/O at
    // construction, so this cannot follow symlinks; `createSession` repeats the
    // check once the path has been resolved.
    assertUsableProjectPath(projectPath);

    this.projectPath = projectPath;
    this.parentPath = dirname(projectPath);
    this.portCount = settings.portCount ?? 1;
    // Inheriting the user's environment IS the credential reuse mechanism.
    this.env = { ...process.env, ...settings.env } as Record<string, string>;
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
    options?.abortSignal?.throwIfAborted();

    mkdirSync(this.projectPath, { recursive: true });

    // realpath after creating the directory, so the sandbox root and every
    // path derived from it are symlink-stable. Adapters compare a spawned
    // process's `pwd` against `defaultWorkingDirectory`; on macOS a project
    // under `/tmp` resolves to `/private/tmp` and the comparison fails without
    // this.
    const workingDirectory = await realpathAllowingMissing(this.parentPath);

    // Now that symlinks are resolved, re-run the guard the constructor could
    // only approximate. A `path` that points at a symlink to `/` or to the home
    // directory passes the unresolved check but is exactly what that check
    // exists to catch.
    assertUsableProjectPath(
      await realpathAllowingMissing(this.projectPath),
      settings => `${settings} (resolved from \`${this.projectPath}\`)`,
    );

    const session = new LocalWorkspaceNetworkSandboxSession({
      id: options?.sessionId ?? `local-workspace-${randomUUID()}`,
      ports: await allocateLoopbackPorts(this.portCount),
      context: {
        workingDirectory,
        projectPath: this.projectPath,
        env: this.env,
        children: new Set(),
      },
    });

    await this.runFirstCreateOnce({
      session,
      workingDirectory,
      identity: options?.identity,
      onFirstCreate: options?.onFirstCreate,
      abortSignal: options?.abortSignal,
    });

    return session;
  };

  /**
   * Rebind to the same project directory.
   *
   * The local filesystem is the durable resource, so there is nothing to
   * rehydrate. Note that cross-process resume of a *bridge-backed* session
   * additionally requires the bridge process to have outlived the orchestrator.
   */
  resumeSession = async (options: {
    sessionId: string;
    abortSignal?: AbortSignal;
  }): Promise<HarnessV1NetworkSandboxSession> =>
    this.createSession({
      sessionId: options.sessionId,
      ...(options.abortSignal != null
        ? { abortSignal: options.abortSignal }
        : {}),
    });

  /**
   * Run `onFirstCreate` at most once per identity, guarded by a marker file.
   *
   * Snapshot-capable providers bake this hook's side effects into a reusable
   * image. There are no snapshots locally, so the hook runs inline and a marker
   * file records that it already ran.
   */
  private async runFirstCreateOnce({
    session,
    workingDirectory,
    identity,
    onFirstCreate,
    abortSignal,
  }: {
    session: LocalWorkspaceNetworkSandboxSession;
    workingDirectory: string;
    identity?: string;
    onFirstCreate?: (
      session: SandboxSession,
      opts: { abortSignal?: AbortSignal },
    ) => Promise<void>;
    abortSignal?: AbortSignal;
  }): Promise<void> {
    if (onFirstCreate == null) return;

    // Without an identity there is no cache key, so the hook must run every
    // time rather than be skipped.
    if (identity == null) {
      await onFirstCreate(session.restricted(), {
        ...(abortSignal != null ? { abortSignal } : {}),
      });
      return;
    }

    // Concurrent callers wait on the first run instead of starting their own.
    const inFlight = this.firstCreateRuns.get(identity);
    if (inFlight != null) {
      await inFlight;
      return;
    }

    const markerPath = join(
      workingDirectory,
      FIRST_CREATE_MARKER_DIR,
      `first-create-${identity}`,
    );
    if (existsSync(markerPath)) return;

    const run = (async () => {
      await onFirstCreate(session.restricted(), {
        ...(abortSignal != null ? { abortSignal } : {}),
      });

      mkdirSync(dirname(markerPath), { recursive: true });
      try {
        // `wx` so a racing process cannot be told the work is done before it
        // is. Losing the race is harmless: both ran the same hook.
        writeFileSync(markerPath, new Date().toISOString(), { flag: 'wx' });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
    })();

    this.firstCreateRuns.set(identity, run);
    try {
      await run;
    } catch (error) {
      // A failed bootstrap must not be remembered as done, by this provider or
      // by the next process to look at the marker.
      this.firstCreateRuns.delete(identity);
      rmSync(markerPath, { force: true });
      throw error;
    }
  }
}

/**
 * Reject paths that are never a deliberate choice of project directory.
 *
 * This is a guard against a scoping mistake, not a security boundary. The
 * package provides no isolation, and every harness ships a shell tool that can
 * reach anywhere the user can. What it prevents is handing the sandbox an
 * enormous tree by accident, which matters here because the sandbox root is the
 * project's *parent*.
 */
function assertUsableProjectPath(
  projectPath: string,
  describe: (message: string) => string = message => message,
): void {
  if (projectPath === parse(projectPath).root) {
    throw new Error(
      describe(
        'createLocalWorkspaceSandbox: `path` must not be the filesystem root',
      ),
    );
  }
  if (projectPath === resolve(homedir())) {
    throw new Error(
      describe(
        'createLocalWorkspaceSandbox: `path` must not be the home directory. ' +
          'Point it at a specific project directory',
      ),
    );
  }
}

/**
 * Ask the OS for free loopback ports.
 *
 * Allocating up front and letting the kernel choose removes a whole class of
 * conflict bugs that a caller-supplied port list would reintroduce. Ports are
 * bound, read, and released, so there is a small race window before the harness
 * binds them for real. That is acceptable, and the same approach every local dev
 * server uses.
 */
async function allocateLoopbackPorts(
  count: number,
): Promise<ReadonlyArray<number>> {
  const ports: number[] = [];
  for (let index = 0; index < count; index++) {
    ports.push(await allocateLoopbackPort());
  }
  return ports;
}

function allocateLoopbackPort(): Promise<number> {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.on('error', rejectPort);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address == null || typeof address === 'string') {
        server.close(() =>
          rejectPort(new Error('Failed to allocate a loopback port.')),
        );
        return;
      }
      const { port } = address;
      server.close(() => resolvePort(port));
    });
  });
}
