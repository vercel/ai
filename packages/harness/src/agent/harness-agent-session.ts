import { HarnessCapabilityUnsupportedError } from '../errors/harness-capability-unsupported-error';
import type {
  HarnessV1,
  HarnessV1NetworkSandboxSession,
  HarnessV1RecoveryMode,
  HarnessV1ResumeState,
  HarnessV1SandboxProvider,
  HarnessV1Session,
} from '../v1';
import { releaseBridgePort } from './internal/bridge-port-registry';
import { validateResumeStateData } from './internal/resume-state-validation';

/**
 * Live harness session held by the caller.
 *
 * Created by {@link import('./harness-agent').HarnessAgent.createSession}.
 * Owns the underlying `HarnessV1Session`, the network sandbox session (when the
 * agent has a sandbox provider), and the bridge-port lease (when the
 * provider wraps a caller-provided sandbox with a port pool).
 *
 * Pass the instance back to `agent.generate` / `agent.stream` on every
 * call; tear it down with `close()` or `detach()`.
 *
 * Both lifecycle methods are idempotent. After either has resolved, the
 * session is unusable — any subsequent `generate`/`stream` call against
 * it throws.
 */
export class HarnessAgentSession {
  /**
   * Stable identifier the harness adapter saw in `doStart`. The same
   * string callers persist when they intend to resume the session in a
   * future process.
   */
  readonly sessionId: string;

  private readonly harness: HarnessV1;
  private readonly sandboxProvider: HarnessV1SandboxProvider | undefined;
  private readonly sessionWorkDir: string | undefined;
  private underlyingSession: HarnessV1Session | undefined;
  private sandboxSession: HarnessV1NetworkSandboxSession | undefined;
  private leasedBridgePort: number | undefined;
  private stopped = false;

  /**
   * How this session was (re)established — `'cold'` for a fresh start, or
   * `'attach'` / `'replay'` / `'rerun'` for the resume rungs. `undefined` when
   * the adapter does not report it. Captured at construction so it survives
   * `close()` / `detach()`.
   */
  readonly recoveryMode: HarnessV1RecoveryMode | undefined;

  constructor(options: {
    sessionId: string;
    harness: HarnessV1;
    underlyingSession: HarnessV1Session;
    sandboxSession?: HarnessV1NetworkSandboxSession;
    sandboxProvider?: HarnessV1SandboxProvider;
    leasedBridgePort?: number;
    sessionWorkDir?: string;
  }) {
    this.sessionId = options.sessionId;
    this.harness = options.harness;
    this.underlyingSession = options.underlyingSession;
    this.sandboxSession = options.sandboxSession;
    this.sandboxProvider = options.sandboxProvider;
    this.leasedBridgePort = options.leasedBridgePort;
    this.sessionWorkDir = options.sessionWorkDir;
    this.recoveryMode = options.underlyingSession.recoveryMode;
  }

  /**
   * Underlying adapter session driven by `agent.stream` / `agent.generate`.
   * Throws once the session has been closed or detached.
   *
   * @internal — accessed only by the agent's turn driver.
   */
  getUnderlyingSession(): HarnessV1Session {
    if (this.stopped || this.underlyingSession == null) {
      throw new Error(
        `Harness session ${this.sessionId} has been closed and cannot be reused.`,
      );
    }
    return this.underlyingSession;
  }

  /**
   * Active network sandbox session, when the agent's provider produced one.
   *
   * @internal — accessed only by the agent's turn driver.
   */
  getSandboxSession(): HarnessV1NetworkSandboxSession | undefined {
    return this.sandboxSession;
  }

  /**
   * Working directory the agent runs in for this session, or `undefined` when
   * the session has no sandbox. Used to strip the prefix from absolute paths in
   * stream events before they reach consumers.
   *
   * @internal — accessed only by the agent's turn driver.
   */
  getSessionWorkDir(): string | undefined {
    return this.sessionWorkDir;
  }

  /**
   * Tear down the session without preserving resume state. Stops the
   * underlying adapter session and the network sandbox session, then releases
   * any leased bridge port. Idempotent.
   */
  async close(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    const session = this.underlyingSession;
    const sandboxSession = this.sandboxSession;
    this.underlyingSession = undefined;
    this.sandboxSession = undefined;
    this.releasePortLease();
    if (session != null) {
      await Promise.resolve(session.doStop()).catch(() => {});
    }
    if (sandboxSession != null) {
      await Promise.resolve(sandboxSession.stop()).catch(() => {});
    }
  }

  /**
   * Detach the session, returning a payload the caller can persist and
   * later pass to `agent.createSession({ sessionId, resumeFrom })` to
   * reconnect. Stops the sandbox (snapshots automatically on persistent
   * providers).
   *
   * Throws `HarnessCapabilityUnsupportedError` if the adapter does not
   * implement `doDetach`. Cleanup runs unconditionally — if `doDetach`
   * throws, the session is still marked stopped and the sandbox is
   * stopped before the original error is rethrown.
   */
  async detach(): Promise<HarnessV1ResumeState> {
    if (this.stopped || this.underlyingSession == null) {
      throw new Error(
        `Harness session ${this.sessionId} is not active and cannot be detached.`,
      );
    }
    const session = this.underlyingSession;
    if (session.doDetach == null) {
      throw new HarnessCapabilityUnsupportedError({
        message: `Harness '${this.harness.harnessId}' does not support detach.`,
        harnessId: this.harness.harnessId,
      });
    }

    const cleanup = (): HarnessV1NetworkSandboxSession | undefined => {
      this.stopped = true;
      const sandboxSession = this.sandboxSession;
      this.underlyingSession = undefined;
      this.sandboxSession = undefined;
      this.releasePortLease();
      return sandboxSession;
    };

    let raw: unknown;
    try {
      raw = await session.doDetach();
    } catch (err) {
      const sandboxSession = cleanup();
      if (sandboxSession != null) {
        await Promise.resolve(sandboxSession.stop()).catch(() => {});
      }
      throw err;
    }
    const validated = await validateResumeStateData({
      harness: this.harness,
      state: raw as HarnessV1ResumeState,
    });
    const sandboxSession = cleanup();
    if (sandboxSession != null) {
      await Promise.resolve(sandboxSession.stop()).catch(() => {});
    }
    return validated;
  }

  /**
   * Capture a resume payload **without** tearing the session down. The sandbox
   * and bridge keep running, so the returned state carries the live
   * coordinates a future process needs to *attach* to the still-running bridge
   * (e.g. via `agent.createSession({ sessionId, resumeFrom })`). Persist it to
   * a cross-process store (file, Redis, DB) to hand a warm session off between
   * processes without the recompute a `detach()` → resume would incur.
   *
   * The session remains fully usable after this call; it may be invoked
   * repeatedly to refresh the cursor. Throws
   * `HarnessCapabilityUnsupportedError` if the adapter does not support
   * cross-process attach.
   */
  async getResumeHandle(): Promise<HarnessV1ResumeState> {
    if (this.stopped || this.underlyingSession == null) {
      throw new Error(
        `Harness session ${this.sessionId} is not active and has no resume handle.`,
      );
    }
    const raw = await this.underlyingSession.doGetResumeHandle();
    return validateResumeStateData({
      harness: this.harness,
      state: raw as HarnessV1ResumeState,
    });
  }

  private releasePortLease(): void {
    if (this.leasedBridgePort == null) return;
    if (this.sandboxProvider != null) {
      releaseBridgePort({
        poolKey: this.sandboxProvider,
        sessionId: this.sessionId,
      });
    }
    this.leasedBridgePort = undefined;
  }
}
