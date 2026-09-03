import type {
  LanguageModelV4CallOptions,
  LanguageModelV4Prompt,
  LanguageModelV4StreamPart,
  LanguageModelV4ToolResultPart,
  SharedV4ProviderOptions,
} from '@ai-sdk/provider';
import {
  getErrorMessage,
  isAbortError,
  withUserAgentSuffix,
  type Context,
  type HasRequiredKey,
  type InferToolContext,
  type InferToolInput,
  type InferToolOutput,
  type InferToolSetContext,
} from '@ai-sdk/provider-utils';
import {
  Output,
  experimental_filterActiveTools as filterActiveTools,
  type FinishReason,
  type LanguageModelResponseMetadata,
  type LanguageModelUsage,
  type ModelMessage,
  type StepResult,
  type StopCondition,
  type GenerateTextOnStepEndCallback,
  type ActiveTools,
  type ToolCallRepairFunction,
  type ToolChoice,
  type ToolSet,
  type InferUITools,
  type UIMessage,
  type LanguageModel,
  type Prompt,
  type TelemetryOptions as CoreTelemetryOptions,
  type Instructions,
  type Experimental_SandboxSession as SandboxSession,
  InvalidToolApprovalSignatureError,
} from 'ai';
import {
  createRestrictedTelemetryDispatcher,
  collectToolApprovals,
  convertToLanguageModelPrompt,
  mergeAbortSignals,
  mergeCallbacks,
  signToolApproval,
  standardizePrompt,
  validateApprovedToolApprovals,
  verifyToolApprovalSignature,
} from 'ai/internal';
import { createLanguageModelToolResultOutput } from './create-language-model-tool-result-output.js';
import type {
  ModelCallStreamPart,
  ModelStopCondition,
} from './do-stream-step.js';
import { resolveToolContext } from './resolve-tool-context.js';
import { streamTextIterator } from './stream-text-iterator.js';

// Re-export for consumers
export type { CompatibleLanguageModel } from './types.js';

/**
 * Callback function to be called after each step completes.
 * Alias for the AI SDK's GenerateTextOnStepEndCallback, using
 * WorkflowAgent-consistent naming.
 */
export type WorkflowAgentOnStepEndCallback<
  TTools extends ToolSet = ToolSet,
  TRuntimeContext extends Context = Context,
> = GenerateTextOnStepEndCallback<TTools, TRuntimeContext>;

/**
 * Callback function to be called after each step completes.
 * Deprecated alias for `WorkflowAgentOnStepEndCallback`.
 *
 * @deprecated Use `WorkflowAgentOnStepEndCallback` instead.
 */
export type WorkflowAgentOnStepFinishCallback<
  TTools extends ToolSet = ToolSet,
  TRuntimeContext extends Context = Context,
> = WorkflowAgentOnStepEndCallback<TTools, TRuntimeContext>;

/**
 * Infer the type of the tools of a workflow agent.
 */
export type InferWorkflowAgentTools<WORKFLOW_AGENT> =
  WORKFLOW_AGENT extends WorkflowAgent<infer TOOLS, any, any, any>
    ? TOOLS
    : never;

/**
 * Infer the UI message type of a workflow agent.
 */
export type InferWorkflowAgentUIMessage<
  WORKFLOW_AGENT,
  MESSAGE_METADATA = unknown,
> = UIMessage<
  MESSAGE_METADATA,
  never,
  InferUITools<InferWorkflowAgentTools<WORKFLOW_AGENT>>
>;

/**
 * Re-export the Output helper for structured output specifications.
 * Use `Output.object({ schema })` for structured output or `Output.text()` for text output.
 */
export { Output };

/**
 * Output specification interface for structured outputs.
 * Use `Output.object({ schema })` or `Output.text()` to create an output specification.
 */
export interface OutputSpecification<OUTPUT, PARTIAL> {
  readonly name: string;
  responseFormat: PromiseLike<LanguageModelV4CallOptions['responseFormat']>;
  parsePartialOutput(options: {
    text: string;
  }): Promise<{ partial: PARTIAL } | undefined>;
  parseCompleteOutput(
    options: { text: string },
    context: {
      response: LanguageModelResponseMetadata;
      usage: LanguageModelUsage;
      finishReason: FinishReason;
    },
  ): Promise<OUTPUT>;
}

type DefaultWorkflowAgentOutput<OUTPUT> = 0 extends 1 & OUTPUT ? never : OUTPUT;

/**
 * Provider-specific options type. This is equivalent to SharedV4ProviderOptions from @ai-sdk/provider.
 */
export type ProviderOptions = SharedV4ProviderOptions;

/**
 * Workflow-safe reference to the environment variable that contains the
 * secret used to sign and verify tool approvals.
 */
export type WorkflowToolApprovalSecret = {
  /**
   * Name of an environment variable containing a high-entropy secret.
   */
  environmentVariable: string;
};

type WorkflowAgentToolsContextParameter<TTools extends ToolSet> =
  HasRequiredKey<InferToolSetContext<TTools>> extends true
    ? { toolsContext: InferToolSetContext<TTools> }
    : { toolsContext?: never };
export type TelemetryOptions<
  TRuntimeContext extends Context = Context,
  TTools extends ToolSet = ToolSet,
> = CoreTelemetryOptions<TRuntimeContext, TTools>;

/**
 * A transformation that is applied to the stream.
 */
export type StreamTextTransform<TTools extends ToolSet> = (options: {
  tools: TTools;
  stopStream: () => void;
}) => TransformStream<LanguageModelV4StreamPart, LanguageModelV4StreamPart>;

/**
 * Function to repair a tool call that failed to parse.
 * Re-exported from the AI SDK core.
 */
export type { ToolCallRepairFunction } from 'ai';

/**
 * Custom download function for URLs.
 * The function receives an array of URLs with information about whether
 * the model supports them directly.
 */
export type DownloadFunction = (
  options: {
    url: URL;
    isUrlSupportedByModel: boolean;
  }[],
) => PromiseLike<
  ({ data: Uint8Array; mediaType: string | undefined } | null)[]
>;

/**
 * Generation settings that can be passed to the model.
 * These map directly to LanguageModelV4CallOptions.
 */
export interface GenerationSettings {
  /**
   * Maximum number of tokens to generate.
   */
  maxOutputTokens?: number;

  /**
   * Temperature setting. The range depends on the provider and model.
   * It is recommended to set either `temperature` or `topP`, but not both.
   */
  temperature?: number;

  /**
   * Nucleus sampling. This is a number between 0 and 1.
   * E.g. 0.1 would mean that only tokens with the top 10% probability mass are considered.
   * It is recommended to set either `temperature` or `topP`, but not both.
   */
  topP?: number;

  /**
   * Only sample from the top K options for each subsequent token.
   * Used to remove "long tail" low probability responses.
   * Recommended for advanced use cases only. You usually only need to use temperature.
   */
  topK?: number;

  /**
   * Presence penalty setting. It affects the likelihood of the model to
   * repeat information that is already in the prompt.
   * The presence penalty is a number between -1 (increase repetition)
   * and 1 (maximum penalty, decrease repetition). 0 means no penalty.
   */
  presencePenalty?: number;

  /**
   * Frequency penalty setting. It affects the likelihood of the model
   * to repeatedly use the same words or phrases.
   * The frequency penalty is a number between -1 (increase repetition)
   * and 1 (maximum penalty, decrease repetition). 0 means no penalty.
   */
  frequencyPenalty?: number;

  /**
   * Stop sequences. If set, the model will stop generating text when one of the stop sequences is generated.
   * Providers may have limits on the number of stop sequences.
   */
  stopSequences?: string[];

  /**
   * The seed (integer) to use for random sampling. If set and supported
   * by the model, calls will generate deterministic results.
   */
  seed?: number;

  /**
   * Maximum number of retries for retryable model call failures. Set to 0 to disable retries.
   * @default 2
   */
  maxRetries?: number;

  /**
   * Abort signal for cancelling the operation.
   */
  abortSignal?: AbortSignal;

  /**
   * Additional HTTP headers to be sent with the request.
   * Only applicable for HTTP-based providers.
   */
  headers?: Record<string, string | undefined>;

  /**
   * Reasoning effort level for the model. Controls how much reasoning
   * the model performs before generating a response.
   */
  reasoning?: LanguageModelV4CallOptions['reasoning'];

  /**
   * Additional provider-specific options. They are passed through
   * to the provider from the AI SDK and enable provider-specific
   * functionality that can be fully encapsulated in the provider.
   */
  providerOptions?: ProviderOptions;
}

/**
 * Information passed to the prepareStep callback.
 */
export interface PrepareStepInfo<
  TTools extends ToolSet = ToolSet,
  TRuntimeContext extends Context = Context,
> {
  /**
   * The current model configuration (string or function).
   * The function should return a LanguageModelV4 instance.
   */
  model: LanguageModel;

  /**
   * The initial instructions passed to the stream.
   */
  initialInstructions: Instructions | undefined;

  /**
   * The initial messages passed to the stream.
   */
  initialMessages: Array<ModelMessage>;

  /**
   * The current step number (0-indexed).
   */
  stepNumber: number;

  /**
   * All previous steps with their results.
   */
  steps: StepResult<TTools, TRuntimeContext>[];

  /**
   * The messages that will be sent to the model.
   * This is the LanguageModelV4Prompt format used internally.
   */
  messages: LanguageModelV4Prompt;

  /**
   * The runtime context that flows through the agent loop.
   * Treat the value as immutable; return a new `runtimeContext` from
   * `prepareStep` to update it for the current and subsequent steps.
   */
  runtimeContext: TRuntimeContext;

  /**
   * Per-tool context, keyed by tool name. Each tool receives only its own
   * validated entry as `context` during execution.
   * Treat the value as immutable; return a new `toolsContext` from
   * `prepareStep` to update it for the current and subsequent steps.
   */
  toolsContext: InferToolSetContext<TTools>;

  /**
   * The sandbox environment that the step is operating in.
   */
  experimental_sandbox?: SandboxSession;
}

/**
 * Return type from the prepareStep callback.
 * All properties are optional - only return the ones you want to override.
 */
export interface PrepareStepResult<
  TTools extends ToolSet = ToolSet,
  TRuntimeContext extends Context = Context,
> extends Partial<GenerationSettings> {
  /**
   * Override the model for this step.
   */
  model?: LanguageModel;

  /**
   * Override the system message for this step.
   */
  system?: string;

  /**
   * Override the messages for this step.
   * Use this for context management or message injection.
   */
  messages?: LanguageModelV4Prompt;

  /**
   * Override the tool choice for this step.
   */
  toolChoice?: ToolChoice<ToolSet>;

  /**
   * Override the active tools for this step.
   * Limits the tools that are available for the model to call.
   */
  activeTools?: ActiveTools<NoInfer<TTools>>;

  /**
   * Updated runtime context for the current and subsequent steps.
   * Returning a value replaces the agent's runtime context.
   */
  runtimeContext?: TRuntimeContext;

  /**
   * Updated per-tool context for the current and subsequent steps.
   * Returning a value replaces the agent's tools context.
   */
  toolsContext?: InferToolSetContext<TTools>;

  /**
   * Override the sandbox environment for this step.
   */
  experimental_sandbox?: SandboxSession;
}

/**
 * Callback function called before each step in the agent loop.
 * Use this to modify settings, manage context, or implement dynamic behavior.
 */
export type PrepareStepCallback<
  TTools extends ToolSet = ToolSet,
  TRuntimeContext extends Context = Context,
> = (
  info: PrepareStepInfo<TTools, TRuntimeContext>,
) =>
  | PrepareStepResult<TTools, TRuntimeContext>
  | undefined
  | Promise<PrepareStepResult<TTools, TRuntimeContext> | undefined>;

/**
 * Options passed to the prepareCall callback.
 */
export interface PrepareCallOptions<
  TTools extends ToolSet = ToolSet,
  TRuntimeContext extends Context = Context,
> extends Partial<GenerationSettings> {
  model: LanguageModel;
  tools: TTools;
  instructions?: Instructions;
  toolChoice?: ToolChoice<TTools>;
  stopWhen?:
    | StopCondition<NoInfer<TTools>, TRuntimeContext>
    | Array<StopCondition<NoInfer<TTools>, TRuntimeContext>>;
  activeTools?: ActiveTools<NoInfer<TTools>>;
  experimental_download?: DownloadFunction;
  telemetry?: TelemetryOptions<TRuntimeContext, TTools>;
  /**
   * Runtime context that flows through the agent loop.
   * Treat as immutable; return a new `runtimeContext` to update it for the call.
   */
  runtimeContext?: TRuntimeContext;
  /**
   * Per-tool context, keyed by tool name.
   */
  toolsContext?: InferToolSetContext<TTools>;
  messages: ModelMessage[];
}

/**
 * Result of the prepareCall callback. All fields are optional —
 * only returned fields override the defaults.
 * Note: `tools` cannot be overridden via prepareCall because they are
 * bound at construction time for type safety.
 */
export type PrepareCallResult<
  TTools extends ToolSet = ToolSet,
  TRuntimeContext extends Context = Context,
> = Partial<Omit<PrepareCallOptions<TTools, TRuntimeContext>, 'tools'>>;

/**
 * Callback called once before the agent loop starts to transform call parameters.
 */
export type PrepareCallCallback<
  TTools extends ToolSet = ToolSet,
  TRuntimeContext extends Context = Context,
> = (
  options: PrepareCallOptions<TTools, TRuntimeContext>,
) =>
  | PrepareCallResult<TTools, TRuntimeContext>
  | Promise<PrepareCallResult<TTools, TRuntimeContext>>;

/**
 * Configuration options for creating a {@link WorkflowAgent} instance.
 */
export type WorkflowAgentOptions<
  TTools extends ToolSet = ToolSet,
  TRuntimeContext extends Context = Context,
  OUTPUT = any,
  PARTIAL_OUTPUT = any,
> = GenerationSettings &
  WorkflowAgentToolsContextParameter<TTools> & {
    /**
     * The id of the agent.
     */
    id?: string;

    /**
     * The model provider to use for the agent.
     *
     * This should be a string compatible with the Vercel AI Gateway (e.g., 'anthropic/claude-opus'),
     * or a LanguageModelV4 instance from a provider.
     */
    model: LanguageModel;

    /**
     * A set of tools available to the agent.
     * Tools can be implemented as workflow steps for automatic retries and persistence,
     * or as regular workflow-level logic using core library features like sleep() and Hooks.
     */
    tools?: TTools;

    /**
     * Agent instructions. Can be a string, a SystemModelMessage, or an array of SystemModelMessages.
     * Supports provider-specific options (e.g., caching) when using the SystemModelMessage form.
     */
    instructions?: Instructions;

    /**
     * Optional system prompt to guide the agent's behavior.
     * @deprecated Use `instructions` instead.
     */
    system?: string;

    /**
     * The tool choice strategy. Default: 'auto'.
     */
    toolChoice?: ToolChoice<TTools>;

    /**
     * Optional telemetry configuration.
     */
    telemetry?: TelemetryOptions<TRuntimeContext, TTools>;

    /**
     * Default runtime context for every stream call on this agent.
     *
     * The runtime context flows through `prepareStep`, lifecycle callbacks,
     * and step results.
     * Treat as immutable; return a new `runtimeContext` from `prepareStep`
     * to update it between steps.
     *
     * In workflow context, keep values serializable so they can cross workflow
     * and step boundaries.
     *
     * Per-stream `runtimeContext` values passed to `stream()` override this default.
     */
    runtimeContext?: TRuntimeContext;

    /**
     * Default stop condition for the agent loop. When the condition is an array,
     * any of the conditions can be met to stop the generation.
     *
     * Per-stream `stopWhen` values passed to `stream()` override this default.
     */
    stopWhen?:
      | StopCondition<NoInfer<TTools>, TRuntimeContext>
      | Array<StopCondition<NoInfer<TTools>, TRuntimeContext>>;

    /**
     * Default set of active tools that limits which tools the model can call,
     * without changing the tool call and result types in the result.
     *
     * Per-stream `activeTools` values passed to `stream()` override this default.
     */
    activeTools?: ActiveTools<NoInfer<TTools>>;

    /**
     * Default output specification for structured outputs.
     * Use `Output.object({ schema })` for structured output or `Output.text()` for text output.
     *
     * Per-stream `output` values passed to `stream()` override this default.
     */
    output?: OutputSpecification<OUTPUT, PARTIAL_OUTPUT>;

    /**
     * Default function that attempts to repair a tool call that failed to parse.
     *
     * Per-stream `repairToolCall` values passed to `stream()` override this default.
     */
    repairToolCall?: ToolCallRepairFunction<TTools>;

    /**
     * Default function that attempts to repair a tool call that failed to parse.
     *
     * Per-stream `repairToolCall` values passed to `stream()` override this default.
     *
     * @deprecated Use `repairToolCall` instead.
     */
    experimental_repairToolCall?: ToolCallRepairFunction<TTools>;

    /**
     * Default custom download function to use for URLs.
     *
     * Per-stream `experimental_download` values passed to `stream()` override this default.
     */
    experimental_download?: DownloadFunction;

    /**
     * Default sandbox environment passed through to tool execution as
     * `experimental_sandbox`.
     *
     * Per-stream `experimental_sandbox` values passed to `stream()` override this default.
     */
    experimental_sandbox?: SandboxSession;

    /**
     * Workflow-safe reference to the environment variable containing the
     * secret for HMAC-signing tool approval requests. When set, the agent signs
     * each approval request and verifies the signature before executing an
     * approved tool replayed from client-supplied message history.
     *
     * Only the environment variable name crosses workflow boundaries. The
     * secret value is read inside signing and verification steps and is never
     * serialized. Per-stream values override this default.
     */
    experimental_toolApprovalSecret?: WorkflowToolApprovalSecret;

    /**
     * Default callback function called before each step in the agent loop.
     * Use this to modify settings, manage context, or inject messages dynamically
     * for every stream call on this agent instance.
     *
     * Per-stream `prepareStep` values passed to `stream()` override this default.
     */
    prepareStep?: PrepareStepCallback<TTools, TRuntimeContext>;

    /**
     * Callback function to be called after each step completes.
     */
    onStepEnd?: WorkflowAgentOnStepEndCallback<TTools, TRuntimeContext>;

    /**
     * Callback function to be called after each step completes.
     *
     * @deprecated Use `onStepEnd` instead.
     */
    onStepFinish?: WorkflowAgentOnStepFinishCallback<TTools, TRuntimeContext>;

    /**
     * Callback that is called when the LLM response and all request tool executions are finished.
     */
    onEnd?: WorkflowAgentOnEndCallback<TTools, TRuntimeContext>;

    /**
     * Callback that is called when the LLM response and all request tool executions are finished.
     *
     * @deprecated Use `onEnd` instead.
     */
    onFinish?: WorkflowAgentOnFinishCallback<TTools, TRuntimeContext>;

    /**
     * Callback called when the agent starts streaming, before any LLM calls.
     */
    onStart?: WorkflowAgentOnStartCallback<TTools, TRuntimeContext>;

    /**
     * Callback called when the agent starts streaming, before any LLM calls.
     *
     * @deprecated Use `onStart` instead.
     */
    experimental_onStart?: WorkflowAgentOnStartCallback<
      TTools,
      TRuntimeContext
    >;

    /**
     * Callback called before each step (LLM call) begins.
     */
    onStepStart?: WorkflowAgentOnStepStartCallback<TTools, TRuntimeContext>;

    /**
     * Callback called before each step (LLM call) begins.
     *
     * @deprecated Use `onStepStart` instead.
     */
    experimental_onStepStart?: WorkflowAgentOnStepStartCallback<
      TTools,
      TRuntimeContext
    >;

    /**
     * Callback called before a tool's execute function runs.
     */
    onToolExecutionStart?: WorkflowAgentOnToolExecutionStartCallback<TTools>;

    /**
     * Callback called after a tool execution completes.
     */
    onToolExecutionEnd?: WorkflowAgentOnToolExecutionEndCallback<TTools>;

    /**
     * Prepare the parameters for the stream call.
     * Called once before the agent loop starts. Use this to transform
     * model, tools, instructions, or other settings based on runtime context.
     */
    prepareCall?: PrepareCallCallback<TTools, TRuntimeContext>;

    /**
     * Whether to allow system messages inside the `prompt` or `messages` fields.
     * When `false` (the default), system messages in `prompt` or `messages` are
     * rejected to prevent prompt-injection attacks. Set to `true` only when you
     * intentionally interleave system messages with user messages.
     *
     * @default false
     */
    allowSystemInMessages?: boolean;
  };

/**
 * Callback that is called when the LLM response and all request tool executions are finished.
 */
export type WorkflowAgentOnEndCallback<
  TTools extends ToolSet = ToolSet,
  TRuntimeContext extends Context = Context,
  OUTPUT = never,
> = (event: {
  /**
   * Details for all steps.
   */
  readonly steps: StepResult<TTools, TRuntimeContext>[];

  /**
   * The final messages including all tool calls and results.
   */
  readonly messages: ModelMessage[];

  /**
   * The text output from the last step.
   */
  readonly text: string;

  /**
   * The finish reason from the last step.
   */
  readonly finishReason: FinishReason;

  /**
   * The total token usage across all steps.
   */
  readonly usage: LanguageModelUsage;

  /**
   * The total token usage across all steps.
   */
  readonly totalUsage: LanguageModelUsage;

  /**
   * The runtime context at the end of the agent loop.
   */
  readonly runtimeContext: TRuntimeContext;

  /**
   * The per-tool context at the end of the agent loop.
   */
  readonly toolsContext: InferToolSetContext<TTools>;

  /**
   * The generated structured output. It uses the `output` specification.
   * Only available when `output` is specified.
   */
  readonly output: OUTPUT;
}) => PromiseLike<void> | void;

/**
 * Callback that is called when the LLM response and all request tool executions are finished.
 *
 * @deprecated Use `WorkflowAgentOnEndCallback` instead.
 */
export type WorkflowAgentOnFinishCallback<
  TTools extends ToolSet = ToolSet,
  TRuntimeContext extends Context = Context,
  OUTPUT = never,
> = WorkflowAgentOnEndCallback<TTools, TRuntimeContext, OUTPUT>;

/**
 * Callback that is invoked when an error occurs during streaming.
 */
export type WorkflowAgentOnErrorCallback = (event: {
  error: unknown;
}) => PromiseLike<void> | void;

/**
 * Callback that is set using the `onAbort` option.
 */
export type WorkflowAgentOnAbortCallback<TTools extends ToolSet = ToolSet> =
  (event: {
    /**
     * Details for all previously finished steps.
     */
    readonly steps: StepResult<TTools, any>[];
  }) => PromiseLike<void> | void;

/**
 * Callback that is called when the agent starts streaming, before any LLM calls.
 */
export type WorkflowAgentOnStartCallback<
  TTools extends ToolSet = ToolSet,
  TRuntimeContext extends Context = Context,
> = (event: {
  /** The model being used */
  readonly model: LanguageModel;
  /** The messages being sent */
  readonly messages: ModelMessage[];
  /** Shared runtime context for this agent loop */
  readonly runtimeContext: TRuntimeContext;
  /** Per-tool context map for this agent loop */
  readonly toolsContext: InferToolSetContext<TTools>;
}) => PromiseLike<void> | void;

/**
 * Callback that is called before each step (LLM call) begins.
 */
export type WorkflowAgentOnStepStartCallback<
  TTools extends ToolSet = ToolSet,
  TRuntimeContext extends Context = Context,
> = (event: {
  /** The current step number (0-based) */
  readonly stepNumber: number;
  /** The model being used for this step */
  readonly model: LanguageModel;
  /** The messages being sent for this step */
  readonly messages: ModelMessage[];
  /** Results from all previously finished steps */
  readonly steps: ReadonlyArray<StepResult<TTools, TRuntimeContext>>;
  /** Shared runtime context for this step */
  readonly runtimeContext: TRuntimeContext;
  /** Per-tool context map for this step */
  readonly toolsContext: InferToolSetContext<TTools>;
}) => PromiseLike<void> | void;

type WorkflowToolContext<TOOL extends ToolSet[keyof ToolSet]> = [
  InferToolContext<TOOL>,
] extends [never]
  ? undefined
  : InferToolContext<TOOL>;

type WorkflowToolCall<
  TTools extends ToolSet,
  NAME extends keyof TTools,
> = ToolCall & {
  readonly toolName: NAME & string;
  readonly input: InferToolInput<TTools[NAME]>;
};

/**
 * Event passed to a WorkflowAgent tool-execution-start callback.
 *
 * For a concrete tool set, each union member correlates the tool call with that
 * tool's context. TypeScript narrows the nested tool call directly; use
 * `Extract` or a user-defined type guard to narrow correlated sibling fields.
 */
export type WorkflowAgentToolExecutionStartEvent<
  TTools extends ToolSet = ToolSet,
> = [ToolSet] extends [TTools]
  ? {
      readonly toolCall: ToolCall;
      readonly stepNumber: number;
      readonly messages: ModelMessage[];
      readonly toolContext: unknown;
    }
  : {
      [NAME in keyof TTools]: {
        readonly toolCall: WorkflowToolCall<TTools, NAME>;
        readonly stepNumber: number;
        readonly messages: ModelMessage[];
        readonly toolContext: WorkflowToolContext<TTools[NAME]>;
      };
    }[keyof TTools];

/**
 * Callback that is called before a tool's execute function runs.
 */
export type WorkflowAgentOnToolExecutionStartCallback<
  TTools extends ToolSet = ToolSet,
> = (
  event: WorkflowAgentToolExecutionStartEvent<TTools>,
) => PromiseLike<void> | void;

/**
 * Event passed to a WorkflowAgent tool-execution-end callback.
 *
 * For a concrete tool set, each union member correlates the tool call with that
 * tool's context and successful output. Check `success` to distinguish output
 * and error events. Use `Extract` or a user-defined type guard to narrow
 * correlated sibling fields by tool name.
 */
export type WorkflowAgentToolExecutionEndEvent<
  TTools extends ToolSet = ToolSet,
> = [ToolSet] extends [TTools]
  ?
      | {
          readonly toolCall: ToolCall;
          readonly stepNumber: number;
          readonly durationMs: number;
          readonly messages: ModelMessage[];
          readonly toolContext: unknown;
          readonly success: true;
          readonly output: unknown;
          readonly error?: never;
        }
      | {
          readonly toolCall: ToolCall;
          readonly stepNumber: number;
          readonly durationMs: number;
          readonly messages: ModelMessage[];
          readonly toolContext: unknown;
          readonly success: false;
          readonly error: unknown;
          readonly output?: never;
        }
  : {
      [NAME in keyof TTools]:
        | {
            readonly toolCall: WorkflowToolCall<TTools, NAME>;
            readonly stepNumber: number;
            readonly durationMs: number;
            readonly messages: ModelMessage[];
            readonly toolContext: WorkflowToolContext<TTools[NAME]>;
            readonly success: true;
            readonly output: InferToolOutput<TTools[NAME]>;
            readonly error?: never;
          }
        | {
            readonly toolCall: WorkflowToolCall<TTools, NAME>;
            readonly stepNumber: number;
            readonly durationMs: number;
            readonly messages: ModelMessage[];
            readonly toolContext: WorkflowToolContext<TTools[NAME]>;
            readonly success: false;
            readonly error: unknown;
            readonly output?: never;
          };
    }[keyof TTools];

/**
 * Callback that is called after a tool execution completes.
 * Uses a discriminated union pattern: check `success` to determine
 * whether `output` or `error` is available.
 */
export type WorkflowAgentOnToolExecutionEndCallback<
  TTools extends ToolSet = ToolSet,
> = (
  event: WorkflowAgentToolExecutionEndEvent<TTools>,
) => PromiseLike<void> | void;

/**
 * Options for the {@link WorkflowAgent.stream} method.
 */
export type WorkflowAgentStreamOptions<
  TTools extends ToolSet = ToolSet,
  TRuntimeContext extends Context = Context,
  OUTPUT = never,
  PARTIAL_OUTPUT = never,
> = Partial<GenerationSettings> &
  (
    | {
        /**
         * A prompt. It can be either a text prompt or a list of messages.
         *
         * You can either use `prompt` or `messages` but not both.
         */
        prompt: string | Array<ModelMessage>;

        /**
         * A list of messages.
         *
         * You can either use `prompt` or `messages` but not both.
         */
        messages?: never;
      }
    | {
        /**
         * The conversation messages to process. Should follow the AI SDK's ModelMessage format.
         *
         * You can either use `prompt` or `messages` but not both.
         */
        messages: Array<ModelMessage>;

        /**
         * A prompt. It can be either a text prompt or a list of messages.
         *
         * You can either use `prompt` or `messages` but not both.
         */
        prompt?: never;
      }
  ) & {
    /**
     * Instructions override for this stream call.
     */
    instructions?: Instructions;

    /**
     * Optional system prompt override.
     *
     * @deprecated Use `instructions` instead.
     */
    system?: string;

    /**
     * A WritableStream that receives raw LanguageModelV4StreamPart chunks in real-time
     * as the model generates them. This enables streaming to the client without
     * coupling WorkflowAgent to UIMessageChunk format.
     *
     * Convert to UIMessageChunks at the response boundary using
     * `createUIMessageChunkTransform()` from `@ai-sdk/workflow`.
     *
     * @example
     * ```typescript
     * // In the workflow:
     * await agent.stream({
     *   messages,
     *   writable: getWritable<ModelCallStreamPart>(),
     * });
     *
     * // In the route handler:
     * return createUIMessageStreamResponse({
     *   stream: run.readable.pipeThrough(createModelCallToUIChunkTransform()),
     * });
     * ```
     */
    writable?: WritableStream<ModelCallStreamPart<ToolSet>>;

    /**
     * Condition for stopping the generation when there are tool results in the last step.
     * When the condition is an array, any of the conditions can be met to stop the generation.
     */
    stopWhen?:
      | StopCondition<NoInfer<TTools>, TRuntimeContext>
      | Array<StopCondition<NoInfer<TTools>, TRuntimeContext>>;

    /**
     * The tool choice strategy. Default: 'auto'.
     * Overrides the toolChoice from the constructor if provided.
     */
    toolChoice?: ToolChoice<TTools>;

    /**
     * Limits the tools that are available for the model to call without
     * changing the tool call and result types in the result.
     */
    activeTools?: ActiveTools<NoInfer<TTools>>;

    /**
     * Optional telemetry configuration.
     */
    telemetry?: TelemetryOptions<TRuntimeContext, TTools>;

    /**
     * Runtime context that flows through the agent loop.
     *
     * Treat as immutable; return a new `runtimeContext` from `prepareStep`
     * to update it between steps.
     *
     * In workflow context, keep values serializable so they can cross workflow
     * and step boundaries.
     *
     * Overrides the constructor-level `runtimeContext` if provided.
     */
    runtimeContext?: TRuntimeContext;

    /**
     * Per-tool context, keyed by tool name. Each tool receives only its own
     * validated entry as `context` during execution. Tools that declare a
     * `contextSchema` validate their entry against the schema.
     *
     * In workflow context, keep values serializable so they can cross workflow
     * and step boundaries.
     *
     * Overrides the constructor-level `toolsContext` if provided.
     */
    toolsContext?: InferToolSetContext<TTools>;

    /**
     * Optional specification for parsing structured outputs from the LLM response.
     * Use `Output.object({ schema })` for structured output or `Output.text()` for text output.
     *
     * @example
     * ```typescript
     * import { Output } from '@workflow/ai';
     * import { z } from 'zod';
     *
     * const result = await agent.stream({
     *   messages: [...],
     *   writable: getWritable(),
     *   output: Output.object({
     *     schema: z.object({
     *       sentiment: z.enum(['positive', 'negative', 'neutral']),
     *       confidence: z.number(),
     *     }),
     *   }),
     * });
     *
     * console.log(result.output); // { sentiment: 'positive', confidence: 0.95 }
     * ```
     */
    output?: OutputSpecification<OUTPUT, PARTIAL_OUTPUT>;

    /**
     * Whether to include raw chunks from the provider in the stream.
     * When enabled, you will receive raw chunks with type 'raw' that contain the unprocessed data from the provider.
     * This allows access to cutting-edge provider features not yet wrapped by the AI SDK.
     * Defaults to false.
     */
    includeRawChunks?: boolean;

    /**
     * A function that attempts to repair a tool call that failed to parse.
     */
    repairToolCall?: ToolCallRepairFunction<TTools>;

    /**
     * A function that attempts to repair a tool call that failed to parse.
     *
     * @deprecated Use `repairToolCall` instead.
     */
    experimental_repairToolCall?: ToolCallRepairFunction<TTools>;

    /**
     * Optional stream transformations.
     * They are applied in the order they are provided.
     * The stream transformations must maintain the stream structure for streamText to work correctly.
     */
    experimental_transform?:
      | StreamTextTransform<TTools>
      | Array<StreamTextTransform<TTools>>;

    /**
     * Custom download function to use for URLs.
     * By default, files are downloaded if the model does not support the URL for the given media type.
     */
    experimental_download?: DownloadFunction;

    /**
     * Sandbox environment passed through to tool execution as
     * `experimental_sandbox`. Overrides the constructor-level value if provided.
     */
    experimental_sandbox?: SandboxSession;

    /**
     * Workflow-safe reference to the environment variable containing the
     * secret for HMAC-signing tool approval requests. When set, the agent signs
     * each approval request and verifies the signature before executing an
     * approved tool replayed from client-supplied message history.
     *
     * Only the environment variable name crosses workflow boundaries. The
     * secret value is read inside signing and verification steps and is never
     * serialized. Overrides the constructor-level value if provided.
     */
    experimental_toolApprovalSecret?: WorkflowToolApprovalSecret;

    /**
     * Callback function to be called after each step completes.
     */
    onStepEnd?: WorkflowAgentOnStepEndCallback<TTools, TRuntimeContext>;

    /**
     * Callback function to be called after each step completes.
     *
     * @deprecated Use `onStepEnd` instead.
     */
    onStepFinish?: WorkflowAgentOnStepFinishCallback<TTools, TRuntimeContext>;

    /**
     * Callback that is invoked when an error occurs during streaming.
     * You can use it to log errors.
     */
    onError?: WorkflowAgentOnErrorCallback;

    /**
     * Callback that is called when the LLM response and all request tool executions
     * (for tools that have an `execute` function) are finished.
     */
    onEnd?: WorkflowAgentOnEndCallback<TTools, TRuntimeContext, OUTPUT>;

    /**
     * Callback that is called when the LLM response and all request tool executions
     * (for tools that have an `execute` function) are finished.
     *
     * @deprecated Use `onEnd` instead.
     */
    onFinish?: WorkflowAgentOnFinishCallback<TTools, TRuntimeContext, OUTPUT>;

    /**
     * Callback that is called when the operation is aborted.
     */
    onAbort?: WorkflowAgentOnAbortCallback<TTools>;

    /**
     * Callback called when the agent starts streaming, before any LLM calls.
     */
    onStart?: WorkflowAgentOnStartCallback<TTools, TRuntimeContext>;

    /**
     * Callback called when the agent starts streaming, before any LLM calls.
     *
     * @deprecated Use `onStart` instead.
     */
    experimental_onStart?: WorkflowAgentOnStartCallback<
      TTools,
      TRuntimeContext
    >;

    /**
     * Callback called before each step (LLM call) begins.
     */
    onStepStart?: WorkflowAgentOnStepStartCallback<TTools, TRuntimeContext>;

    /**
     * Callback called before each step (LLM call) begins.
     *
     * @deprecated Use `onStepStart` instead.
     */
    experimental_onStepStart?: WorkflowAgentOnStepStartCallback<
      TTools,
      TRuntimeContext
    >;

    /**
     * Callback called before a tool's execute function runs.
     */
    onToolExecutionStart?: WorkflowAgentOnToolExecutionStartCallback<TTools>;

    /**
     * Callback called after a tool execution completes.
     */
    onToolExecutionEnd?: WorkflowAgentOnToolExecutionEndCallback<TTools>;

    /**
     * Callback function called before each step in the agent loop.
     * Use this to modify settings, manage context, or inject messages dynamically.
     *
     * @example
     * ```typescript
     * prepareStep: async ({ messages, stepNumber }) => {
     *   // Inject messages from a queue
     *   const queuedMessages = await getQueuedMessages();
     *   if (queuedMessages.length > 0) {
     *     return {
     *       messages: [...messages, ...queuedMessages],
     *     };
     *   }
     *   return {};
     * }
     * ```
     */
    prepareStep?: PrepareStepCallback<TTools, TRuntimeContext>;

    /**
     * Timeout in milliseconds for the stream operation.
     * When specified, creates an AbortSignal that will abort the operation after the given time.
     * If both `timeout` and `abortSignal` are provided, whichever triggers first will abort.
     */
    timeout?: number;

    /**
     * Whether to send a 'finish' chunk to the writable stream when streaming completes.
     * @default true
     */
    sendFinish?: boolean;

    /**
     * Whether to prevent the writable stream from being closed after streaming completes.
     * @default false
     */
    preventClose?: boolean;
  };

/**
 * A tool call made by the model. Matches the AI SDK's tool call shape.
 */
export interface ToolCall {
  /** Discriminator for content part arrays */
  type: 'tool-call';
  /** The unique identifier of the tool call */
  toolCallId: string;
  /** The name of the tool that was called */
  toolName: string;
  /** The parsed input arguments for the tool call */
  input: unknown;
}

/**
 * A tool result from executing a tool. Matches the AI SDK's tool result shape.
 */
export interface ToolResult {
  /** Discriminator for content part arrays */
  type: 'tool-result';
  /** The tool call ID this result corresponds to */
  toolCallId: string;
  /** The name of the tool that was executed */
  toolName: string;
  /** The parsed input arguments that were passed to the tool */
  input: unknown;
  /** The output produced by the tool */
  output: unknown;
}

type WorkflowToolExecutionResult = {
  modelResult: LanguageModelV4ToolResultPart;
  rawOutput: unknown;
  isError: boolean;
};

function addToolResultsToStep(
  step: StepResult<ToolSet, any> | undefined,
  executedResults: WorkflowToolExecutionResult[],
) {
  if (step == null || executedResults.length === 0) {
    return;
  }

  const toolOutputs = executedResults.map(result => {
    const toolCall = step.toolCalls.find(
      toolCall => toolCall.toolCallId === result.modelResult.toolCallId,
    );

    const common = {
      toolCallId: result.modelResult.toolCallId,
      toolName: result.modelResult.toolName,
      input: toolCall?.input,
      ...(toolCall?.dynamic === true ? { dynamic: true as const } : {}),
      ...(toolCall?.providerExecuted === true
        ? { providerExecuted: true }
        : {}),
    };

    return result.isError
      ? {
          type: 'tool-error' as const,
          ...common,
          error: result.rawOutput,
        }
      : {
          type: 'tool-result' as const,
          ...common,
          output: result.rawOutput,
        };
  });

  step.content.push(...(toolOutputs as StepResult<ToolSet, any>['content']));

  const toolResults = toolOutputs.filter(
    result => result.type === 'tool-result',
  );
  step.toolResults.push(
    ...(toolResults as StepResult<ToolSet, any>['toolResults']),
  );
  step.staticToolResults.push(
    ...(toolResults.filter(result => result.dynamic !== true) as StepResult<
      ToolSet,
      any
    >['staticToolResults']),
  );
  step.dynamicToolResults.push(
    ...(toolResults.filter(result => result.dynamic === true) as StepResult<
      ToolSet,
      any
    >['dynamicToolResults']),
  );
}

/**
 * Result of the WorkflowAgent.stream method.
 */
export interface WorkflowAgentStreamResult<
  TTools extends ToolSet = ToolSet,
  OUTPUT = never,
> {
  /**
   * The final messages including all tool calls and results.
   */
  messages: ModelMessage[];

  /**
   * Details for all steps.
   */
  steps: StepResult<TTools, any>[];

  /**
   * The tool calls from the last step.
   * Includes all tool calls regardless of whether they were executed.
   *
   * When the agent stops because a tool without an `execute` function was called,
   * this array will contain those calls. Compare with `toolResults` to find
   * unresolved tool calls that need client-side handling:
   *
   * ```ts
   * const unresolved = result.toolCalls.filter(
   *   tc => !result.toolResults.some(tr => tr.toolCallId === tc.toolCallId)
   * );
   * ```
   *
   * This matches the AI SDK's `GenerateTextResult.toolCalls` behavior.
   */
  toolCalls: ToolCall[];

  /**
   * The tool results from the last step.
   * Only includes results for tools that were actually executed (server-side or provider-executed).
   * Tools without an `execute` function will NOT have entries here.
   *
   * This matches the AI SDK's `GenerateTextResult.toolResults` behavior.
   */
  toolResults: ToolResult[];

  /**
   * The finish reason from the last step.
   */
  finishReason: FinishReason;

  /**
   * The original value from a model stream error part.
   *
   * This property is present when the model emitted an error part, including
   * when the supplied value is `undefined`. Check with `'error' in result` to
   * distinguish that case from a result without a model stream error.
   */
  error?: unknown;

  /**
   * The total token usage across all steps.
   */
  totalUsage: LanguageModelUsage;

  /**
   * The generated structured output. It uses the `output` specification.
   * Only available when `output` is specified.
   */
  output: OUTPUT;
}

/**
 * A class for building durable AI agents within workflows.
 *
 * WorkflowAgent enables you to create AI-powered agents that can maintain state
 * across workflow steps, call tools, and gracefully handle interruptions and resumptions.
 * It integrates seamlessly with the AI SDK and the Workflow DevKit for
 * production-grade reliability.
 *
 * @example
 * ```typescript
 * const agent = new WorkflowAgent({
 *   model: 'anthropic/claude-opus',
 *   tools: {
 *     getWeather: {
 *       description: 'Get weather for a location',
 *       inputSchema: z.object({ location: z.string() }),
 *       execute: getWeatherStep,
 *     },
 *   },
 *   instructions: 'You are a helpful weather assistant.',
 * });
 *
 * const result = await agent.stream({
 *   messages: [{ role: 'user', content: 'What is the weather?' }],
 * });
 * ```
 */
export class WorkflowAgent<
  TBaseTools extends ToolSet = ToolSet,
  TRuntimeContext extends Context = Context,
  OUTPUT = any,
  PARTIAL_OUTPUT = any,
> {
  /**
   * The id of the agent.
   */
  public readonly id: string | undefined;

  private model: LanguageModel;
  /**
   * The tool set configured for this agent.
   */
  public readonly tools: TBaseTools;
  private instructions?: Instructions;
  private generationSettings: GenerationSettings;
  private toolChoice?: ToolChoice<TBaseTools>;
  private telemetry?: TelemetryOptions<TRuntimeContext, TBaseTools>;
  private runtimeContext?: TRuntimeContext;
  private toolsContext?: InferToolSetContext<TBaseTools>;
  private stopWhen?:
    | StopCondition<TBaseTools, TRuntimeContext>
    | Array<StopCondition<TBaseTools, TRuntimeContext>>;
  private activeTools?: ActiveTools<TBaseTools>;
  private output?: OutputSpecification<OUTPUT, PARTIAL_OUTPUT>;
  private repairToolCall?: ToolCallRepairFunction<TBaseTools>;
  private experimentalDownload?: DownloadFunction;
  private experimentalSandbox?: SandboxSession;
  private experimentalToolApprovalSecret?: WorkflowToolApprovalSecret;
  private prepareStep?: PrepareStepCallback<TBaseTools, TRuntimeContext>;
  private allowSystemInMessages: boolean;
  private constructorOnStepEnd?: WorkflowAgentOnStepEndCallback<
    TBaseTools,
    TRuntimeContext
  >;
  private constructorOnEnd?: WorkflowAgentOnEndCallback<
    TBaseTools,
    TRuntimeContext
  >;
  private constructorOnStart?: WorkflowAgentOnStartCallback<
    TBaseTools,
    TRuntimeContext
  >;
  private constructorOnStepStart?: WorkflowAgentOnStepStartCallback<
    TBaseTools,
    TRuntimeContext
  >;
  private constructorOnToolExecutionStart?: WorkflowAgentOnToolExecutionStartCallback<TBaseTools>;
  private constructorOnToolExecutionEnd?: WorkflowAgentOnToolExecutionEndCallback<TBaseTools>;
  private prepareCall?: PrepareCallCallback<TBaseTools, TRuntimeContext>;

  constructor(
    options: WorkflowAgentOptions<
      TBaseTools,
      TRuntimeContext,
      OUTPUT,
      PARTIAL_OUTPUT
    >,
  ) {
    this.id = options.id;
    this.model = options.model;
    this.tools = (options.tools ?? {}) as TBaseTools;
    // `instructions` takes precedence over deprecated `system`
    this.instructions = options.instructions ?? options.system;
    this.toolChoice = options.toolChoice;
    this.telemetry = options.telemetry;
    this.runtimeContext = options.runtimeContext;
    this.toolsContext = options.toolsContext;
    this.stopWhen = options.stopWhen;
    this.activeTools = options.activeTools;
    this.output = options.output;
    this.repairToolCall =
      options.repairToolCall ?? options.experimental_repairToolCall;
    this.experimentalDownload = options.experimental_download;
    this.experimentalSandbox = options.experimental_sandbox;
    this.experimentalToolApprovalSecret =
      options.experimental_toolApprovalSecret;
    this.prepareStep = options.prepareStep;
    this.constructorOnStepEnd = options.onStepEnd ?? options.onStepFinish;
    const { onFinish, onEnd = onFinish } = options;
    this.constructorOnEnd = onEnd;
    this.constructorOnStart = options.onStart ?? options.experimental_onStart;
    this.constructorOnStepStart =
      options.onStepStart ?? options.experimental_onStepStart;
    this.constructorOnToolExecutionStart = options.onToolExecutionStart;
    this.constructorOnToolExecutionEnd = options.onToolExecutionEnd;
    this.prepareCall = options.prepareCall;
    this.allowSystemInMessages = options.allowSystemInMessages ?? false;

    // Extract generation settings
    this.generationSettings = {
      maxOutputTokens: options.maxOutputTokens,
      temperature: options.temperature,
      topP: options.topP,
      topK: options.topK,
      presencePenalty: options.presencePenalty,
      frequencyPenalty: options.frequencyPenalty,
      stopSequences: options.stopSequences,
      seed: options.seed,
      maxRetries: options.maxRetries,
      abortSignal: options.abortSignal,
      headers: options.headers,
      reasoning: options.reasoning,
      providerOptions: options.providerOptions,
    };
  }

  generate() {
    throw new Error('Not implemented');
  }

  async stream<
    TTools extends TBaseTools = TBaseTools,
    TOutput = DefaultWorkflowAgentOutput<OUTPUT>,
    TPartialOutput = DefaultWorkflowAgentOutput<PARTIAL_OUTPUT>,
  >(
    options: WorkflowAgentStreamOptions<
      TTools,
      TRuntimeContext,
      TOutput,
      TPartialOutput
    >,
  ): Promise<WorkflowAgentStreamResult<TTools, TOutput>> {
    const { onFinish, onEnd = onFinish } = options;

    // Call prepareCall to transform parameters before the agent loop
    let effectiveModel: LanguageModel = this.model;
    let effectiveInstructions =
      options.instructions ?? options.system ?? this.instructions;
    let effectivePrompt: string | Array<ModelMessage> | undefined =
      options.prompt;
    let effectiveMessages: Array<ModelMessage> | undefined = options.messages;
    let effectiveGenerationSettings = { ...this.generationSettings };
    let effectiveRuntimeContext: TRuntimeContext = (options.runtimeContext ??
      this.runtimeContext ??
      {}) as TRuntimeContext;
    let effectiveToolsContext: Record<string, Context | undefined> =
      (options.toolsContext ?? this.toolsContext ?? {}) as unknown as Record<
        string,
        Context | undefined
      >;
    let effectiveToolChoiceFromPrepare = options.toolChoice ?? this.toolChoice;
    let effectiveStopWhenFromPrepare = options.stopWhen ?? this.stopWhen;
    let effectiveActiveToolsFromPrepare =
      options.activeTools ?? this.activeTools;
    let effectiveDownloadFromPrepare =
      options.experimental_download ?? this.experimentalDownload;
    const effectiveToolApprovalSecret =
      options.experimental_toolApprovalSecret ??
      this.experimentalToolApprovalSecret;
    let effectiveTelemetryFromPrepare = options.telemetry ?? this.telemetry;

    // Resolve messages for prepareCall: use messages directly, or convert prompt
    const resolvedMessagesForPrepareCall: ModelMessage[] =
      effectiveMessages ??
      (typeof effectivePrompt === 'string'
        ? [{ role: 'user' as const, content: effectivePrompt }]
        : (effectivePrompt as ModelMessage[])) ??
      [];

    if (this.prepareCall) {
      const prepared = await this.prepareCall({
        model: effectiveModel,
        tools: this.tools,
        instructions: effectiveInstructions,
        toolChoice: effectiveToolChoiceFromPrepare as ToolChoice<TBaseTools>,
        stopWhen: effectiveStopWhenFromPrepare,
        activeTools: effectiveActiveToolsFromPrepare,
        experimental_download: effectiveDownloadFromPrepare,
        telemetry: effectiveTelemetryFromPrepare,
        runtimeContext: effectiveRuntimeContext,
        toolsContext: effectiveToolsContext as InferToolSetContext<TBaseTools>,
        messages: resolvedMessagesForPrepareCall,
        ...effectiveGenerationSettings,
      } as PrepareCallOptions<TBaseTools, TRuntimeContext>);

      if (prepared.model !== undefined) effectiveModel = prepared.model;
      if (prepared.instructions !== undefined)
        effectiveInstructions = prepared.instructions;
      if (prepared.messages !== undefined) {
        effectiveMessages = prepared.messages as Array<ModelMessage>;
        effectivePrompt = undefined; // messages from prepareCall take precedence
      }
      if (prepared.runtimeContext !== undefined)
        effectiveRuntimeContext = prepared.runtimeContext;
      if (prepared.toolsContext !== undefined)
        effectiveToolsContext = prepared.toolsContext as Record<
          string,
          Context | undefined
        >;
      if (prepared.toolChoice !== undefined)
        effectiveToolChoiceFromPrepare =
          prepared.toolChoice as ToolChoice<TBaseTools>;
      if (prepared.stopWhen !== undefined)
        effectiveStopWhenFromPrepare = prepared.stopWhen;
      if (prepared.activeTools !== undefined)
        effectiveActiveToolsFromPrepare = prepared.activeTools;
      if (prepared.experimental_download !== undefined)
        effectiveDownloadFromPrepare = prepared.experimental_download;
      if (prepared.telemetry !== undefined)
        effectiveTelemetryFromPrepare = prepared.telemetry;
      if (prepared.maxOutputTokens !== undefined)
        effectiveGenerationSettings.maxOutputTokens = prepared.maxOutputTokens;
      if (prepared.temperature !== undefined)
        effectiveGenerationSettings.temperature = prepared.temperature;
      if (prepared.topP !== undefined)
        effectiveGenerationSettings.topP = prepared.topP;
      if (prepared.topK !== undefined)
        effectiveGenerationSettings.topK = prepared.topK;
      if (prepared.presencePenalty !== undefined)
        effectiveGenerationSettings.presencePenalty = prepared.presencePenalty;
      if (prepared.frequencyPenalty !== undefined)
        effectiveGenerationSettings.frequencyPenalty =
          prepared.frequencyPenalty;
      if (prepared.stopSequences !== undefined)
        effectiveGenerationSettings.stopSequences = prepared.stopSequences;
      if (prepared.seed !== undefined)
        effectiveGenerationSettings.seed = prepared.seed;
      if (prepared.maxRetries !== undefined)
        effectiveGenerationSettings.maxRetries = prepared.maxRetries;
      if (prepared.abortSignal !== undefined)
        effectiveGenerationSettings.abortSignal = prepared.abortSignal;
      if (prepared.headers !== undefined)
        effectiveGenerationSettings.headers = prepared.headers;
      if (prepared.reasoning !== undefined)
        effectiveGenerationSettings.reasoning = prepared.reasoning;
      if (prepared.providerOptions !== undefined)
        effectiveGenerationSettings.providerOptions = prepared.providerOptions;
    }

    const effectiveTelemetry = effectiveTelemetryFromPrepare;
    const telemetryDispatcher = createRestrictedTelemetryDispatcher<
      any,
      any,
      any
    >({
      telemetry: effectiveTelemetry as any,
      includeRuntimeContext: effectiveTelemetry?.includeRuntimeContext,
      includeToolsContext: effectiveTelemetry?.includeToolsContext,
    }) as any;

    const prompt = await standardizePrompt({
      system: effectiveInstructions,
      allowSystemInMessages: this.allowSystemInMessages,
      ...(effectivePrompt != null
        ? { prompt: effectivePrompt }
        : { messages: effectiveMessages! }),
    } as Prompt);
    const download = effectiveDownloadFromPrepare;
    const sandbox = options.experimental_sandbox ?? this.experimentalSandbox;
    const effectiveAbortSignal = mergeAbortSignals(
      options.abortSignal ?? effectiveGenerationSettings.abortSignal,
      options.timeout,
    );
    const timeoutAt =
      options.timeout == null ? undefined : Date.now() + options.timeout;
    const mergedOnToolExecutionStart = mergeCallbacks(
      this.constructorOnToolExecutionStart as
        | WorkflowAgentOnToolExecutionStartCallback<TTools>
        | undefined,
      options.onToolExecutionStart,
    );
    const mergedOnToolExecutionEnd = mergeCallbacks(
      this.constructorOnToolExecutionEnd as
        | WorkflowAgentOnToolExecutionEndCallback<TTools>
        | undefined,
      options.onToolExecutionEnd,
    );

    // Process tool approval responses before starting the agent loop.
    // This mirrors how stream-text.ts handles tool-approval-response parts:
    // approved tools are executed, denied tools get denial results, and
    // approval parts are stripped from the messages.
    // Use the AI SDK core collector so this path cannot drift from the
    // hardened generateText/streamText implementation. The collected approvals
    // are mapped to the flat shape used below; the original (nested) approval
    // is carried on `collected` for re-validation.
    const collectedApprovals = collectToolApprovals<ToolSet>({
      messages: prompt.messages,
    });
    const approvedToolApprovals = collectedApprovals.approvedToolApprovals.map(
      collected => ({
        toolCallId: collected.toolCall.toolCallId,
        toolName: collected.toolCall.toolName,
        input: collected.toolCall.input,
        reason: collected.approvalResponse.reason,
        providerExecuted: collected.toolCall.providerExecuted === true,
        collected,
      }),
    );
    const deniedToolApprovals = collectedApprovals.deniedToolApprovals.map(
      collected => ({
        toolCallId: collected.toolCall.toolCallId,
        toolName: collected.toolCall.toolName,
        input: collected.toolCall.input,
        reason: collected.approvalResponse.reason,
        providerExecuted: collected.toolCall.providerExecuted === true,
      }),
    );

    // Approval ids of provider-executed tool calls. Provider-executed tools
    // (e.g. MCP via the Responses API) cannot be resolved locally — the
    // provider owns execution. We therefore skip them from local execution
    // and preserve their approval responses in the messages so the provider
    // receives the approval on the next call. The discriminator is sourced
    // from the original `tool-call` part (matching how core's stream-text.ts
    // decides), not from the response part which may be missing the flag.
    const providerExecutedApprovalIds = new Set<string>(
      [
        ...collectedApprovals.approvedToolApprovals,
        ...collectedApprovals.deniedToolApprovals,
      ]
        .filter(collected => collected.toolCall.providerExecuted === true)
        .map(collected => collected.approvalResponse.approvalId),
    );

    if (approvedToolApprovals.length > 0 || deniedToolApprovals.length > 0) {
      const _toolResultMessages: ModelMessage[] = [];
      const toolResultContent: LanguageModelV4ToolResultPart[] = [];
      const approvedRawResults: Array<{
        toolCallId: string;
        toolName: string;
        input: unknown;
        output: unknown;
      }> = [];

      // Execute approved tools
      for (const approval of approvedToolApprovals) {
        // Provider-executed approvals are forwarded to the provider via the
        // preserved approval response below, not executed locally.
        if (approval.providerExecuted) {
          continue;
        }
        const tool = (this.tools as ToolSet)[approval.toolName];
        if (tool && typeof tool.execute === 'function') {
          if (!tool.needsApproval) {
            const reason = `Tool "${approval.toolName}" does not require approval`;
            toolResultContent.push({
              type: 'tool-result' as const,
              toolCallId: approval.toolCallId,
              toolName: approval.toolName,
              output: await createLanguageModelToolResultOutput({
                toolCallId: approval.toolCallId,
                toolName: approval.toolName,
                input: approval.input,
                output: reason,
                tool,
                errorMode: 'text',
                supportedUrls: {},
                download,
              }),
            });
            continue;
          }

          // Re-validate through the shared core implementation: input schema,
          // approval signature (when configured), and approval policy.
          // Convert invalid input, denial, or signature errors to a tool error
          // result so the agent loop can continue gracefully.
          let revalidationReason: string | undefined;
          try {
            await validateWorkflowToolApprovalSignature({
              secret: effectiveToolApprovalSecret,
              approvalId: approval.collected.approvalRequest.approvalId,
              toolCallId: approval.toolCallId,
              toolName: approval.toolName,
              input: approval.input,
              signature: approval.collected.approvalRequest.signature,
            });

            const { deniedToolApprovals: policyDenied, invalidToolApprovals } =
              await validateApprovedToolApprovals({
                approvedToolApprovals: [approval.collected],
                tools: this.tools as ToolSet,
                toolApproval: undefined,
                messages: prompt.messages,
                toolsContext:
                  effectiveToolsContext as InferToolSetContext<ToolSet>,
                runtimeContext: effectiveRuntimeContext,
              });

            if (invalidToolApprovals.length > 0) {
              revalidationReason = getErrorMessage(
                invalidToolApprovals[0].error,
              );
            } else if (policyDenied.length > 0) {
              revalidationReason =
                policyDenied[0].approvalResponse.reason ??
                'Tool approval denied';
            }
          } catch (error) {
            revalidationReason = getErrorMessage(error);
          }

          if (revalidationReason != null) {
            toolResultContent.push({
              type: 'tool-result' as const,
              toolCallId: approval.toolCallId,
              toolName: approval.toolName,
              output: await createLanguageModelToolResultOutput({
                toolCallId: approval.toolCallId,
                toolName: approval.toolName,
                input: approval.input,
                output: revalidationReason,
                tool,
                errorMode: 'text',
                supportedUrls: {},
                download,
              }),
            });
            continue;
          }

          const result = await executeToolWithCallbacks(
            {
              toolCallId: approval.toolCallId,
              toolName: approval.toolName,
              input: approval.input,
            },
            this.tools as ToolSet,
            prompt.messages as unknown as LanguageModelV4Prompt,
            effectiveToolsContext,
            0,
            sandbox,
          );
          toolResultContent.push(result.modelResult);
          approvedRawResults.push({
            toolCallId: approval.toolCallId,
            toolName: approval.toolName,
            input: approval.input,
            output: result.rawOutput,
          });
        }
      }

      // Create denial results for denied tools
      for (const denial of deniedToolApprovals) {
        // Provider-executed denials are forwarded to the provider via the
        // preserved approval response below, not turned into a local result.
        if (denial.providerExecuted) {
          continue;
        }
        toolResultContent.push({
          type: 'tool-result' as const,
          toolCallId: denial.toolCallId,
          toolName: denial.toolName,
          output: {
            type: 'execution-denied' as const,
            reason: denial.reason,
          },
        });
      }

      // Strip approval parts that we resolved locally and inject tool results.
      // Provider-executed approval parts are preserved so the next call to
      // `convertToLanguageModelPrompt` forwards the approval response to the
      // provider (it only forwards responses flagged `providerExecuted`).
      const cleanedMessages: ModelMessage[] = [];
      for (const msg of prompt.messages) {
        if (msg.role === 'assistant' && Array.isArray(msg.content)) {
          const filtered = (msg.content as any[]).filter(
            (p: any) =>
              p.type !== 'tool-approval-request' ||
              providerExecutedApprovalIds.has(p.approvalId),
          );
          if (filtered.length > 0) {
            cleanedMessages.push({ ...msg, content: filtered });
          }
        } else if (msg.role === 'tool') {
          const filtered = (msg.content as any[]).flatMap((p: any) => {
            if (p.type !== 'tool-approval-response') {
              return [p];
            }
            if (!providerExecutedApprovalIds.has(p.approvalId)) {
              return [];
            }
            // Re-stamp `providerExecuted` so the conversion layer forwards the
            // response even if the client omitted the flag on the response part.
            return [{ ...p, providerExecuted: true }];
          });
          if (filtered.length > 0) {
            cleanedMessages.push({ ...msg, content: filtered });
          }
        } else {
          cleanedMessages.push(msg);
        }
      }

      // Add tool results as a new tool message
      if (toolResultContent.length > 0) {
        cleanedMessages.push({
          role: 'tool',
          content: toolResultContent,
        } as ModelMessage);
      }

      prompt.messages = cleanedMessages;

      // Write tool results and step boundaries to the stream so the UI
      // can transition approved/denied tool parts to the correct state
      // and properly separate them from the subsequent model step.
      if (options.writable && toolResultContent.length > 0) {
        const deniedResults = toolResultContent
          .filter(r => r.output.type === 'execution-denied')
          .map(r => ({ toolCallId: r.toolCallId }));
        await writeApprovalToolResults(
          options.writable,
          approvedRawResults,
          deniedResults,
        );
      }
    }

    const modelPrompt = await convertToLanguageModelPrompt({
      prompt,
      supportedUrls: {},
      download,
    });

    // Merge generation settings: constructor defaults < prepareCall < stream options
    const mergedGenerationSettings: GenerationSettings = {
      ...effectiveGenerationSettings,
      ...(options.maxOutputTokens !== undefined && {
        maxOutputTokens: options.maxOutputTokens,
      }),
      ...(options.temperature !== undefined && {
        temperature: options.temperature,
      }),
      ...(options.topP !== undefined && { topP: options.topP }),
      ...(options.topK !== undefined && { topK: options.topK }),
      ...(options.presencePenalty !== undefined && {
        presencePenalty: options.presencePenalty,
      }),
      ...(options.frequencyPenalty !== undefined && {
        frequencyPenalty: options.frequencyPenalty,
      }),
      ...(options.stopSequences !== undefined && {
        stopSequences: options.stopSequences,
      }),
      ...(options.seed !== undefined && { seed: options.seed }),
      ...(options.maxRetries !== undefined && {
        maxRetries: options.maxRetries,
      }),
      ...(effectiveAbortSignal !== undefined && {
        abortSignal: effectiveAbortSignal,
      }),
      ...(options.headers !== undefined && { headers: options.headers }),
      ...(options.reasoning !== undefined && { reasoning: options.reasoning }),
      ...(options.providerOptions !== undefined && {
        providerOptions: options.providerOptions,
      }),
    };

    // tag the outgoing request so usage can be attributed to WorkflowAgent.
    // chains with the `ai/<version>` and `ai-sdk/<provider>/<version>` suffixes
    // added downstream by the model run and the provider.
    mergedGenerationSettings.headers = withUserAgentSuffix(
      mergedGenerationSettings.headers ?? {},
      'ai-sdk-agent/workflow',
    );

    // Merge constructor + stream callbacks (constructor first, then stream)
    const mergedOnStepEnd = mergeCallbacks(
      this.constructorOnStepEnd as
        | WorkflowAgentOnStepEndCallback<TTools, TRuntimeContext>
        | undefined,
      options.onStepEnd ?? options.onStepFinish,
    );
    const mergedOnEnd = mergeCallbacks(
      this.constructorOnEnd as
        | WorkflowAgentOnEndCallback<TTools, TRuntimeContext, TOutput>
        | undefined,
      onEnd,
    );
    const mergedOnStart = mergeCallbacks(
      this.constructorOnStart as
        | WorkflowAgentOnStartCallback<TTools, TRuntimeContext>
        | undefined,
      options.onStart ?? options.experimental_onStart,
    );
    const mergedOnStepStart = mergeCallbacks(
      this.constructorOnStepStart as
        | WorkflowAgentOnStepStartCallback<TTools, TRuntimeContext>
        | undefined,
      options.onStepStart ?? options.experimental_onStepStart,
    );
    // Determine effective tool choice
    const effectiveToolChoice = effectiveToolChoiceFromPrepare;

    // Filter tools if activeTools is specified (stream-level overrides constructor default)
    const effectiveActiveTools = effectiveActiveToolsFromPrepare;
    const effectiveTools =
      effectiveActiveTools !== undefined
        ? (filterActiveTools({
            tools: this.tools,
            activeTools: effectiveActiveTools,
          }) ?? this.tools)
        : this.tools;
    const effectiveModelInfo = getModelInfo(effectiveModel);

    // Initialize context
    let runtimeContext: TRuntimeContext = effectiveRuntimeContext;
    let toolsContext: Record<string, Context | undefined> =
      effectiveToolsContext;

    const steps: StepResult<TTools, TRuntimeContext>[] = [];

    // Track tool calls and results from the last step for the result
    let lastStepToolCalls: ToolCall[] = [];
    let lastStepToolResults: ToolResult[] = [];

    // Call onStart before the agent loop
    if (mergedOnStart) {
      await mergedOnStart({
        model: effectiveModel,
        messages: prompt.messages,
        runtimeContext,
        toolsContext: toolsContext as unknown as InferToolSetContext<TTools>,
      });
    }
    await telemetryDispatcher.onStart?.({
      callId: 'workflow-agent',
      operationId: 'ai.workflowAgent.stream',
      provider: effectiveModelInfo.provider,
      modelId: effectiveModelInfo.modelId,
      system: undefined,
      messages: prompt.messages,
      tools: effectiveTools,
      toolChoice: effectiveToolChoice,
      activeTools: effectiveActiveTools as never,
      maxOutputTokens: mergedGenerationSettings.maxOutputTokens,
      temperature: mergedGenerationSettings.temperature,
      topP: mergedGenerationSettings.topP,
      topK: mergedGenerationSettings.topK,
      presencePenalty: mergedGenerationSettings.presencePenalty,
      frequencyPenalty: mergedGenerationSettings.frequencyPenalty,
      stopSequences: mergedGenerationSettings.stopSequences,
      seed: mergedGenerationSettings.seed,
      maxRetries: mergedGenerationSettings.maxRetries ?? 2,
      timeout: undefined,
      headers: mergedGenerationSettings.headers,
      reasoning: mergedGenerationSettings.reasoning,
      providerOptions: mergedGenerationSettings.providerOptions,
      output: (options.output ?? this.output) as never,
      runtimeContext,
      toolsContext: toolsContext as unknown as InferToolSetContext<TTools>,
    });

    // Helper to wrap executeTool with onToolExecutionStart/onToolExecutionEnd callbacks
    async function executeToolWithCallbacks(
      toolCall: { toolCallId: string; toolName: string; input: unknown },
      tools: ToolSet,
      messages: LanguageModelV4Prompt,
      perToolContexts: Record<string, Context | undefined>,
      currentStepNumber: number = 0,
      stepSandbox?: SandboxSession,
    ): Promise<WorkflowToolExecutionResult> {
      const toolCallEvent: ToolCall = {
        type: 'tool-call',
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        input: toolCall.input,
      };

      const tool = tools[toolCall.toolName];
      const resolvedContext = tool
        ? await resolveToolContext({
            toolName: toolCall.toolName,
            tool,
            toolsContext: perToolContexts,
          })
        : undefined;
      const modelMessages = getToolCallbackMessages(messages);

      if (mergedOnToolExecutionStart) {
        await mergedOnToolExecutionStart({
          toolCall: toolCallEvent,
          stepNumber: currentStepNumber,
          messages: modelMessages,
          toolContext: resolvedContext,
        } as WorkflowAgentToolExecutionStartEvent<TTools>);
      }
      await telemetryDispatcher.onToolExecutionStart?.({
        toolCall: toolCallEvent,
        stepNumber: currentStepNumber,
        messages: modelMessages,
        toolContext: resolvedContext as
          | InferToolSetContext<TTools>[keyof InferToolSetContext<TTools>]
          | undefined,
      });

      const startTime = Date.now();
      let result: WorkflowToolExecutionResult;
      try {
        const execute = () =>
          executeTool(
            toolCall,
            tools,
            messages,
            resolvedContext,
            effectiveAbortSignal,
            download,
            stepSandbox,
          );
        result =
          telemetryDispatcher.executeTool != null
            ? await telemetryDispatcher.executeTool({
                callId: 'workflow-agent',
                toolCallId: toolCall.toolCallId,
                execute,
              })
            : await execute();
      } catch (err) {
        const durationMs = Date.now() - startTime;
        if (mergedOnToolExecutionEnd) {
          await mergedOnToolExecutionEnd({
            toolCall: toolCallEvent,
            stepNumber: currentStepNumber,
            durationMs,
            messages: modelMessages,
            toolContext: resolvedContext,
            success: false,
            error: err,
          } as WorkflowAgentToolExecutionEndEvent<TTools>);
        }
        await telemetryDispatcher.onToolExecutionEnd?.({
          toolCall: toolCallEvent,
          stepNumber: currentStepNumber,
          durationMs,
          messages: modelMessages,
          toolContext: resolvedContext as
            | InferToolSetContext<TTools>[keyof InferToolSetContext<TTools>]
            | undefined,
          success: false,
          error: err,
        });
        throw err;
      }

      const durationMs = Date.now() - startTime;
      if (mergedOnToolExecutionEnd) {
        if (result.isError) {
          await mergedOnToolExecutionEnd({
            toolCall: toolCallEvent,
            stepNumber: currentStepNumber,
            durationMs,
            messages: modelMessages,
            toolContext: resolvedContext,
            success: false,
            error: result.rawOutput,
          } as WorkflowAgentToolExecutionEndEvent<TTools>);
        } else {
          await mergedOnToolExecutionEnd({
            toolCall: toolCallEvent,
            stepNumber: currentStepNumber,
            durationMs,
            messages: modelMessages,
            toolContext: resolvedContext,
            success: true,
            output: result.rawOutput,
          } as WorkflowAgentToolExecutionEndEvent<TTools>);
        }
      }
      if (result.isError) {
        await telemetryDispatcher.onToolExecutionEnd?.({
          toolCall: toolCallEvent,
          stepNumber: currentStepNumber,
          durationMs,
          messages: modelMessages,
          toolContext: resolvedContext as
            | InferToolSetContext<TTools>[keyof InferToolSetContext<TTools>]
            | undefined,
          success: false,
          error: result.rawOutput,
        });
      } else {
        await telemetryDispatcher.onToolExecutionEnd?.({
          toolCall: toolCallEvent,
          stepNumber: currentStepNumber,
          durationMs,
          messages: modelMessages,
          toolContext: resolvedContext as
            | InferToolSetContext<TTools>[keyof InferToolSetContext<TTools>]
            | undefined,
          success: true,
          output: result.rawOutput,
        });
      }
      return result;
    }

    const recordProviderExecutedToolTelemetry = async (
      toolCall: { toolCallId: string; toolName: string; input: unknown },
      result: WorkflowToolExecutionResult,
      messages: LanguageModelV4Prompt,
      currentStepNumber: number,
    ) => {
      const toolCallEvent: ToolCall = {
        type: 'tool-call',
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        input: toolCall.input,
      };
      const modelMessages = getToolCallbackMessages(messages);

      await telemetryDispatcher.onToolExecutionStart?.({
        toolCall: toolCallEvent,
        stepNumber: currentStepNumber,
        messages: modelMessages,
        toolContext: undefined,
      });

      await telemetryDispatcher.onToolExecutionEnd?.({
        toolCall: toolCallEvent,
        stepNumber: currentStepNumber,
        durationMs: 0,
        messages: modelMessages,
        toolContext: undefined,
        ...(result.isError
          ? {
              success: false as const,
              error: result.rawOutput,
            }
          : {
              success: true as const,
              output: result.rawOutput,
            }),
      });
    };

    // Check for abort before starting
    if (mergedGenerationSettings.abortSignal?.aborted) {
      if (options.onAbort) {
        await options.onAbort({ steps });
      }
      return {
        messages: prompt.messages,
        steps,
        toolCalls: [],
        toolResults: [],
        finishReason: 'other',
        totalUsage: aggregateUsage(steps),
        output: undefined as TOutput,
      };
    }

    const iterator = streamTextIterator({
      model: effectiveModel,
      tools: effectiveTools as ToolSet,
      writable: options.writable,
      prompt: modelPrompt,
      initialInstructions: effectiveInstructions,
      initialMessages: prompt.messages,
      stopConditions: effectiveStopWhenFromPrepare as
        | ModelStopCondition
        | ModelStopCondition[]
        | undefined,
      onStepEnd: mergedOnStepEnd as any,
      onStepStart: mergedOnStepStart as any,
      prepareStep: (options.prepareStep ??
        (this.prepareStep as
          | PrepareStepCallback<ToolSet, TRuntimeContext>
          | undefined)) as any,
      generationSettings: mergedGenerationSettings,
      toolChoice: effectiveToolChoice as ToolChoice<ToolSet>,
      runtimeContext,
      toolsContext,
      telemetry: effectiveTelemetry,
      includeRawChunks: options.includeRawChunks ?? false,
      timeoutAt,
      repairToolCall: (options.repairToolCall ??
        options.experimental_repairToolCall ??
        this.repairToolCall) as ToolCallRepairFunction<ToolSet> | undefined,
      responseFormat: await (options.output ?? this.output)?.responseFormat,
      experimental_sandbox: sandbox,
    });

    // Track the final conversation messages from the iterator
    let finalMessages: LanguageModelV4Prompt | undefined;
    let encounteredError: unknown;
    let hasEncounteredError = false;
    let wasAborted = false;
    let terminalError: unknown;
    let hasTerminalError = false;

    try {
      let result = await iterator.next();
      while (!result.done) {
        // Check for abort during iteration
        if (mergedGenerationSettings.abortSignal?.aborted) {
          wasAborted = true;
          if (options.onAbort) {
            await options.onAbort({ steps });
          }
          break;
        }

        const {
          toolCalls,
          messages: iterMessages,
          step,
          runtimeContext: yieldedRuntimeContext,
          toolsContext: yieldedToolsContext,
          experimental_sandbox: stepSandbox,
          providerExecutedToolResults,
        } = result.value;
        const toolExecutionSandbox = stepSandbox ?? sandbox;
        // Capture current step number before pushing (0-based)
        const currentStepNumber = steps.length;
        if (step) {
          steps.push(step as unknown as StepResult<TTools, TRuntimeContext>);
        }
        if (yieldedRuntimeContext !== undefined) {
          runtimeContext = yieldedRuntimeContext as TRuntimeContext;
        }
        if (yieldedToolsContext !== undefined) {
          toolsContext = yieldedToolsContext;
        }

        // Only execute tools if there are tool calls
        if (toolCalls.length > 0) {
          const invalidToolCalls = toolCalls.filter(tc => tc.invalid === true);
          const validToolCalls = toolCalls.filter(tc => tc.invalid !== true);

          // Separate provider-executed tool calls from client-executed ones
          const nonProviderToolCalls = validToolCalls.filter(
            tc => !tc.providerExecuted,
          );
          const providerToolCalls = validToolCalls.filter(
            tc => tc.providerExecuted,
          );

          // Check which tools need approval (can be async)
          const approvalNeeded = await Promise.all(
            nonProviderToolCalls.map(async tc => {
              const tool = (effectiveTools as ToolSet)[tc.toolName];
              if (!tool) return false;
              if (tool.needsApproval == null) return false;
              if (typeof tool.needsApproval === 'boolean')
                return tool.needsApproval;
              const resolvedContext = await resolveToolContext({
                toolName: tc.toolName,
                tool,
                toolsContext:
                  toolsContext as unknown as InferToolSetContext<TTools>,
              });
              return tool.needsApproval(tc.input, {
                toolCallId: tc.toolCallId,
                messages: iterMessages as unknown as ModelMessage[],
                context: resolvedContext,
              });
            }),
          );

          // Further split non-provider tool calls into:
          // - executable: has execute function and doesn't need approval
          // - paused: no execute function (client-side) OR needs approval
          // Note: missing tools (!tool) are left to executeTool which will throw.
          const executableToolCalls = nonProviderToolCalls.filter((tc, i) => {
            const tool = (effectiveTools as ToolSet)[tc.toolName];
            return (
              (!tool || typeof tool.execute === 'function') &&
              !approvalNeeded[i]
            );
          });
          const pausedToolCalls = nonProviderToolCalls.filter((tc, i) => {
            const tool = (effectiveTools as ToolSet)[tc.toolName];
            return (
              (tool && typeof tool.execute !== 'function') || approvalNeeded[i]
            );
          });

          // If there are paused tool calls (client-side or needing approval),
          // stop the loop and return them.
          // This matches AI SDK behavior: tools without execute or needing
          // approval pause the agent loop.
          if (pausedToolCalls.length > 0) {
            // Execute any executable tools that were also called in this step
            const executableResults = await Promise.all(
              executableToolCalls.map(
                (toolCall): Promise<WorkflowToolExecutionResult> =>
                  executeToolWithCallbacks(
                    toolCall,
                    effectiveTools as ToolSet,
                    iterMessages,
                    toolsContext,
                    currentStepNumber,
                    toolExecutionSandbox,
                  ),
              ),
            );

            // Collect provider tool results
            const providerResultEntries = await Promise.all(
              providerToolCalls.map(async toolCall => ({
                toolCall,
                result: await resolveProviderToolResult(
                  toolCall,
                  providerExecutedToolResults,
                  effectiveTools as ToolSet,
                  download,
                ),
              })),
            );
            await Promise.all(
              providerResultEntries.flatMap(({ toolCall, result }) =>
                result == null
                  ? []
                  : [
                      recordProviderExecutedToolTelemetry(
                        toolCall,
                        result,
                        iterMessages,
                        currentStepNumber,
                      ),
                    ],
              ),
            );
            const providerResults = providerResultEntries.flatMap(
              ({ result }) => (result == null ? [] : [result]),
            );

            const continuationInvalidResults = invalidToolCalls.map(
              createInvalidToolResult,
            );
            const resolvedResults: LanguageModelV4ToolResultPart[] = [
              ...executableResults.map(result => result.modelResult),
              ...providerResults.map(result => result.modelResult),
              ...continuationInvalidResults,
            ];
            const executedResults = [...executableResults, ...providerResults];

            const allToolCalls: ToolCall[] = toolCalls.map(tc => ({
              type: 'tool-call' as const,
              toolCallId: tc.toolCallId,
              toolName: tc.toolName,
              input: tc.input,
            }));

            const allToolResults: ToolResult[] = executedResults.map(r => ({
              type: 'tool-result' as const,
              toolCallId: r.modelResult.toolCallId,
              toolName: r.modelResult.toolName,
              input: toolCalls.find(
                tc => tc.toolCallId === r.modelResult.toolCallId,
              )?.input,
              output: r.rawOutput,
            }));

            addToolResultsToStep(step, executedResults);

            if (resolvedResults.length > 0) {
              iterMessages.push({
                role: 'tool',
                content: resolvedResults,
              });
            }

            const messages = iterMessages as unknown as ModelMessage[];
            const lastStep = steps[steps.length - 1];
            const totalUsage = aggregateUsage(steps);
            const finishReason = lastStep?.finishReason ?? 'other';

            if (mergedOnEnd && !wasAborted) {
              await mergedOnEnd({
                steps,
                messages,
                text: lastStep?.text ?? '',
                finishReason,
                usage: totalUsage,
                totalUsage,
                runtimeContext,
                toolsContext:
                  toolsContext as unknown as InferToolSetContext<TTools>,
                output: undefined as TOutput,
              });
            }
            if (!wasAborted && steps.length > 0) {
              const telemetrySteps = steps.map(normalizeStepForTelemetry);
              const lastTelemetryStep =
                telemetrySteps[telemetrySteps.length - 1];
              await telemetryDispatcher.onEnd?.({
                ...lastTelemetryStep,
                steps: telemetrySteps,
                usage: totalUsage,
                totalUsage,
              });
            }

            // Emit tool-approval-request chunks for tools that need approval
            // so useChat can show the approval UI
            if (options.writable) {
              if (allToolResults.length > 0) {
                await writeToolResults(
                  options.writable,
                  executedResults.map(r => ({
                    toolCallId: r.modelResult.toolCallId,
                    toolName: r.modelResult.toolName,
                    input: toolCalls.find(
                      tc => tc.toolCallId === r.modelResult.toolCallId,
                    )?.input,
                    output: r.rawOutput,
                    isError: r.isError,
                  })),
                );
              }

              const approvalToolCalls = pausedToolCalls.filter((_, i) => {
                const tcIndex = nonProviderToolCalls.indexOf(
                  pausedToolCalls[i],
                );
                return approvalNeeded[tcIndex];
              });
              if (approvalToolCalls.length > 0) {
                // The signing step receives only a non-secret environment
                // variable reference. It resolves the secret inside the step,
                // and only the resulting signature is persisted in the stream.
                const approvalRequests = await Promise.all(
                  approvalToolCalls.map(async tc => {
                    const approvalId = `approval-${tc.toolCallId}`;
                    const signature =
                      effectiveToolApprovalSecret == null
                        ? undefined
                        : await signWorkflowToolApproval({
                            secret: effectiveToolApprovalSecret,
                            approvalId,
                            toolCallId: tc.toolCallId,
                            toolName: tc.toolName,
                            input: tc.input,
                          });

                    return {
                      approvalId,
                      toolCallId: tc.toolCallId,
                      ...(signature != null ? { signature } : {}),
                    };
                  }),
                );
                await writeApprovalRequests(options.writable, approvalRequests);
              }
            }

            // Close the stream before returning for paused tools
            if (options.writable) {
              const sendFinish = options.sendFinish ?? true;
              const preventClose = options.preventClose ?? false;
              if (sendFinish || !preventClose) {
                await closeStream(options.writable, preventClose, sendFinish);
              }
            }

            return {
              messages,
              steps,
              toolCalls: allToolCalls,
              toolResults: allToolResults,
              finishReason,
              totalUsage,
              output: undefined as TOutput,
            };
          }

          // Execute client tools (all have execute functions at this point)
          const clientToolResults = await Promise.all(
            nonProviderToolCalls.map(
              (toolCall): Promise<WorkflowToolExecutionResult> =>
                executeToolWithCallbacks(
                  toolCall,
                  effectiveTools as ToolSet,
                  iterMessages,
                  toolsContext,
                  currentStepNumber,
                  toolExecutionSandbox,
                ),
            ),
          );

          // For provider-executed tools, use the results from the stream
          const providerToolResultEntries = await Promise.all(
            providerToolCalls.map(async toolCall => ({
              toolCall,
              result: await resolveProviderToolResult(
                toolCall,
                providerExecutedToolResults,
                effectiveTools as ToolSet,
                download,
              ),
            })),
          );
          await Promise.all(
            providerToolResultEntries.flatMap(({ toolCall, result }) =>
              result == null
                ? []
                : [
                    recordProviderExecutedToolTelemetry(
                      toolCall,
                      result,
                      iterMessages,
                      currentStepNumber,
                    ),
                  ],
            ),
          );
          const providerToolResults = providerToolResultEntries.flatMap(
            ({ result }) => (result == null ? [] : [result]),
          );
          const continuationInvalidToolResults = invalidToolCalls.map(
            createInvalidToolResult,
          );

          // Combine executable/provider results in the original order,
          // while preserving invalid tool calls as error results for the
          // next model step without emitting them as synthetic UI success.
          const executedToolResults = toolCalls.flatMap(tc => {
            const clientResult = clientToolResults.find(
              r => r.modelResult.toolCallId === tc.toolCallId,
            );
            if (clientResult) return [clientResult];
            const providerResult = providerToolResults.find(
              r => r.modelResult.toolCallId === tc.toolCallId,
            );
            if (providerResult) return [providerResult];
            return [];
          });
          const continuationToolResults = toolCalls.flatMap(tc => {
            const invalidResult = continuationInvalidToolResults.find(
              r => r.toolCallId === tc.toolCallId,
            );
            if (invalidResult) return [invalidResult];
            const executedResult = executedToolResults.find(
              r => r.modelResult.toolCallId === tc.toolCallId,
            );
            if (executedResult) return [executedResult.modelResult];
            return [];
          });

          // Write tool results and step boundaries to the stream so the UI can
          // transition tool parts to the appropriate output state and properly
          // separate multi-step model calls in the message history.
          if (options.writable) {
            await writeToolResults(
              options.writable,
              executedToolResults.map(r => ({
                toolCallId: r.modelResult.toolCallId,
                toolName: r.modelResult.toolName,
                input: toolCalls.find(
                  tc => tc.toolCallId === r.modelResult.toolCallId,
                )?.input,
                output: r.rawOutput,
                isError: r.isError,
              })),
              true,
            );
          }

          // Track the tool calls and results for this step
          lastStepToolCalls = toolCalls.map(tc => ({
            type: 'tool-call' as const,
            toolCallId: tc.toolCallId,
            toolName: tc.toolName,
            input: tc.input,
          }));
          lastStepToolResults = executedToolResults.map(r => ({
            type: 'tool-result' as const,
            toolCallId: r.modelResult.toolCallId,
            toolName: r.modelResult.toolName,
            input: toolCalls.find(
              tc => tc.toolCallId === r.modelResult.toolCallId,
            )?.input,
            output: r.rawOutput,
          }));

          addToolResultsToStep(step, executedToolResults);

          result = await iterator.next(continuationToolResults);
        } else {
          // Final step with no tool calls - reset tracking
          lastStepToolCalls = [];
          lastStepToolResults = [];
          result = await iterator.next([]);
        }
      }

      // When the iterator completes normally, result.value contains the final
      // conversation prompt. Aborts inside the retryable model step are
      // returned as data so the workflow runtime does not retry them.
      if (result.done) {
        if (Array.isArray(result.value)) {
          finalMessages = result.value;
        } else if ('error' in result.value) {
          finalMessages = result.value.messages;
          terminalError = result.value.error;
          hasTerminalError = true;
        } else {
          finalMessages = result.value.messages;
          wasAborted = true;
          if (options.onAbort) {
            await options.onAbort({ steps });
          }
        }
      }
    } catch (error) {
      encounteredError = error;
      hasEncounteredError = true;
      // Check if this is an abort error
      if (isAbortError(error)) {
        wasAborted = true;
        if (options.onAbort) {
          await options.onAbort({ steps });
        }
      } else if (options.onError) {
        // Call onError for non-abort errors (including tool execution errors)
        await options.onError({ error });
      }
      await telemetryDispatcher.onError?.(error);
      // Don't throw yet - we want to call onEnd first
    }

    if (hasTerminalError) {
      if (options.onError) {
        await options.onError({ error: terminalError });
      }
      await telemetryDispatcher.onError?.(terminalError);
    }

    // Use the final messages from the iterator, or fall back to standardized messages
    const messages = (finalMessages ??
      prompt.messages) as unknown as ModelMessage[];

    // Parse structured output if output is specified (stream-level overrides constructor default)
    const effectiveOutput = (options.output ?? this.output) as
      | OutputSpecification<TOutput, TPartialOutput>
      | undefined;
    let experimentalOutput: TOutput = undefined as TOutput;
    if (effectiveOutput && steps.length > 0) {
      const lastStep = steps[steps.length - 1];
      const text = lastStep.text;
      if (text) {
        try {
          experimentalOutput = await effectiveOutput.parseCompleteOutput(
            { text },
            {
              response: lastStep.response,
              usage: lastStep.usage,
              finishReason: lastStep.finishReason,
            },
          );
        } catch (parseError) {
          // If there's already an error, don't override it
          // If not, set this as the error
          if (!hasEncounteredError) {
            encounteredError = parseError;
            hasEncounteredError = true;
          }
        }
      }
    }

    const lastStep = steps[steps.length - 1];
    const totalUsage = aggregateUsage(steps);
    const finishReason = lastStep?.finishReason ?? 'other';

    // Call onEnd callback if provided (always call, even on errors, but not on abort)
    if (mergedOnEnd && !wasAborted) {
      await mergedOnEnd({
        steps,
        messages: messages as ModelMessage[],
        text: lastStep?.text ?? '',
        finishReason,
        usage: totalUsage,
        totalUsage,
        runtimeContext,
        toolsContext: toolsContext as unknown as InferToolSetContext<TTools>,
        output: experimentalOutput,
      });
    }
    if (!wasAborted && steps.length > 0) {
      const telemetrySteps = steps.map(normalizeStepForTelemetry);
      const lastTelemetryStep = telemetrySteps[telemetrySteps.length - 1];
      await telemetryDispatcher.onEnd?.({
        ...lastTelemetryStep,
        steps: telemetrySteps,
        usage: totalUsage,
        totalUsage,
      });
    }

    // Re-throw any error that occurred
    if (hasEncounteredError) {
      // Close the stream before throwing
      if (options.writable) {
        const sendFinish = options.sendFinish ?? true;
        const preventClose = options.preventClose ?? false;
        if (sendFinish || !preventClose) {
          await closeStream(options.writable, preventClose, sendFinish);
        }
      }
      throw encounteredError;
    }

    // Close the writable stream
    if (options.writable) {
      const sendFinish = options.sendFinish ?? true;
      const preventClose = options.preventClose ?? false;
      if (sendFinish || !preventClose) {
        await closeStream(options.writable, preventClose, sendFinish);
      }
    }

    return {
      messages: messages as ModelMessage[],
      steps,
      toolCalls: lastStepToolCalls,
      toolResults: lastStepToolResults,
      finishReason,
      totalUsage,
      output: experimentalOutput,
      ...(hasTerminalError ? { error: terminalError } : {}),
    };
  }
}

function getModelInfo(model: LanguageModel): {
  provider: string;
  modelId: string;
} {
  return typeof model === 'string'
    ? { provider: model.split('/')[0] ?? 'gateway', modelId: model }
    : { provider: model.provider, modelId: model.modelId };
}

function normalizeStepForTelemetry<
  TOOLS extends ToolSet,
  RUNTIME_CONTEXT extends Context,
>(step: StepResult<TOOLS, RUNTIME_CONTEXT>) {
  return {
    ...step,
    model: step.model ?? { provider: 'unknown', modelId: 'unknown' },
  };
}

/**
 * Filter tools to only include the specified active tools.
 */
/**
 * Aggregate token usage across all steps.
 */
/**
 * Close the writable stream, optionally sending a finish chunk first.
 * This is a step function because writable.getWriter() and writable.close()
 * cannot be called in workflow context (sandbox limitation).
 */
async function closeStream(
  writable: WritableStream<any>,
  preventClose?: boolean,
  sendFinish?: boolean,
) {
  'use step';
  if (sendFinish) {
    const writer = writable.getWriter();
    try {
      await writer.write({ type: 'finish' });
    } finally {
      writer.releaseLock();
    }
  }
  if (!preventClose) {
    await writable.close();
  }
}

/**
 * Write tool-approval-request chunks to the writable stream.
 * These are consumed by useChat to show the approval UI.
 */
async function writeApprovalRequests(
  writable: WritableStream<any>,
  approvalRequests: Array<{
    approvalId: string;
    toolCallId: string;
    signature?: string;
  }>,
) {
  'use step';
  const writer = writable.getWriter();
  try {
    for (const request of approvalRequests) {
      await writer.write({
        type: 'tool-approval-request',
        approvalId: request.approvalId,
        toolCallId: request.toolCallId,
        ...(request.signature != null ? { signature: request.signature } : {}),
      });
    }
  } finally {
    writer.releaseLock();
  }
}

async function signWorkflowToolApproval({
  secret,
  approvalId,
  toolCallId,
  toolName,
  input,
}: {
  secret: WorkflowToolApprovalSecret;
  approvalId: string;
  toolCallId: string;
  toolName: string;
  input: unknown;
}): Promise<string> {
  'use step';

  return signToolApproval({
    secret: getWorkflowToolApprovalSecret(secret),
    approvalId,
    toolCallId,
    toolName,
    input,
  });
}

async function verifyWorkflowToolApprovalSignature({
  secret,
  signature,
  approvalId,
  toolCallId,
  toolName,
  input,
}: {
  secret: WorkflowToolApprovalSecret;
  signature: string;
  approvalId: string;
  toolCallId: string;
  toolName: string;
  input: unknown;
}): Promise<boolean> {
  'use step';

  return verifyToolApprovalSignature({
    secret: getWorkflowToolApprovalSecret(secret),
    signature,
    approvalId,
    toolCallId,
    toolName,
    input,
  });
}

async function validateWorkflowToolApprovalSignature({
  secret,
  signature,
  approvalId,
  toolCallId,
  toolName,
  input,
}: {
  secret: WorkflowToolApprovalSecret | undefined;
  signature: string | undefined;
  approvalId: string;
  toolCallId: string;
  toolName: string;
  input: unknown;
}): Promise<void> {
  if (secret == null) {
    return;
  }

  if (signature == null) {
    throw new InvalidToolApprovalSignatureError({
      approvalId,
      toolCallId,
      reason: 'missing signature',
    });
  }

  const valid = await verifyWorkflowToolApprovalSignature({
    secret,
    signature,
    approvalId,
    toolCallId,
    toolName,
    input,
  });

  if (!valid) {
    throw new InvalidToolApprovalSignatureError({
      approvalId,
      toolCallId,
      reason: 'invalid signature',
    });
  }
}

function getWorkflowToolApprovalSecret({
  environmentVariable,
}: WorkflowToolApprovalSecret): string {
  const secret = process.env[environmentVariable];

  if (secret == null) {
    throw new Error(
      `Tool approval secret environment variable "${environmentVariable}" is not set`,
    );
  }

  return secret;
}

async function writeToolResults(
  writable: WritableStream<any>,
  results: Array<{
    toolCallId: string;
    toolName: string;
    input: unknown;
    output: unknown;
    isError: boolean;
  }>,
  writeStepBoundary = false,
) {
  'use step';
  const writer = writable.getWriter();
  try {
    for (const r of results) {
      await writer.write(
        r.isError
          ? {
              type: 'tool-error',
              toolCallId: r.toolCallId,
              toolName: r.toolName,
              input: r.input,
              error: r.output,
            }
          : {
              type: 'tool-result',
              toolCallId: r.toolCallId,
              toolName: r.toolName,
              input: r.input,
              output: r.output,
            },
      );
    }
    if (writeStepBoundary) {
      // Emit step boundaries so the UI message history properly separates
      // the tool call step from the subsequent text step. This ensures
      // convertToModelMessages creates separate assistant messages for
      // tool calls and text responses.
      await writer.write({ type: 'finish-step' });
      await writer.write({ type: 'start-step' });
    }
  } finally {
    writer.releaseLock();
  }
}

async function writeApprovalToolResults(
  writable: WritableStream<any>,
  approvedResults: Array<{
    toolCallId: string;
    toolName: string;
    input: unknown;
    output: unknown;
  }>,
  deniedResults: Array<{ toolCallId: string }>,
) {
  'use step';
  const writer = writable.getWriter();
  try {
    for (const r of approvedResults) {
      await writer.write({
        type: 'tool-result',
        toolCallId: r.toolCallId,
        toolName: r.toolName,
        input: r.input,
        output: r.output,
      });
    }
    for (const r of deniedResults) {
      await writer.write({
        type: 'tool-output-denied',
        toolCallId: r.toolCallId,
      });
    }
    await writer.write({ type: 'finish-step' });
    await writer.write({ type: 'start-step' });
  } finally {
    writer.releaseLock();
  }
}

function aggregateUsage(steps: StepResult<any, any>[]): LanguageModelUsage {
  let inputTokens = 0;
  let outputTokens = 0;
  for (const step of steps) {
    inputTokens += step.usage?.inputTokens ?? 0;
    outputTokens += step.usage?.outputTokens ?? 0;
  }
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  } as LanguageModelUsage;
}

async function resolveProviderToolResult(
  toolCall: { toolCallId: string; toolName: string; input: unknown },
  providerExecutedToolResults?: Map<
    string,
    { toolCallId: string; toolName: string; result: unknown; isError?: boolean }
  >,
  tools?: ToolSet,
  download?: DownloadFunction,
): Promise<WorkflowToolExecutionResult | undefined> {
  const streamResult = providerExecutedToolResults?.get(toolCall.toolCallId);
  if (!streamResult) {
    const tool = tools?.[toolCall.toolName];
    if (
      tool?.type === 'provider' &&
      tool.isProviderExecuted &&
      tool.supportsDeferredResults
    ) {
      return undefined;
    }

    console.warn(
      `[WorkflowAgent] Provider-executed tool "${toolCall.toolName}" (${toolCall.toolCallId}) ` +
        `did not receive a result from the stream. This may indicate a provider issue.`,
    );
    return {
      modelResult: {
        type: 'tool-result' as const,
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        output: {
          type: 'text' as const,
          value: '',
        },
      },
      rawOutput: '',
      isError: false,
    };
  }

  const result = streamResult.result;
  const errorMode = streamResult.isError
    ? typeof result === 'string'
      ? 'text'
      : 'json'
    : 'none';

  return {
    modelResult: {
      type: 'tool-result' as const,
      toolCallId: toolCall.toolCallId,
      toolName: toolCall.toolName,
      output: await createLanguageModelToolResultOutput({
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        input: toolCall.input,
        output: result,
        tool: tools?.[toolCall.toolName],
        errorMode,
        supportedUrls: {},
        download,
      }),
    },
    rawOutput: result,
    isError: streamResult.isError === true,
  };
}

function createInvalidToolResult(toolCall: {
  toolCallId: string;
  toolName: string;
  error?: unknown;
}): LanguageModelV4ToolResultPart {
  return {
    type: 'tool-result' as const,
    toolCallId: toolCall.toolCallId,
    toolName: toolCall.toolName,
    output: {
      type: 'error-text' as const,
      value: getErrorMessage(toolCall.error),
    },
  };
}

function getToolCallbackMessages(
  messages: LanguageModelV4Prompt,
): ModelMessage[] {
  const withoutAssistantToolCall =
    messages.at(-1)?.role === 'assistant' ? messages.slice(0, -1) : messages;
  return withoutAssistantToolCall as unknown as ModelMessage[];
}

async function executeTool(
  toolCall: { toolCallId: string; toolName: string; input: unknown },
  tools: ToolSet,
  messages: LanguageModelV4Prompt,
  context?: unknown,
  abortSignal?: AbortSignal,
  download?: DownloadFunction,
  sandbox?: SandboxSession,
): Promise<WorkflowToolExecutionResult> {
  const tool = tools[toolCall.toolName];
  if (!tool) throw new Error(`Tool "${toolCall.toolName}" not found`);
  if (typeof tool.execute !== 'function') {
    throw new Error(
      `Tool "${toolCall.toolName}" does not have an execute function. ` +
        `Client-side tools should be filtered before calling executeTool.`,
    );
  }
  // Input is already parsed and validated by streamModelCall's parseToolCall
  const parsedInput = toolCall.input;
  let toolResult: unknown;

  try {
    // Extract execute function to avoid binding `this` to the tool object.
    // If we called `tool.execute(...)` directly, JavaScript would bind `this`
    // to `tool`, which contains non-serializable properties like `inputSchema`.
    // When the execute function is a workflow step (marked with 'use step'),
    // the step system captures `this` for serialization, causing failures.
    const { execute } = tool;
    toolResult = await execute(parsedInput, {
      toolCallId: toolCall.toolCallId,
      // Pass the conversation messages to the tool so it has context about the conversation
      messages,
      // Pass the effective agent signal so in-flight tool work can cooperatively cancel
      abortSignal,
      // Pass per-tool context to the tool (resolved from `toolsContext`)
      context,
      experimental_sandbox: sandbox,
    });
  } catch (error) {
    // Convert tool errors to error-text results sent back to the model,
    // allowing the agent to recover rather than killing the entire stream.
    // This aligns with AI SDK's streamText behavior for individual tool failures.
    const errorMessage = getErrorMessage(error);
    return {
      modelResult: {
        type: 'tool-result',
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        output: await createLanguageModelToolResultOutput({
          toolCallId: toolCall.toolCallId,
          toolName: toolCall.toolName,
          input: parsedInput,
          output: errorMessage,
          tool,
          errorMode: 'text',
          supportedUrls: {},
          download,
        }),
      },
      rawOutput: errorMessage,
      isError: true,
    };
  }

  return {
    modelResult: {
      type: 'tool-result' as const,
      toolCallId: toolCall.toolCallId,
      toolName: toolCall.toolName,
      output: await createLanguageModelToolResultOutput({
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        input: parsedInput,
        output: toolResult,
        tool,
        errorMode: 'none',
        supportedUrls: {},
        download,
      }),
    },
    rawOutput: toolResult,
    isError: false,
  };
}
