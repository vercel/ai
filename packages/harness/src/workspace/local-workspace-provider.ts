import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import type {
  HarnessV1NetworkSandboxSession,
  HarnessV1SandboxProvider,
} from '../v1';
import {
  assertUsableProjectPath,
  type LocalWorkspaceSettings,
} from './local-workspace';
import { LocalWorkspaceNetworkSandboxSession } from './local-workspace-network-sandbox-session';
import {
  LocalWorkspaceSandboxSession,
  realpathAllowingMissing,
  type LocalWorkspaceSessionContext,
} from './local-workspace-sandbox-session';
import {
  ensureLocalWorkspaceStateDirectory,
  localWorkspaceStateDirectory,
} from './local-workspace-state';

const LOCAL_WORKSPACE_PROVIDER_ID = 'local-workspace';

/**
 * `onFirstCreate` runs currently in flight, keyed by marker path.
 *
 * Module scope, not per provider: two workspaces on the same project share a
 * state directory and therefore a marker, and a per-instance map would let
 * them bootstrap on top of each other. Entries are dropped once settled,
 * leaving the marker file as the durable record.
 *
 * Separate processes are not coordinated. That needs a lock file with
 * staleness detection, which the framework's own recipe application does not
 * attempt either.
 */
const firstCreateRuns = new Map<string, Promise<void>>();

/**
 * `HarnessV1SandboxProvider` implementation backed by the user's own machine.
 *
 * Unlike hosted providers there is no machine to create: sessions bind to a
 * project directory that already exists and outlives them, and all Harness
 * SDK state lives in the central per-project store
 * (`~/.ai-sdk/harness/projects/…`), never inside the project.
 * `resumeSession` therefore just rebinds to the same root.
 *
 * **This provides no isolation.** The session declares
 * `environmentOwner: 'user'`, so nothing is installed without consent, but
 * the harness itself has every permission the current user has.
 */
export class LocalWorkspaceProvider implements HarnessV1SandboxProvider {
  readonly specificationVersion = 'harness-sandbox-v1' as const;
  readonly providerId = LOCAL_WORKSPACE_PROVIDER_ID;

  private readonly projectPath: string;
  private readonly env: Record<string, string>;

  constructor(settings: LocalWorkspaceSettings = {}) {
    const projectPath = resolve(settings.path ?? process.cwd());

    // Fails fast on the obvious mistake. The provider contract forbids I/O at
    // construction, so this cannot follow symlinks; `createSession` repeats
    // the check once the path has been resolved.
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

    // realpath after creating the directory, so the workspace root and every
    // path derived from it are symlink-stable. Adapters compare a spawned
    // process's `pwd` against `defaultWorkingDirectory`; on macOS a project
    // under `/tmp` resolves to `/private/tmp` and the comparison fails
    // without this.
    const workingDirectory = await realpathAllowingMissing(this.projectPath);

    // A symlink to `/` or to the home directory passes the constructor's
    // unresolved check, and is exactly what that check exists to catch.
    assertUsableProjectPath(
      workingDirectory,
      message => `${message} (resolved from \`${this.projectPath}\`)`,
    );

    const stateDirectory = localWorkspaceStateDirectory(workingDirectory);
    await ensureLocalWorkspaceStateDirectory({
      stateDirectory,
      projectPath: workingDirectory,
    });

    const children: LocalWorkspaceSessionContext['children'] = new Set();
    const session = new LocalWorkspaceNetworkSandboxSession({
      id: options?.sessionId ?? `local-workspace-${randomUUID()}`,
      ports: [await allocateLoopbackPort()],
      stateDirectory,
      context: {
        workingDirectory,
        env: this.env,
        children,
      },
    });

    await this.runFirstCreateOnce({
      // One-time setup is infrastructure work (bootstrap recipes and their
      // dependencies), so it runs rooted at the state directory: its output
      // belongs in the store, never in the user's project. The child set is
      // shared so anything the hook spawns is reaped with the session.
      setupSession: new LocalWorkspaceSandboxSession({
        workingDirectory: stateDirectory,
        env: this.env,
        children,
      }),
      stateDirectory,
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
   * Within one process this reattaches to a still-running bridge, which is
   * what makes `detach()` worthwhile. From a new process it does not:
   * sessions reap their processes on exit, so the adapter respawns. That
   * trade is deliberate — stray bridges on a developer's machine are never a
   * supported mode, and unlike a hosted sandbox there is no separate machine
   * for a parked session to live on.
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
   * image. There are no snapshots locally, so it runs inline and a marker
   * file in the state directory records that it did.
   */
  private async runFirstCreateOnce({
    setupSession,
    stateDirectory,
    identity,
    onFirstCreate,
    abortSignal,
  }: {
    /** Restricted session rooted at the state directory, not the project. */
    setupSession: LocalWorkspaceSandboxSession;
    stateDirectory: string;
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
      await onFirstCreate(setupSession, {
        ...(abortSignal != null ? { abortSignal } : {}),
      });
      return;
    }

    const markerPath = join(stateDirectory, `.first-create-${identity}.ok`);

    // Keyed by marker path, so providers on unrelated projects never block.
    const inFlight = firstCreateRuns.get(markerPath);
    if (inFlight != null) {
      await inFlight;
      return;
    }

    if (existsSync(markerPath)) return;

    const run = (async () => {
      await onFirstCreate(setupSession, {
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
      // The marker file is the durable record. Holding the settled promise
      // would mean deleting it no longer forces a re-bootstrap.
      firstCreateRuns.delete(markerPath);
    }
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
