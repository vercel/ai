import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import { dirname, join, parse, resolve } from 'node:path';
import type {
  HarnessV1NetworkSandboxSession,
  HarnessV1SandboxProvider,
} from '../../../v1';
import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import { LocalWorkspaceNetworkSandboxSession } from './local-workspace-network-sandbox-session';
import { realpathAllowingMissing } from './local-workspace-sandbox-session';

/**
 * Settings for {@link createLocalWorkspaceSandbox}.
 *
 * Deliberately small. This provider's job is to get out of the way of the
 * harness: it supplies no tools, no tool filtering, and no permission-mode
 * opinions, so each harness keeps its own optimized tools, skills and user
 * configuration.
 */
export type LocalWorkspaceSandboxSettings = {
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

const LOCAL_WORKSPACE_PROVIDER_ID = 'local-workspace-sandbox';

/**
 * Directory holding the one-time-setup markers that stand in for the snapshots
 * a hosted provider would use.
 */
const FIRST_CREATE_MARKER_DIR = '.harness-local';

/**
 * Directories the harness machinery generates inside the sandbox root.
 *
 * Adapters resolve these against `defaultWorkingDirectory` themselves, so the
 * names are duplicated here only to make them invisible to git before anything
 * lands in them. For a hosted sandbox the root is a throwaway machine and none
 * of this matters; here the root is the user's own project.
 *
 * - `.harness-bootstrap` holds bridge recipes and their `node_modules`, which
 *   runs to hundreds of megabytes.
 * - `.harness-local` holds this provider's one-time-setup markers.
 * - `.agent-runs` holds per-session adapter state. Every bridge-backed adapter
 *   writes it, and the codex adapter describes it as living "outside the agent
 *   workdir", which held only while the sandbox root and the session directory
 *   differed. They are the same directory here.
 */
const GENERATED_DIRS = ['.harness-bootstrap', '.harness-local', '.agent-runs'];

/**
 * Hide a generated directory from git without touching a file the user owns.
 *
 * The sandbox root is the user's project, so a bridge bootstrap drops a full
 * `node_modules` inside it. A `.gitignore` of `*` placed in the directory
 * ignores its own contents and itself, so `git status` stays clean, nothing can
 * be committed by accident, and we never edit the project's `.gitignore`. Works
 * whether or not the project is a git repository.
 */
function hideFromGit(directory: string): void {
  mkdirSync(directory, { recursive: true });
  const ignoreFile = join(directory, '.gitignore');
  if (existsSync(ignoreFile)) return;
  writeFileSync(ignoreFile, '*\n');
}

/**
 * `onFirstCreate` runs currently in flight, keyed by marker path.
 *
 * Module scope, not per provider: callers build one provider per project, so
 * sibling projects share a parent and therefore a marker, and a per-instance
 * map would let them bootstrap on top of each other. Entries are dropped once
 * settled, leaving the marker file as the durable record.
 *
 * Separate processes are not coordinated. That needs a lock file with staleness
 * detection, which the framework's own recipe application does not attempt
 * either.
 */
const firstCreateRuns = new Map<string, Promise<void>>();

/**
 * Create a `HarnessV1SandboxProvider` that runs harnesses on the local machine,
 * scoped to a project directory.
 *
 * The provider is stable and synchronous; no filesystem or process work happens
 * until `createSession()` is called.
 *
 * **This provides no isolation.** See the package README.
 */
export function createLocalWorkspaceSandbox(
  settings: LocalWorkspaceSandboxSettings = {},
): HarnessV1SandboxProvider {
  return new LocalWorkspaceSandboxProvider(settings);
}

/**
 * `HarnessV1SandboxProvider` implementation backed by the user's own machine.
 *
 * Unlike hosted providers there is no machine to create: sessions bind to a
 * directory that already exists and outlives them. `resumeSession` therefore
 * just rebinds to the same root.
 */
export class LocalWorkspaceSandboxProvider implements HarnessV1SandboxProvider {
  readonly specificationVersion = 'harness-sandbox-v1' as const;
  readonly providerId = LOCAL_WORKSPACE_PROVIDER_ID;

  private readonly projectPath: string;
  private readonly env: Record<string, string>;

  constructor(settings: LocalWorkspaceSandboxSettings = {}) {
    const projectPath = resolve(settings.path ?? process.cwd());

    // Fails fast on the obvious mistake. The provider contract forbids I/O at
    // construction, so this cannot follow symlinks; `createSession` repeats the
    // check once the path has been resolved.
    assertUsableProjectPath(projectPath);

    this.projectPath = projectPath;
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
    const workingDirectory = await realpathAllowingMissing(this.projectPath);

    // A symlink to `/` or to the home directory passes the constructor's
    // unresolved check, and is exactly what that check exists to catch.
    assertUsableProjectPath(
      await realpathAllowingMissing(this.projectPath),
      settings => `${settings} (resolved from \`${this.projectPath}\`)`,
    );

    // Before anything writes into them, so generated state can never surface in
    // the user's `git status`.
    for (const generated of GENERATED_DIRS) {
      hideFromGit(join(workingDirectory, generated));
    }

    const session = new LocalWorkspaceNetworkSandboxSession({
      id: options?.sessionId ?? `local-workspace-${randomUUID()}`,
      ports: [await allocateLoopbackPort()],
      context: {
        workingDirectory,
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
   * rehydrate.
   *
   * Within one process this reattaches to a still-running bridge, which is what
   * makes `detach()` worthwhile. From a new process it does not: sessions reap
   * their processes on exit, so the adapter respawns. That trade is deliberate.
   * Stray bridges on a developer's machine are never a supported mode, and
   * unlike a hosted sandbox there is no separate machine for a parked session
   * to live on.
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
   * Run `onFirstCreate` at most once per identity.
   *
   * Snapshot-capable providers bake the hook's side effects into a reusable
   * image. There are no snapshots locally, so it runs inline and a marker file
   * records that it did.
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

    const markerPath = join(
      workingDirectory,
      FIRST_CREATE_MARKER_DIR,
      `first-create-${identity}`,
    );

    // Keyed by marker path, so providers on unrelated roots never block.
    const inFlight = firstCreateRuns.get(markerPath);
    if (inFlight != null) {
      await inFlight;
      return;
    }

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

    firstCreateRuns.set(markerPath, run);
    try {
      await run;
    } catch (error) {
      // A failed bootstrap must not be remembered as done, by this process or
      // by the next one to look at the marker.
      rmSync(markerPath, { force: true });
      throw error;
    } finally {
      // The marker is the durable record. Holding the settled promise would
      // mean deleting `.harness-local` no longer forces a re-bootstrap.
      firstCreateRuns.delete(markerPath);
    }
  }
}

/**
 * Reject paths that are never a deliberate choice of project directory.
 *
 * A guard against a scoping mistake, not a security boundary: the package
 * provides no isolation, and every harness ships a shell tool that reaches
 * anywhere the user can. It prevents handing the sandbox an enormous tree by
 * accident, which matters because the sandbox root is the project's *parent*.
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
