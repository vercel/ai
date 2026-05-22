import { HarnessCapabilityUnsupportedError } from '../../errors/harness-capability-unsupported-error';
import type {
  HarnessV1,
  HarnessV1Options,
  HarnessV1ResumeState,
  HarnessV1SandboxProvider,
  HarnessV1SandboxHandle,
  HarnessV1Session,
} from '../../v1';
import { generateId } from '@ai-sdk/provider-utils';

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
  private readonly harnessOptions: HarnessV1Options | undefined;
  private readonly resumeFrom: HarnessV1ResumeState | undefined;

  readonly sessionId: string;

  private session: HarnessV1Session | null = null;
  private sandboxHandle: HarnessV1SandboxHandle | null = null;
  private startPromise: Promise<HarnessV1Session> | null = null;
  private stopped = false;

  constructor(options: {
    harness: HarnessV1;
    sessionId?: string;
    sandbox?: HarnessV1SandboxProvider;
    harnessOptions?: HarnessV1Options;
    resumeFrom?: HarnessV1ResumeState;
  }) {
    this.harness = options.harness;
    this.sandboxProvider = options.sandbox;
    this.harnessOptions = options.harnessOptions;
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
      const sandboxHandle =
        this.sandboxProvider != null
          ? await this.sandboxProvider.create({
              abortSignal: options?.abortSignal,
            })
          : undefined;
      this.sandboxHandle = sandboxHandle ?? null;

      try {
        const session = await this.harness.doStart({
          sessionId: this.sessionId,
          sandboxHandle,
          harnessOptions: this.harnessOptions,
          resumeFrom: this.resumeFrom,
          abortSignal: options?.abortSignal,
        });
        this.session = session;
        return session;
      } catch (error) {
        if (sandboxHandle != null) {
          await Promise.resolve(sandboxHandle.stop()).catch(() => {});
          this.sandboxHandle = null;
        }
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
    return state;
  }
}
