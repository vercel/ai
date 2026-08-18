import { HarnessCapabilityUnsupportedError } from '../errors/harness-capability-unsupported-error';
import type {
  HarnessV1Bootstrap,
  HarnessV1BuiltinToolFiltering,
  HarnessV1JSONSchema,
  HarnessV1NetworkSandboxSession,
  HarnessV1ResponseFormat,
} from '../v1';
import {
  asArray,
  asSchema,
  generateId,
  type Context,
  type ModelMessage,
  type ToolSet,
} from '@ai-sdk/provider-utils';
import type {
  Agent,
  AgentCallParameters,
  AgentStreamParameters,
  GenerateTextResult,
  OutputInterface as Output,
  ReasoningFileOutput,
  ReasoningOutput,
  StopCondition,
  StreamTextResult,
} from 'ai';
import type {
  HarnessAgentSandboxConfig,
  HarnessAgentSettings,
} from './harness-agent-settings';
import type { HarnessAllTools } from './harness-agent-tool-types';
import { HarnessAgentSession } from './harness-agent-session';
import type {
  HarnessAgentAdapter,
  HarnessAgentContinueTurnState,
  HarnessAgentPermissionMode,
  HarnessAgentPrompt,
  HarnessAgentResumeSessionState,
  HarnessAgentToolSpec,
} from './harness-agent-types';
import {
  collectHarnessAgentToolApprovalContinuations,
  type HarnessAgentToolApprovalContinuation,
} from './harness-agent-tool-approval-continuation';
import {
  collectHarnessAgentToolResultContinuations,
  type HarnessAgentToolResultContinuation,
} from './harness-agent-tool-result-continuation';
import { applyBootstrapRecipe } from './internal/bootstrap-recipe';
import {
  createSandboxBootstrapPlan,
  ensureSandboxDirectory,
  resolveSessionWorkDir,
  validateSandboxBootstrapSettings,
} from './internal/sandbox-bootstrap';
import { buildObservability } from './internal/resolve-observability';
import { validateLifecycleStateData } from './internal/lifecycle-state-validation';
import {
  permissionModeNeedsBuiltinSupport,
  resolvePermissionMode,
} from './internal/permission-mode';
import { resolveHarnessAgentToolFiltering } from './internal/tool-filtering';

export type { HarnessAllTools } from './harness-agent-tool-types';

/**
 * Required `session` extension on every `HarnessAgent.generate` /
 * `HarnessAgent.stream` call. The agent operates exclusively on the
 * `HarnessAgentSession` the caller passes in — it owns no session
 * state of its own.
 */
export interface HarnessAgentCallExtensions {
  /**
   * Active session returned by `agent.createSession(...)`. Drives the
   * underlying harness adapter for this turn.
   */
  session: HarnessAgentSession;
}

/**
 * AI SDK `Agent` implementation that drives a third-party agent runtime
 * through a harness adapter (Claude Code, Codex, …).
 *
 * Behaviour summary:
 *  - **Stateless definition.** Construct once at module scope. The agent
 *    holds the harness adapter, the merged tool surface, the sandbox
 *    provider and other config — never a live session. Per-call data
 *    (prompt, abort signal, the `HarnessAgentSession`) lives on
 *    `generate()` / `stream()`.
 *  - **Explicit sessions.** Callers spawn sessions with
 *    `agent.createSession(...)`, pass the returned
 *    `HarnessAgentSession` on every `generate` / `stream`, and end it via
 *    `session.detach()`, `session.stop()`, or `session.destroy()`.
 *  - **Cross-process resume.** `createSession({ sessionId, resumeFrom })`
 *    resumes from state previously returned by `session.detach()` or
 *    `session.stop()`. The framework validates `resumeFrom` against the
 *    harness's `lifecycleStateSchema` before handing it to the adapter.
 *    `createSession({ sessionId, continueFrom })` resumes from state returned
 *    by `session.suspendTurn()` before `continueStream()` /
 *    `continueGenerate()`.
 *  - **Host tool execution.** User tools passed in `settings.tools` are
 *    executed on the host whenever the underlying runtime calls them;
 *    the result is fed back to the harness via `submitToolResult`.
 *    Adapter builtin tools (e.g. Claude Code's `Bash`) pass through
 *    untouched.
 *  - **Sandbox propagation.** `settings.sandbox` is a sandbox provider.
 *    On `createSession`, the agent calls `provider.createSession()` (or
 *    `resumeSession()`) and passes the resulting network sandbox session into
 *    `doStart`. Its `restricted()` view (a tool-safe
 *    `Experimental_SandboxSession`) is handed to user-tool `execute()` calls
 *    via `experimental_sandbox`.
 */
export class HarnessAgent<
  THarness extends HarnessAgentAdapter<any> = HarnessAgentAdapter,
  TUserTools extends ToolSet = {},
  RUNTIME_CONTEXT extends Context = Context,
  OUTPUT extends Output = never,
> implements Agent<
  never,
  HarnessAllTools<THarness, TUserTools>,
  RUNTIME_CONTEXT,
  OUTPUT
> {
  readonly version = 'agent-v1' as const;
  readonly id: string | undefined;

  /**
   * Merged tool set exposed to AI SDK consumers: harness builtins +
   * user-defined tools, with user tools overriding builtins on key
   * collision. Built once at construction time so the typed surface is
   * stable across calls.
   */
  readonly tools: HarnessAllTools<THarness, TUserTools>;

  private readonly settings: HarnessAgentSettings<
    THarness,
    TUserTools,
    RUNTIME_CONTEXT,
    OUTPUT
  >;
  private readonly stopConditions: Array<
    StopCondition<HarnessAllTools<THarness, TUserTools>, RUNTIME_CONTEXT>
  >;
  private readonly sandboxConfig: HarnessAgentSandboxConfig;
  private readonly activeUserTools: TUserTools;
  private readonly builtinToolFiltering:
    | HarnessV1BuiltinToolFiltering
    | undefined;
  private readonly permissionMode: HarnessAgentPermissionMode;

  constructor(
    settings: HarnessAgentSettings<
      THarness,
      TUserTools,
      RUNTIME_CONTEXT,
      OUTPUT
    >,
  ) {
    const sandboxConfig = resolveSandboxConfig(settings);
    validateSandboxBootstrapSettings(sandboxConfig);
    this.settings = settings;
    this.stopConditions =
      settings.stopWhen == null ? [] : asArray(settings.stopWhen);
    this.sandboxConfig = sandboxConfig;
    this.id = settings.id;
    const userTools = settings.tools ?? ({} as TUserTools);
    this.permissionMode = resolvePermissionMode({
      permissionMode: settings.permissionMode,
    });
    const tools = {
      ...settings.harness.builtinTools,
      ...userTools,
    } as HarnessAllTools<THarness, TUserTools>;
    const toolFiltering = resolveHarnessAgentToolFiltering({
      harness: settings.harness,
      userTools,
      allTools: tools,
      activeTools: settings.activeTools,
      inactiveTools: settings.inactiveTools,
    });
    this.activeUserTools = toolFiltering.activeUserTools;
    this.builtinToolFiltering = toolFiltering.builtinToolFiltering;
    if (
      Object.keys(settings.harness.builtinTools).length > 0 &&
      permissionModeNeedsBuiltinSupport({
        permissionMode: this.permissionMode,
      }) &&
      settings.harness.supportsBuiltinToolApprovals !== true
    ) {
      throw new HarnessCapabilityUnsupportedError({
        message: `Harness '${settings.harness.harnessId}' does not support built-in tool approval requests; use permissionMode: 'allow-all'.`,
        harnessId: settings.harness.harnessId,
      });
    }
    this.tools = tools;
  }

  /** Identifier of the harness backing this agent. */
  get harnessId(): string {
    return this.settings.harness.harnessId;
  }

  /**
   * Start a fresh session, or resume from state previously returned by
   * `session.detach()` or `session.stop()`. The returned
   * `HarnessAgentSession` must be passed to subsequent `generate` / `stream`
   * calls; end it with `session.detach()`, `session.stop()`, or
   * `session.destroy()`.
   */
  async createSession(options?: {
    /**
     * Optional stable identifier for the underlying sandbox/session.
     * When omitted the agent generates one. Supply the original
     * `session.sessionId` together with `resumeFrom` to reattach a
     * previously ended session across processes.
     */
    sessionId?: string;
    /**
     * Resume payload returned by a prior `session.detach()` or
     * `session.stop()`. Must be accompanied by the original `sessionId`; the
     * framework validates it against `harness.lifecycleStateSchema` before
     * handing it to the adapter.
     */
    resumeFrom?: HarnessAgentResumeSessionState;
    /**
     * Continuation payload returned by a prior `session.suspendTurn()`. Must be
     * accompanied by the original `sessionId`; the framework validates it before
     * handing it to the adapter.
     */
    continueFrom?: HarnessAgentContinueTurnState;
    abortSignal?: AbortSignal;
  }): Promise<HarnessAgentSession> {
    const sessionId = options?.sessionId ?? generateId();
    const resumeFrom = options?.resumeFrom;
    const continueFrom = options?.continueFrom;
    const abortSignal = options?.abortSignal;
    const harness = this.settings.harness;
    const sandboxProvider = this.settings.sandbox;

    if (resumeFrom != null && continueFrom != null) {
      throw new Error(
        'HarnessAgent.createSession: pass either `resumeFrom` or `continueFrom`, not both.',
      );
    }

    let validatedResumeFrom: HarnessAgentResumeSessionState | undefined;
    if (resumeFrom != null) {
      validatedResumeFrom = await validateLifecycleStateData({
        harness,
        state: resumeFrom,
        expectedType: 'resume-session',
      });
    }

    let validatedContinueFrom: HarnessAgentContinueTurnState | undefined;
    if (continueFrom != null) {
      validatedContinueFrom = await validateLifecycleStateData({
        harness,
        state: continueFrom,
        expectedType: 'continue-turn',
      });
    }

    const effectiveContinueFrom =
      validatedContinueFrom ?? validatedResumeFrom?.continueFrom;
    const isResumedSession =
      validatedResumeFrom != null || effectiveContinueFrom != null;

    // Acquires the concrete sandbox session, either by starting fresh and then
    // creating a post-bootstrap snapshot, or by reusing a previously created
    // snapshot based on the bootstrap-based hashes.
    let sandboxSession: HarnessV1NetworkSandboxSession;
    let sessionWorkDir: string;
    if (isResumedSession) {
      if (sandboxProvider.resumeSession == null) {
        throw new HarnessCapabilityUnsupportedError({
          message: `Sandbox provider '${sandboxProvider.providerId}' does not support resume.`,
          harnessId: harness.harnessId,
        });
      }
      sandboxSession = await sandboxProvider.resumeSession({
        sessionId,
        abortSignal,
      });
      sessionWorkDir = resolveSessionWorkDir({
        defaultWorkingDirectory: sandboxSession.defaultWorkingDirectory,
        harnessId: harness.harnessId,
        sessionId,
        workDir: this.sandboxConfig.workDir,
      });
    } else {
      // The logic in this clause applies the bootstrap plan, including both the harness
      // bootstrap recipe and agent specific sandbox configuration.
      // The logic matches largely what `prepareHarnessSandboxTemplate()` and
      // `prepareSandboxForHarness()` do, so they will have to remain aligned.
      let recipe: HarnessV1Bootstrap | undefined;
      if (harness.getBootstrap != null) {
        recipe = await harness.getBootstrap({ abortSignal });
      }

      // Defines the hashes based on both harness bootstrap recipe and
      // consumer-defined onBootstrap callback.
      const sandboxBootstrapPlan = await createSandboxBootstrapPlan({
        recipe,
        settings: this.sandboxConfig,
      });

      sandboxSession = await sandboxProvider.createSession({
        sessionId,
        abortSignal,
        identity: sandboxBootstrapPlan.identity,
        onFirstCreate: sandboxBootstrapPlan.onFirstCreate,
      });
      sessionWorkDir = resolveSessionWorkDir({
        defaultWorkingDirectory: sandboxSession.defaultWorkingDirectory,
        harnessId: harness.harnessId,
        sessionId,
        workDir: sandboxBootstrapPlan.workDir,
      });

      // In case the sandbox session was created with a custom sandbox, or in
      // case the sandbox provider doesn't respect `onFirstCreate`, we still
      // have to ensure the harness bootstrap recipe has run. In the common
      // scenario, this will be a cheap no-op based on just a marker check.
      if (
        sandboxBootstrapPlan.recipe != null &&
        sandboxBootstrapPlan.recipeIdentity != null
      ) {
        try {
          await applyBootstrapRecipe({
            session: sandboxSession.restricted(),
            recipe: sandboxBootstrapPlan.recipe,
            identity: sandboxBootstrapPlan.recipeIdentity,
            defaultWorkingDirectory: sandboxSession.defaultWorkingDirectory,
            abortSignal,
          });
        } catch (err) {
          await cleanupAfterStartFailure({
            sandboxSession,
          });
          throw err;
        }
      }
    }

    try {
      await ensureSandboxDirectory({
        session: sandboxSession,
        workDir: sessionWorkDir,
        abortSignal,
      });
      if (this.sandboxConfig.onSession != null) {
        await this.sandboxConfig.onSession({
          session: sandboxSession.restricted(),
          sessionWorkDir,
          abortSignal,
        });
      }
    } catch (err) {
      await cleanupAfterStartFailure({
        sandboxSession,
      });
      throw err;
    }

    try {
      const baseStartOptions = {
        sessionId,
        skills: this.settings.skills,
        resumeFrom: validatedResumeFrom,
        continueFrom: effectiveContinueFrom,
        permissionMode: this.permissionMode,
        builtinToolFiltering: this.builtinToolFiltering,
        abortSignal,
        observability: buildObservability({ settings: this.settings }),
      };
      const underlyingSession = await harness.doStart({
        ...baseStartOptions,
        sandboxSession,
        sessionWorkDir,
      });
      return new HarnessAgentSession({
        sessionId,
        harness,
        underlyingSession,
        sandboxSession,
        sessionWorkDir,
        toolApproval: this.settings.toolApproval,
        pendingToolApprovals: effectiveContinueFrom?.pendingToolApprovals,
        pendingToolResults: effectiveContinueFrom?.pendingToolResults,
        turnState:
          effectiveContinueFrom == null
            ? 'idle'
            : effectiveContinueFrom.pendingToolApprovals != null &&
                effectiveContinueFrom.pendingToolApprovals.length > 0
              ? 'awaiting-approval'
              : effectiveContinueFrom.pendingToolResults != null &&
                  effectiveContinueFrom.pendingToolResults.length > 0
                ? 'awaiting-tool-result'
                : 'suspended',
      });
    } catch (error) {
      await cleanupAfterStartFailure({
        sandboxSession,
      });
      throw error;
    }
  }

  async generate(
    options: AgentCallParameters<
      never,
      HarnessAllTools<THarness, TUserTools>,
      RUNTIME_CONTEXT
    > &
      HarnessAgentCallExtensions,
  ): Promise<
    GenerateTextResult<
      HarnessAllTools<THarness, TUserTools>,
      RUNTIME_CONTEXT,
      OUTPUT
    >
  > {
    const turnInput = this._resolveTurnInput(options);
    const runtimeContext = {} as RUNTIME_CONTEXT;
    const responseFormat = await this._resolveResponseFormat();
    const { result, done } = this._startTurn({
      session: options.session,
      turnInput,
      runtimeContext,
      abortSignal: options.abortSignal,
      responseFormat,
    });
    await done;
    return this._toGenerateResult(result);
  }

  async stream(
    options: AgentStreamParameters<
      never,
      HarnessAllTools<THarness, TUserTools>,
      RUNTIME_CONTEXT
    > &
      HarnessAgentCallExtensions,
  ): Promise<
    StreamTextResult<
      HarnessAllTools<THarness, TUserTools>,
      RUNTIME_CONTEXT,
      OUTPUT
    >
  > {
    const turnInput = this._resolveTurnInput(options);
    const runtimeContext = {} as RUNTIME_CONTEXT;
    const responseFormat = await this._resolveResponseFormat();
    const { result } = this._startTurn({
      session: options.session,
      turnInput,
      runtimeContext,
      abortSignal: options.abortSignal,
      responseFormat,
    });
    return result;
  }

  /**
   * Continue the in-flight turn **without a new prompt**, draining it like
   * {@link generate}. Used after `createSession({ continueFrom })` to finish
   * consuming a turn that crossed a process boundary.
   */
  async continueGenerate(options: {
    session: HarnessAgentSession;
    toolApprovalContinuations?: readonly HarnessAgentToolApprovalContinuation[];
    toolResultContinuations?: readonly HarnessAgentToolResultContinuation[];
    abortSignal?: AbortSignal;
  }): Promise<
    GenerateTextResult<
      HarnessAllTools<THarness, TUserTools>,
      RUNTIME_CONTEXT,
      OUTPUT
    >
  > {
    const runtimeContext = {} as RUNTIME_CONTEXT;
    const responseFormat = await this._resolveResponseFormat();

    const { result, done } = this._startTurn({
      session: options.session,
      turnInput: {
        mode: 'continue',
        toolApprovalContinuations: options.toolApprovalContinuations ?? [],
        toolResultContinuations: options.toolResultContinuations ?? [],
      },
      runtimeContext,
      abortSignal: options.abortSignal,
      responseFormat,
    });
    await done;
    return this._toGenerateResult(result);
  }

  /**
   * Continue the in-flight turn **without a new prompt**, streaming its events
   * like {@link stream}. Used to keep consuming a turn that is still running
   * (or finished) in the runtime after a process boundary — the workflow slice
   * loop calls this on every slice after the first. Routes through the adapter's
   * `doContinueTurn`; what it can guarantee (lossless attach vs. lossy rerun)
   * follows from how the adapter resumed the session.
   */
  async continueStream(options: {
    session: HarnessAgentSession;
    toolApprovalContinuations?: readonly HarnessAgentToolApprovalContinuation[];
    toolResultContinuations?: readonly HarnessAgentToolResultContinuation[];
    abortSignal?: AbortSignal;
  }): Promise<
    StreamTextResult<
      HarnessAllTools<THarness, TUserTools>,
      RUNTIME_CONTEXT,
      OUTPUT
    >
  > {
    const runtimeContext = {} as RUNTIME_CONTEXT;
    const responseFormat = await this._resolveResponseFormat();

    const { result } = this._startTurn({
      session: options.session,
      turnInput: {
        mode: 'continue',
        toolApprovalContinuations: options.toolApprovalContinuations ?? [],
        toolResultContinuations: options.toolResultContinuations ?? [],
      },
      runtimeContext,
      abortSignal: options.abortSignal,
      responseFormat,
    });
    return result;
  }

  // ─── Internals ──────────────────────────────────────────────────────

  private _startTurn(input: {
    session: HarnessAgentSession;
    turnInput:
      | { mode: 'prompt'; prompt: HarnessAgentPrompt }
      | {
          mode: 'continue';
          toolApprovalContinuations: readonly HarnessAgentToolApprovalContinuation[];
          toolResultContinuations: readonly HarnessAgentToolResultContinuation[];
        };
    runtimeContext: RUNTIME_CONTEXT;
    abortSignal: AbortSignal | undefined;
    responseFormat: HarnessV1ResponseFormat | undefined;
  }): {
    result: StreamTextResult<
      HarnessAllTools<THarness, TUserTools>,
      RUNTIME_CONTEXT,
      OUTPUT
    >;
    done: Promise<void>;
  } {
    if (input.turnInput.mode === 'continue') {
      return input.session.continueTurn<
        HarnessAllTools<THarness, TUserTools>,
        RUNTIME_CONTEXT,
        OUTPUT
      >({
        instructions: this.settings.instructions,
        tools: this.tools,
        activeTools: this.activeUserTools,
        toolSpecs: this._toToolSpecs(),
        builtinToolFiltering: this.builtinToolFiltering,
        runtimeContext: input.runtimeContext,
        abortSignal: input.abortSignal,
        responseFormat: input.responseFormat,
        output: this.settings.output,
        telemetry: this.settings.telemetry,
        stopConditions: this.stopConditions,
        toolApprovalContinuations: input.turnInput.toolApprovalContinuations,
        toolResultContinuations: input.turnInput.toolResultContinuations,
      });
    }

    return input.session.promptTurn<
      HarnessAllTools<THarness, TUserTools>,
      RUNTIME_CONTEXT,
      OUTPUT
    >({
      prompt: input.turnInput.prompt,
      instructions: this.settings.instructions,
      tools: this.tools,
      activeTools: this.activeUserTools,
      toolSpecs: this._toToolSpecs(),
      builtinToolFiltering: this.builtinToolFiltering,
      runtimeContext: input.runtimeContext,
      abortSignal: input.abortSignal,
      responseFormat: input.responseFormat,
      output: this.settings.output,
      telemetry: this.settings.telemetry,
      stopConditions: this.stopConditions,
    });
  }

  /*
   * Reduce AI SDK input to the single user message the harness should run
   * for this turn. The harness session owns prior-turn state (system
   * prompt, assistant turns, tool results) — we never replay it. A bare
   * string is forwarded as-is; a message array is collapsed to its last
   * `role: 'user'` entry. Inputs whose only messages are non-user (system,
   * assistant, tool) have no fresh user input and are rejected.
   */
  private _resolveTurnInput(options: {
    prompt?: string | ModelMessage[];
    messages?: ModelMessage[];
  }):
    | { mode: 'prompt'; prompt: HarnessAgentPrompt }
    | {
        mode: 'continue';
        toolApprovalContinuations: readonly HarnessAgentToolApprovalContinuation[];
        toolResultContinuations: readonly HarnessAgentToolResultContinuation[];
      } {
    if (typeof options.prompt === 'string') {
      return { mode: 'prompt', prompt: options.prompt };
    }
    const messages = Array.isArray(options.prompt)
      ? options.prompt
      : options.messages;
    if (Array.isArray(messages)) {
      const toolApprovalContinuations =
        collectHarnessAgentToolApprovalContinuations({ messages });
      const toolResultContinuations =
        collectHarnessAgentToolResultContinuations({ messages });
      if (
        toolApprovalContinuations.length > 0 ||
        toolResultContinuations.length > 0
      ) {
        return {
          mode: 'continue',
          toolApprovalContinuations,
          toolResultContinuations,
        };
      }
      for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];
        if (message?.role === 'user')
          return { mode: 'prompt', prompt: message };
      }
      throw new Error(
        'HarnessAgent: messages must contain at least one `role: "user"` entry.',
      );
    }
    throw new Error('HarnessAgent: either `prompt` or `messages` is required.');
  }

  /*
   * Wire-format projection of user-defined tools only. Harness builtins are
   * executed by the runtime and the bridge already knows about them — we
   * never re-declare them over the wire.
   */
  private _toToolSpecs(): HarnessAgentToolSpec[] {
    const specs: HarnessAgentToolSpec[] = [];
    for (const [name, tool] of Object.entries(
      this.activeUserTools as Record<string, unknown>,
    )) {
      const t = tool as {
        description?: string;
        inputSchema?: unknown;
      };
      let inputSchema: HarnessAgentToolSpec['inputSchema'];
      if (t.inputSchema != null) {
        try {
          inputSchema = asSchema(
            t.inputSchema as Parameters<typeof asSchema>[0],
          ).jsonSchema as HarnessAgentToolSpec['inputSchema'];
        } catch {
          // tools without a usable schema are still forwarded by name
        }
      }
      specs.push({ name, description: t.description, inputSchema });
    }
    return specs;
  }

  private async _toGenerateResult(
    streamResult: StreamTextResult<
      HarnessAllTools<THarness, TUserTools>,
      RUNTIME_CONTEXT,
      OUTPUT
    >,
  ): Promise<
    GenerateTextResult<
      HarnessAllTools<THarness, TUserTools>,
      RUNTIME_CONTEXT,
      OUTPUT
    >
  > {
    // The stream is already drained by the time generate() calls this helper
    // (done has resolved). `steps` is the single source of truth the result
    // derives everything else from, mirroring core's `generateText` result.
    const [steps, usage, responseMessages, output] = await Promise.all([
      streamResult.steps,
      streamResult.usage,
      streamResult.responseMessages,
      this.settings.output == null
        ? Promise.resolve(undefined as never)
        : streamResult.output,
    ]);

    return new HarnessGenerateTextResult<
      HarnessAllTools<THarness, TUserTools>,
      RUNTIME_CONTEXT,
      OUTPUT
    >({ steps, usage, responseMessages, output });
  }

  private async _resolveResponseFormat(): Promise<
    HarnessV1ResponseFormat | undefined
  > {
    const responseFormat = await this.settings.output?.responseFormat;
    if (responseFormat == null || responseFormat.type === 'text') {
      return responseFormat == null ? undefined : { type: 'text' };
    }
    return {
      type: 'json',
      ...(responseFormat.schema == null
        ? {}
        : { schema: responseFormat.schema as HarnessV1JSONSchema }),
      ...(responseFormat.name == null ? {} : { name: responseFormat.name }),
      ...(responseFormat.description == null
        ? {}
        : { description: responseFormat.description }),
    };
  }
}

/*
 * `GenerateTextResult` view over a drained `streamText` run. Non-deprecated
 * members derive from `steps` (the single source of truth), and the deprecated
 * members are exposed as getters that delegate to `finalStep` / `usage`.
 * Implementing the deprecated members as getters — rather than assigning them
 * in an object literal — keeps construction free of deprecated-property usage,
 * matching how core's `generateText` builds its result.
 */
class HarnessGenerateTextResult<
  TOOLS extends ToolSet,
  RUNTIME_CONTEXT extends Context,
  OUTPUT extends Output,
> implements GenerateTextResult<TOOLS, RUNTIME_CONTEXT, OUTPUT> {
  readonly steps: GenerateTextResult<TOOLS, RUNTIME_CONTEXT, OUTPUT>['steps'];
  readonly usage: GenerateTextResult<TOOLS, RUNTIME_CONTEXT, OUTPUT>['usage'];
  readonly responseMessages: GenerateTextResult<
    TOOLS,
    RUNTIME_CONTEXT,
    OUTPUT
  >['responseMessages'];
  readonly output: GenerateTextResult<TOOLS, RUNTIME_CONTEXT, OUTPUT>['output'];

  constructor(options: {
    steps: GenerateTextResult<TOOLS, RUNTIME_CONTEXT, OUTPUT>['steps'];
    usage: GenerateTextResult<TOOLS, RUNTIME_CONTEXT, OUTPUT>['usage'];
    responseMessages: GenerateTextResult<
      TOOLS,
      RUNTIME_CONTEXT,
      OUTPUT
    >['responseMessages'];
    output: GenerateTextResult<TOOLS, RUNTIME_CONTEXT, OUTPUT>['output'];
  }) {
    this.steps = options.steps;
    this.usage = options.usage;
    this.responseMessages = options.responseMessages;
    this.output = options.output;
  }

  get finalStep() {
    return this.steps.at(-1)!;
  }

  get content() {
    return this.steps.flatMap(step => step.content);
  }

  get text() {
    return this.finalStep.text;
  }

  get files() {
    return this.steps.flatMap(step => step.files);
  }

  get sources() {
    return this.steps.flatMap(step => step.sources);
  }

  get toolCalls() {
    return this.steps.flatMap(step => step.toolCalls);
  }

  get staticToolCalls() {
    return this.steps.flatMap(step => step.staticToolCalls);
  }

  get dynamicToolCalls() {
    return this.steps.flatMap(step => step.dynamicToolCalls);
  }

  get toolResults() {
    return this.steps.flatMap(step => step.toolResults);
  }

  get staticToolResults() {
    return this.steps.flatMap(step => step.staticToolResults);
  }

  get dynamicToolResults() {
    return this.steps.flatMap(step => step.dynamicToolResults);
  }

  get finishReason() {
    return this.finalStep.finishReason;
  }

  get rawFinishReason() {
    return this.finalStep.rawFinishReason;
  }

  get warnings() {
    return this.steps.flatMap(step => step.warnings ?? []);
  }

  get reasoning() {
    return this.finalStep.content.filter(
      (part): part is ReasoningOutput | ReasoningFileOutput =>
        part.type === 'reasoning' || part.type === 'reasoning-file',
    );
  }

  get reasoningText() {
    return this.finalStep.reasoningText;
  }

  get totalUsage() {
    return this.usage;
  }

  get request() {
    return this.finalStep.request;
  }

  get response() {
    return this.finalStep.response;
  }

  get providerMetadata() {
    return this.finalStep.providerMetadata;
  }
}

function resolveSandboxConfig(
  settings: Pick<HarnessAgentSettings, 'sandboxConfig' | 'onSandboxSession'>,
): HarnessAgentSandboxConfig {
  if (settings.onSandboxSession != null) {
    console.warn(
      'HarnessAgent: `onSandboxSession` is deprecated. Use `sandboxConfig.onSession` instead.',
    );
  }

  return {
    ...settings.sandboxConfig,
    ...(settings.sandboxConfig?.onSession == null &&
    settings.onSandboxSession != null
      ? { onSession: settings.onSandboxSession }
      : {}),
  };
}

async function cleanupAfterStartFailure(input: {
  sandboxSession: HarnessV1NetworkSandboxSession;
}): Promise<void> {
  await Promise.resolve(input.sandboxSession.stop()).catch(() => {});
}
