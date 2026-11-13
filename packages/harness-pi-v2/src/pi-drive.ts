import {
  HarnessCapabilityUnsupportedError,
  type HarnessV2DriveContext,
  type HarnessV2EffectContext,
  type HarnessV2EffectOutput,
  type HarnessV2ToolExecutionOutput,
  type HarnessV2ToolExecutionValue,
  type HarnessV2TurnSettings,
  type HarnessV2Usage,
} from '@ai-sdk/harness';
import type { UserModelMessage } from '@ai-sdk/provider-utils';
import {
  Agent,
  type AgentEvent,
  type AgentToolResult,
  type StreamFn,
} from '@earendil-works/pi-agent-core';
import {
  createAssistantMessageEventStream,
  type Api,
  type AssistantMessage,
  type AssistantMessageEventStream,
  type Message,
  type Model,
  type SimpleStreamOptions,
  type TranscriptContext,
  type UserMessage,
} from '@earendil-works/pi-ai';
import {
  PI_BUILTIN_TOOL_DEFINITIONS,
  createPiBuiltinToolExecutors,
  isPiBuiltinToolName,
  type PiBuiltinAgentTool,
  type PiBuiltinToolExecutors,
  type PiBuiltinToolInput,
  type PiBuiltinToolName,
} from './pi-builtin-tools';
import { createPiHostAgentTool, type PiHostAgentTool } from './pi-host-tools';
import {
  readPiLogState,
  restorePiTranscript,
  type PiLogState,
  type PiModelEffectInput,
  type PiPromptSubmission,
  type PiRecorded,
} from './pi-log-state';
import { DEFAULT_PI_MODEL_ID, type PiModelRuntime } from './pi-model-runtime';
import { createPiStreamPartTranslator } from './pi-stream-parts';
import {
  describeToolFailure,
  toAgentToolResult,
  toBuiltinToolValue,
} from './pi-tool-results';
import {
  addHarnessUsage,
  createUnknownHarnessUsage,
  toHarnessFinishReason,
  toHarnessUsage,
} from './pi-usage';
import { toJSONValue } from './to-json-value';

const MODEL_ATTEMPTS = 3;

/**
 * Waits before retrying a failed model request, resolving early when the
 * signal aborts. The timer keeps the process alive, since the retry is
 * pending work of the drive: a process with nothing else to do must not exit
 * while a turn waits to retry.
 */
function waitBeforeRetry(options: {
  /**
   * Time to wait in milliseconds.
   */
  ms: number;

  /**
   * Ends the wait early.
   */
  abortSignal: AbortSignal;
}): Promise<void> {
  const { ms, abortSignal } = options;
  if (abortSignal.aborted) return Promise.resolve();
  return new Promise(resolve => {
    let settled = false;
    let onAbort = () => {};
    const finish = () => {
      if (settled) return;
      settled = true;
      abortSignal.removeEventListener('abort', onAbort);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    onAbort = () => {
      clearTimeout(timer);
      finish();
    };
    abortSignal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Converts a prompt's user message into a Pi user message. Only text is
 * supported so far.
 */
export function toPiUserMessage(options: {
  /**
   * User message of the prompt submission.
   */
  message: UserModelMessage;

  /**
   * Timestamp of the Pi message.
   */
  timestamp: number;
}): UserMessage {
  const { message, timestamp } = options;
  if (typeof message.content === 'string') {
    return { role: 'user', content: message.content, timestamp };
  }
  return {
    role: 'user',
    content: message.content.map(part => {
      if (part.type !== 'text') {
        throw new HarnessCapabilityUnsupportedError({
          message: `Pi harness: prompts support only text parts, but received a '${part.type}' part.`,
          harnessId: 'pi',
        });
      }
      return { type: 'text', text: part.text };
    }),
    timestamp,
  };
}

/**
 * Returns the reason of a Pi `done` event for a successful model response.
 */
function toDoneReason(options: {
  /**
   * Model response.
   */
  message: AssistantMessage;
}): 'stop' | 'length' | 'toolUse' | 'deferred' {
  const { stopReason } = options.message;
  return stopReason === 'length' ||
    stopReason === 'toolUse' ||
    stopReason === 'deferred'
    ? stopReason
    : 'stop';
}

/**
 * Creates the failed model response Pi places in the transcript when a model
 * call failed or the drive stopped during it.
 */
function createErrorResponse(options: {
  /**
   * Model of the failed call.
   */
  model: Model<Api>;

  /**
   * Error message.
   */
  message: string;

  /**
   * Whether the call was aborted rather than failed.
   */
  aborted: boolean;
}): AssistantMessage {
  return {
    role: 'assistant',
    content: [],
    api: options.model.api,
    provider: options.model.provider,
    model: options.model.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: options.aborted ? 'aborted' : 'error',
    errorMessage: options.message,
    timestamp: Date.now(),
  };
}

/**
 * Returns the message of an unknown thrown value.
 */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * One drive of a Pi session: rebuilds Pi's agent from the log, runs what is
 * left of the current turn, then runs a turn for every pending prompt.
 *
 * The transcript is an exact fold of the log (see `PiModelEffectInput`). Pi
 * re-enters the last recorded model call of an unfinished turn, so the steps
 * of that turn replay against recorded effects and the rest runs for real.
 * Every model call is the effect `model:${ordinal}` with `replay: 'safe'`,
 * and every tool call goes through `executeBuiltinTool()` or
 * `executeHostTool()`. A step ends at Pi's `turn_end` event, a turn when
 * Pi's run for its prompt settled.
 *
 * The drive halts, without finishing the current turn, when the drive must
 * stop, when an effect reports that the drive is yielding, or when a drive
 * context call rejects. A rejection is rethrown from `run()` once Pi
 * settled, because Pi itself turns errors thrown by tools and stream
 * functions into model-visible results.
 */
export class PiDrive {
  /**
   * Host capabilities of this drive.
   */
  private readonly context: HarnessV2DriveContext;

  /**
   * ID of the driven session, forwarded to Pi for provider prompt caching.
   */
  private readonly sessionId: string;

  /**
   * Model access of this drive.
   */
  private readonly runtime: PiModelRuntime;

  /**
   * Pi's agent, created once the log was read.
   */
  private agent: Agent | undefined;

  /**
   * Session state read from the log, refreshed before each new prompt.
   */
  private state: PiLogState = {
    prompts: [],
    pendingPrompts: [],
    modelEffects: [],
    toolOutputs: new Map(),
  };

  /**
   * Number of leading transcript messages already recorded by model effects.
   */
  private recorded = 0;

  /**
   * Ordinal of the next model call.
   */
  private nextModelOrdinal = 0;

  /**
   * Ordinal of the latest model call, i.e. of the step that is running.
   */
  private stepOrdinal = 0;

  /**
   * Ordinal of the current turn's first model call, from which step numbers
   * count.
   */
  private turnFirstOrdinal = 0;

  /**
   * Usage of the current turn's finished steps.
   */
  private turnUsage: HarnessV2Usage = createUnknownHarnessUsage();

  /**
   * Latest model response of the current turn.
   */
  private lastResponse: AssistantMessage | undefined;

  /**
   * Names of the current turn's host tools, which take precedence over
   * built-in tools of the same name.
   */
  private hostToolNames = new Set<string>();

  /**
   * Pi messages of prompts handed to Pi whose delivery no model call
   * recorded yet, by submission ID.
   */
  private readonly handed = new Map<string, Message>();

  /**
   * IDs of every prompt handed to Pi in this drive. A handed prompt stays
   * pending in the log until a model call's start commits, so it must not be
   * handed again in the meantime.
   */
  private readonly given = new Set<string>();

  /**
   * Whether the drive halted and must start no more work.
   */
  private halted = false;

  /**
   * First drive context rejection, rethrown from `run()`.
   */
  private driveError: { error: unknown } | undefined;

  /**
   * Pi's built-in tools operating on the sandbox of this drive, created on
   * the first built-in tool call.
   */
  private builtinToolExecutors: Promise<PiBuiltinToolExecutors> | undefined;

  /**
   * Creates the drive of a session.
   */
  constructor(options: {
    /**
     * ID of the driven session.
     */
    sessionId: string;

    /**
     * Host capabilities of this drive.
     */
    context: HarnessV2DriveContext;

    /**
     * Model access of this drive.
     */
    runtime: PiModelRuntime;
  }) {
    this.sessionId = options.sessionId;
    this.context = options.context;
    this.runtime = options.runtime;
  }

  /**
   * Runs the drive. Resolves when no work is left, or when the drive halted
   * for a stop or a yield; rejects when a drive context call rejected.
   */
  async run(): Promise<void> {
    const { context } = this;
    if (context.stopAbortSignal.aborted) return;

    this.state = await this.readState();
    const { currentTurn } = this.state;
    const resumedSettings =
      currentTurn != null && !currentTurn.ended
        ? currentTurn.prompt.settings
        : undefined;
    const initialSettings =
      resumedSettings ?? this.state.pendingPrompts[0]?.settings;
    this.hostToolNames = new Set(initialSettings?.tools.map(spec => spec.name));
    const restored = restorePiTranscript({
      state: this.state,
      isBuiltinTool: toolName => this.isBuiltinTool(toolName),
    });
    this.recorded = restored.recorded;
    this.nextModelOrdinal = restored.nextModelOrdinal;

    const agent = new Agent({
      initialState: {
        systemPrompt: initialSettings?.instructions ?? '',
        model: this.resolveModel({ settings: initialSettings }),
        thinkingLevel: 'off',
        tools: this.createAgentTools({ settings: initialSettings }),
        messages: restored.messages,
      },
      streamFn: this.stream,
      sessionId: this.sessionId,
      toolExecution: 'sequential',
      followUpMode: 'one-at-a-time',
    });
    this.agent = agent;
    const unsubscribe = agent.subscribe(event => this.onAgentEvent(event));
    const onStop = () => this.halt();
    context.stopAbortSignal.addEventListener('abort', onStop);

    try {
      if (restored.resume && currentTurn != null) {
        this.startTurn({ firstOrdinal: currentTurn.firstModelOrdinal });
        this.turnUsage = this.state.modelEffects
          .filter(
            record =>
              record.ordinal >= currentTurn.firstModelOrdinal &&
              record.ordinal < restored.nextModelOrdinal,
          )
          .reduce(
            (usage, record) =>
              record.output?.type === 'result'
                ? addHarnessUsage({
                    left: usage,
                    right: toHarnessUsage({ usage: record.output.value.usage }),
                  })
                : usage,
            createUnknownHarnessUsage(),
          );
        await agent.continue();
        if (!(await this.finishRun())) return;
      }

      for (;;) {
        if (this.halted || context.yieldAbortSignal.aborted) return;
        this.state = await this.readState();
        const prompt = this.state.pendingPrompts.find(
          pending => !this.given.has(pending.id),
        );
        if (prompt == null) return;
        await this.runPrompt({ prompt });
        if (!(await this.finishRun())) return;
      }
    } finally {
      context.stopAbortSignal.removeEventListener('abort', onStop);
      unsubscribe();
    }
  }

  /**
   * Reads the session state from the log.
   */
  private async readState(): Promise<PiLogState> {
    const { events } = await this.context.log.read();
    return readPiLogState({ events });
  }

  /**
   * Hands a prompt to Pi as a new turn, with the model and tools of the
   * prompt's settings, and resolves once Pi's run for it settled.
   */
  private async runPrompt(options: {
    /**
     * Prompt that starts the turn.
     */
    prompt: PiPromptSubmission;
  }): Promise<void> {
    const agent = this.agent!;
    const { prompt } = options;
    const message = toPiUserMessage({
      message: prompt.message,
      timestamp: Date.now(),
    });
    this.hostToolNames = new Set(prompt.settings.tools.map(spec => spec.name));
    agent.state.model = this.resolveModel({ settings: prompt.settings });
    agent.state.tools = this.createAgentTools({ settings: prompt.settings });
    this.given.add(prompt.id);
    this.handed.set(prompt.id, message);
    this.startTurn({ firstOrdinal: this.nextModelOrdinal });
    await agent.prompt(message);
  }

  /**
   * Resets the step and usage tracking for a turn whose first model call has
   * the given ordinal.
   */
  private startTurn(options: {
    /**
     * Ordinal of the turn's first model call.
     */
    firstOrdinal: number;
  }): void {
    this.turnFirstOrdinal = options.firstOrdinal;
    this.turnUsage = createUnknownHarnessUsage();
    this.lastResponse = undefined;
  }

  /**
   * Finishes the current turn after Pi's run settled. Rethrows a drive
   * context rejection, and returns `false` without finishing the turn when
   * the drive halted.
   */
  private async finishRun(): Promise<boolean> {
    if (this.driveError != null) throw this.driveError.error;
    if (this.halted) return false;
    await this.context.finishTurn({
      finishReason:
        this.lastResponse == null
          ? { unified: 'other', raw: undefined }
          : toHarnessFinishReason({ message: this.lastResponse }),
      totalUsage: this.turnUsage,
    });
    return true;
  }

  /**
   * Stops the drive: Pi's run is aborted and no further work starts. The
   * first error passed is rethrown from `run()`.
   */
  private halt(options: { error?: unknown } = {}): void {
    if (options.error !== undefined && this.driveError == null) {
      this.driveError = { error: options.error };
    }
    this.halted = true;
    this.agent?.abort();
  }

  /**
   * Awaits a drive context call, halting the drive when it rejects.
   */
  private async guard<T>(promise: Promise<T>): Promise<T> {
    try {
      return await promise;
    } catch (error) {
      this.halt({ error });
      throw error;
    }
  }

  /**
   * Throws when the drive halted, so Pi starts no further tool call.
   */
  private throwIfHalted(): void {
    if (this.halted) {
      throw new Error('The drive stopped before this call ran.');
    }
  }

  /**
   * Resolves the model of a turn, the default model when its settings
   * request none.
   */
  private resolveModel(options: {
    /**
     * Settings of the turn, if there is one.
     */
    settings?: HarnessV2TurnSettings;
  }): Model<Api> {
    return this.runtime.resolveModel({
      modelId: options.settings?.model ?? DEFAULT_PI_MODEL_ID,
    });
  }

  /**
   * Returns whether a tool name refers to one of Pi's built-in tools in the
   * current turn, i.e. one that no host tool of the turn overrides.
   */
  private isBuiltinTool(toolName: string): boolean {
    return isPiBuiltinToolName(toolName) && !this.hostToolNames.has(toolName);
  }

  /**
   * Creates Pi's tools for a turn: the built-in tools, then the turn's host
   * tools. A host tool replaces a built-in tool of the same name.
   */
  private createAgentTools(options: {
    /**
     * Settings of the turn, if there is one.
     */
    settings?: HarnessV2TurnSettings;
  }): Array<PiBuiltinAgentTool | PiHostAgentTool> {
    const specs = options.settings?.tools ?? [];
    const hostNames = new Set(specs.map(spec => spec.name));
    const builtinTools = Object.keys(PI_BUILTIN_TOOL_DEFINITIONS)
      .filter(isPiBuiltinToolName)
      .filter(name => !hostNames.has(name))
      .map(name => this.createBuiltinAgentTool({ toolName: name }));
    const hostTools = specs.map(spec =>
      createPiHostAgentTool({
        spec,
        execute: async ({ toolCallId, input }) => {
          this.throwIfHalted();
          const output = await this.guard(
            this.context.executeHostTool({
              toolCallId,
              toolName: spec.name,
              input: toJSONValue({ value: input }),
            }),
          );
          return this.toToolResult({
            output,
            toolName: spec.name,
            builtin: false,
          });
        },
      }),
    );
    return [...builtinTools, ...hostTools];
  }

  /**
   * Creates the Pi tool of one built-in tool, with Pi's definition, whose
   * calls run through `executeBuiltinTool()`.
   */
  private createBuiltinAgentTool<NAME extends PiBuiltinToolName>(options: {
    /**
     * Name of the built-in tool.
     */
    toolName: NAME;
  }): PiBuiltinAgentTool<NAME> {
    const { toolName } = options;
    const definition = PI_BUILTIN_TOOL_DEFINITIONS[toolName];
    return {
      name: definition.name,
      label: definition.label,
      description: definition.description,
      parameters: definition.parameters,
      prepareArguments: definition.prepareArguments,
      execute: async (toolCallId, input) => {
        this.throwIfHalted();
        const output = await this.guard(
          this.context.executeBuiltinTool({
            toolCallId,
            toolName,
            input: toJSONValue({ value: input }),
            execute: ({ abortSignal }) =>
              this.executeBuiltinTool({
                toolName,
                toolCallId,
                input,
                abortSignal,
              }),
          }),
        );
        return this.toToolResult({ output, toolName, builtin: true });
      },
    };
  }

  /**
   * Runs a built-in tool for a new attempt of its effect, yielding each
   * partial result as it arrives and the final result last.
   *
   * @yields The tool's partial results, followed by its final result.
   */
  private async *executeBuiltinTool<NAME extends PiBuiltinToolName>(options: {
    /**
     * Name of the built-in tool.
     */
    toolName: NAME;

    /**
     * ID of the tool call.
     */
    toolCallId: string;

    /**
     * Tool input given by the model, validated by Pi.
     */
    input: PiBuiltinToolInput<NAME>;

    /**
     * Aborts the tool when its attempt is cancelled.
     */
    abortSignal: AbortSignal;
  }): AsyncIterable<HarnessV2ToolExecutionValue> {
    const executors = await this.getBuiltinToolExecutors();
    const partials: HarnessV2ToolExecutionValue[] = [];
    let notify: (() => void) | undefined;
    let settled = false;
    let outcome:
      | { type: 'result'; result: AgentToolResult<unknown> }
      | { type: 'error'; error: unknown }
      | undefined;

    void executors[options.toolName]
      .execute(
        options.toolCallId,
        options.input,
        options.abortSignal,
        partial => {
          partials.push(toBuiltinToolValue({ result: partial }));
          notify?.();
        },
      )
      .then(
        result => {
          outcome = { type: 'result', result };
        },
        error => {
          outcome = { type: 'error', error };
        },
      )
      .finally(() => {
        settled = true;
        notify?.();
      });

    for (;;) {
      while (partials.length > 0) yield partials.shift()!;
      if (settled) break;
      await new Promise<void>(resolve => {
        notify = resolve;
      });
      notify = undefined;
    }
    if (outcome?.type !== 'result') {
      throw outcome?.type === 'error'
        ? outcome.error
        : new Error(`${options.toolName} returned no result`);
    }
    yield toBuiltinToolValue({ result: outcome.result });
  }

  /**
   * Resolves the drive's sandbox and the sandbox user's home directory, and
   * creates Pi's built-in tools on them, once per drive.
   */
  private getBuiltinToolExecutors(): Promise<PiBuiltinToolExecutors> {
    this.builtinToolExecutors ??= (async () => {
      const { session, workDir } = await this.context.sandbox();
      const result = await session.run({ command: 'printf %s "$HOME"' });
      const home = result.stdout.trim();
      return createPiBuiltinToolExecutors({
        sandbox: {
          session,
          workDir,
          home: result.exitCode === 0 && home.length > 0 ? home : workDir,
        },
      });
    })();
    return this.builtinToolExecutors;
  }

  /**
   * Converts a tool call outcome into the result Pi places in the
   * transcript, or throws so Pi places an error result.
   *
   * An interrupted call halts the drive when the drive is stopping or
   * yielding. A suspended call is answered with an error result.
   */
  private toToolResult(options: {
    /**
     * Outcome of the tool call.
     */
    output: HarnessV2ToolExecutionOutput;

    /**
     * Name of the called tool.
     */
    toolName: string;

    /**
     * Whether the call was one of the harness's built-in tools.
     */
    builtin: boolean;
  }): AgentToolResult<unknown> {
    const { output, toolName, builtin } = options;
    switch (output.type) {
      case 'result':
        return toAgentToolResult({ value: output.value, builtin });
      case 'interrupted':
        if (
          this.context.stopAbortSignal.aborted ||
          this.context.yieldAbortSignal.aborted
        ) {
          this.halt();
        }
        throw new Error(describeToolFailure({ output, toolName }));
      case 'error':
      case 'denied':
        throw new Error(describeToolFailure({ output, toolName }));
      case 'suspended':
        /*
         * TODO: A suspended call waits for a tool approval or a client-side
         * tool result. Once the harness supports those, end the drive's turn
         * work here so the call resumes in a later drive, instead of
         * answering it with an error result.
         */
        return {
          content: [
            { type: 'text', text: describeToolFailure({ output, toolName }) },
          ],
          details: undefined,
          isError: true,
        };
    }
  }

  /**
   * Finishes a step at Pi's `turn_end` event: one model response plus the
   * tool calls resulting from it. Step numbers count from the turn's first
   * model call. Nothing is recorded once the drive halted.
   */
  private async onAgentEvent(event: AgentEvent): Promise<void> {
    if (event.type !== 'turn_end' || this.halted) return;
    const message = event.message;
    if (message.role !== 'assistant') return;
    this.lastResponse = message;
    const usage = toHarnessUsage({ usage: message.usage });
    this.turnUsage = addHarnessUsage({ left: this.turnUsage, right: usage });
    try {
      await this.context.finishStep({
        stepNumber: this.stepOrdinal - this.turnFirstOrdinal,
        finishReason: toHarnessFinishReason({ message }),
        usage,
      });
    } catch (error) {
      this.halt({ error });
    }
  }

  /**
   * Returns the IDs of the handed prompts that a model call delivers, i.e.
   * whose Pi messages are among the messages it appends.
   */
  private claimSubmissions(options: {
    /**
     * Messages the model call appends to the transcript.
     */
    appended: Message[];
  }): string[] {
    const ids: string[] = [];
    for (const message of options.appended) {
      if (message.role !== 'user') continue;
      for (const [id, handed] of this.handed) {
        if (
          handed === message ||
          JSON.stringify(handed) === JSON.stringify(message)
        ) {
          this.handed.delete(id);
          ids.push(id);
          break;
        }
      }
    }
    return ids;
  }

  /**
   * Pi's stream function: runs one model call as a recorded effect.
   *
   * The effect records the messages appended since the previous model call.
   * Its output is pushed to Pi as the response's end only once it is
   * recorded, so Pi never sees a response finish that the log does not have.
   * A replayed call is checked against the recorded request size; a
   * different size means the transcript diverged, which fails the drive.
   */
  private readonly stream: StreamFn = (model, context, options) => {
    const out = createAssistantMessageEventStream();
    const ordinal = this.nextModelOrdinal++;
    this.stepOrdinal = ordinal;
    const key = `model:${ordinal}`;
    const { messages } = context;

    if (this.halted) {
      out.push({
        type: 'error',
        reason: 'aborted',
        error: createErrorResponse({
          model,
          message: 'The drive stopped.',
          aborted: true,
        }),
      });
      return out;
    }

    const appended = messages.slice(this.recorded);
    const recordedEffect = this.state.modelEffects.find(
      record => record.ordinal === ordinal,
    );
    const deliveredSubmissionIds =
      recordedEffect != null && recordedEffect.deliveredSubmissionIds.length > 0
        ? [...recordedEffect.deliveredSubmissionIds]
        : this.claimSubmissions({ appended });
    const replayed = recordedEffect?.output?.type === 'result';
    const input = {
      appended,
      contextLength: messages.length,
      model: `${model.provider}/${model.id}`,
    } satisfies PiModelEffectInput;

    void (async () => {
      let output: HarnessV2EffectOutput<PiRecorded<AssistantMessage>>;
      try {
        output = await this.context.effect({
          key,
          name: 'model',
          replay: 'safe',
          input: toJSONValue({ value: input }),
          deliveredSubmissionIds,
          fn: effectContext =>
            this.callModel({ model, context, options, effectContext, out }),
        });
      } catch (error) {
        this.halt({ error });
        out.push({
          type: 'error',
          reason: 'aborted',
          error: createErrorResponse({
            model,
            message: getErrorMessage(error),
            aborted: true,
          }),
        });
        return;
      }
      if (output.type === 'result') {
        const message: AssistantMessage = output.value;
        if (
          replayed &&
          recordedEffect.input.contextLength !== messages.length
        ) {
          const error = new Error(
            `Pi harness: the model call ${key} replayed with a different context than it recorded.`,
          );
          this.halt({ error });
          out.push({
            type: 'error',
            reason: 'aborted',
            error: createErrorResponse({
              model,
              message: error.message,
              aborted: true,
            }),
          });
          return;
        }
        this.recorded = messages.length + 1;
        out.push({
          type: 'done',
          reason: toDoneReason({ message }),
          message,
        });
        return;
      }
      if (output.type === 'error') {
        out.push({
          type: 'error',
          reason: 'error',
          error: createErrorResponse({
            model,
            message: output.error.message,
            aborted: false,
          }),
        });
        return;
      }
      this.halt();
      out.push({
        type: 'error',
        reason: 'aborted',
        error: createErrorResponse({
          model,
          message: 'The drive stopped before the model call finished.',
          aborted: true,
        }),
      });
    })();
    return out;
  };

  /**
   * Runs a new attempt of a model call effect: up to three provider
   * requests, retrying failed ones after a growing delay.
   *
   * Each request's events are emitted as stream parts, with a `reset-step`
   * part before a retry's parts. Only the first request streams its events
   * to Pi, so a retry does not open a second partial response in Pi; the
   * terminal event is never forwarded (see `stream`). When every request
   * failed, an `error` part is emitted and the attempt fails with the last
   * error.
   */
  private async callModel(options: {
    /**
     * Model to call.
     */
    model: Model<Api>;

    /**
     * Request context passed by Pi.
     */
    context: TranscriptContext;

    /**
     * Request options passed by Pi.
     */
    options?: SimpleStreamOptions;

    /**
     * Context of the effect attempt.
     */
    effectContext: HarnessV2EffectContext;

    /**
     * Stream returned to Pi for this model call.
     */
    out: AssistantMessageEventStream;
  }): Promise<PiRecorded<AssistantMessage>> {
    const { model, context, effectContext, out } = options;
    const signal =
      options.options?.signal == null
        ? effectContext.abortSignal
        : AbortSignal.any([options.options.signal, effectContext.abortSignal]);
    let errorMessage = 'The model call failed.';

    for (let attempt = 1; attempt <= MODEL_ATTEMPTS; attempt++) {
      if (attempt > 1) effectContext.emit({ type: 'reset-step' });
      const translator = createPiStreamPartTranslator({
        isBuiltinTool: toolName => this.isBuiltinTool(toolName),
      });
      const response = await this.runtime.streamFn(model, context, {
        ...options.options,
        signal,
      });
      for await (const event of response) {
        for (const part of translator.translate(event)) {
          effectContext.emit(part);
        }
        if (attempt === 1 && event.type !== 'done' && event.type !== 'error') {
          out.push(event);
        }
      }
      const message = await response.result();
      if (signal.aborted || message.stopReason === 'aborted') {
        throw new Error(message.errorMessage ?? 'The model call was aborted.');
      }
      if (message.stopReason !== 'error') {
        return message;
      }
      errorMessage = message.errorMessage ?? errorMessage;
      if (attempt < MODEL_ATTEMPTS)
        await waitBeforeRetry({ ms: 500 * attempt, abortSignal: signal });
    }

    effectContext.emit({ type: 'error', error: { message: errorMessage } });
    throw new Error(errorMessage);
  }
}
