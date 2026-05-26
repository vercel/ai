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
import { generateId } from '@ai-sdk/provider-utils';
import { applyBootstrapRecipe, hashBootstrap } from './bootstrap-recipe';
import { acquireBridgePort, releaseBridgePort } from './bridge-port-registry';

/**
 * Owns the lifecycle of one `HarnessV1Session` on behalf of a `HarnessAgent`.
 *
 * On first `getSession()`, if a sandbox provider was supplied, the manager
 * creates the sandbox handle and passes it into `harness.doStart()`. The
 * handle is held for the lifetime of the session and stopped during `close()`.
 *
 * Session and handle are sticky: every subsequent `getSession()` call returns
 * the same instances until `close()` or `detach()` is invoked.
 *
 * `close()` and `detach()` are idempotent.
 */
export class SessionManager {
  private readonly harness: HarnessV1;
  private readonly sandboxProvider: HarnessV1SandboxProvider | undefined;
  private readonly skills: ReadonlyArray<HarnessV1Skill> | undefined;
  private readonly resumeFrom: HarnessV1ResumeState | undefined;

  readonly sessionId: string;

  private session: HarnessV1Session | null = null;
  private sandboxHandle: HarnessV1SandboxHandle | null = null;
  private leasedBridgePort: number | null = null;
  private startPromise: Promise<HarnessV1Session> | null = null;
  private stopped = false;

  constructor(options: {
    harness: HarnessV1;
    sessionId?: string;
    sandbox?: HarnessV1SandboxProvider;
    skills?: ReadonlyArray<HarnessV1Skill>;
    resumeFrom?: HarnessV1ResumeState;
  }) {
    this.harness = options.harness;
    this.sandboxProvider = options.sandbox;
    this.skills = options.skills;
    this.resumeFrom = options.resumeFrom;
    this.sessionId = options.sessionId ?? generateId();
  }

  /** The sandbox handle currently in use, if any. */
  get currentSandboxHandle(): HarnessV1SandboxHandle | null {
    return this.sandboxHandle;
  }

  /**
   * Return the active session, creating it on first call. Idempotent across
   * concurrent callers: the second caller awaits the same in-flight start.
   */
  async getSession(options?: {
    abortSignal?: AbortSignal;
  }): Promise<HarnessV1Session> {
    if (this.stopped) {
      throw new Error(
        `Harness session ${this.sessionId} has been closed and cannot be reused.`,
      );
    }
    if (this.session != null) {
      return this.session;
    }
    if (this.startPromise != null) {
      return this.startPromise;
    }

    this.startPromise = (async () => {
      let sandboxHandle: HarnessV1SandboxHandle | undefined;
      let recipe: HarnessV1Bootstrap | undefined;
      let identity: string | undefined;

      if (this.sandboxProvider != null) {
        if (this.harness.getBootstrap != null) {
          recipe = await this.harness.getBootstrap({
            abortSignal: options?.abortSignal,
          });
          identity = await hashBootstrap(recipe);
        }

        const rawHandle = await this.sandboxProvider.create({
          abortSignal: options?.abortSignal,
          identity,
          onFirstCreate:
            recipe != null && identity != null
              ? (session, opts) =>
                  applyBootstrapRecipe(session, recipe!, identity!, opts)
              : undefined,
        });

        sandboxHandle = this.applyPortLease(this.sandboxProvider, rawHandle);

        try {
          if (recipe != null && identity != null) {
            await applyBootstrapRecipe(
              sandboxHandle.session,
              recipe,
              identity,
              { abortSignal: options?.abortSignal },
            );
          }
          if (this.sandboxProvider.setup != null) {
            await this.sandboxProvider.setup({
              session: sandboxHandle.session,
              abortSignal: options?.abortSignal,
            });
          }
        } catch (err) {
          await this.cleanupAfterStartFailure(rawHandle);
          throw err;
        }
      }

      this.sandboxHandle = sandboxHandle ?? null;

      try {
        const session = await this.harness.doStart({
          sessionId: this.sessionId,
          sandboxHandle,
          skills: this.skills,
          resumeFrom: this.resumeFrom,
          abortSignal: options?.abortSignal,
        });
        this.session = session;
        return session;
      } catch (error) {
        if (sandboxHandle != null) {
          await this.cleanupAfterStartFailure(sandboxHandle);
        }
        this.sandboxHandle = null;
        throw error;
      }
    })().finally(() => {
      this.startPromise = null;
    });

    return this.startPromise;
  }

  async close(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    const session = this.session;
    const handle = this.sandboxHandle;
    this.session = null;
    this.sandboxHandle = null;
    if (session != null) {
      await Promise.resolve(session.doStop()).catch(() => {});
    }
    if (handle != null) {
      await Promise.resolve(handle.stop()).catch(() => {});
    }
    this.releasePortLeaseIfAny();
  }

  /**
   * Detach the underlying session, returning a resume payload the caller
   * can later pass back to a future `HarnessAgent` via `resumeFrom`.
   * Throws `HarnessCapabilityUnsupportedError` if the active session does
   * not expose `doDetach`.
   */
  async detach(): Promise<HarnessV1ResumeState> {
    if (this.stopped) {
      throw new Error(
        `Harness session ${this.sessionId} has been closed and cannot be detached.`,
      );
    }
    const session = await this.getSession();
    if (session.doDetach == null) {
      throw new HarnessCapabilityUnsupportedError({
        message: `Harness '${this.harness.harnessId}' does not support detach.`,
        harnessId: this.harness.harnessId,
      });
    }
    const state = await session.doDetach();
    const handle = this.sandboxHandle;
    this.stopped = true;
    this.session = null;
    this.sandboxHandle = null;
    if (handle != null) {
      // Detach is "release host without tearing down the runtime" — but the
      // sandbox is host infrastructure, not the runtime. We stop it.
      await Promise.resolve(handle.stop()).catch(() => {});
    }
    this.releasePortLeaseIfAny();
    return state;
  }

  private applyPortLease(
    provider: HarnessV1SandboxProvider,
    handle: HarnessV1SandboxHandle,
  ): HarnessV1SandboxHandle {
    const pool = provider.bridgePorts;
    if (pool == null || pool.length === 0) {
      return handle;
    }
    const port = acquireBridgePort({
      poolKey: provider,
      pool,
      sessionId: this.sessionId,
    });
    this.leasedBridgePort = port;
    return narrowHandlePorts(handle, port);
  }

  private releasePortLeaseIfAny(): void {
    if (this.leasedBridgePort == null) return;
    if (this.sandboxProvider != null) {
      releaseBridgePort({
        poolKey: this.sandboxProvider,
        sessionId: this.sessionId,
      });
    }
    this.leasedBridgePort = null;
  }

  private async cleanupAfterStartFailure(
    handle: HarnessV1SandboxHandle,
  ): Promise<void> {
    await Promise.resolve(handle.stop()).catch(() => {});
    this.releasePortLeaseIfAny();
  }
}

function narrowHandlePorts(
  handle: HarnessV1SandboxHandle,
  leasedPort: number,
): HarnessV1SandboxHandle {
  return {
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
