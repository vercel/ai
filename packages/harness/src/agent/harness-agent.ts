import { HarnessCapabilityUnsupportedError } from '../errors/harness-capability-unsupported-error';
import type {
  HarnessV1,
  HarnessV1Bootstrap,
  HarnessV1Prompt,
  HarnessV1ResumeState,
  HarnessV1SandboxHandle,
  HarnessV1SandboxProvider,
  HarnessV1ToolSpec,
} from '../v1';
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
  ReasoningFileOutput,
  ReasoningOutput,
  StreamTextResult,
} from 'ai';
import type { HarnessAgentSettings } from './harness-agent-settings';
import { HarnessAgentSession } from './harness-agent-session';
import {
  applyBootstrapRecipe,
  hashBootstrap,
} from './internal/bootstrap-recipe';
import {
  acquireBridgePort,
  releaseBridgePort,
} from './internal/bridge-port-registry';
import { validateResumeStateData } from './internal/resume-state-validation';
import { runPrompt } from './internal/run-prompt';

/** Extract the builtin tool set type from a `HarnessV1<...>` parameter. */
type BuiltinToolsOf<H> = H extends HarnessV1<infer T> ? T : never;

/**
 * Type-level merge of a harness's builtin tools with user-defined tools.
 * User tools override builtins on key collision.
 */
export type HarnessAllTools<
  THarness extends HarnessV1<any>,
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
 * through a `HarnessV1` adapter (Claude Code, Codex, …).
 *
 * Behaviour summary:
 *  - **Stateless definition.** Construct once at module scope. The agent
 *    holds the harness adapter, the merged tool surface, the sandbox
 *    provider and other config — never a live session. Per-call data
 *    (prompt, abort signal, the `HarnessAgentSession`) lives on
 *    `generate()` / `stream()`.
 *  - **Explicit sessions.** Callers spawn sessions with
 *    `agent.createSession(...)`, pass the returned
 *    `HarnessAgentSession` on every `generate` / `stream`, and tear it
 *    down via `session.close()` or `session.detach()`.
 *  - **Cross-process resume.** `createSession({ sessionId, resumeFrom })`
 *    reattaches to a sandbox previously detached via
 *    `session.detach()`. The framework validates `resumeFrom` against
 *    the harness's `resumeStateSchema` before handing it to the adapter.
 *  - **Host tool execution.** User tools passed in `settings.tools` are
 *    executed on the host whenever the underlying runtime calls them;
 *    the result is fed back to the harness via `submitToolResult`.
 *    Adapter builtin tools (e.g. Claude Code's `Bash`) pass through
 *    untouched.
 *  - **Sandbox propagation.** `settings.sandbox` is a sandbox provider.
 *    On `createSession`, the agent calls `provider.create()` (or
 *    `resume()`) and passes the resulting handle into `doStart`. The
 *    handle's `session` (a tool-safe `Experimental_Sandbox` view) is
 *    handed to user-tool `execute()` calls via `experimental_sandbox`.
 */
export class HarnessAgent<
  THarness extends HarnessV1<any> = HarnessV1,
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

  constructor(settings: HarnessAgentSettings<THarness, TUserTools>) {
    this.settings = settings;
    this.id = settings.id;
    this.userTools = settings.tools ?? ({} as TUserTools);
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
   * Start a fresh session, or reattach to one previously detached via
   * `session.detach()`. The returned `HarnessAgentSession` must be
   * passed to subsequent `generate` / `stream` calls; closing it with
   * `session.close()` releases the sandbox and bridge-port lease.
   */
  async createSession(options?: {
    /**
     * Optional stable identifier for the underlying sandbox/session.
     * When omitted the agent generates one. Supply the original
     * `session.sessionId` together with `resumeFrom` to reattach a
     * previously detached session across processes.
     */
    sessionId?: string;
    /**
     * Resume payload returned by a prior `session.detach()`. Must be
     * accompanied by the original `sessionId`; the framework
     * validates it against `harness.resumeStateSchema` before handing
     * it to the adapter.
     */
    resumeFrom?: HarnessV1ResumeState;
    abortSignal?: AbortSignal;
  }): Promise<HarnessAgentSession> {
    const sessionId = options?.sessionId ?? generateId();
    const resumeFrom = options?.resumeFrom;
    const abortSignal = options?.abortSignal;
    const harness = this.settings.harness;
    const sandboxProvider = this.settings.sandbox;

    let validatedResumeFrom: HarnessV1ResumeState | undefined;
    if (resumeFrom != null) {
      validatedResumeFrom = await validateResumeStateData({
        harness,
        state: resumeFrom,
      });
    }

    let sandboxHandle: HarnessV1SandboxHandle | undefined;
    let sessionWorkDir: string | undefined;
    let leasedBridgePort: number | null = null;
    let recipe: HarnessV1Bootstrap | undefined;
    let identity: string | undefined;

    if (sandboxProvider != null) {
      if (harness.getBootstrap != null) {
        recipe = await harness.getBootstrap({ abortSignal });
        identity = await hashBootstrap(recipe);
      }

      const rawHandle = await this._acquireSandbox({
        sandboxProvider,
        sessionId,
        isResume: validatedResumeFrom != null,
        recipe,
        identity,
        abortSignal,
      });

      const leased = applyPortLease({
        provider: sandboxProvider,
        handle: rawHandle,
        sessionId,
      });
      sandboxHandle = leased.handle;
      leasedBridgePort = leased.port;
      sessionWorkDir = `${sandboxHandle.defaultWorkingDirectory}/${harness.harnessId}-${sessionId}`;

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
          // Create the session work dir before `setup` so the hook can
          // operate against it (e.g. clone a repo into it).
          await sandboxHandle.session.run({
            command: `mkdir -p ${sessionWorkDir}`,
            abortSignal,
          });
          if (sandboxProvider.setup != null) {
            await sandboxProvider.setup({
              session: sandboxHandle.session,
              sessionWorkDir,
              abortSignal,
            });
          }
        } catch (err) {
          await cleanupAfterStartFailure({
            sandboxProvider,
            rawHandle,
            sessionId,
            leasedBridgePort,
          });
          throw err;
        }
      }
    }

    try {
      const baseStartOptions = {
        sessionId,
        skills: this.settings.skills,
        resumeFrom: validatedResumeFrom,
        abortSignal,
      };
      const underlyingSession = await harness.doStart(
        sandboxHandle != null && sessionWorkDir != null
          ? { ...baseStartOptions, sandboxHandle, sessionWorkDir }
          : baseStartOptions,
      );
      return new HarnessAgentSession({
        sessionId,
        harness,
        underlyingSession,
        sandboxHandle: sandboxHandle ?? null,
        sandboxProvider,
        leasedBridgePort,
        sessionWorkDir,
      });
    } catch (error) {
      if (sandboxHandle != null) {
        await cleanupAfterStartFailure({
          sandboxProvider: sandboxProvider!,
          rawHandle: sandboxHandle,
          sessionId,
          leasedBridgePort,
        });
      }
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
      never
    >
  > {
    const { result, done } = this._runTurn(options);
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
      never
    >
  > {
    const { result } = this._runTurn(options);
    return result;
  }

  // ─── Internals ──────────────────────────────────────────────────────

  private _runTurn(
    options: (
      | AgentCallParameters<
          never,
          HarnessAllTools<THarness, TUserTools>,
          RUNTIME_CONTEXT
        >
      | AgentStreamParameters<
          never,
          HarnessAllTools<THarness, TUserTools>,
          RUNTIME_CONTEXT
        >
    ) &
      HarnessAgentCallExtensions,
  ): {
    result: ReturnType<
      typeof runPrompt<HarnessAllTools<THarness, TUserTools>, RUNTIME_CONTEXT>
    >['result'];
    done: Promise<void>;
  } {
    const session = options.session;
    const underlyingSession = session.getUnderlyingSession();
    const sandboxHandle = session.getSandboxHandle();
    const sessionWorkDir = session.getSessionWorkDir();

    const prompt = this._normalizePrompt(options);
    const toolSpecs = this._toToolSpecs();
    // `runtimeContext` is not part of AgentCallParameters by name; AI SDK
    // populates it via context propagation. For v0 we pass an empty object
    // cast to RUNTIME_CONTEXT, which is correct for the default Context type.
    const runtimeContext = {} as RUNTIME_CONTEXT;

    return runPrompt<HarnessAllTools<THarness, TUserTools>, RUNTIME_CONTEXT>({
      harness: this.settings.harness,
      session: underlyingSession,
      prompt,
      instructions: this.settings.instructions,
      tools: this.tools,
      toolSpecs,
      sandboxSession: sandboxHandle?.session,
      sessionWorkDir,
      runtimeContext,
      abortSignal: options.abortSignal,
    });
  }

  private async _acquireSandbox(input: {
    sandboxProvider: HarnessV1SandboxProvider;
    sessionId: string;
    isResume: boolean;
    recipe: HarnessV1Bootstrap | undefined;
    identity: string | undefined;
    abortSignal: AbortSignal | undefined;
  }): Promise<HarnessV1SandboxHandle> {
    const { sandboxProvider } = input;
    if (input.isResume) {
      if (sandboxProvider.resume == null) {
        throw new HarnessCapabilityUnsupportedError({
          message: `Sandbox provider '${sandboxProvider.providerId}' does not support resume.`,
          harnessId: this.settings.harness.harnessId,
        });
      }
      return sandboxProvider.resume({
        sessionId: input.sessionId,
        abortSignal: input.abortSignal,
      });
    }
    return sandboxProvider.create({
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
  private _normalizePrompt(options: {
    prompt?: string | ModelMessage[];
    messages?: ModelMessage[];
  }): HarnessV1Prompt {
    if (typeof options.prompt === 'string') {
      return options.prompt;
    }
    const messages = Array.isArray(options.prompt)
      ? options.prompt
      : options.messages;
    if (Array.isArray(messages)) {
      for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];
        if (message?.role === 'user') return message;
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
  private _toToolSpecs(): HarnessV1ToolSpec[] {
    const specs: HarnessV1ToolSpec[] = [];
    for (const [name, tool] of Object.entries(
      this.userTools as Record<string, unknown>,
    )) {
      const t = tool as {
        description?: string;
        inputSchema?: unknown;
      };
      let inputSchema: HarnessV1ToolSpec['inputSchema'];
      if (t.inputSchema != null) {
        try {
          inputSchema = asSchema(
            t.inputSchema as Parameters<typeof asSchema>[0],
          ).jsonSchema as HarnessV1ToolSpec['inputSchema'];
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
      never
    >,
  ): Promise<
    GenerateTextResult<
      HarnessAllTools<THarness, TUserTools>,
      RUNTIME_CONTEXT,
      never
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

    return new HarnessGenerateTextResult<
      HarnessAllTools<THarness, TUserTools>,
      RUNTIME_CONTEXT
    >({ steps, usage, responseMessages });
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
> implements GenerateTextResult<TOOLS, RUNTIME_CONTEXT, never> {
  readonly steps: GenerateTextResult<TOOLS, RUNTIME_CONTEXT, never>['steps'];
  readonly usage: GenerateTextResult<TOOLS, RUNTIME_CONTEXT, never>['usage'];
  readonly responseMessages: GenerateTextResult<
    TOOLS,
    RUNTIME_CONTEXT,
    never
  >['responseMessages'];
  readonly output = undefined as never;

  constructor(options: {
    steps: GenerateTextResult<TOOLS, RUNTIME_CONTEXT, never>['steps'];
    usage: GenerateTextResult<TOOLS, RUNTIME_CONTEXT, never>['usage'];
    responseMessages: GenerateTextResult<
      TOOLS,
      RUNTIME_CONTEXT,
      never
    >['responseMessages'];
  }) {
    this.steps = options.steps;
    this.usage = options.usage;
    this.responseMessages = options.responseMessages;
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
 * Bridge-port leasing helper. Returns the narrowed handle plus the leased
 * port (or null when the provider has no port pool). Kept here rather than
 * on the session so the lease is established as part of session start —
 * the session only needs to release it on close/detach.
 */
function applyPortLease(input: {
  provider: HarnessV1SandboxProvider;
  handle: HarnessV1SandboxHandle;
  sessionId: string;
}): { handle: HarnessV1SandboxHandle; port: number | null } {
  const pool = input.provider.bridgePorts;
  if (pool == null || pool.length === 0) {
    return { handle: input.handle, port: null };
  }
  const port = acquireBridgePort({
    poolKey: input.provider,
    pool,
    sessionId: input.sessionId,
  });
  return { handle: narrowHandlePorts(input.handle, port), port };
}

function narrowHandlePorts(
  handle: HarnessV1SandboxHandle,
  leasedPort: number,
): HarnessV1SandboxHandle {
  return {
    id: handle.id,
    defaultWorkingDirectory: handle.defaultWorkingDirectory,
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

async function cleanupAfterStartFailure(input: {
  sandboxProvider: HarnessV1SandboxProvider;
  rawHandle: HarnessV1SandboxHandle;
  sessionId: string;
  leasedBridgePort: number | null;
}): Promise<void> {
  await Promise.resolve(input.rawHandle.stop()).catch(() => {});
  if (input.leasedBridgePort != null) {
    releaseBridgePort({
      poolKey: input.sandboxProvider,
      sessionId: input.sessionId,
    });
  }
}
