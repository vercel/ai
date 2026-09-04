import type {
  Context,
  Experimental_SandboxSession as SandboxSession,
  ToolApprovalResponse,
  ToolResultPart,
  ToolSet,
} from '@ai-sdk/provider-utils';
import type {
  OutputInterface as Output,
  StopCondition,
  StreamTextResult,
  TelemetryOptions,
} from 'ai';
import type { HarnessAgentToolApprovalConfiguration } from './harness-agent-settings';
import type {
  HarnessV1BuiltinToolFiltering,
  HarnessV1NetworkSandboxSession,
  HarnessV1PromptControl,
  HarnessV1ResponseFormat,
  HarnessV1Skill,
  HarnessV1TurnSettings,
} from '../v1';
import { HarnessCapabilityUnsupportedError } from '../errors/harness-capability-unsupported-error';
import type {
  HarnessAgentAdapter,
  HarnessAgentAdapterSession,
  HarnessAgentContinueTurnState,
  HarnessAgentPendingToolApproval,
  HarnessAgentPendingToolResult,
  HarnessAgentPrompt,
  HarnessAgentResumeSessionState,
  HarnessAgentToolSpec,
} from './harness-agent-types';
import { validateLifecycleStateData } from './internal/lifecycle-state-validation';
import { runPrompt } from './internal/run-prompt';
import { getRestrictedSandboxSession } from '../utils/get-restricted-sandbox-session';
import type { HarnessAgentLifecycleCallbacks } from './internal/turn-telemetry';

type HarnessAgentTurnResult<
  TOOLS extends ToolSet,
  RUNTIME_CONTEXT extends Context,
  OUTPUT extends Output,
> = {
  result: StreamTextResult<TOOLS, RUNTIME_CONTEXT, OUTPUT>;
  done: Promise<void>;
  ready: Promise<void>;
};

type HarnessAgentSessionState = 'active' | 'detached' | 'stopped' | 'destroyed';

type HarnessAgentTurnState =
  | 'idle'
  | 'running'
  | 'awaiting-approval'
  | 'awaiting-tool-result'
  | 'suspended';

type ActivePromptControl = {
  readonly turnId: number;
  readonly promise: Promise<HarnessV1PromptControl | undefined>;
  resolve(control: HarnessV1PromptControl | undefined): void;
  settled: boolean;
};

type ActiveTurnSettings = {
  readonly persisted: HarnessV1TurnSettings;
  readonly tools: ToolSet;
  readonly activeTools: ToolSet;
  readonly builtinToolFiltering: HarnessV1BuiltinToolFiltering | undefined;
};

/**
 * Live harness session held by the caller.
 *
 * Created by {@link import('./harness-agent').HarnessAgent.createSession}.
 * Owns the underlying adapter session and holds its sandbox session.
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

  private readonly harness: HarnessAgentAdapter;
  private readonly sessionWorkDir: string;
  private readonly ownsSandboxLifecycle: boolean;
  private underlyingSession: HarnessAgentAdapterSession | undefined;
  private sandboxSession:
    | HarnessV1NetworkSandboxSession
    | SandboxSession
    | undefined;
  private readonly toolApproval:
    | HarnessAgentToolApprovalConfiguration
    | undefined;
  private readonly pendingToolApprovals = new Map<
    string,
    HarnessAgentPendingToolApproval
  >();
  private readonly pendingToolResults = new Map<
    string,
    HarnessAgentPendingToolResult
  >();
  private sessionState: HarnessAgentSessionState = 'active';
  private turnState: HarnessAgentTurnState;
  private turnSequence = 0;
  private activeTurnSequence = 0;
  private activePromptControl: ActivePromptControl | undefined;
  private suspendedTurnState:
    | Promise<HarnessAgentContinueTurnState>
    | undefined;
  private activeTurnSettings: ActiveTurnSettings | undefined;
  private persistedTurnSettings: HarnessV1TurnSettings | undefined;

  /**
   * Whether this session was created from `resumeFrom` or `continueFrom`.
   * Captured at construction so it survives lifecycle cleanup.
   */
  readonly isResume: boolean;

  constructor(options: {
    sessionId: string;
    harness: HarnessAgentAdapter;
    underlyingSession: HarnessAgentAdapterSession;
    sandboxSession: HarnessV1NetworkSandboxSession | SandboxSession;
    ownsSandboxLifecycle?: boolean;
    sessionWorkDir: string;
    toolApproval: HarnessAgentToolApprovalConfiguration | undefined;
    pendingToolApprovals?: readonly HarnessAgentPendingToolApproval[];
    pendingToolResults?: readonly HarnessAgentPendingToolResult[];
    turnSettings?: HarnessV1TurnSettings;
    turnState?: HarnessAgentTurnState;
  }) {
    this.sessionId = options.sessionId;
    this.harness = options.harness;
    this.underlyingSession = options.underlyingSession;
    this.sandboxSession = options.sandboxSession;
    this.ownsSandboxLifecycle = options.ownsSandboxLifecycle ?? true;
    this.sessionWorkDir = options.sessionWorkDir;
    this.toolApproval = options.toolApproval;
    for (const approval of options.pendingToolApprovals ?? []) {
      this.pendingToolApprovals.set(approval.approvalId, approval);
    }
    for (const pendingResult of options.pendingToolResults ?? []) {
      this.pendingToolResults.set(pendingResult.toolCallId, pendingResult);
    }
    this.persistedTurnSettings = options.turnSettings;
    this.turnState =
      options.turnState ??
      (this.pendingToolApprovals.size > 0
        ? 'awaiting-approval'
        : this.pendingToolResults.size > 0
          ? 'awaiting-tool-result'
          : 'idle');
    this.isResume = options.underlyingSession.isResume;
  }

  /**
   * Active sandbox session.
   *
   * @internal — accessed by session turn and lifecycle drivers.
   */
  getSandboxSession(): HarnessV1NetworkSandboxSession | SandboxSession {
    if (this.sessionState !== 'active' || this.sandboxSession == null) {
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

  hasUnfinishedTurn(): boolean {
    return this.turnState !== 'idle';
  }

  promptTurn<
    TOOLS extends ToolSet,
    RUNTIME_CONTEXT extends Context,
    OUTPUT extends Output,
  >(options: {
    prompt: HarnessAgentPrompt;
    model: string | undefined;
    skills: ReadonlyArray<HarnessV1Skill>;
    instructions: string | undefined;
    tools: TOOLS;
    activeTools: ToolSet;
    toolSpecs: HarnessAgentToolSpec[];
    builtinToolFiltering: HarnessV1BuiltinToolFiltering | undefined;
    runtimeContext: RUNTIME_CONTEXT;
    abortSignal: AbortSignal | undefined;
    responseFormat: HarnessV1ResponseFormat | undefined;
    output: OUTPUT | undefined;
    telemetry: TelemetryOptions | undefined;
    callbacks: HarnessAgentLifecycleCallbacks<TOOLS, RUNTIME_CONTEXT, OUTPUT>;
    stopConditions: ReadonlyArray<StopCondition<TOOLS, RUNTIME_CONTEXT>>;
  }): HarnessAgentTurnResult<TOOLS, RUNTIME_CONTEXT, OUTPUT> {
    const session = this.requireReusableSession();
    this.requirePromptableTurn();
    this.persistedTurnSettings = {
      ...(options.model == null ? {} : { model: options.model }),
      skills: options.skills,
      ...(options.instructions == null
        ? {}
        : { instructions: options.instructions }),
      tools: options.toolSpecs,
    };
    this.activeTurnSettings = {
      persisted: this.persistedTurnSettings,
      tools: options.tools,
      activeTools: options.activeTools,
      builtinToolFiltering: options.builtinToolFiltering,
    };
    const sandboxSession = this.getSandboxSession();
    const turnId = this.startTrackedTurn();
    try {
      const turn = runPrompt<TOOLS, RUNTIME_CONTEXT, OUTPUT>({
        harness: this.harness,
        session,
        prompt: options.prompt,
        model: options.model,
        skills: options.skills,
        instructions: options.instructions,
        tools: options.tools,
        activeTools: options.activeTools,
        toolSpecs: options.toolSpecs,
        builtinToolFiltering: options.builtinToolFiltering,
        sandboxSession: getRestrictedSandboxSession(sandboxSession),
        sessionWorkDir: this.sessionWorkDir,
        runtimeContext: options.runtimeContext,
        abortSignal: options.abortSignal,
        responseFormat: options.responseFormat,
        output: options.output,
        telemetry: options.telemetry,
        callbacks: options.callbacks,
        stopConditions: options.stopConditions,
        toolApproval: this.toolApproval,
        pendingToolApprovals: this.getPendingToolApprovals(),
        pendingToolResults: this.getPendingToolResults(),
        onPendingToolApproval: approval => {
          this.pendingToolApprovals.set(approval.approvalId, approval);
          this.markAwaitingApprovalIfActive();
        },
        onToolApprovalSettled: approvalId => {
          this.pendingToolApprovals.delete(approvalId);
        },
        onPendingToolResult: pendingResult => {
          this.pendingToolResults.set(pendingResult.toolCallId, pendingResult);
          this.markAwaitingToolResultIfActive();
        },
        onToolResultSettled: toolCallId => {
          this.pendingToolResults.delete(toolCallId);
        },
        onTurnFinished: () => {
          this.finishTrackedTurn({ turnId });
        },
        onTurnFailed: () => {
          this.finishTrackedTurn({ turnId });
        },
        onPromptControlAvailable: control => {
          this.setPromptControl({ turnId, control });
        },
        isTurnSuspending: () =>
          this.activeTurnSequence === turnId && this.suspendedTurnState != null,
        onStopConditionMet: () =>
          this.captureStopConditionBoundary({ session, turnId }),
      });
      return {
        ...turn,
        ready: this.waitForPromptControl({ turnId }),
      };
    } catch (error) {
      this.finishTrackedTurn({ turnId });
      throw error;
    }
  }

  continueTurn<
    TOOLS extends ToolSet,
    RUNTIME_CONTEXT extends Context,
    OUTPUT extends Output,
  >(options: {
    model: string | undefined;
    skills: ReadonlyArray<HarnessV1Skill>;
    instructions: string | undefined;
    tools: TOOLS;
    activeTools: ToolSet;
    toolSpecs: HarnessAgentToolSpec[];
    builtinToolFiltering: HarnessV1BuiltinToolFiltering | undefined;
    runtimeContext: RUNTIME_CONTEXT;
    abortSignal: AbortSignal | undefined;
    responseFormat: HarnessV1ResponseFormat | undefined;
    output: OUTPUT | undefined;
    telemetry: TelemetryOptions | undefined;
    callbacks: HarnessAgentLifecycleCallbacks<TOOLS, RUNTIME_CONTEXT, OUTPUT>;
    stopConditions: ReadonlyArray<StopCondition<TOOLS, RUNTIME_CONTEXT>>;
    toolApprovalContinuations?: readonly ToolApprovalResponse[] | undefined;
    toolResultContinuations?: readonly ToolResultPart[] | undefined;
  }): HarnessAgentTurnResult<TOOLS, RUNTIME_CONTEXT, OUTPUT> {
    const session = this.requireReusableSession();
    this.requireContinuableTurn();
    const turnSettings = this.resolveActiveTurnSettings({
      model: options.model,
      skills: options.skills,
      instructions: options.instructions,
      tools: options.tools,
      activeTools: options.activeTools,
      toolSpecs: options.toolSpecs,
      builtinToolFiltering: options.builtinToolFiltering,
    });
    const sandboxSession = this.getSandboxSession();
    const turnId = this.startTrackedTurn();
    try {
      const turn = runPrompt<TOOLS, RUNTIME_CONTEXT, OUTPUT>({
        harness: this.harness,
        session,
        mode: 'continue',
        model: turnSettings.persisted.model,
        skills: turnSettings.persisted.skills,
        instructions: turnSettings.persisted.instructions,
        tools: turnSettings.tools as TOOLS,
        activeTools: turnSettings.activeTools,
        toolSpecs: [...turnSettings.persisted.tools],
        builtinToolFiltering: turnSettings.builtinToolFiltering,
        sandboxSession: getRestrictedSandboxSession(sandboxSession),
        sessionWorkDir: this.sessionWorkDir,
        runtimeContext: options.runtimeContext,
        abortSignal: options.abortSignal,
        responseFormat: options.responseFormat,
        output: options.output,
        telemetry: options.telemetry,
        callbacks: options.callbacks,
        stopConditions: options.stopConditions,
        toolApproval: this.toolApproval,
        pendingToolApprovals: this.getPendingToolApprovals(),
        pendingToolResults: this.getPendingToolResults(),
        toolApprovalContinuations: options.toolApprovalContinuations,
        toolResultContinuations: options.toolResultContinuations,
        onPendingToolApproval: approval => {
          this.pendingToolApprovals.set(approval.approvalId, approval);
          this.markAwaitingApprovalIfActive();
        },
        onToolApprovalSettled: approvalId => {
          this.pendingToolApprovals.delete(approvalId);
        },
        onPendingToolResult: pendingResult => {
          this.pendingToolResults.set(pendingResult.toolCallId, pendingResult);
          this.markAwaitingToolResultIfActive();
        },
        onToolResultSettled: toolCallId => {
          this.pendingToolResults.delete(toolCallId);
        },
        onTurnFinished: () => {
          this.finishTrackedTurn({ turnId });
        },
        onTurnFailed: () => {
          this.finishTrackedTurn({ turnId });
        },
        onPromptControlAvailable: control => {
          this.setPromptControl({ turnId, control });
        },
        isTurnSuspending: () =>
          this.activeTurnSequence === turnId && this.suspendedTurnState != null,
        onStopConditionMet: () =>
          this.captureStopConditionBoundary({ session, turnId }),
      });
      return {
        ...turn,
        ready: this.waitForPromptControl({ turnId }),
      };
    } catch (error) {
      this.finishTrackedTurn({ turnId });
      throw error;
    }
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
   * Submit another user message to the active turn.
   *
   * The runtime accepts the message for its next safe input boundary. Output
   * caused by the message remains part of the active turn's result stream.
   */
  async experimental_steerTurn(text: string): Promise<void> {
    this.requireReusableSession();
    const activePromptControl = this.activePromptControl;
    if (
      this.turnState !== 'running' ||
      this.suspendedTurnState != null ||
      activePromptControl == null
    ) {
      throw new Error(
        `Harness session ${this.sessionId} has no running turn to steer.`,
      );
    }

    const control = await activePromptControl.promise;
    if (
      control == null ||
      this.sessionState !== 'active' ||
      this.turnState !== 'running' ||
      this.suspendedTurnState != null ||
      this.activePromptControl !== activePromptControl ||
      this.activeTurnSequence !== activePromptControl.turnId
    ) {
      throw new Error(
        `Harness session ${this.sessionId} no longer has the running turn targeted for steering.`,
      );
    }

    if (control.submitUserMessage == null) {
      throw new HarnessCapabilityUnsupportedError({
        message: `Harness '${this.harness.harnessId}' does not support steering active turns.`,
        harnessId: this.harness.harnessId,
      });
    }

    await control.submitUserMessage(text);
  }

  /**
   * Park the session, returning a payload the caller can persist and later
   * pass to `agent.createSession({ sessionId, resumeFrom })` to reconnect.
   * The runtime and sandbox keep running; this local session handle becomes
   * unusable.
   */
  async detach(): Promise<HarnessAgentResumeSessionState> {
    if (this.sessionState !== 'active' || this.underlyingSession == null) {
      throw new Error(
        `Harness session ${this.sessionId} is not active and cannot be detached.`,
      );
    }
    const session = this.underlyingSession;
    try {
      if (this.turnState !== 'idle') {
        return this.toResumeStateWithContinuation({
          continueFrom: await this.suspendCurrentTurn({ session }),
        });
      }
      const raw = await session.doDetach();
      const validated = await validateLifecycleStateData({
        harness: this.harness,
        state: raw,
        expectedType: 'resume-session',
      });
      return validated;
    } finally {
      this.endLocalHandle({ sessionState: 'detached' });
    }
  }

  /**
   * Persist enough state to resume later, then stop the runtime and any
   * harness-owned sandbox.
   * Returns the resume state for a future
   * `agent.createSession({ sessionId, resumeFrom })` call.
   */
  async stop(): Promise<HarnessAgentResumeSessionState> {
    if (this.sessionState !== 'active' || this.underlyingSession == null) {
      throw new Error(
        `Harness session ${this.sessionId} is not active and cannot be stopped.`,
      );
    }
    const session = this.underlyingSession;
    const sandboxSession = this.getSandboxSession();
    try {
      if (this.turnState !== 'idle') {
        return this.toResumeStateWithContinuation({
          continueFrom: await this.suspendCurrentTurn({ session }),
        });
      }
      const raw = await session.doStop();
      const validated = await validateLifecycleStateData({
        harness: this.harness,
        state: raw,
        expectedType: 'resume-session',
      });
      return validated;
    } finally {
      this.endLocalHandle({ sessionState: 'stopped' });
      if (this.ownsSandboxLifecycle && 'stop' in sandboxSession) {
        await Promise.resolve(sandboxSession.stop()).catch(() => {});
      }
    }
  }

  /**
   * Stop the runtime and discard resumability. A harness-owned network
   * sandbox is stopped and destroyed through its `destroy()` method.
   */
  async destroy(): Promise<void> {
    if (this.sessionState !== 'active') return;
    const session = this.underlyingSession;
    const sandboxSession = this.getSandboxSession();
    this.endLocalHandle({ sessionState: 'destroyed' });
    if (session != null) {
      await Promise.resolve(session.doDestroy()).catch(() => {});
    }
    if (!this.ownsSandboxLifecycle) return;
    if ('destroy' in sandboxSession) {
      await Promise.resolve(sandboxSession.destroy()).catch(() => {});
    }
  }

  /**
   * Gracefully freeze the active turn at the slice boundary and return the
   * continuation payload, **leaving the sandbox/runtime running** so the next
   * process can continue. Resolves once the in-flight `stream()` /
   * `continueStream()` has cleanly wound down at a precise cursor (see
   * `doSuspendTurn`).
   *
   * After this call the session is detached. This in-process handle no
   * longer drives turns; a future slice creates a fresh session from the
   * returned state. The sandbox is **not** stopped because bridge-backed
   * adapters may still have a live bridge.
   */
  async suspendTurn(): Promise<HarnessAgentContinueTurnState> {
    if (this.sessionState !== 'active' || this.underlyingSession == null) {
      throw new Error(
        `Harness session ${this.sessionId} is not active and cannot be suspended.`,
      );
    }
    if (this.turnState === 'idle') {
      throw new Error(
        `Harness session ${this.sessionId} has no unfinished turn to suspend.`,
      );
    }
    const session = this.underlyingSession;
    try {
      return await this.suspendCurrentTurn({ session });
    } finally {
      this.endLocalHandle({ sessionState: 'detached' });
    }
  }

  private getPendingToolApprovals(): readonly HarnessAgentPendingToolApproval[] {
    return Array.from(this.pendingToolApprovals.values());
  }

  private getPendingToolResults(): readonly HarnessAgentPendingToolResult[] {
    return Array.from(this.pendingToolResults.values());
  }

  private addPendingToolState(
    state: HarnessAgentContinueTurnState,
  ): HarnessAgentContinueTurnState {
    const turnSettings = this.persistedTurnSettings;
    const pendingToolApprovals = this.getPendingToolApprovals();
    const pendingToolResults = this.getPendingToolResults();
    if (pendingToolApprovals.length === 0 && pendingToolResults.length === 0) {
      return {
        type: state.type,
        harnessId: state.harnessId,
        specificationVersion: state.specificationVersion,
        data: state.data,
        ...(turnSettings == null ? {} : { turnSettings }),
      };
    }
    return {
      ...state,
      ...(turnSettings == null ? {} : { turnSettings }),
      ...(pendingToolApprovals.length > 0 ? { pendingToolApprovals } : {}),
      ...(pendingToolResults.length > 0 ? { pendingToolResults } : {}),
    };
  }

  private async suspendCurrentTurn(options: {
    session: HarnessAgentAdapterSession;
  }): Promise<HarnessAgentContinueTurnState> {
    this.clearActivePromptControl();
    this.suspendedTurnState ??= (async () => {
      const raw = await options.session.doSuspendTurn();
      const validated = await validateLifecycleStateData({
        harness: this.harness,
        state: raw,
        expectedType: 'continue-turn',
      });
      return this.addPendingToolState(validated);
    })();
    const state = await this.suspendedTurnState;
    this.turnState = 'suspended';
    return state;
  }

  private async captureStopConditionBoundary(options: {
    session: HarnessAgentAdapterSession;
    turnId: number;
  }): Promise<void> {
    if (
      this.sessionState !== 'active' ||
      this.activeTurnSequence !== options.turnId
    ) {
      return;
    }
    await this.suspendCurrentTurn({ session: options.session });
  }

  private toResumeStateWithContinuation(options: {
    continueFrom: HarnessAgentContinueTurnState;
  }): HarnessAgentResumeSessionState {
    const { continueFrom } = options;
    return {
      type: 'resume-session',
      harnessId: continueFrom.harnessId,
      specificationVersion: continueFrom.specificationVersion,
      data: continueFrom.data,
      continueFrom,
    };
  }

  private requirePromptableTurn(): void {
    if (this.turnState === 'idle') return;
    if (this.turnState === 'running') {
      throw new Error(
        `Harness session ${this.sessionId} already has a turn in progress.`,
      );
    }
    throw new Error(
      `Harness session ${this.sessionId} has an unfinished turn and must be continued before accepting a new prompt.`,
    );
  }

  private requireContinuableTurn(): void {
    if (
      this.turnState === 'awaiting-approval' ||
      this.turnState === 'awaiting-tool-result' ||
      this.turnState === 'suspended'
    ) {
      return;
    }
    if (this.turnState === 'running') {
      throw new Error(
        `Harness session ${this.sessionId} already has a turn in progress.`,
      );
    }
    throw new Error(
      `Harness session ${this.sessionId} has no unfinished turn to continue.`,
    );
  }

  private markAwaitingApprovalIfActive(): void {
    if (this.sessionState === 'active') {
      this.clearActivePromptControl();
      this.turnState = 'awaiting-approval';
    }
  }

  private markAwaitingToolResultIfActive(): void {
    if (this.sessionState === 'active') {
      this.clearActivePromptControl();
      this.turnState = 'awaiting-tool-result';
    }
  }

  private startTrackedTurn(): number {
    const turnId = ++this.turnSequence;
    this.activeTurnSequence = turnId;
    this.suspendedTurnState = undefined;
    this.turnState = 'running';
    this.clearActivePromptControl();
    let resolve!: (control: HarnessV1PromptControl | undefined) => void;
    const promise = new Promise<HarnessV1PromptControl | undefined>(
      resolvePromise => {
        resolve = resolvePromise;
      },
    );
    this.activePromptControl = {
      turnId,
      promise,
      resolve,
      settled: false,
    };
    return turnId;
  }

  private setPromptControl(options: {
    turnId: number;
    control: HarnessV1PromptControl;
  }): void {
    const activePromptControl = this.activePromptControl;
    if (
      this.sessionState !== 'active' ||
      this.turnState !== 'running' ||
      this.activeTurnSequence !== options.turnId ||
      activePromptControl?.turnId !== options.turnId
    ) {
      return;
    }
    this.settleActivePromptControl(options.control);
  }

  private async waitForPromptControl(options: {
    turnId: number;
  }): Promise<void> {
    const activePromptControl = this.activePromptControl;
    if (activePromptControl?.turnId !== options.turnId) return;
    await activePromptControl.promise;
  }

  private settleActivePromptControl(
    control: HarnessV1PromptControl | undefined,
  ): void {
    const activePromptControl = this.activePromptControl;
    if (activePromptControl == null || activePromptControl.settled) return;
    activePromptControl.settled = true;
    activePromptControl.resolve(control);
  }

  private clearActivePromptControl(turnId?: number): void {
    if (
      turnId != null &&
      this.activePromptControl != null &&
      this.activePromptControl.turnId !== turnId
    ) {
      return;
    }
    this.settleActivePromptControl(undefined);
    this.activePromptControl = undefined;
  }

  private finishTrackedTurn(options: { turnId: number }): void {
    if (this.sessionState !== 'active') return;
    if (this.activeTurnSequence !== options.turnId) return;
    this.clearActivePromptControl(options.turnId);
    this.pendingToolApprovals.clear();
    this.pendingToolResults.clear();
    this.suspendedTurnState = undefined;
    this.activeTurnSettings = undefined;
    this.persistedTurnSettings = undefined;
    this.turnState = 'idle';
  }

  private resolveActiveTurnSettings(options: {
    model: string | undefined;
    skills: ReadonlyArray<HarnessV1Skill>;
    instructions: string | undefined;
    tools: ToolSet;
    activeTools: ToolSet;
    toolSpecs: HarnessAgentToolSpec[];
    builtinToolFiltering: HarnessV1BuiltinToolFiltering | undefined;
  }): ActiveTurnSettings {
    if (this.activeTurnSettings != null) {
      return this.activeTurnSettings;
    }
    const persisted =
      this.persistedTurnSettings ??
      ({
        ...(options.model == null ? {} : { model: options.model }),
        skills: options.skills,
        ...(options.instructions == null
          ? {}
          : { instructions: options.instructions }),
        tools: options.toolSpecs,
      } satisfies HarnessV1TurnSettings);
    this.persistedTurnSettings = persisted;

    const activeTools: ToolSet = {};
    for (const toolSpec of persisted.tools) {
      const tool = options.activeTools[toolSpec.name];
      if (tool == null) {
        throw new Error(
          `HarnessAgent cannot continue turn because tool '${toolSpec.name}' is no longer available.`,
        );
      }
      activeTools[toolSpec.name] = tool;
    }

    this.activeTurnSettings = {
      persisted,
      tools: options.tools,
      activeTools,
      builtinToolFiltering: options.builtinToolFiltering,
    };
    return this.activeTurnSettings;
  }

  private endLocalHandle(options: {
    sessionState: Exclude<HarnessAgentSessionState, 'active'>;
  }): void {
    this.clearActivePromptControl();
    this.sessionState = options.sessionState;
    this.underlyingSession = undefined;
    this.sandboxSession = undefined;
  }

  private requireReusableSession(): HarnessAgentAdapterSession {
    if (this.sessionState !== 'active' || this.underlyingSession == null) {
      throw new Error(
        `Harness session ${this.sessionId} has ended and cannot be reused.`,
      );
    }
    return this.underlyingSession;
  }
}
