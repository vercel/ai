import { HarnessCapabilityUnsupportedError } from '../../errors/harness-capability-unsupported-error';
import type {
  HarnessV1,
  HarnessV1Options,
  HarnessV1ResumeState,
  HarnessV1Sandbox,
  HarnessV1Session,
} from '../../v1';
import { generateId } from '@ai-sdk/provider-utils';

/**
 * Owns the lifecycle of one `HarnessV1Session` on behalf of a `HarnessAgent`.
 *
 * The session is created lazily on the first `getSession()` call so the
 * `HarnessAgent` constructor is cheap and never throws for setup reasons.
 * Once created, the session is sticky: every subsequent `getSession()` call
 * returns the same instance until `close()` or `detach()` is invoked.
 *
 * `close()` and `detach()` are idempotent.
 */
export class SessionManager {
  private readonly harness: HarnessV1;
  private readonly sandbox: HarnessV1Sandbox | undefined;
  private readonly harnessOptions: HarnessV1Options | undefined;
  private readonly resumeFrom: HarnessV1ResumeState | undefined;

  readonly sessionId: string;

  private session: HarnessV1Session | null = null;
  private startPromise: Promise<HarnessV1Session> | null = null;
  private stopped = false;

  constructor(options: {
    harness: HarnessV1;
    sessionId?: string;
    sandbox?: HarnessV1Sandbox;
    harnessOptions?: HarnessV1Options;
    resumeFrom?: HarnessV1ResumeState;
  }) {
    this.harness = options.harness;
    this.sandbox = options.sandbox;
    this.harnessOptions = options.harnessOptions;
    this.resumeFrom = options.resumeFrom;
    this.sessionId = options.sessionId ?? generateId();
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

    this.startPromise = Promise.resolve(
      this.harness.doStart({
        sessionId: this.sessionId,
        sandbox: this.sandbox,
        harnessOptions: this.harnessOptions,
        resumeFrom: this.resumeFrom,
        abortSignal: options?.abortSignal,
      }),
    )
      .then(session => {
        this.session = session;
        return session;
      })
      .finally(() => {
        this.startPromise = null;
      });

    return this.startPromise;
  }

  async close(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    const session = this.session;
    this.session = null;
    if (session != null) {
      await session.doStop();
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
    this.stopped = true;
    this.session = null;
    return state;
  }
}
