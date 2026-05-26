import type {
  HarnessV1Prompt,
  HarnessV1ResumeState,
  HarnessV1ToolSpec,
} from '../v1';
import { asSchema, type Context, type ToolSet } from '@ai-sdk/provider-utils';
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

/**
 * AI SDK `Agent` implementation that drives a third-party agent runtime
 * through a `HarnessV1` adapter (Claude Code, Codex, …).
 *
 * Behaviour summary:
 *  - **Sticky session.** The first `generate()` / `stream()` call lazily
 *    starts the harness session; subsequent calls reuse it for multi-turn
 *    conversation. Call `close()` (or `detach()`) to release.
 *  - **Pull-based result.** Both `generate()` and `stream()` surface the
 *    standard AI SDK shapes (`GenerateTextResult`, `StreamTextResult`).
 *    `stream()` returns immediately with promise-based accessors; iterate
 *    `result.fullStream` for live events.
 *  - **Host tool execution.** User tools passed in `settings.tools` are
 *    executed on the host whenever the underlying runtime calls them; the
 *    result is fed back to the harness via `submitToolResult`. Adapter
 *    builtin tools (e.g. Claude Code's `Bash`) pass through untouched.
 *  - **Sandbox propagation.** `settings.sandbox` is a sandbox provider. On
 *    session start, the agent calls `provider.create()` and passes the
 *    resulting handle into `doStart`. The handle's `session` (a tool-safe
 *    `Experimental_Sandbox` view) is also handed to user-tool `execute()`
 *    calls via `experimental_sandbox`.
 */
export class HarnessAgent<
  TOOLS extends ToolSet = {},
  RUNTIME_CONTEXT extends Context = Context,
> implements Agent<never, TOOLS, RUNTIME_CONTEXT, never> {
  readonly version = 'agent-v1' as const;
  readonly id: string | undefined;
  readonly tools: TOOLS;

  private readonly settings: HarnessAgentSettings<TOOLS>;
  private readonly sessions: SessionManager;

  constructor(settings: HarnessAgentSettings<TOOLS>) {
    this.settings = settings;
    this.id = settings.id;
    this.tools = settings.tools ?? ({} as TOOLS);
    this.sessions = new SessionManager({
      harness: settings.harness,
      sessionId: settings.sessionId,
      sandbox: settings.sandbox,
      skills: settings.skills,
      resumeFrom: settings.resumeFrom,
    });
  }

  /** Stable identifier for the underlying harness session. */
  get sessionId(): string {
    return this.sessions.sessionId;
  }

  /** Identifier of the harness backing this agent. */
  get harnessId(): string {
    return this.settings.harness.harnessId;
  }

  async generate(
    options: AgentCallParameters<never, TOOLS, RUNTIME_CONTEXT>,
  ): Promise<GenerateTextResult<TOOLS, RUNTIME_CONTEXT, never>> {
    const { result, done } = await this._startTurn(options);
    await done;
    return await this._toGenerateResult(result);
  }

  async stream(
    options: AgentStreamParameters<never, TOOLS, RUNTIME_CONTEXT>,
  ): Promise<StreamTextResult<TOOLS, RUNTIME_CONTEXT, never>> {
    const { result } = await this._startTurn(options);
    return result;
  }

  /**
   * Tear down the underlying session. Idempotent.
   */
  async close(): Promise<void> {
    await this.sessions.close();
  }

  /**
   * Detach the underlying session and return a payload for later resume.
   * Throws `HarnessCapabilityUnsupportedError` if the harness does not
   * support detach.
   */
  async detach(): Promise<HarnessV1ResumeState> {
    return this.sessions.detach();
  }

  // ─── Internals ──────────────────────────────────────────────────────

  private async _startTurn(
    options:
      | AgentCallParameters<never, TOOLS, RUNTIME_CONTEXT>
      | AgentStreamParameters<never, TOOLS, RUNTIME_CONTEXT>,
  ) {
    const session = await this.sessions.getSession({
      abortSignal: options.abortSignal,
    });

    const prompt = this._normalizePrompt(options);
    const toolSpecs = this._toToolSpecs();
    // `runtimeContext` is not part of AgentCallParameters by name; AI SDK
    // populates it via context propagation. For v0 we pass an empty object
    // cast to RUNTIME_CONTEXT, which is correct for the default Context type.
    const runtimeContext = {} as RUNTIME_CONTEXT;

    return runPrompt<TOOLS, RUNTIME_CONTEXT>({
      harness: this.settings.harness,
      session,
      prompt,
      instructions: this.settings.instructions,
      tools: this.tools,
      toolSpecs,
      sandboxSession: this.sessions.currentSandboxHandle?.session,
      runtimeContext,
      abortSignal: options.abortSignal,
    });
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

  private _toToolSpecs(): HarnessV1ToolSpec[] {
    const specs: HarnessV1ToolSpec[] = [];
    for (const [name, tool] of Object.entries(
      this.tools as Record<string, unknown>,
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
    streamResult: StreamTextResult<TOOLS, RUNTIME_CONTEXT, never>,
  ): Promise<GenerateTextResult<TOOLS, RUNTIME_CONTEXT, never>> {
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
