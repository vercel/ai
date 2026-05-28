import type {
  HarnessV1,
  HarnessV1Prompt,
  HarnessV1ResumeState,
  HarnessV1Session,
  HarnessV1ToolSpec,
} from '../v1';
import {
  asSchema,
  generateId,
  type Context,
  type ToolSet,
} from '@ai-sdk/provider-utils';
import type {
  Agent,
  AgentCallParameters,
  AgentStreamParameters,
  GenerateTextResult,
  StreamTextResult,
} from 'ai';
import type { HarnessAgentSettings } from './harness-agent-settings';
import { runPrompt } from './internal/run-prompt';
import { SessionManager } from './internal/session-manager';

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
 * Per-call options accepted by `HarnessAgent.generate` / `HarnessAgent.stream`
 * in addition to the AI SDK base parameters. Supplying `sessionId` signals a
 * resume call against an existing harness session; the corresponding
 * `resumeFrom` payload is the `HarnessV1ResumeState` previously returned by
 * `agent.detach({ sessionId })`.
 */
export interface HarnessAgentCallExtensions {
  /**
   * Identifier of the harness session this call targets. Omit for a fresh
   * session — the agent generates one and surfaces it on the result. Supply
   * on subsequent calls (multi-turn within one process, or cross-process
   * resume) to address the same session.
   */
  sessionId?: string;
  /**
   * Resume payload from a prior `agent.detach()`. Must be supplied together
   * with `sessionId` when continuing a session in a fresh process; the
   * framework validates it against `harness.resumeStateSchema` before
   * handing it to the adapter.
   */
  resumeFrom?: HarnessV1ResumeState;
}

/**
 * Fields the harness adds to each `StreamTextResult` / `GenerateTextResult`
 * returned by `generate` / `stream`. The agent guarantees `sessionId` so the
 * caller can persist it for a future resume.
 */
export interface HarnessAgentCallResultExtensions {
  /**
   * Identifier of the session this call ran against. Either the value the
   * caller supplied on the options, or the framework-generated id on a
   * first call.
   */
  sessionId: string;
}

/**
 * AI SDK `Agent` implementation that drives a third-party agent runtime
 * through a `HarnessV1` adapter (Claude Code, Codex, …).
 *
 * Behaviour summary:
 *  - **Multi-session.** The agent is constructed once at module scope; each
 *    `generate()` / `stream()` call addresses a session by `sessionId`.
 *    Calls without an explicit id reuse a single auto-generated default
 *    session, preserving multi-turn ergonomics for one-shot scripts.
 *  - **Cross-process resume.** Supply `sessionId` + `resumeFrom` on the
 *    call to continue a session previously detached via
 *    `agent.detach({ sessionId })`. The framework validates the resume
 *    payload against the harness's `resumeStateSchema` and asks the
 *    sandbox provider for a handle bound to the existing resource.
 *  - **Pull-based result.** Both `generate()` and `stream()` surface the
 *    standard AI SDK shapes (`GenerateTextResult`, `StreamTextResult`)
 *    plus a `sessionId` field so callers can persist it.
 *  - **Host tool execution.** User tools passed in `settings.tools` are
 *    executed on the host whenever the underlying runtime calls them; the
 *    result is fed back to the harness via `submitToolResult`. Adapter
 *    builtin tools (e.g. Claude Code's `Bash`) pass through untouched.
 *  - **Sandbox propagation.** `settings.sandbox` is a sandbox provider. On
 *    session start, the agent calls `provider.create()` (or `resume()`)
 *    and passes the resulting handle into `doStart`. The handle's
 *    `session` (a tool-safe `Experimental_Sandbox` view) is also handed to
 *    user-tool `execute()` calls via `experimental_sandbox`.
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
  private readonly sessions: SessionManager;
  private defaultSessionId: string | undefined;

  constructor(settings: HarnessAgentSettings<THarness, TUserTools>) {
    this.settings = settings;
    this.id = settings.id;
    this.userTools = settings.tools ?? ({} as TUserTools);
    this.tools = {
      ...settings.harness.builtinTools,
      ...this.userTools,
    } as HarnessAllTools<THarness, TUserTools>;
    this.sessions = new SessionManager({
      harness: settings.harness,
      sandbox: settings.sandbox,
      skills: settings.skills,
    });
  }

  /** Identifier of the harness backing this agent. */
  get harnessId(): string {
    return this.settings.harness.harnessId;
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
    > &
      HarnessAgentCallResultExtensions
  > {
    const { result, done, sessionId } = await this._startTurn(options);
    await done;
    const generateResult = await this._toGenerateResult(result);
    return Object.assign(generateResult, { sessionId });
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
    > &
      HarnessAgentCallResultExtensions
  > {
    const { result, sessionId } = await this._startTurn(options);
    return Object.assign(result, { sessionId });
  }

  /**
   * Tear down a session. Stops the sandbox without preserving resume
   * state. Idempotent.
   *
   * `sessionId` defaults to the auto-generated default session — the one
   * implicitly used by `stream` / `generate` calls that omit `sessionId`.
   */
  async close(options?: { sessionId?: string }): Promise<void> {
    const sessionId = options?.sessionId ?? this.defaultSessionId;
    if (sessionId == null) return;
    await this.sessions.close({ sessionId });
  }

  /**
   * Detach a session and return a payload for later resume. Stops the
   * sandbox (snapshots automatically on persistent providers) — a future
   * `stream` / `generate` call with the same `sessionId` and this payload
   * as `resumeFrom` resumes against the same resource.
   *
   * Throws `HarnessCapabilityUnsupportedError` if the harness does not
   * support detach.
   */
  async detach(options?: {
    sessionId?: string;
  }): Promise<HarnessV1ResumeState> {
    const sessionId = options?.sessionId ?? this.defaultSessionId;
    if (sessionId == null) {
      throw new Error(
        'HarnessAgent.detach(): no active default session and no sessionId provided.',
      );
    }
    return this.sessions.detach({ sessionId });
  }

  // ─── Internals ──────────────────────────────────────────────────────

  private async _startTurn(
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
  ): Promise<{
    sessionId: string;
    session: HarnessV1Session;
    result: ReturnType<
      typeof runPrompt<HarnessAllTools<THarness, TUserTools>, RUNTIME_CONTEXT>
    >['result'];
    done: Promise<void>;
  }> {
    const sessionId = this._resolveSessionId(options.sessionId);
    const session = await this.sessions.getSession({
      sessionId,
      resumeFrom: options.resumeFrom,
      abortSignal: options.abortSignal,
    });

    const prompt = this._normalizePrompt(options);
    const toolSpecs = this._toToolSpecs();
    // `runtimeContext` is not part of AgentCallParameters by name; AI SDK
    // populates it via context propagation. For v0 we pass an empty object
    // cast to RUNTIME_CONTEXT, which is correct for the default Context type.
    const runtimeContext = {} as RUNTIME_CONTEXT;

    const { result, done } = runPrompt<
      HarnessAllTools<THarness, TUserTools>,
      RUNTIME_CONTEXT
    >({
      harness: this.settings.harness,
      session,
      prompt,
      instructions: this.settings.instructions,
      tools: this.tools,
      toolSpecs,
      sandboxSession: this.sessions.sandboxHandleFor(sessionId)?.session,
      runtimeContext,
      abortSignal: options.abortSignal,
    });

    return { sessionId, session, result, done };
  }

  /**
   * Resolve the per-call sessionId. Explicit value wins; otherwise the
   * default session is initialized on first call and reused.
   */
  private _resolveSessionId(explicit: string | undefined): string {
    if (explicit != null) return explicit;
    if (this.defaultSessionId == null) {
      this.defaultSessionId = generateId();
    }
    return this.defaultSessionId;
  }

  private _normalizePrompt(options: {
    prompt?: string | unknown[];
    messages?: unknown[];
  }): HarnessV1Prompt {
    if (typeof options.prompt === 'string') {
      return [
        {
          role: 'user',
          content: [{ type: 'text', text: options.prompt }],
        },
      ];
    }
    if (Array.isArray(options.prompt)) {
      return options.prompt as HarnessV1Prompt;
    }
    if (Array.isArray(options.messages)) {
      return options.messages as HarnessV1Prompt;
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
    // Await everything in parallel; the stream is already drained by the time
    // generate() calls this helper (done has resolved).
    const [
      content,
      text,
      reasoning,
      reasoningText,
      files,
      sources,
      toolCalls,
      staticToolCalls,
      dynamicToolCalls,
      toolResults,
      staticToolResults,
      dynamicToolResults,
      finishReason,
      rawFinishReason,
      usage,
      warnings,
      steps,
      finalStep,
      request,
      response,
      responseMessages,
      providerMetadata,
    ] = await Promise.all([
      streamResult.content,
      streamResult.text,
      streamResult.reasoning,
      streamResult.reasoningText,
      streamResult.files,
      streamResult.sources,
      streamResult.toolCalls,
      streamResult.staticToolCalls,
      streamResult.dynamicToolCalls,
      streamResult.toolResults,
      streamResult.staticToolResults,
      streamResult.dynamicToolResults,
      streamResult.finishReason,
      streamResult.rawFinishReason,
      streamResult.usage,
      streamResult.warnings,
      streamResult.steps,
      streamResult.finalStep,
      streamResult.request,
      streamResult.response,
      streamResult.responseMessages,
      streamResult.providerMetadata,
    ]);

    return {
      content,
      text,
      reasoning,
      reasoningText,
      files,
      sources,
      toolCalls,
      staticToolCalls,
      dynamicToolCalls,
      toolResults,
      staticToolResults,
      dynamicToolResults,
      finishReason,
      rawFinishReason,
      usage,
      totalUsage: usage,
      warnings,
      steps,
      finalStep,
      request,
      response,
      responseMessages,
      providerMetadata,
      output: undefined as never,
    };
  }
}
