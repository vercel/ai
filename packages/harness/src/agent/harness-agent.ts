import { HarnessCapabilityUnsupportedError } from '../errors/harness-capability-unsupported-error';
import type {
  HarnessV1Bootstrap,
  HarnessV1NetworkSandboxSession,
  HarnessV1SandboxProvider,
} from '../v1';
import type { JSONValue } from '@ai-sdk/provider';
import {
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
  Output,
  ReasoningFileOutput,
  ReasoningOutput,
  StreamTextResult,
} from 'ai';
import type { HarnessAgentSettings } from './harness-agent-settings';
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
  applyBootstrapRecipe,
  hashBootstrap,
} from './internal/bootstrap-recipe';
import {
  acquireBridgePort,
  releaseBridgePort,
} from './internal/bridge-port-registry';
import { buildObservability } from './internal/resolve-observability';
import { validateLifecycleStateData } from './internal/lifecycle-state-validation';
import {
  permissionModeNeedsBuiltinSupport,
  resolvePermissionMode,
} from './internal/permission-mode';

/** Extract the builtin tool set type from a harness adapter parameter. */
type BuiltinToolsOf<H> = H extends HarnessAgentAdapter<infer T> ? T : never;

/**
 * Type-level merge of a harness's builtin tools with user-defined tools.
 * User tools override builtins on key collision.
 */
export type HarnessAllTools<
  THarness extends HarnessAgentAdapter<any>,
  TUserTools extends ToolSet,
> = Omit<BuiltinToolsOf<THarness>, keyof TUserTools> & TUserTools;

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
> implements Agent<
  never,
  HarnessAllTools<THarness, TUserTools>,
  RUNTIME_CONTEXT,
  never
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

  private readonly settings: HarnessAgentSettings<THarness, TUserTools>;
  private readonly userTools: TUserTools;
  private readonly permissionMode: HarnessAgentPermissionMode;

  constructor(settings: HarnessAgentSettings<THarness, TUserTools>) {
    this.settings = settings;
    this.id = settings.id;
    this.userTools = settings.tools ?? ({} as TUserTools);
    this.permissionMode = resolvePermissionMode({
      permissionMode: settings.permissionMode,
    });
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
    this.tools = {
      ...settings.harness.builtinTools,
      ...this.userTools,
    } as HarnessAllTools<THarness, TUserTools>;
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

    let recipe: HarnessV1Bootstrap | undefined;
    let identity: string | undefined;

    if (harness.getBootstrap != null) {
      recipe = await harness.getBootstrap({ abortSignal });
      identity = await hashBootstrap(recipe);
    }

    const acquiredSandboxSession = await this._acquireSandbox({
      sandboxProvider,
      sessionId,
      isResume: isResumedSession,
      recipe,
      identity,
      abortSignal,
    });

    const leased = applyPortLease({
      provider: sandboxProvider,
      sandboxSession: acquiredSandboxSession,
      sessionId,
    });
    const sandboxSession = leased.sandboxSession;
    const leasedBridgePort = leased.port;
    const sessionWorkDir = `${sandboxSession.defaultWorkingDirectory}/${harness.harnessId}-${sessionId}`;

    try {
      /*
       * Adapter bootstrap is one-time work for fresh sessions. The consumer
       * hook runs for every acquired sandbox session after the work dir exists.
       */
      if (!isResumedSession && recipe != null && identity != null) {
        await applyBootstrapRecipe(
          sandboxSession.restricted(),
          recipe,
          identity,
          { abortSignal },
        );
      }
      await sandboxSession.run({
        command: `mkdir -p ${sessionWorkDir}`,
        abortSignal,
      });
      if (this.settings.onSandboxSession != null) {
        await this.settings.onSandboxSession({
          session: sandboxSession.restricted(),
          sessionWorkDir,
          abortSignal,
        });
      }
    } catch (err) {
      await cleanupAfterStartFailure({
        sandboxProvider,
        sandboxSession,
        sessionId,
        leasedBridgePort,
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
        sandboxProvider,
        leasedBridgePort,
        sessionWorkDir,
        toolApproval: this.settings.toolApproval,
        pendingToolApprovals: effectiveContinueFrom?.pendingToolApprovals,
        turnState:
          effectiveContinueFrom == null
            ? 'idle'
            : effectiveContinueFrom.pendingToolApprovals != null &&
                effectiveContinueFrom.pendingToolApprovals.length > 0
              ? 'awaiting-approval'
              : 'suspended',
      });
    } catch (error) {
      await cleanupAfterStartFailure({
        sandboxProvider,
        sandboxSession,
        sessionId,
        leasedBridgePort,
      });
      throw error;
    }
  }

  async generate<OUTPUT extends Output.Output = never>(
    options: AgentCallParameters<
      never,
      HarnessAllTools<THarness, TUserTools>,
      RUNTIME_CONTEXT
    > &
      HarnessAgentCallExtensions & {
        /**
         * Optional output specification for this turn (e.g.
         * `Output.object({ schema })`). When present the runtime enforces the
         * schema, the framework validates the result host-side, and
         * `result.output` is typed as the schema's inferred type.
         */
        output?: OUTPUT;
      },
  ): Promise<
    GenerateTextResult<
      HarnessAllTools<THarness, TUserTools>,
      RUNTIME_CONTEXT,
      OUTPUT
    >
  > {
    const turnInput = this._resolveTurnInput(options);
    const runtimeContext = {} as RUNTIME_CONTEXT;
    const outputSchema = await this._resolveOutputSchema(options.output);
    const { result, done } = this._startTurn<OUTPUT>({
      session: options.session,
      turnInput,
      output: options.output,
      outputSchema,
      runtimeContext,
      abortSignal: options.abortSignal,
    });
    await done;
    return this._toGenerateResult<OUTPUT>(result, options.output);
  }

  async stream<OUTPUT extends Output.Output = never>(
    options: AgentStreamParameters<
      never,
      HarnessAllTools<THarness, TUserTools>,
      RUNTIME_CONTEXT
    > &
      HarnessAgentCallExtensions & {
        /**
         * Optional output specification for this turn. Same semantics as
         * {@link generate}'s `output`; the streaming result exposes the
         * structured-output surfaces (`output`, `partialOutputStream`,
         * `elementStream`).
         */
        output?: OUTPUT;
      },
  ): Promise<
    StreamTextResult<
      HarnessAllTools<THarness, TUserTools>,
      RUNTIME_CONTEXT,
      OUTPUT
    >
  > {
    const turnInput = this._resolveTurnInput(options);
    const runtimeContext = {} as RUNTIME_CONTEXT;
    const outputSchema = await this._resolveOutputSchema(options.output);
    const { result } = this._startTurn<OUTPUT>({
      session: options.session,
      turnInput,
      output: options.output,
      outputSchema,
      runtimeContext,
      abortSignal: options.abortSignal,
    });
    return result;
  }

  /**
   * Continue the in-flight turn **without a new prompt**, draining it like
   * {@link generate}. Used after `createSession({ continueFrom })` to finish
   * consuming a turn that crossed a process boundary.
   */
  async continueGenerate<OUTPUT extends Output.Output = never>(options: {
    session: HarnessAgentSession;
    toolApprovalContinuations?: readonly HarnessAgentToolApprovalContinuation[];
    /**
     * Re-pass the same output specification used to start the suspended turn.
     * It is used host-side to validate the final result, and re-threaded to the
     * runtime when the adapter re-drives the turn (rerun recovery).
     */
    output?: OUTPUT;
    abortSignal?: AbortSignal;
  }): Promise<
    GenerateTextResult<
      HarnessAllTools<THarness, TUserTools>,
      RUNTIME_CONTEXT,
      OUTPUT
    >
  > {
    const runtimeContext = {} as RUNTIME_CONTEXT;
    const outputSchema = await this._resolveOutputSchema(options.output);

    const { result, done } = this._startTurn<OUTPUT>({
      session: options.session,
      turnInput: {
        mode: 'continue',
        toolApprovalContinuations: options.toolApprovalContinuations ?? [],
      },
      output: options.output,
      outputSchema,
      runtimeContext,
      abortSignal: options.abortSignal,
    });
    await done;
    return this._toGenerateResult<OUTPUT>(result, options.output);
  }

  /**
   * Continue the in-flight turn **without a new prompt**, streaming its events
   * like {@link stream}. Used to keep consuming a turn that is still running
   * (or finished) in the runtime after a process boundary — the workflow slice
   * loop calls this on every slice after the first. Routes through the adapter's
   * `doContinueTurn`; what it can guarantee (lossless attach vs. lossy rerun)
   * follows from how the adapter resumed the session.
   */
  async continueStream<OUTPUT extends Output.Output = never>(options: {
    session: HarnessAgentSession;
    toolApprovalContinuations?: readonly HarnessAgentToolApprovalContinuation[];
    /**
     * Re-pass the same output specification used to start the suspended turn.
     * Same semantics as {@link continueGenerate}'s `output`.
     */
    output?: OUTPUT;
    abortSignal?: AbortSignal;
  }): Promise<
    StreamTextResult<
      HarnessAllTools<THarness, TUserTools>,
      RUNTIME_CONTEXT,
      OUTPUT
    >
  > {
    const runtimeContext = {} as RUNTIME_CONTEXT;
    const outputSchema = await this._resolveOutputSchema(options.output);

    const { result } = this._startTurn<OUTPUT>({
      session: options.session,
      turnInput: {
        mode: 'continue',
        toolApprovalContinuations: options.toolApprovalContinuations ?? [],
      },
      output: options.output,
      outputSchema,
      runtimeContext,
      abortSignal: options.abortSignal,
    });
    return result;
  }

  // ─── Internals ──────────────────────────────────────────────────────

  private _startTurn<OUTPUT extends Output.Output = never>(input: {
    session: HarnessAgentSession;
    turnInput:
      | { mode: 'prompt'; prompt: HarnessAgentPrompt }
      | {
          mode: 'continue';
          toolApprovalContinuations: readonly HarnessAgentToolApprovalContinuation[];
        };
    output: OUTPUT | undefined;
    outputSchema: JSONValue | undefined;
    runtimeContext: RUNTIME_CONTEXT;
    abortSignal: AbortSignal | undefined;
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
        toolSpecs: this._toToolSpecs(),
        output: input.output,
        outputSchema: input.outputSchema,
        runtimeContext: input.runtimeContext,
        abortSignal: input.abortSignal,
        telemetry: this.settings.telemetry,
        toolApprovalContinuations: input.turnInput.toolApprovalContinuations,
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
      toolSpecs: this._toToolSpecs(),
      output: input.output,
      outputSchema: input.outputSchema,
      runtimeContext: input.runtimeContext,
      abortSignal: input.abortSignal,
      telemetry: this.settings.telemetry,
    });
  }

  /*
   * Resolve the bare JSON Schema to send down to the runtime from an `output`
   * specification. Mirrors how core derives the wire schema: the spec's
   * `responseFormat` already produces the wrapped schema for `array`/`choice`;
   * only the bare `schema` travels (the runtimes accept neither `name` nor
   * `description`).
   */
  private async _resolveOutputSchema(
    output: Output.Output | undefined,
  ): Promise<JSONValue | undefined> {
    if (output == null) return undefined;
    const responseFormat = await output.responseFormat;
    if (responseFormat?.type === 'json') {
      return responseFormat.schema as JSONValue | undefined;
    }
    return undefined;
  }

  private async _acquireSandbox(input: {
    sandboxProvider: HarnessV1SandboxProvider;
    sessionId: string;
    isResume: boolean;
    recipe: HarnessV1Bootstrap | undefined;
    identity: string | undefined;
    abortSignal: AbortSignal | undefined;
  }): Promise<HarnessV1NetworkSandboxSession> {
    const { sandboxProvider } = input;
    if (input.isResume) {
      if (sandboxProvider.resumeSession == null) {
        throw new HarnessCapabilityUnsupportedError({
          message: `Sandbox provider '${sandboxProvider.providerId}' does not support resume.`,
          harnessId: this.settings.harness.harnessId,
        });
      }
      return sandboxProvider.resumeSession({
        sessionId: input.sessionId,
        abortSignal: input.abortSignal,
      });
    }
    return sandboxProvider.createSession({
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
      if (toolApprovalContinuations.length > 0) {
        return {
          mode: 'continue',
          toolApprovalContinuations,
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
      this.userTools as Record<string, unknown>,
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

  private async _toGenerateResult<OUTPUT extends Output.Output = never>(
    streamResult: StreamTextResult<
      HarnessAllTools<THarness, TUserTools>,
      RUNTIME_CONTEXT,
      OUTPUT
    >,
    output: OUTPUT | undefined,
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
    const [steps, usage, responseMessages] = await Promise.all([
      streamResult.steps,
      streamResult.usage,
      streamResult.responseMessages,
    ]);

    // When an output specification is present, read the validated object off
    // the (already-settled) streaming result. A non-conformant final text
    // rejects here with `NoObjectGeneratedError`, surfacing from `generate()`.
    const outputValue = (
      output != null ? await streamResult.output : undefined
    ) as GenerateTextResult<
      HarnessAllTools<THarness, TUserTools>,
      RUNTIME_CONTEXT,
      OUTPUT
    >['output'];

    return new HarnessGenerateTextResult<
      HarnessAllTools<THarness, TUserTools>,
      RUNTIME_CONTEXT,
      OUTPUT
    >({ steps, usage, responseMessages, output: outputValue });
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
  OUTPUT extends Output.Output = never,
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

/*
 * Bridge-port leasing helper. Returns the port-narrowed network sandbox session
 * plus the leased port (or `undefined` when the provider has no port pool). Kept here
 * rather than on the session so the lease is established as part of session
 * start — the session only needs to release it on close/detach.
 */
function applyPortLease(input: {
  provider: HarnessV1SandboxProvider;
  sandboxSession: HarnessV1NetworkSandboxSession;
  sessionId: string;
}): {
  sandboxSession: HarnessV1NetworkSandboxSession;
  port: number | undefined;
} {
  const pool = input.provider.bridgePorts;
  if (pool == null || pool.length === 0) {
    return { sandboxSession: input.sandboxSession, port: undefined };
  }
  const port = acquireBridgePort({
    poolKey: input.provider,
    pool,
    sessionId: input.sessionId,
  });
  return {
    sandboxSession: narrowNetworkSessionPorts(input.sandboxSession, port),
    port,
  };
}

/*
 * Derive a view of the network sandbox session that reports only the leased
 * port. Implemented as a prototype-delegating overlay so every other member
 * (file I/O, exec, spawn, lifecycle, `restricted`) forwards to the same live
 * instance — only `ports` is shadowed.
 */
function narrowNetworkSessionPorts(
  sandboxSession: HarnessV1NetworkSandboxSession,
  leasedPort: number,
): HarnessV1NetworkSandboxSession {
  return Object.create(sandboxSession, {
    ports: {
      value: [leasedPort] as ReadonlyArray<number>,
      enumerable: true,
    },
  }) as HarnessV1NetworkSandboxSession;
}

async function cleanupAfterStartFailure(input: {
  sandboxProvider: HarnessV1SandboxProvider;
  sandboxSession: HarnessV1NetworkSandboxSession;
  sessionId: string;
  leasedBridgePort: number | undefined;
}): Promise<void> {
  await Promise.resolve(input.sandboxSession.stop()).catch(() => {});
  if (input.leasedBridgePort != null) {
    releaseBridgePort({
      poolKey: input.sandboxProvider,
      sessionId: input.sessionId,
    });
  }
}
