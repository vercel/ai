import type {
  HarnessV1,
  HarnessV1ContinueTurnState,
  HarnessV1LifecycleState,
  HarnessV1NetworkSandboxSession,
  HarnessV1PendingToolApproval,
  HarnessV1Prompt,
  HarnessV1ResumeSessionState,
  HarnessV1SandboxProvider,
  HarnessV1Session,
  HarnessV1ToolSpec,
} from '../v1';
import type { Context, ToolSet } from '@ai-sdk/provider-utils';
import type { TelemetryOptions } from 'ai';
import type { HarnessAgentToolApprovalConfiguration } from './harness-agent-settings';
import type { HarnessAgentToolApprovalContinuation } from './harness-agent-tool-approval-continuation';
import { releaseBridgePort } from './internal/bridge-port-registry';
import { validateLifecycleStateData } from './internal/lifecycle-state-validation';
import { runPrompt } from './internal/run-prompt';

/**
 * Live harness session held by the caller.
 *
 * Created by {@link import('./harness-agent').HarnessAgent.createSession}.
 * Owns the underlying `HarnessV1Session`, the network sandbox session, and the
 * bridge-port lease (when the provider wraps a caller-provided sandbox with a
 * port pool).
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
  private readonly sandboxProvider: HarnessV1SandboxProvider;
  private readonly sessionWorkDir: string;
  private underlyingSession: HarnessV1Session | undefined;
  private sandboxSession: HarnessV1NetworkSandboxSession | undefined;
  private leasedBridgePort: number | undefined;
  private readonly toolApproval:
    | HarnessAgentToolApprovalConfiguration
    | undefined;
  private readonly pendingToolApprovals = new Map<
    string,
    HarnessV1PendingToolApproval
  >();
  private stopped = false;

  /**
   * Whether this session was created from `resumeFrom` or `continueFrom`.
   * Captured at construction so it survives lifecycle cleanup.
   */
  readonly isResume: boolean;

  constructor(options: {
    sessionId: string;
    harness: HarnessV1;
    underlyingSession: HarnessV1Session;
    sandboxSession: HarnessV1NetworkSandboxSession;
    sandboxProvider: HarnessV1SandboxProvider;
    leasedBridgePort?: number;
    sessionWorkDir: string;
    toolApproval: HarnessAgentToolApprovalConfiguration | undefined;
    pendingToolApprovals?: readonly HarnessV1PendingToolApproval[];
  }) {
    this.sessionId = options.sessionId;
    this.harness = options.harness;
    this.underlyingSession = options.underlyingSession;
    this.sandboxSession = options.sandboxSession;
    this.sandboxProvider = options.sandboxProvider;
    this.leasedBridgePort = options.leasedBridgePort;
    this.sessionWorkDir = options.sessionWorkDir;
    this.toolApproval = options.toolApproval;
    for (const approval of options.pendingToolApprovals ?? []) {
      this.pendingToolApprovals.set(approval.approvalId, approval);
    }
    this.isResume = options.underlyingSession.isResume;
  }

  /**
   * Active network sandbox session.
   *
   * @internal — accessed by session turn and lifecycle drivers.
   */
  getSandboxSession(): HarnessV1NetworkSandboxSession {
    if (this.stopped || this.sandboxSession == null) {
      throw new Error(
        `Harness session ${this.sessionId} has ended and cannot be reused.`,
      );
    }
    return this.sandboxSession;
  }

  /**
   * Working directory the agent runs in for this session. Used to strip the
   * prefix from absolute paths in stream events before they reach consumers.
   *
   * @internal — accessed by session turn drivers.
   */
  getSessionWorkDir(): string {
    return this.sessionWorkDir;
  }

  promptTurn<TOOLS extends ToolSet, RUNTIME_CONTEXT extends Context>(options: {
    prompt: HarnessV1Prompt;
    instructions: string | undefined;
    tools: TOOLS;
    toolSpecs: HarnessV1ToolSpec[];
    runtimeContext: RUNTIME_CONTEXT;
    abortSignal: AbortSignal | undefined;
    telemetry: TelemetryOptions | undefined;
  }): ReturnType<typeof runPrompt<TOOLS, RUNTIME_CONTEXT>> {
    const session = this.requireReusableSession();
    if (this.pendingToolApprovals.size > 0) {
      throw new Error(
        `Harness session ${this.sessionId} has pending tool approvals and must be continued with approval responses before accepting a new prompt.`,
      );
    }
    const sandboxSession = this.getSandboxSession();
    return runPrompt<TOOLS, RUNTIME_CONTEXT>({
      harness: this.harness,
      session,
      prompt: options.prompt,
      instructions: options.instructions,
      tools: options.tools,
      toolSpecs: options.toolSpecs,
      sandboxSession: sandboxSession.restricted(),
      sessionWorkDir: this.sessionWorkDir,
      runtimeContext: options.runtimeContext,
      abortSignal: options.abortSignal,
      telemetry: options.telemetry,
      toolApproval: this.toolApproval,
      pendingToolApprovals: this.getPendingToolApprovals(),
      onPendingToolApproval: approval => {
        this.pendingToolApprovals.set(approval.approvalId, approval);
      },
      onToolApprovalSettled: approvalId => {
        this.pendingToolApprovals.delete(approvalId);
      },
    });
  }

  continueTurn<
    TOOLS extends ToolSet,
    RUNTIME_CONTEXT extends Context,
  >(options: {
    instructions: string | undefined;
    tools: TOOLS;
    toolSpecs: HarnessV1ToolSpec[];
    runtimeContext: RUNTIME_CONTEXT;
    abortSignal: AbortSignal | undefined;
    telemetry: TelemetryOptions | undefined;
    toolApprovalContinuations?:
      | readonly HarnessAgentToolApprovalContinuation[]
      | undefined;
  }): ReturnType<typeof runPrompt<TOOLS, RUNTIME_CONTEXT>> {
    const session = this.requireReusableSession();
    const sandboxSession = this.getSandboxSession();
    return runPrompt<TOOLS, RUNTIME_CONTEXT>({
      harness: this.harness,
      session,
      mode: 'continue',
      instructions: options.instructions,
      tools: options.tools,
      toolSpecs: options.toolSpecs,
      sandboxSession: sandboxSession.restricted(),
      sessionWorkDir: this.sessionWorkDir,
      runtimeContext: options.runtimeContext,
      abortSignal: options.abortSignal,
      telemetry: options.telemetry,
      toolApproval: this.toolApproval,
      pendingToolApprovals: this.getPendingToolApprovals(),
      toolApprovalContinuations: options.toolApprovalContinuations,
      onPendingToolApproval: approval => {
        this.pendingToolApprovals.set(approval.approvalId, approval);
      },
      onToolApprovalSettled: approvalId => {
        this.pendingToolApprovals.delete(approvalId);
      },
    });
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
    await this.requireReusableSession().doCompact(customInstructions);
  }

  /**
   * Park the session, returning a payload the caller can persist and later
   * pass to `agent.createSession({ sessionId, resumeFrom })` to reconnect.
   * The runtime and sandbox keep running; this local session handle becomes
   * unusable.
   */
  async detach(): Promise<HarnessV1ResumeSessionState> {
    if (this.stopped || this.underlyingSession == null) {
      throw new Error(
        `Harness session ${this.sessionId} is not active and cannot be detached.`,
      );
    }
    const session = this.underlyingSession;
    try {
      const raw = await session.doDetach();
      const validated = await validateLifecycleStateData({
        harness: this.harness,
        state: raw,
        expectedType: 'resume-session',
      });
      return this.withPendingToolApprovals(validated);
    } finally {
      this.endLocalHandle({ releasePortLease: false });
    }
  }

  /**
   * Persist enough state to resume later, then stop the runtime and sandbox.
   * Returns the resume state for a future
   * `agent.createSession({ sessionId, resumeFrom })` call.
   */
  async stop(): Promise<HarnessV1ResumeSessionState> {
    if (this.stopped || this.underlyingSession == null) {
      throw new Error(
        `Harness session ${this.sessionId} is not active and cannot be stopped.`,
      );
    }
    const session = this.underlyingSession;
    const sandboxSession = this.getSandboxSession();
    try {
      const raw = await session.doStop();
      const validated = await validateLifecycleStateData({
        harness: this.harness,
        state: raw,
        expectedType: 'resume-session',
      });
      return this.withPendingToolApprovals(validated);
    } finally {
      this.endLocalHandle({ releasePortLease: true });
      await Promise.resolve(sandboxSession.stop()).catch(() => {});
    }
  }

  /**
   * Stop the runtime and discard resumability. The sandbox is destroyed when
   * the provider supports destruction; otherwise it is stopped.
   */
  async destroy(): Promise<void> {
    if (this.stopped) return;
    const session = this.underlyingSession;
    const sandboxSession = this.getSandboxSession();
    this.endLocalHandle({ releasePortLease: true });
    if (session != null) {
      await Promise.resolve(session.doDestroy()).catch(() => {});
    }
    await Promise.resolve(
      sandboxSession.destroy?.() ?? sandboxSession.stop(),
    ).catch(() => {});
  }

  /**
   * Gracefully freeze the active turn at the slice boundary and return the
   * continuation payload, **leaving the sandbox/runtime running** so the next
   * process can continue. Resolves once the in-flight `stream()`/`continueTurn()`
   * has cleanly wound down at a precise cursor (see
   * {@link HarnessV1Session.doSuspendTurn}).
   *
   * After this call the session is marked stopped. This in-process handle no
   * longer drives turns; a future slice creates a fresh session from the
   * returned state. The sandbox is **not** stopped and no port lease is
   * released, because bridge-backed adapters may still have a live bridge on
   * that port.
   */
  async suspendTurn(): Promise<HarnessV1ContinueTurnState> {
    if (this.stopped || this.underlyingSession == null) {
      throw new Error(
        `Harness session ${this.sessionId} is not active and cannot be suspended.`,
      );
    }
    const session = this.underlyingSession;
    const raw = await session.doSuspendTurn();
    const validated = await validateLifecycleStateData({
      harness: this.harness,
      state: raw,
      expectedType: 'continue-turn',
    });
    // Drop the in-process references without stopping the sandbox or releasing
    // the port lease: bridge-backed adapters may keep using that port.
    this.stopped = true;
    this.underlyingSession = undefined;
    this.sandboxSession = undefined;
    return this.withPendingToolApprovals(validated);
  }

  private getPendingToolApprovals(): readonly HarnessV1PendingToolApproval[] {
    return Array.from(this.pendingToolApprovals.values());
  }

  private withPendingToolApprovals<STATE extends HarnessV1LifecycleState>(
    state: STATE,
  ): STATE {
    const pendingToolApprovals = this.getPendingToolApprovals();
    if (pendingToolApprovals.length === 0) {
      return {
        type: state.type,
        harnessId: state.harnessId,
        specificationVersion: state.specificationVersion,
        data: state.data,
      } as STATE;
    }
    return {
      ...state,
      pendingToolApprovals,
    } as STATE;
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
    releaseBridgePort({
      poolKey: this.sandboxProvider,
      sessionId: this.sessionId,
    });
    this.leasedBridgePort = undefined;
  }

  private requireReusableSession(): HarnessV1Session {
    if (this.stopped || this.underlyingSession == null) {
      throw new Error(
        `Harness session ${this.sessionId} has ended and cannot be reused.`,
      );
    }
    return this.underlyingSession;
  }
}
