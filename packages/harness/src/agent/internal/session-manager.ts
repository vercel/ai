import { HarnessCapabilityUnsupportedError } from '../../errors/harness-capability-unsupported-error';
import type {
  HarnessV1,
  HarnessV1Bootstrap,
  HarnessV1ResumeState,
  HarnessV1SandboxHandle,
  HarnessV1SandboxProvider,
  HarnessV1Session,
  HarnessV1Skill,
} from '../../v1';
import { applyBootstrapRecipe, hashBootstrap } from './bootstrap-recipe';
import { acquireBridgePort, releaseBridgePort } from './bridge-port-registry';
import { validateResumeStateData } from './resume-state-validation';

/**
 * Per-session runtime state held by {@link SessionManager}. One entry per
 * sessionId in the manager's internal map.
 */
interface SessionEntry {
  session: HarnessV1Session | null;
  sandboxHandle: HarnessV1SandboxHandle | null;
  leasedBridgePort: number | null;
  startPromise: Promise<HarnessV1Session> | null;
  stopped: boolean;
}

/**
 * Manages the lifecycle of multiple concurrent `HarnessV1Session`s on behalf
 * of a `HarnessAgent`.
 *
 * Sessions are keyed by `sessionId`. The first `getSession({ sessionId })`
 * for a given id lazily starts the session; subsequent calls with the same
 * id return the same instance until `close({ sessionId })` or
 * `detach({ sessionId })` is invoked.
 *
 * Resume path: when `resumeFrom` is supplied, the manager validates the
 * payload against `harness.resumeStateSchema`, asks the provider for a
 * handle bound to the existing sandbox via `provider.resume({ sessionId })`,
 * and threads `resumeFrom` through `harness.doStart`.
 *
 * `close` and `detach` are idempotent per sessionId.
 */
export class SessionManager {
  private readonly harness: HarnessV1;
  private readonly sandboxProvider: HarnessV1SandboxProvider | undefined;
  private readonly skills: ReadonlyArray<HarnessV1Skill> | undefined;

  private readonly entries = new Map<string, SessionEntry>();

  constructor(options: {
    harness: HarnessV1;
    sandbox?: HarnessV1SandboxProvider;
    skills?: ReadonlyArray<HarnessV1Skill>;
  }) {
    this.harness = options.harness;
    this.sandboxProvider = options.sandbox;
    this.skills = options.skills;
  }

  /**
   * Return the sandbox handle currently bound to the given session, if the
   * session has started. Returns null if the session does not exist yet or
   * has been closed.
   */
  sandboxHandleFor(sessionId: string): HarnessV1SandboxHandle | null {
    return this.entries.get(sessionId)?.sandboxHandle ?? null;
  }

  /**
   * Return the active session for `sessionId`, creating it on first call.
   * Concurrent callers for the same id share the in-flight start.
   *
   * When `resumeFrom` is supplied the manager reattaches to the existing
   * sandbox via `provider.resume({ sessionId })` and threads the validated
   * payload into `harness.doStart`.
   */
  async getSession(options: {
    sessionId: string;
    resumeFrom?: HarnessV1ResumeState;
    abortSignal?: AbortSignal;
  }): Promise<HarnessV1Session> {
    const { sessionId, resumeFrom, abortSignal } = options;
    let entry = this.entries.get(sessionId);
    if (entry == null) {
      entry = this.createEntry();
      this.entries.set(sessionId, entry);
    }
    if (entry.stopped) {
      throw new Error(
        `Harness session ${sessionId} has been closed and cannot be reused.`,
      );
    }
    if (entry.session != null) {
      return entry.session;
    }
    if (entry.startPromise != null) {
      return entry.startPromise;
    }

    const currentEntry: SessionEntry = entry;
    const startPromise = this.startSession({
      entry: currentEntry,
      sessionId,
      resumeFrom,
      abortSignal,
    }).finally(() => {
      currentEntry.startPromise = null;
    });
    currentEntry.startPromise = startPromise;
    return startPromise;
  }

  /** Close one session. Idempotent. */
  async close(options: { sessionId: string }): Promise<void> {
    const entry = this.entries.get(options.sessionId);
    if (entry == null || entry.stopped) {
      this.entries.delete(options.sessionId);
      return;
    }
    entry.stopped = true;
    const session = entry.session;
    const handle = entry.sandboxHandle;
    entry.session = null;
    entry.sandboxHandle = null;
    this.releasePortLease(options.sessionId, entry);
    this.entries.delete(options.sessionId);
    if (session != null) {
      await Promise.resolve(session.doStop()).catch(() => {});
    }
    if (handle != null) {
      await Promise.resolve(handle.stop()).catch(() => {});
    }
  }

  /** Close every active session. Convenience for shutdown paths. */
  async closeAll(): Promise<void> {
    const sessionIds = Array.from(this.entries.keys());
    await Promise.all(sessionIds.map(sessionId => this.close({ sessionId })));
  }

  /**
   * Detach one session, returning a resume payload the caller can later
   * pass back via `resumeFrom`. Throws `HarnessCapabilityUnsupportedError`
   * if the session does not expose `doDetach`. The sandbox is stopped
   * (snapshots automatically on persistent providers).
   */
  async detach(options: { sessionId: string }): Promise<HarnessV1ResumeState> {
    const { sessionId } = options;
    const entry = this.entries.get(sessionId);
    if (entry == null || entry.stopped) {
      throw new Error(
        `Harness session ${sessionId} is not active and cannot be detached.`,
      );
    }
    const session = await this.getSession({ sessionId });
    if (session.doDetach == null) {
      throw new HarnessCapabilityUnsupportedError({
        message: `Harness '${this.harness.harnessId}' does not support detach.`,
        harnessId: this.harness.harnessId,
      });
    }

    /*
     * Drop the entry from the map BEFORE the slow `handle.stop()` snapshot
     * call. Otherwise a concurrent caller (cross-process REST where the
     * next request arrives while the previous turn's stop is still
     * in flight) would hit the `stopped` guard in `getSession` instead of
     * being routed through a fresh resume.
     *
     * Cleanup happens unconditionally — even if `doDetach` throws (e.g.
     * the bridge's WS closed mid-turn and the adapter can no longer
     * round-trip a detach message). Leaving the entry in the map would
     * wedge future calls to this sessionId; the caller still gets the
     * original error, but the manager state is consistent.
     */
    const cleanup = (): HarnessV1SandboxHandle | null => {
      entry.stopped = true;
      const handle = entry.sandboxHandle;
      entry.session = null;
      entry.sandboxHandle = null;
      this.releasePortLease(sessionId, entry);
      this.entries.delete(sessionId);
      return handle;
    };

    let raw: unknown;
    try {
      raw = await session.doDetach();
    } catch (err) {
      const handle = cleanup();
      if (handle != null) {
        await Promise.resolve(handle.stop()).catch(() => {});
      }
      throw err;
    }
    const validated = await validateResumeStateData({
      harness: this.harness,
      state: raw,
    });
    const handle = cleanup();
    if (handle != null) {
      // Detach stops the sandbox so it snapshots; the resume payload is
      // what binds a future process back to the same resource via
      // `provider.resume({ sessionId })`.
      await Promise.resolve(handle.stop()).catch(() => {});
    }
    return validated;
  }

  private createEntry(): SessionEntry {
    return {
      session: null,
      sandboxHandle: null,
      leasedBridgePort: null,
      startPromise: null,
      stopped: false,
    };
  }

  private async startSession(input: {
    entry: SessionEntry;
    sessionId: string;
    resumeFrom: HarnessV1ResumeState | undefined;
    abortSignal: AbortSignal | undefined;
  }): Promise<HarnessV1Session> {
    const { entry, sessionId, resumeFrom, abortSignal } = input;

    let validatedResumeFrom: HarnessV1ResumeState | undefined;
    if (resumeFrom != null) {
      validatedResumeFrom = await validateResumeStateData({
        harness: this.harness,
        state: resumeFrom,
      });
    }

    let sandboxHandle: HarnessV1SandboxHandle | undefined;
    let recipe: HarnessV1Bootstrap | undefined;
    let identity: string | undefined;

    if (this.sandboxProvider != null) {
      if (this.harness.getBootstrap != null) {
        recipe = await this.harness.getBootstrap({ abortSignal });
        identity = await hashBootstrap(recipe);
      }

      const rawHandle = await this.acquireSandbox({
        sessionId,
        isResume: validatedResumeFrom != null,
        recipe,
        identity,
        abortSignal,
      });

      sandboxHandle = this.applyPortLease({
        provider: this.sandboxProvider,
        handle: rawHandle,
        sessionId,
        entry,
      });

      // On resume the recipe is already baked into the sandbox snapshot;
      // skip re-applying it and skip the setup hook (it ran on the
      // original create).
      if (validatedResumeFrom == null) {
        try {
          if (recipe != null && identity != null) {
            await applyBootstrapRecipe(
              sandboxHandle.session,
              recipe,
              identity,
              { abortSignal },
            );
          }
          if (this.sandboxProvider.setup != null) {
            await this.sandboxProvider.setup({
              session: sandboxHandle.session,
              abortSignal,
            });
          }
        } catch (err) {
          await this.cleanupAfterStartFailure({
            rawHandle,
            sessionId,
            entry,
          });
          throw err;
        }
      }
    }

    entry.sandboxHandle = sandboxHandle ?? null;

    try {
      const session = await this.harness.doStart({
        sessionId,
        sandboxHandle,
        skills: this.skills,
        resumeFrom: validatedResumeFrom,
        abortSignal,
      });
      entry.session = session;
      return session;
    } catch (error) {
      if (sandboxHandle != null) {
        await this.cleanupAfterStartFailure({
          rawHandle: sandboxHandle,
          sessionId,
          entry,
        });
      }
      entry.sandboxHandle = null;
      throw error;
    }
  }

  private async acquireSandbox(input: {
    sessionId: string;
    isResume: boolean;
    recipe: HarnessV1Bootstrap | undefined;
    identity: string | undefined;
    abortSignal: AbortSignal | undefined;
  }): Promise<HarnessV1SandboxHandle> {
    const provider = this.sandboxProvider!;
    if (input.isResume) {
      if (provider.resume == null) {
        throw new HarnessCapabilityUnsupportedError({
          message: `Sandbox provider '${provider.providerId}' does not support resume.`,
          harnessId: this.harness.harnessId,
        });
      }
      return provider.resume({
        sessionId: input.sessionId,
        abortSignal: input.abortSignal,
      });
    }
    return provider.create({
      sessionId: input.sessionId,
      abortSignal: input.abortSignal,
      identity: input.identity,
      onFirstCreate:
        input.recipe != null && input.identity != null
          ? (session, opts) =>
              applyBootstrapRecipe(
                session,
                input.recipe!,
                input.identity!,
                opts,
              )
          : undefined,
    });
  }

  private applyPortLease(input: {
    provider: HarnessV1SandboxProvider;
    handle: HarnessV1SandboxHandle;
    sessionId: string;
    entry: SessionEntry;
  }): HarnessV1SandboxHandle {
    const pool = input.provider.bridgePorts;
    if (pool == null || pool.length === 0) {
      return input.handle;
    }
    const port = acquireBridgePort({
      poolKey: input.provider,
      pool,
      sessionId: input.sessionId,
    });
    input.entry.leasedBridgePort = port;
    return narrowHandlePorts(input.handle, port);
  }

  private releasePortLease(sessionId: string, entry: SessionEntry): void {
    if (entry.leasedBridgePort == null) return;
    if (this.sandboxProvider != null) {
      releaseBridgePort({
        poolKey: this.sandboxProvider,
        sessionId,
      });
    }
    entry.leasedBridgePort = null;
  }

  private async cleanupAfterStartFailure(input: {
    rawHandle: HarnessV1SandboxHandle;
    sessionId: string;
    entry: SessionEntry;
  }): Promise<void> {
    await Promise.resolve(input.rawHandle.stop()).catch(() => {});
    this.releasePortLease(input.sessionId, input.entry);
  }
}

function narrowHandlePorts(
  handle: HarnessV1SandboxHandle,
  leasedPort: number,
): HarnessV1SandboxHandle {
  return {
    id: handle.id,
    session: handle.session,
    ports: [leasedPort],
    getPortUrl: handle.getPortUrl,
    stop: handle.stop,
    ...(handle.setNetworkPolicy != null
      ? { setNetworkPolicy: handle.setNetworkPolicy }
      : {}),
    ...(handle.setPorts != null ? { setPorts: handle.setPorts } : {}),
  };
}
