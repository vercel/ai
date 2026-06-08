import type {
  HarnessV1,
  HarnessV1NetworkSandboxSession,
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
 * call; end the local handle with `detach()`, `stop()`, or `destroy()`.
 *
 * After any lifecycle method has resolved, the session is unusable — any
 * subsequent `generate`/`stream` call against it throws.
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
   * Whether this session was created from a resume payload. Captured at
   * construction so it survives lifecycle cleanup.
   */
  readonly isResume: boolean;

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
    this.isResume = options.underlyingSession.isResume;
  }

  /**
   * Underlying adapter session driven by `agent.stream` / `agent.generate`.
   * Throws once the session has ended.
   *
   * @internal — accessed only by the agent's turn driver.
   */
  getUnderlyingSession(): HarnessV1Session {
    if (this.stopped || this.underlyingSession == null) {
      throw new Error(
        `Harness session ${this.sessionId} has ended and cannot be reused.`,
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
   * Ask the underlying runtime to compact its context. The runtime performs
   * the compaction itself; when it completes, a `compaction` part appears on
   * the active (or next) turn's stream. Safe to call between turns for
   * runtimes whose compaction is session-scoped (e.g. Pi).
   *
   * Throws `HarnessCapabilityUnsupportedError` for harnesses that cannot
   * trigger compaction manually (e.g. Codex, which still auto-compacts under
   * the hood). Throws if the session has ended.
   */
  async compact(customInstructions?: string): Promise<void> {
    await this.getUnderlyingSession().doCompact(customInstructions);
  }

  /**
   * Park the session, returning a payload the caller can persist and later
   * pass to `agent.createSession({ sessionId, resumeFrom })` to reconnect.
   * The runtime and sandbox keep running; this local session handle becomes
   * unusable.
   */
  async detach(): Promise<HarnessV1ResumeState> {
    if (this.stopped || this.underlyingSession == null) {
      throw new Error(
        `Harness session ${this.sessionId} is not active and cannot be detached.`,
      );
    }
    const session = this.underlyingSession;
    try {
      const raw = await session.doDetach();
      return await validateResumeStateData({
        harness: this.harness,
        state: raw as HarnessV1ResumeState,
      });
    } finally {
      this.endLocalHandle({ releasePortLease: false });
    }
  }

  /**
   * Persist enough state to resume later, then stop the runtime and sandbox.
   * Returns the resume state for a future
   * `agent.createSession({ sessionId, resumeFrom })` call.
   */
  async stop(): Promise<HarnessV1ResumeState> {
    if (this.stopped || this.underlyingSession == null) {
      throw new Error(
        `Harness session ${this.sessionId} is not active and cannot be stopped.`,
      );
    }
    const session = this.underlyingSession;
    const sandboxSession = this.sandboxSession;
    try {
      const raw = await session.doStop();
      return await validateResumeStateData({
        harness: this.harness,
        state: raw as HarnessV1ResumeState,
      });
    } finally {
      this.endLocalHandle({ releasePortLease: true });
      if (sandboxSession != null) {
        await Promise.resolve(sandboxSession.stop()).catch(() => {});
      }
    }
  }

  /**
   * Stop the runtime and discard resumability. The sandbox is destroyed when
   * the provider supports destruction; otherwise it is stopped.
   */
  async destroy(): Promise<void> {
    if (this.stopped) return;
    const session = this.underlyingSession;
    const sandboxSession = this.sandboxSession;
    this.endLocalHandle({ releasePortLease: true });
    if (session != null) {
      await Promise.resolve(session.doDestroy()).catch(() => {});
    }
    if (sandboxSession != null) {
      await Promise.resolve(
        sandboxSession.destroy?.() ?? sandboxSession.stop(),
      ).catch(() => {});
    }
  }

  /**
   * Gracefully freeze the active turn at the slice boundary and return the
   * resume payload, **leaving the sandbox/runtime running** so the next process
   * can resume. Resolves once the in-flight `stream()`/`continueTurn()`
   * has cleanly wound down at a precise cursor (see
   * {@link HarnessV1Session.doSuspendTurn}).
   *
   * After this call the session is marked stopped. This in-process handle no
   * longer drives turns; a future slice creates a fresh session from the
   * returned state. The sandbox is **not** stopped and no port lease is
   * released, because bridge-backed adapters may still have a live bridge on
   * that port.
   */
  async suspendTurn(): Promise<HarnessV1ResumeState> {
    if (this.stopped || this.underlyingSession == null) {
      throw new Error(
        `Harness session ${this.sessionId} is not active and cannot be suspended.`,
      );
    }
    const session = this.underlyingSession;
    const raw = await session.doSuspendTurn();
    const validated = await validateResumeStateData({
      harness: this.harness,
      state: raw as HarnessV1ResumeState,
    });
    // Drop the in-process references without stopping the sandbox or releasing
    // the port lease: bridge-backed adapters may keep using that port.
    this.stopped = true;
    this.underlyingSession = undefined;
    this.sandboxSession = undefined;
    return validated;
  }

  private endLocalHandle(options: { releasePortLease: boolean }): void {
    this.stopped = true;
    this.underlyingSession = undefined;
    this.sandboxSession = undefined;
    if (options.releasePortLease) {
      this.releasePortLease();
    }
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
