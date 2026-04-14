import type {
  JSONValue,
  LanguageModelV4CallOptions,
  LanguageModelV4Prompt,
  LanguageModelV4StreamPart,
  LanguageModelV4ToolResultPart,
  SharedV4ProviderOptions,
} from '@ai-sdk/provider';
import {
  type Experimental_LanguageModelStreamPart as ModelCallStreamPart,
  type FinishReason,
  type LanguageModelResponseMetadata,
  type LanguageModelUsage,
  type ModelMessage,
  Output,
  type StepResult,
  type StopCondition,
  type StreamTextOnStepFinishCallback,
  type SystemModelMessage,
  type ToolCallRepairFunction,
  type ToolChoice,
  type ToolSet,
  type UIMessage,
  LanguageModel,
} from 'ai';
import {
  convertToLanguageModelPrompt,
  mergeAbortSignals,
  mergeCallbacks,
  standardizePrompt,
} from 'ai/internal';
import { streamTextIterator } from './stream-text-iterator.js';
import type { CompatibleLanguageModel } from './types.js';

// Re-export for consumers
export type { CompatibleLanguageModel } from './types.js';

/**
 * Infer the type of the tools of a workflow agent.
 */
export type InferWorkflowAgentTools<WORKFLOW_AGENT> =
  WORKFLOW_AGENT extends WorkflowAgent<infer TOOLS> ? TOOLS : never;

/**
 * Infer the UI message type of a workflow agent.
 */
export type InferWorkflowAgentUIMessage<
  _WORKFLOW_AGENT,
  MESSAGE_METADATA = unknown,
> = UIMessage<MESSAGE_METADATA>;

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

/**
 * Provider-specific options type. This is equivalent to SharedV4ProviderOptions from @ai-sdk/provider.
 */
export type ProviderOptions = SharedV4ProviderOptions;

/**
 * Telemetry settings for observability.
 */
export interface TelemetrySettings {
  /**
   * Enable or disable telemetry. Defaults to true.
   */
  isEnabled?: boolean;

  /**
   * Identifier for this function. Used to group telemetry data by function.
   */
  functionId?: string;

  /**
   * Additional information to include in the telemetry data.
   */
  metadata?: Record<
    string,
    | string
    | number
    | boolean
    | Array<string | number | boolean>
    | null
    | undefined
  >;

  /**
   * Enable or disable input recording. Enabled by default.
   *
   * You might want to disable input recording to avoid recording sensitive
   * information, to reduce data transfers, or to increase performance.
   */
  recordInputs?: boolean;

  /**
   * Enable or disable output recording. Enabled by default.
   *
   * You might want to disable output recording to avoid recording sensitive
   * information, to reduce data transfers, or to increase performance.
   */
  recordOutputs?: boolean;

  /**
   * Custom tracer for the telemetry.
   */
  tracer?: unknown;
}

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
   * Maximum number of retries. Set to 0 to disable retries.
   * Note: In workflow context, retries are typically handled by the workflow step mechanism.
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
   * Additional provider-specific options. They are passed through
   * to the provider from the AI SDK and enable provider-specific
   * functionality that can be fully encapsulated in the provider.
   */
  providerOptions?: ProviderOptions;
}

/**
 * Information passed to the prepareStep callback.
 */
export interface PrepareStepInfo<TTools extends ToolSet = ToolSet> {
  /**
   * The current model configuration (string or function).
   * The function should return a LanguageModelV4 instance.
   */
  model: LanguageModel;

  /**
   * The current step number (0-indexed).
   */
  stepNumber: number;

  /**
   * All previous steps with their results.
   */
  steps: StepResult<TTools, any>[];

  /**
   * The messages that will be sent to the model.
   * This is the LanguageModelV4Prompt format used internally.
   */
  messages: LanguageModelV4Prompt;

  /**
   * The context passed via the experimental_context setting (experimental).
   */
  experimental_context: unknown;
}

/**
 * Return type from the prepareStep callback.
 * All properties are optional - only return the ones you want to override.
 */
export interface PrepareStepResult extends Partial<GenerationSettings> {
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
  activeTools?: string[];

  /**
   * Context that is passed into tool execution. Experimental.
   * Changing the context will affect the context in this step and all subsequent steps.
   */
  experimental_context?: unknown;
}

/**
 * Callback function called before each step in the agent loop.
 * Use this to modify settings, manage context, or implement dynamic behavior.
 */
export type PrepareStepCallback<TTools extends ToolSet = ToolSet> = (
  info: PrepareStepInfo<TTools>,
) => PrepareStepResult | Promise<PrepareStepResult>;

/**
 * Options passed to the prepareCall callback.
 */
export interface PrepareCallOptions<
  TTools extends ToolSet = ToolSet,
> extends Partial<GenerationSettings> {
  model: LanguageModel;
  tools: TTools;
  instructions?: string | SystemModelMessage | Array<SystemModelMessage>;
  toolChoice?: ToolChoice<TTools>;
  experimental_telemetry?: TelemetrySettings;
  experimental_context?: unknown;
  messages: ModelMessage[];
}

/**
 * Result of the prepareCall callback. All fields are optional —
 * only returned fields override the defaults.
 * Note: `tools` cannot be overridden via prepareCall because they are
 * bound at construction time for type safety.
 */
export type PrepareCallResult<TTools extends ToolSet = ToolSet> = Partial<
  Omit<PrepareCallOptions<TTools>, 'tools'>
>;

/**
 * Callback called once before the agent loop starts to transform call parameters.
 */
export type PrepareCallCallback<TTools extends ToolSet = ToolSet> = (
  options: PrepareCallOptions<TTools>,
) => PrepareCallResult<TTools> | Promise<PrepareCallResult<TTools>>;

/**
 * Configuration options for creating a {@link WorkflowAgent} instance.
 */
export interface WorkflowAgentOptions<
  TTools extends ToolSet = ToolSet,
> extends GenerationSettings {
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
  instructions?: string | SystemModelMessage | Array<SystemModelMessage>;

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
   * Optional telemetry configuration (experimental).
   */
  experimental_telemetry?: TelemetrySettings;

  /**
   * Default context that is passed into tool execution for every stream call on this agent.
   *
   * Per-stream `experimental_context` values passed to `stream()` override this default.
   * Experimental (can break in patch releases).
   * @default undefined
   */
  experimental_context?: unknown;

  /**
   * Default callback function called before each step in the agent loop.
   * Use this to modify settings, manage context, or inject messages dynamically
   * for every stream call on this agent instance.
   *
   * Per-stream `prepareStep` values passed to `stream()` override this default.
   */
  prepareStep?: PrepareStepCallback<TTools>;

  /**
   * Callback function to be called after each step completes.
   */
  onStepFinish?: StreamTextOnStepFinishCallback<ToolSet, any>;

  /**
   * Callback that is called when the LLM response and all request tool executions are finished.
   */
  onFinish?: StreamTextOnFinishCallback<ToolSet>;

  /**
   * Callback called when the agent starts streaming, before any LLM calls.
   */
  experimental_onStart?: WorkflowAgentOnStartCallback;

  /**
   * Callback called before each step (LLM call) begins.
   */
  experimental_onStepStart?: WorkflowAgentOnStepStartCallback;

  /**
   * Callback called before a tool's execute function runs.
   */
  experimental_onToolCallStart?: WorkflowAgentOnToolCallStartCallback;

  /**
   * Callback called after a tool execution completes.
   */
  experimental_onToolCallFinish?: WorkflowAgentOnToolCallFinishCallback;

  /**
   * Prepare the parameters for the stream call.
   * Called once before the agent loop starts. Use this to transform
   * model, tools, instructions, or other settings based on runtime context.
   */
  prepareCall?: PrepareCallCallback<TTools>;
}

/**
 * Callback that is called when the LLM response and all request tool executions are finished.
 */
export type StreamTextOnFinishCallback<
  TTools extends ToolSet = ToolSet,
  OUTPUT = never,
> = (event: {
  /**
   * Details for all steps.
   */
  readonly steps: StepResult<TTools, any>[];

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
  readonly totalUsage: LanguageModelUsage;

  /**
   * Context that is passed into tool execution.
   */
  readonly experimental_context: unknown;

  /**
   * The generated structured output. It uses the `output` specification.
   * Only available when `output` is specified.
   */
  readonly output: OUTPUT;
}) => PromiseLike<void> | void;

/**
 * Callback that is invoked when an error occurs during streaming.
 */
export type StreamTextOnErrorCallback = (event: {
  error: unknown;
}) => PromiseLike<void> | void;

/**
 * Callback that is set using the `onAbort` option.
 */
export type StreamTextOnAbortCallback<TTools extends ToolSet = ToolSet> =
  (event: {
    /**
     * Details for all previously finished steps.
     */
    readonly steps: StepResult<TTools, any>[];
  }) => PromiseLike<void> | void;

/**
 * Callback that is called when the agent starts streaming, before any LLM calls.
 */
export type WorkflowAgentOnStartCallback = (event: {
  /** The model being used */
  readonly model: LanguageModel;
  /** The messages being sent */
  readonly messages: ModelMessage[];
}) => PromiseLike<void> | void;

/**
 * Callback that is called before each step (LLM call) begins.
 */
export type WorkflowAgentOnStepStartCallback = (event: {
  /** The current step number (0-based) */
  readonly stepNumber: number;
  /** The model being used for this step */
  readonly model: LanguageModel;
  /** The messages being sent for this step */
  readonly messages: ModelMessage[];
}) => PromiseLike<void> | void;

/**
 * Callback that is called before a tool's execute function runs.
 */
export type WorkflowAgentOnToolCallStartCallback = (event: {
  /** The tool call being executed */
  readonly toolCall: ToolCall;
}) => PromiseLike<void> | void;

/**
 * Callback that is called after a tool execution completes.
 */
export type WorkflowAgentOnToolCallFinishCallback = (event: {
  /** The tool call that was executed */
  readonly toolCall: ToolCall;
  /** The tool result (undefined if execution failed) */
  readonly result?: unknown;
  /** The error if execution failed */
  readonly error?: unknown;
}) => PromiseLike<void> | void;

/**
 * Options for the {@link WorkflowAgent.stream} method.
 */
export interface WorkflowAgentStreamOptions<
  TTools extends ToolSet = ToolSet,
  OUTPUT = never,
  PARTIAL_OUTPUT = never,
> extends Partial<GenerationSettings> {
  /**
   * The conversation messages to process. Should follow the AI SDK's ModelMessage format.
   */
  messages: ModelMessage[];

  /**
   * Optional system prompt override. If provided, overrides the system prompt from the constructor.
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
    | StopCondition<NoInfer<ToolSet>, any>
    | Array<StopCondition<NoInfer<ToolSet>, any>>;

  /**
   * Maximum number of sequential LLM calls (steps), e.g. when you use tool calls.
   * A maximum number can be set to prevent infinite loops in the case of misconfigured tools.
   * By default, it's unlimited (the agent loops until completion).
   */
  maxSteps?: number;

  /**
   * The tool choice strategy. Default: 'auto'.
   * Overrides the toolChoice from the constructor if provided.
   */
  toolChoice?: ToolChoice<TTools>;

  /**
   * Limits the tools that are available for the model to call without
   * changing the tool call and result types in the result.
   */
  activeTools?: Array<keyof NoInfer<TTools>>;

  /**
   * Optional telemetry configuration (experimental).
   */
  experimental_telemetry?: TelemetrySettings;

  /**
   * Context that is passed into tool execution.
   * Experimental (can break in patch releases).
   * @default undefined
   */
  experimental_context?: unknown;

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
   * Callback function to be called after each step completes.
   */
  onStepFinish?: StreamTextOnStepFinishCallback<TTools, any>;

  /**
   * Callback that is invoked when an error occurs during streaming.
   * You can use it to log errors.
   */
  onError?: StreamTextOnErrorCallback;

  /**
   * Callback that is called when the LLM response and all request tool executions
   * (for tools that have an `execute` function) are finished.
   */
  onFinish?: StreamTextOnFinishCallback<TTools, OUTPUT>;

  /**
   * Callback that is called when the operation is aborted.
   */
  onAbort?: StreamTextOnAbortCallback<TTools>;

  /**
   * Callback called when the agent starts streaming, before any LLM calls.
   */
  experimental_onStart?: WorkflowAgentOnStartCallback;

  /**
   * Callback called before each step (LLM call) begins.
   */
  experimental_onStepStart?: WorkflowAgentOnStepStartCallback;

  /**
   * Callback called before a tool's execute function runs.
   */
  experimental_onToolCallStart?: WorkflowAgentOnToolCallStartCallback;

  /**
   * Callback called after a tool execution completes.
   */
  experimental_onToolCallFinish?: WorkflowAgentOnToolCallFinishCallback;

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
  prepareStep?: PrepareStepCallback<TTools>;

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
}

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
export class WorkflowAgent<TBaseTools extends ToolSet = ToolSet> {
  private model: LanguageModel;
  /**
   * The tool set configured for this agent.
   */
  public readonly tools: TBaseTools;
  private instructions?:
    | string
    | SystemModelMessage
    | Array<SystemModelMessage>;
  private generationSettings: GenerationSettings;
  private toolChoice?: ToolChoice<TBaseTools>;
  private telemetry?: TelemetrySettings;
  private experimentalContext: unknown;
  private prepareStep?: PrepareStepCallback<TBaseTools>;
  private constructorOnStepFinish?: StreamTextOnStepFinishCallback<
    ToolSet,
    any
  >;
  private constructorOnFinish?: StreamTextOnFinishCallback<ToolSet>;
  private constructorOnStart?: WorkflowAgentOnStartCallback;
  private constructorOnStepStart?: WorkflowAgentOnStepStartCallback;
  private constructorOnToolCallStart?: WorkflowAgentOnToolCallStartCallback;
  private constructorOnToolCallFinish?: WorkflowAgentOnToolCallFinishCallback;
  private prepareCall?: PrepareCallCallback<TBaseTools>;

  constructor(options: WorkflowAgentOptions<TBaseTools>) {
    this.model = options.model;
    this.tools = (options.tools ?? {}) as TBaseTools;
    // `instructions` takes precedence over deprecated `system`
    this.instructions = options.instructions ?? options.system;
    this.toolChoice = options.toolChoice;
    this.telemetry = options.experimental_telemetry;
    this.experimentalContext = options.experimental_context;
    this.prepareStep = options.prepareStep;
    this.constructorOnStepFinish = options.onStepFinish;
    this.constructorOnFinish = options.onFinish;
    this.constructorOnStart = options.experimental_onStart;
    this.constructorOnStepStart = options.experimental_onStepStart;
    this.constructorOnToolCallStart = options.experimental_onToolCallStart;
    this.constructorOnToolCallFinish = options.experimental_onToolCallFinish;
    this.prepareCall = options.prepareCall;

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
      providerOptions: options.providerOptions,
    };
  }

  generate() {
    throw new Error('Not implemented');
  }

  async stream<
    TTools extends TBaseTools = TBaseTools,
    OUTPUT = never,
    PARTIAL_OUTPUT = never,
  >(
    options: WorkflowAgentStreamOptions<TTools, OUTPUT, PARTIAL_OUTPUT>,
  ): Promise<WorkflowAgentStreamResult<TTools, OUTPUT>> {
    // Call prepareCall to transform parameters before the agent loop
    let effectiveModel: LanguageModel = this.model;
    let effectiveInstructions = options.system ?? this.instructions;
    let effectiveMessages = options.messages;
    let effectiveGenerationSettings = { ...this.generationSettings };
    let effectiveExperimentalContext =
      options.experimental_context ?? this.experimentalContext;
    let effectiveToolChoiceFromPrepare = options.toolChoice ?? this.toolChoice;
    let effectiveTelemetryFromPrepare =
      options.experimental_telemetry ?? this.telemetry;

    if (this.prepareCall) {
      const prepared = await this.prepareCall({
        model: effectiveModel,
        tools: this.tools,
        instructions: effectiveInstructions,
        toolChoice: effectiveToolChoiceFromPrepare as ToolChoice<TBaseTools>,
        experimental_telemetry: effectiveTelemetryFromPrepare,
        experimental_context: effectiveExperimentalContext,
        messages: effectiveMessages as ModelMessage[],
        ...effectiveGenerationSettings,
      } as PrepareCallOptions<TBaseTools>);

      if (prepared.model !== undefined) effectiveModel = prepared.model;
      if (prepared.instructions !== undefined)
        effectiveInstructions = prepared.instructions;
      if (prepared.messages !== undefined)
        effectiveMessages =
          prepared.messages as WorkflowAgentStreamOptions<TTools>['messages'];
      if (prepared.experimental_context !== undefined)
        effectiveExperimentalContext = prepared.experimental_context;
      if (prepared.toolChoice !== undefined)
        effectiveToolChoiceFromPrepare =
          prepared.toolChoice as ToolChoice<TBaseTools>;
      if (prepared.experimental_telemetry !== undefined)
        effectiveTelemetryFromPrepare = prepared.experimental_telemetry;
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
      if (prepared.headers !== undefined)
        effectiveGenerationSettings.headers = prepared.headers;
      if (prepared.providerOptions !== undefined)
        effectiveGenerationSettings.providerOptions = prepared.providerOptions;
    }

    const prompt = await standardizePrompt({
      system: effectiveInstructions,
      messages: effectiveMessages,
    });

    // Process tool approval responses before starting the agent loop.
    // This mirrors how stream-text.ts handles tool-approval-response parts:
    // approved tools are executed, denied tools get denial results, and
    // approval parts are stripped from the messages.
    const { approvedToolApprovals, deniedToolApprovals } =
      collectToolApprovalsFromMessages(prompt.messages);

    if (approvedToolApprovals.length > 0 || deniedToolApprovals.length > 0) {
      const _toolResultMessages: ModelMessage[] = [];
      const toolResultContent: Array<{
        type: 'tool-result';
        toolCallId: string;
        toolName: string;
        output:
          | { type: 'text'; value: string }
          | { type: 'json'; value: JSONValue }
          | { type: 'execution-denied'; reason: string | undefined };
      }> = [];

      // Execute approved tools
      for (const approval of approvedToolApprovals) {
        const tool = (this.tools as ToolSet)[approval.toolName];
        if (tool && typeof tool.execute === 'function') {
          try {
            const { execute } = tool;
            const toolResult = await execute(approval.input, {
              toolCallId: approval.toolCallId,
              messages: [],
              context: effectiveExperimentalContext,
            });
            toolResultContent.push({
              type: 'tool-result' as const,
              toolCallId: approval.toolCallId,
              toolName: approval.toolName,
              output:
                typeof toolResult === 'string'
                  ? { type: 'text' as const, value: toolResult }
                  : { type: 'json' as const, value: toolResult },
            });
          } catch (error) {
            toolResultContent.push({
              type: 'tool-result' as const,
              toolCallId: approval.toolCallId,
              toolName: approval.toolName,
              output: {
                type: 'text' as const,
                value: getErrorMessage(error),
              },
            });
          }
        }
      }

      // Create denial results for denied tools
      for (const denial of deniedToolApprovals) {
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

      // Strip approval parts from messages and inject tool results
      const cleanedMessages: ModelMessage[] = [];
      for (const msg of prompt.messages) {
        if (msg.role === 'assistant' && Array.isArray(msg.content)) {
          const filtered = (msg.content as any[]).filter(
            (p: any) => p.type !== 'tool-approval-request',
          );
          if (filtered.length > 0) {
            cleanedMessages.push({ ...msg, content: filtered });
          }
        } else if (msg.role === 'tool') {
          const filtered = (msg.content as any[]).filter(
            (p: any) => p.type !== 'tool-approval-response',
          );
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
        const approvedResults = toolResultContent
          .filter(r => r.output.type !== 'execution-denied')
          .map(r => ({
            toolCallId: r.toolCallId,
            toolName: r.toolName,
            input: approvedToolApprovals.find(
              a => a.toolCallId === r.toolCallId,
            )?.input,
            output: 'value' in r.output ? r.output.value : undefined,
          }));
        const deniedResults = toolResultContent
          .filter(r => r.output.type === 'execution-denied')
          .map(r => ({ toolCallId: r.toolCallId }));
        await writeApprovalToolResults(
          options.writable,
          approvedResults,
          deniedResults,
        );
      }
    }

    const modelPrompt = await convertToLanguageModelPrompt({
      prompt,
      supportedUrls: {},
      download: options.experimental_download,
    });

    const effectiveAbortSignal = mergeAbortSignals(
      options.abortSignal ?? effectiveGenerationSettings.abortSignal,
      options.timeout != null
        ? AbortSignal.timeout(options.timeout)
        : undefined,
    );

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
      ...(options.providerOptions !== undefined && {
        providerOptions: options.providerOptions,
      }),
    };

    // Merge constructor + stream callbacks (constructor first, then stream)
    const mergedOnStepFinish = mergeCallbacks(
      this.constructorOnStepFinish as
        | StreamTextOnStepFinishCallback<TTools, any>
        | undefined,
      options.onStepFinish,
    );
    const mergedOnFinish = mergeCallbacks(
      this.constructorOnFinish as
        | StreamTextOnFinishCallback<TTools, OUTPUT>
        | undefined,
      options.onFinish,
    );
    const mergedOnStart = mergeCallbacks(
      this.constructorOnStart,
      options.experimental_onStart,
    );
    const mergedOnStepStart = mergeCallbacks(
      this.constructorOnStepStart,
      options.experimental_onStepStart,
    );
    const mergedOnToolCallStart = mergeCallbacks(
      this.constructorOnToolCallStart,
      options.experimental_onToolCallStart,
    );
    const mergedOnToolCallFinish = mergeCallbacks(
      this.constructorOnToolCallFinish,
      options.experimental_onToolCallFinish,
    );

    // Determine effective tool choice
    const effectiveToolChoice = effectiveToolChoiceFromPrepare;

    // Merge telemetry settings
    const effectiveTelemetry = effectiveTelemetryFromPrepare;

    // Filter tools if activeTools is specified
    const effectiveTools =
      options.activeTools && options.activeTools.length > 0
        ? filterTools(this.tools, options.activeTools as string[])
        : this.tools;

    // Initialize context
    let experimentalContext = effectiveExperimentalContext;

    const steps: StepResult<TTools, any>[] = [];

    // Track tool calls and results from the last step for the result
    let lastStepToolCalls: ToolCall[] = [];
    let lastStepToolResults: ToolResult[] = [];

    // Call onStart before the agent loop
    if (mergedOnStart) {
      await mergedOnStart({
        model: effectiveModel,
        messages: effectiveMessages as ModelMessage[],
      });
    }

    // Helper to wrap executeTool with onToolCallStart/onToolCallFinish callbacks
    const executeToolWithCallbacks = async (
      toolCall: { toolCallId: string; toolName: string; input: unknown },
      tools: ToolSet,
      messages: LanguageModelV4Prompt,
      context?: unknown,
    ): Promise<LanguageModelV4ToolResultPart> => {
      if (mergedOnToolCallStart) {
        await mergedOnToolCallStart({
          toolCall: {
            type: 'tool-call',
            toolCallId: toolCall.toolCallId,
            toolName: toolCall.toolName,
            input: toolCall.input,
          },
        });
      }
      let result: LanguageModelV4ToolResultPart;
      try {
        result = await executeTool(toolCall, tools, messages, context);
      } catch (err) {
        if (mergedOnToolCallFinish) {
          await mergedOnToolCallFinish({
            toolCall: {
              type: 'tool-call',
              toolCallId: toolCall.toolCallId,
              toolName: toolCall.toolName,
              input: toolCall.input,
            },
            error: err,
          });
        }
        throw err;
      }
      if (mergedOnToolCallFinish) {
        const isError =
          result.output &&
          'type' in result.output &&
          (result.output.type === 'error-text' ||
            result.output.type === 'error-json');
        await mergedOnToolCallFinish({
          toolCall: {
            type: 'tool-call',
            toolCallId: toolCall.toolCallId,
            toolName: toolCall.toolName,
            input: toolCall.input,
          },
          ...(isError
            ? {
                error:
                  'value' in result.output ? result.output.value : undefined,
              }
            : {
                result:
                  result.output && 'value' in result.output
                    ? result.output.value
                    : undefined,
              }),
        });
      }
      return result;
    };

    // Check for abort before starting
    if (mergedGenerationSettings.abortSignal?.aborted) {
      if (options.onAbort) {
        await options.onAbort({ steps });
      }
      return {
        messages: options.messages as unknown as ModelMessage[],
        steps,
        toolCalls: [],
        toolResults: [],
        output: undefined as OUTPUT,
      };
    }

    const iterator = streamTextIterator({
      model: effectiveModel,
      tools: effectiveTools as ToolSet,
      writable: options.writable,
      prompt: modelPrompt,
      stopConditions: options.stopWhen,
      maxSteps: options.maxSteps,
      onStepFinish: mergedOnStepFinish,
      onStepStart: mergedOnStepStart,
      onError: options.onError,
      prepareStep:
        options.prepareStep ??
        (this.prepareStep as PrepareStepCallback<ToolSet> | undefined),
      generationSettings: mergedGenerationSettings,
      toolChoice: effectiveToolChoice as ToolChoice<ToolSet>,
      experimental_context: experimentalContext,
      experimental_telemetry: effectiveTelemetry,
      includeRawChunks: options.includeRawChunks ?? false,
      repairToolCall:
        options.experimental_repairToolCall as ToolCallRepairFunction<ToolSet>,
      responseFormat: await options.output?.responseFormat,
    });

    // Track the final conversation messages from the iterator
    let finalMessages: LanguageModelV4Prompt | undefined;
    let encounteredError: unknown;
    let wasAborted = false;

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
          context,
          providerExecutedToolResults,
        } = result.value;
        if (step) {
          steps.push(step as unknown as StepResult<TTools, any>);
        }
        if (context !== undefined) {
          experimentalContext = context;
        }

        // Only execute tools if there are tool calls
        if (toolCalls.length > 0) {
          // Separate provider-executed tool calls from client-executed ones
          const nonProviderToolCalls = toolCalls.filter(
            tc => !tc.providerExecuted,
          );
          const providerToolCalls = toolCalls.filter(tc => tc.providerExecuted);

          // Check which tools need approval (can be async)
          const approvalNeeded = await Promise.all(
            nonProviderToolCalls.map(async tc => {
              const tool = (effectiveTools as ToolSet)[tc.toolName];
              if (!tool) return false;
              if (tool.needsApproval == null) return false;
              if (typeof tool.needsApproval === 'boolean')
                return tool.needsApproval;
              return tool.needsApproval(tc.input, {
                toolCallId: tc.toolCallId,
                messages: iterMessages as unknown as ModelMessage[],
                context: experimentalContext,
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
                (toolCall): Promise<LanguageModelV4ToolResultPart> =>
                  executeToolWithCallbacks(
                    toolCall,
                    effectiveTools as ToolSet,
                    iterMessages,
                    experimentalContext,
                  ),
              ),
            );

            // Collect provider tool results
            const providerResults: LanguageModelV4ToolResultPart[] =
              providerToolCalls.map(toolCall =>
                resolveProviderToolResult(
                  toolCall,
                  providerExecutedToolResults,
                ),
              );

            const resolvedResults = [...executableResults, ...providerResults];

            const allToolCalls: ToolCall[] = toolCalls.map(tc => ({
              type: 'tool-call' as const,
              toolCallId: tc.toolCallId,
              toolName: tc.toolName,
              input: tc.input,
            }));

            const allToolResults: ToolResult[] = resolvedResults.map(r => ({
              type: 'tool-result' as const,
              toolCallId: r.toolCallId,
              toolName: r.toolName,
              input: toolCalls.find(tc => tc.toolCallId === r.toolCallId)
                ?.input,
              output: 'value' in r.output ? r.output.value : undefined,
            }));

            if (resolvedResults.length > 0) {
              iterMessages.push({
                role: 'tool',
                content: resolvedResults,
              });
            }

            const messages = iterMessages as unknown as ModelMessage[];

            if (mergedOnFinish && !wasAborted) {
              const lastStep = steps[steps.length - 1];
              await mergedOnFinish({
                steps,
                messages,
                text: lastStep?.text ?? '',
                finishReason: lastStep?.finishReason ?? 'other',
                totalUsage: aggregateUsage(steps),
                experimental_context: experimentalContext,
                output: undefined as OUTPUT,
              });
            }

            // Emit tool-approval-request chunks for tools that need approval
            // so useChat can show the approval UI
            if (options.writable) {
              const approvalToolCalls = pausedToolCalls.filter((_, i) => {
                const tcIndex = nonProviderToolCalls.indexOf(
                  pausedToolCalls[i],
                );
                return approvalNeeded[tcIndex];
              });
              if (approvalToolCalls.length > 0) {
                await writeApprovalRequests(
                  options.writable,
                  approvalToolCalls.map(tc => ({
                    toolCallId: tc.toolCallId,
                    toolName: tc.toolName,
                  })),
                );
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
              output: undefined as OUTPUT,
            };
          }

          // Execute client tools (all have execute functions at this point)
          const clientToolResults = await Promise.all(
            nonProviderToolCalls.map(
              (toolCall): Promise<LanguageModelV4ToolResultPart> =>
                executeToolWithCallbacks(
                  toolCall,
                  effectiveTools as ToolSet,
                  iterMessages,
                  experimentalContext,
                ),
            ),
          );

          // For provider-executed tools, use the results from the stream
          const providerToolResults: LanguageModelV4ToolResultPart[] =
            providerToolCalls.map(toolCall =>
              resolveProviderToolResult(toolCall, providerExecutedToolResults),
            );

          // Combine results in the original order
          const toolResults = toolCalls.map(tc => {
            const clientResult = clientToolResults.find(
              r => r.toolCallId === tc.toolCallId,
            );
            if (clientResult) return clientResult;
            const providerResult = providerToolResults.find(
              r => r.toolCallId === tc.toolCallId,
            );
            if (providerResult) return providerResult;
            // This should never happen, but return empty result as fallback
            return {
              type: 'tool-result' as const,
              toolCallId: tc.toolCallId,
              toolName: tc.toolName,
              output: { type: 'text' as const, value: '' },
            };
          });

          // Write tool results and step boundaries to the stream so the
          // UI can transition tool parts to output-available state and
          // properly separate multi-step model calls in the message history.
          if (options.writable) {
            await writeToolResultsWithStepBoundary(
              options.writable,
              toolResults.map(r => ({
                toolCallId: r.toolCallId,
                toolName: r.toolName,
                input: toolCalls.find(tc => tc.toolCallId === r.toolCallId)
                  ?.input,
                output: 'value' in r.output ? r.output.value : undefined,
              })),
            );
          }

          // Track the tool calls and results for this step
          lastStepToolCalls = toolCalls.map(tc => ({
            type: 'tool-call' as const,
            toolCallId: tc.toolCallId,
            toolName: tc.toolName,
            input: tc.input,
          }));
          lastStepToolResults = toolResults.map(r => ({
            type: 'tool-result' as const,
            toolCallId: r.toolCallId,
            toolName: r.toolName,
            input: toolCalls.find(tc => tc.toolCallId === r.toolCallId)?.input,
            output: 'value' in r.output ? r.output.value : undefined,
          }));

          result = await iterator.next(toolResults);
        } else {
          // Final step with no tool calls - reset tracking
          lastStepToolCalls = [];
          lastStepToolResults = [];
          result = await iterator.next([]);
        }
      }

      // When the iterator completes normally, result.value contains the final conversation prompt
      if (result.done) {
        finalMessages = result.value;
      }
    } catch (error) {
      encounteredError = error;
      // Check if this is an abort error
      if (error instanceof Error && error.name === 'AbortError') {
        wasAborted = true;
        if (options.onAbort) {
          await options.onAbort({ steps });
        }
      } else if (options.onError) {
        // Call onError for non-abort errors (including tool execution errors)
        await options.onError({ error });
      }
      // Don't throw yet - we want to call onFinish first
    }

    // Use the final messages from the iterator, or fall back to original messages
    const messages = (finalMessages ??
      options.messages) as unknown as ModelMessage[];

    // Parse structured output if output is specified
    let experimentalOutput: OUTPUT = undefined as OUTPUT;
    if (options.output && steps.length > 0) {
      const lastStep = steps[steps.length - 1];
      const text = lastStep.text;
      if (text) {
        try {
          experimentalOutput = await options.output.parseCompleteOutput(
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
          if (!encounteredError) {
            encounteredError = parseError;
          }
        }
      }
    }

    // Call onFinish callback if provided (always call, even on errors, but not on abort)
    if (mergedOnFinish && !wasAborted) {
      const lastStep = steps[steps.length - 1];
      await mergedOnFinish({
        steps,
        messages: messages as ModelMessage[],
        text: lastStep?.text ?? '',
        finishReason: lastStep?.finishReason ?? 'other',
        totalUsage: aggregateUsage(steps),
        experimental_context: experimentalContext,
        output: experimentalOutput,
      });
    }

    // Re-throw any error that occurred
    if (encounteredError) {
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
      output: experimentalOutput,
    };
  }
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
  toolCalls: Array<{ toolCallId: string; toolName: string }>,
) {
  'use step';
  const writer = writable.getWriter();
  try {
    for (const tc of toolCalls) {
      await writer.write({
        type: 'tool-approval-request',
        approvalId: `approval-${tc.toolCallId}`,
        toolCallId: tc.toolCallId,
      });
    }
  } finally {
    writer.releaseLock();
  }
}

async function writeToolResultsWithStepBoundary(
  writable: WritableStream<any>,
  results: Array<{
    toolCallId: string;
    toolName: string;
    input: unknown;
    output: unknown;
  }>,
) {
  'use step';
  const writer = writable.getWriter();
  try {
    for (const r of results) {
      await writer.write({
        type: 'tool-result',
        toolCallId: r.toolCallId,
        toolName: r.toolName,
        input: r.input,
        output: r.output,
      });
    }
    // Emit step boundaries so the UI message history properly separates
    // the tool call step from the subsequent text step. This ensures
    // convertToModelMessages creates separate assistant messages for
    // tool calls and text responses.
    await writer.write({ type: 'finish-step' });
    await writer.write({ type: 'start-step' });
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

function filterTools<TTools extends ToolSet>(
  tools: TTools,
  activeTools: string[],
): ToolSet {
  const filtered: ToolSet = {};
  for (const toolName of activeTools) {
    if (toolName in tools) {
      filtered[toolName] = tools[toolName];
    }
  }
  return filtered;
}

// Matches AI SDK's getErrorMessage from @ai-sdk/provider-utils
function getErrorMessage(error: unknown): string {
  if (error == null) {
    return 'unknown error';
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return JSON.stringify(error);
}

function resolveProviderToolResult(
  toolCall: { toolCallId: string; toolName: string },
  providerExecutedToolResults?: Map<
    string,
    { toolCallId: string; toolName: string; result: unknown; isError?: boolean }
  >,
): LanguageModelV4ToolResultPart {
  const streamResult = providerExecutedToolResults?.get(toolCall.toolCallId);
  if (!streamResult) {
    console.warn(
      `[WorkflowAgent] Provider-executed tool "${toolCall.toolName}" (${toolCall.toolCallId}) ` +
        `did not receive a result from the stream. This may indicate a provider issue.`,
    );
    return {
      type: 'tool-result' as const,
      toolCallId: toolCall.toolCallId,
      toolName: toolCall.toolName,
      output: {
        type: 'text' as const,
        value: '',
      },
    };
  }

  const result = streamResult.result;
  const isString = typeof result === 'string';

  return {
    type: 'tool-result' as const,
    toolCallId: toolCall.toolCallId,
    toolName: toolCall.toolName,
    output: isString
      ? streamResult.isError
        ? { type: 'error-text' as const, value: result }
        : { type: 'text' as const, value: result }
      : streamResult.isError
        ? {
            type: 'error-json' as const,
            value: result as JSONValue,
          }
        : {
            type: 'json' as const,
            value: result as JSONValue,
          },
  };
}

async function executeTool(
  toolCall: { toolCallId: string; toolName: string; input: unknown },
  tools: ToolSet,
  messages: LanguageModelV4Prompt,
  experimentalContext?: unknown,
): Promise<LanguageModelV4ToolResultPart> {
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

  try {
    // Extract execute function to avoid binding `this` to the tool object.
    // If we called `tool.execute(...)` directly, JavaScript would bind `this`
    // to `tool`, which contains non-serializable properties like `inputSchema`.
    // When the execute function is a workflow step (marked with 'use step'),
    // the step system captures `this` for serialization, causing failures.
    const { execute } = tool;
    const toolResult = await execute(parsedInput, {
      toolCallId: toolCall.toolCallId,
      // Pass the conversation messages to the tool so it has context about the conversation
      messages,
      // Pass context to the tool
      context: experimentalContext,
    });

    // Use the appropriate output type based on the result
    // AI SDK supports 'text' for strings and 'json' for objects
    const output =
      typeof toolResult === 'string'
        ? { type: 'text' as const, value: toolResult }
        : { type: 'json' as const, value: toolResult };

    return {
      type: 'tool-result' as const,
      toolCallId: toolCall.toolCallId,
      toolName: toolCall.toolName,
      output,
    };
  } catch (error) {
    // Convert tool errors to error-text results sent back to the model,
    // allowing the agent to recover rather than killing the entire stream.
    // This aligns with AI SDK's streamText behavior for individual tool failures.
    return {
      type: 'tool-result',
      toolCallId: toolCall.toolCallId,
      toolName: toolCall.toolName,
      output: {
        type: 'error-text',
        value: getErrorMessage(error),
      },
    };
  }
}

/**
 * Collected tool approval information for a single tool call.
 */
interface CollectedApproval {
  toolCallId: string;
  toolName: string;
  input: unknown;
  approvalId: string;
  reason?: string;
}

/**
 * Collect tool approval responses from model messages.
 * Mirrors the logic from `collectToolApprovals` in the AI SDK core
 * (`packages/ai/src/generate-text/collect-tool-approvals.ts`).
 *
 * Scans the last tool message for `tool-approval-response` parts,
 * matches them with `tool-approval-request` parts in assistant messages
 * and the corresponding `tool-call` parts.
 */
function collectToolApprovalsFromMessages(messages: ModelMessage[]): {
  approvedToolApprovals: CollectedApproval[];
  deniedToolApprovals: CollectedApproval[];
} {
  const lastMessage = messages.at(-1);

  if (lastMessage?.role !== 'tool') {
    return { approvedToolApprovals: [], deniedToolApprovals: [] };
  }

  // Gather tool calls from assistant messages
  const toolCallsByToolCallId: Record<
    string,
    { toolName: string; input: unknown }
  > = {};
  for (const message of messages) {
    if (message.role === 'assistant' && Array.isArray(message.content)) {
      for (const part of message.content as any[]) {
        if (part.type === 'tool-call') {
          toolCallsByToolCallId[part.toolCallId] = {
            toolName: part.toolName,
            input: part.input ?? part.args,
          };
        }
      }
    }
  }

  // Gather approval requests from assistant messages
  const approvalRequestsByApprovalId: Record<
    string,
    { approvalId: string; toolCallId: string }
  > = {};
  for (const message of messages) {
    if (message.role === 'assistant' && Array.isArray(message.content)) {
      for (const part of message.content as any[]) {
        if (part.type === 'tool-approval-request') {
          approvalRequestsByApprovalId[part.approvalId] = {
            approvalId: part.approvalId,
            toolCallId: part.toolCallId,
          };
        }
      }
    }
  }

  // Gather existing tool results to avoid re-executing
  const existingToolResults = new Set<string>();
  for (const part of lastMessage.content as any[]) {
    if (part.type === 'tool-result') {
      existingToolResults.add(part.toolCallId);
    }
  }

  const approvedToolApprovals: CollectedApproval[] = [];
  const deniedToolApprovals: CollectedApproval[] = [];

  // Collect approval responses from the last tool message
  const approvalResponses = (lastMessage.content as any[]).filter(
    (part: any) => part.type === 'tool-approval-response',
  );

  for (const response of approvalResponses) {
    const approvalRequest = approvalRequestsByApprovalId[response.approvalId];
    if (approvalRequest == null) continue;

    // Skip if there's already a tool result for this tool call
    if (existingToolResults.has(approvalRequest.toolCallId)) continue;

    const toolCall = toolCallsByToolCallId[approvalRequest.toolCallId];
    if (toolCall == null) continue;

    const approval: CollectedApproval = {
      toolCallId: approvalRequest.toolCallId,
      toolName: toolCall.toolName,
      input: toolCall.input,
      approvalId: response.approvalId,
      reason: response.reason,
    };

    if (response.approved) {
      approvedToolApprovals.push(approval);
    } else {
      deniedToolApprovals.push(approval);
    }
  }

  return { approvedToolApprovals, deniedToolApprovals };
}
