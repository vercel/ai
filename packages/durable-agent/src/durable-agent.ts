import type {
  JSONValue,
  LanguageModelV4CallOptions,
  LanguageModelV4StreamPart,
  SharedV4ProviderOptions,
} from '@ai-sdk/provider';
import type { ToolResultPart } from '@ai-sdk/provider-utils';
import {
  type FinishReason,
  type LanguageModelResponseMetadata,
  type LanguageModelUsage,
  type ModelMessage,
  Output,
  readUIMessageStream,
  type StepResult,
  type StopCondition,
  type StreamTextOnStepFinishCallback,
  type SystemModelMessage,
  type ToolCallRepairFunction,
  type ToolChoice,
  type ToolSet,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';
import { standardizePrompt } from 'ai/internal';
import type { ParsedToolCall } from './do-stream-step.js';
import type { ProviderExecutedToolResult } from './do-stream-step.js';
import { recordSpan } from './telemetry.js';
import { streamTextIterator } from './stream-text-iterator.js';
import type { CompatibleLanguageModel } from './types.js';

// Re-export for consumers
export type { CompatibleLanguageModel } from './types.js';

/**
 * Infer the type of the tools of a durable agent.
 */
export type InferDurableAgentTools<DURABLE_AGENT> =
  DURABLE_AGENT extends DurableAgent<infer TOOLS> ? TOOLS : never;

/**
 * Infer the UI message type of a durable agent.
 */
export type InferDurableAgentUIMessage<
  DURABLE_AGENT,
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
 * Re-exported from the AI SDK core for compatibility.
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
  model: string | (() => Promise<CompatibleLanguageModel>);

  /**
   * The current step number (0-indexed).
   */
  stepNumber: number;

  /**
   * All previous steps with their results.
   */
  steps: StepResult<TTools>[];

  /**
   * The messages that will be sent to the model.
   */
  messages: ModelMessage[];

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
   * The function should return a LanguageModelV4 instance.
   */
  model?: string | (() => Promise<CompatibleLanguageModel>);

  /**
   * Override the system message for this step.
   */
  system?: string;

  /**
   * Override the messages for this step.
   * Use this for context management or message injection.
   */
  messages?: ModelMessage[];

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
 * Configuration options for creating a {@link DurableAgent} instance.
 */
export interface DurableAgentOptions<
  TTools extends ToolSet = ToolSet,
> extends GenerationSettings {
  /**
   * The model provider to use for the agent.
   *
   * This should be a string compatible with the Vercel AI Gateway (e.g., 'anthropic/claude-opus'),
   * or a step function that returns a LanguageModelV4 instance.
   */
  model: string | (() => Promise<CompatibleLanguageModel>);

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
  onStepFinish?: StreamTextOnStepFinishCallback<ToolSet>;

  /**
   * Callback that is called when the LLM response and all request tool executions are finished.
   */
  onFinish?: StreamTextOnFinishCallback<ToolSet>;
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
  readonly steps: StepResult<TTools>[];

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
   * The generated structured output. It uses the `experimental_output` specification.
   * Only available when `experimental_output` is specified.
   */
  readonly experimental_output: OUTPUT;
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
    readonly steps: StepResult<TTools>[];
  }) => PromiseLike<void> | void;

/**
 * Options for the {@link DurableAgent.stream} method.
 */
export interface DurableAgentStreamOptions<
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
   * The stream to which the agent writes message chunks. For example, use `getWritable<UIMessageChunk>()` to write to the workflow's default output stream.
   */
  writable: WritableStream<UIMessageChunk>;

  /**
   * If true, prevents the writable stream from being closed after streaming completes.
   * Defaults to false (stream will be closed).
   */
  preventClose?: boolean;

  /**
   * If true, sends a 'start' chunk (with an auto-generated messageId) at the
   * beginning of the stream. Defaults to true.
   *
   * Set to `false` when you write custom UIMessageChunks to the writable
   * stream **before** calling `agent.stream()`. The auto-generated start
   * chunk would overwrite your custom message metadata.
   */
  sendStart?: boolean;

  /**
   * If true, sends a 'finish' chunk at the end of the stream.
   * Defaults to true.
   */
  sendFinish?: boolean;

  /**
   * Condition for stopping the generation when there are tool results in the last step.
   * When the condition is an array, any of the conditions can be met to stop the generation.
   */
  stopWhen?:
    | StopCondition<NoInfer<ToolSet>>
    | Array<StopCondition<NoInfer<ToolSet>>>;

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
   *   experimental_output: Output.object({
   *     schema: z.object({
   *       sentiment: z.enum(['positive', 'negative', 'neutral']),
   *       confidence: z.number(),
   *     }),
   *   }),
   * });
   *
   * console.log(result.experimental_output); // { sentiment: 'positive', confidence: 0.95 }
   * ```
   */
  experimental_output?: OutputSpecification<OUTPUT, PARTIAL_OUTPUT>;

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
  onStepFinish?: StreamTextOnStepFinishCallback<TTools>;

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
   * If true, accumulates UIMessage[] during streaming.
   * The accumulated messages will be available in the `uiMessages` property of the result.
   * This is useful when you need the final UIMessage representation after streaming completes,
   * without having to re-read the stream.
   *
   * @default false
   */
  collectUIMessages?: boolean;

  /**
   * Timeout in milliseconds for the stream operation.
   * When specified, creates an AbortSignal that will abort the operation after the given time.
   * If both `timeout` and `abortSignal` are provided, whichever triggers first will abort.
   */
  timeout?: number;
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
 * Result of the DurableAgent.stream method.
 */
export interface DurableAgentStreamResult<
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
  steps: StepResult<TTools>[];

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
   * The generated structured output. It uses the `experimental_output` specification.
   * Only available when `experimental_output` is specified.
   */
  experimental_output: OUTPUT;

  /**
   * The accumulated UI messages from the stream.
   * Only available when `collectUIMessages` is set to `true` in the stream options.
   */
  uiMessages?: UIMessage[];
}

/**
 * A class for building durable AI agents within workflows.
 *
 * DurableAgent enables you to create AI-powered agents that can maintain state
 * across workflow steps, call tools, and gracefully handle interruptions and resumptions.
 * It integrates seamlessly with the AI SDK and the Workflow DevKit for
 * production-grade reliability.
 *
 * @example
 * ```typescript
 * const agent = new DurableAgent({
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
 * await agent.stream({
 *   messages: [{ role: 'user', content: 'What is the weather?' }],
 *   writable: getWritable<UIMessageChunk>(),
 * });
 * ```
 */
export class DurableAgent<TBaseTools extends ToolSet = ToolSet> {
  private model: string | (() => Promise<CompatibleLanguageModel>);
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
  private constructorOnStepFinish?: StreamTextOnStepFinishCallback<ToolSet>;
  private constructorOnFinish?: StreamTextOnFinishCallback<ToolSet>;

  constructor(options: DurableAgentOptions<TBaseTools>) {
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
    options: DurableAgentStreamOptions<TTools, OUTPUT, PARTIAL_OUTPUT>,
  ): Promise<DurableAgentStreamResult<TTools, OUTPUT>> {
    const prompt = await standardizePrompt({
      system: options.system ?? this.instructions,
      messages: options.messages,
    });

    // Build effective abort signal: merge timeout + explicit abortSignal
    let effectiveAbortSignal =
      options.abortSignal ?? this.generationSettings.abortSignal;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (
      options.timeout !== undefined &&
      typeof AbortController !== 'undefined'
    ) {
      const timeoutController = new AbortController();
      timeoutId = setTimeout(() => timeoutController.abort(), options.timeout);
      const timeoutSignal = timeoutController.signal;
      if (effectiveAbortSignal) {
        // Combine: whichever fires first wins
        const combined = new AbortController();
        effectiveAbortSignal.addEventListener('abort', () => combined.abort(), {
          once: true,
        });
        timeoutSignal.addEventListener('abort', () => combined.abort(), {
          once: true,
        });
        effectiveAbortSignal = combined.signal;
      } else {
        effectiveAbortSignal = timeoutSignal;
      }
    }

    // Merge generation settings: constructor defaults < stream options
    const mergedGenerationSettings: GenerationSettings = {
      ...this.generationSettings,
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
    const mergedOnStepFinish:
      | StreamTextOnStepFinishCallback<TTools>
      | undefined =
      this.constructorOnStepFinish || options.onStepFinish
        ? async event => {
            if (this.constructorOnStepFinish) {
              await (
                this
                  .constructorOnStepFinish as unknown as StreamTextOnStepFinishCallback<TTools>
              )(event);
            }
            if (options.onStepFinish) {
              await options.onStepFinish(event);
            }
          }
        : undefined;

    const mergedOnFinish:
      | StreamTextOnFinishCallback<TTools, OUTPUT>
      | undefined =
      this.constructorOnFinish || options.onFinish
        ? async event => {
            if (this.constructorOnFinish) {
              await (
                this
                  .constructorOnFinish as unknown as StreamTextOnFinishCallback<
                  TTools,
                  OUTPUT
                >
              )(event);
            }
            if (options.onFinish) {
              await options.onFinish(event);
            }
          }
        : undefined;

    // Determine effective tool choice
    const effectiveToolChoice = options.toolChoice ?? this.toolChoice;

    // Merge telemetry settings
    const effectiveTelemetry = options.experimental_telemetry ?? this.telemetry;

    // Filter tools if activeTools is specified
    const effectiveTools =
      options.activeTools && options.activeTools.length > 0
        ? filterTools(this.tools, options.activeTools as string[])
        : this.tools;

    // Initialize context
    let experimentalContext =
      options.experimental_context ?? this.experimentalContext;

    const steps: StepResult<TTools>[] = [];

    // Track tool calls and results from the last step for the result
    let lastStepToolCalls: ToolCall[] = [];
    let lastStepToolResults: ToolResult[] = [];

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
        experimental_output: undefined as OUTPUT,
        uiMessages: undefined,
      };
    }

    // Track collected UI chunks if collectUIMessages is enabled
    const collectUIChunks = options.collectUIMessages ?? false;
    const allUIChunks: UIMessageChunk[] = [];

    const iterator = streamTextIterator({
      model: this.model,
      tools: effectiveTools as ToolSet,
      writable: options.writable,
      messages: prompt.messages,
      system: prompt.system,
      stopConditions: options.stopWhen,
      maxSteps: options.maxSteps,
      sendStart: options.sendStart ?? true,
      onStepFinish: mergedOnStepFinish,
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
      collectUIChunks,
    });

    // Track the final conversation messages from the iterator
    let finalMessages: ModelMessage[] | undefined;
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
          uiChunks,
          providerExecutedToolResults,
        } = result.value;
        if (step) {
          // The step result is compatible with StepResult<TTools> since we're using the same tools
          steps.push(step as unknown as StepResult<TTools>);
        }
        // Update context if changed by prepareStep
        if (context !== undefined) {
          experimentalContext = context;
        }
        // Collect UI chunks if enabled
        if (uiChunks && uiChunks.length > 0) {
          allUIChunks.push(...uiChunks);
        }

        // Only execute tools if there are tool calls
        if (toolCalls.length > 0) {
          // Separate provider-executed tool calls from client-executed ones
          const nonProviderToolCalls = toolCalls.filter(
            tc => !tc.providerExecuted,
          );
          const providerToolCalls = toolCalls.filter(tc => tc.providerExecuted);

          // Further split non-provider tool calls into executable (has execute function)
          // and client-side (no execute function, needs external resolution)
          const executableToolCalls = nonProviderToolCalls.filter(tc => {
            const tool = (effectiveTools as ToolSet)[tc.toolName];
            return !tool || typeof tool.execute === 'function';
          });
          const clientSideToolCalls = nonProviderToolCalls.filter(tc => {
            const tool = (effectiveTools as ToolSet)[tc.toolName];
            return tool && typeof tool.execute !== 'function';
          });

          // If there are client-side tool calls, stop the loop and return them
          if (clientSideToolCalls.length > 0) {
            const executableResults = await Promise.all(
              executableToolCalls.map(
                (toolCall): Promise<ToolResultPart> =>
                  executeTool(
                    toolCall,
                    effectiveTools as ToolSet,
                    iterMessages,
                    experimentalContext,
                  ),
              ),
            );

            const providerResults: ToolResultPart[] = providerToolCalls.map(
              toolCall =>
                resolveProviderToolResult(
                  toolCall,
                  providerExecutedToolResults,
                ),
            );

            const resolvedResults = [...executableResults, ...providerResults];
            if (resolvedResults.length > 0) {
              const writer = options.writable.getWriter();
              try {
                for (const r of resolvedResults) {
                  const chunk: UIMessageChunk = {
                    type: 'tool-output-available' as const,
                    toolCallId: r.toolCallId,
                    output: 'value' in r.output ? r.output.value : undefined,
                  };
                  await writer.write(chunk);
                  if (collectUIChunks) {
                    allUIChunks.push(chunk);
                  }
                }
              } finally {
                writer.releaseLock();
              }
            }

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

            const sendFinish = options.sendFinish ?? true;
            const preventClose = options.preventClose ?? false;
            if (sendFinish || !preventClose) {
              await closeStream(options.writable, preventClose, sendFinish);
            }

            if (resolvedResults.length > 0) {
              iterMessages.push({
                role: 'tool',
                content: resolvedResults,
              });
            }

            const messages = iterMessages;

            if (mergedOnFinish && !wasAborted) {
              const lastStep = steps[steps.length - 1];
              await mergedOnFinish({
                steps,
                messages,
                text: lastStep?.text ?? '',
                finishReason: lastStep?.finishReason ?? 'other',
                totalUsage: aggregateUsage(steps),
                experimental_context: experimentalContext,
                experimental_output: undefined as OUTPUT,
              });
            }

            const uiMessages = collectUIChunks
              ? await convertChunksToUIMessages(allUIChunks)
              : undefined;

            return {
              messages,
              steps,
              toolCalls: allToolCalls,
              toolResults: allToolResults,
              experimental_output: undefined as OUTPUT,
              uiMessages,
            };
          }

          // Execute client tools (all have execute functions at this point)
          const clientToolResults = await Promise.all(
            nonProviderToolCalls.map(
              (toolCall): Promise<ToolResultPart> =>
                executeTool(
                  toolCall,
                  effectiveTools as ToolSet,
                  iterMessages,
                  experimentalContext,
                ),
            ),
          );

          const providerToolResults: ToolResultPart[] = providerToolCalls.map(
            toolCall =>
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
            return {
              type: 'tool-result' as const,
              toolCallId: tc.toolCallId,
              toolName: tc.toolName,
              output: { type: 'text' as const, value: '' },
            };
          });

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
    } finally {
      // Clean up the timeout timer if it was set
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }

    const sendFinish = options.sendFinish ?? true;
    const preventClose = options.preventClose ?? false;

    // Handle stream closing
    if (sendFinish || !preventClose) {
      await closeStream(options.writable, preventClose, sendFinish);
    }

    // Use the final messages from the iterator, or fall back to original messages
    const messages: ModelMessage[] =
      finalMessages ?? (options.messages as unknown as ModelMessage[]);

    // Parse structured output if experimental_output is specified
    let experimentalOutput: OUTPUT = undefined as OUTPUT;
    if (options.experimental_output && steps.length > 0) {
      const lastStep = steps[steps.length - 1];
      const text = lastStep.text;
      if (text) {
        try {
          experimentalOutput =
            await options.experimental_output.parseCompleteOutput(
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
        messages,
        text: lastStep?.text ?? '',
        finishReason: lastStep?.finishReason ?? 'other',
        totalUsage: aggregateUsage(steps),
        experimental_context: experimentalContext,
        experimental_output: experimentalOutput,
      });
    }

    // Re-throw any error that occurred
    if (encounteredError) {
      throw encounteredError;
    }

    // Collect accumulated UI messages if requested
    // This requires a step function since it performs stream operations
    const uiMessages = collectUIChunks
      ? await convertChunksToUIMessages(allUIChunks)
      : undefined;

    return {
      messages,
      steps,
      toolCalls: lastStepToolCalls,
      toolResults: lastStepToolResults,
      experimental_output: experimentalOutput,
      uiMessages,
    };
  }
}

/**
 * Filter tools to only include the specified active tools.
 */
/**
 * Aggregate token usage across all steps.
 */
function aggregateUsage(steps: StepResult<any>[]): LanguageModelUsage {
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

async function writeFinishChunk(writable: WritableStream<UIMessageChunk>) {
  'use step';

  const writer = writable.getWriter();
  try {
    await writer.write({ type: 'finish' });
  } finally {
    writer.releaseLock();
  }
}

async function closeStream(
  writable: WritableStream<UIMessageChunk>,
  preventClose?: boolean,
  sendFinish?: boolean,
) {
  'use step';

  // Conditionally write the finish chunk
  if (sendFinish) {
    await writeFinishChunk(writable);
  }

  // Conditionally close the stream
  if (!preventClose) {
    await writable.close();
  }
}

/**
 * Convert UIMessageChunks to UIMessage[] using the AI SDK's readUIMessageStream.
 * This must be a step function because it performs stream operations.
 *
 * @param chunks - The collected UIMessageChunks to convert
 * @returns The accumulated UIMessage array
 */
async function convertChunksToUIMessages(
  chunks: UIMessageChunk[],
): Promise<UIMessage[]> {
  'use step';

  if (chunks.length === 0) {
    return [];
  }

  // Create a readable stream from the collected chunks.
  // AI SDK only supports conversion from UIMessageChunk[] to UIMessage[]
  // as a streaming operation, so we need to wrap the chunks in a stream.
  const chunkStream = new ReadableStream<UIMessageChunk>({
    start: controller => {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });

  // Use the AI SDK's readUIMessageStream to convert chunks to messages
  const messageStream = readUIMessageStream({
    stream: chunkStream,
    onError: error => {
      console.error('Error processing UI message chunks:', error);
    },
  });

  // Collect all message updates and return the final state
  const messages: UIMessage[] = [];
  for await (const message of messageStream) {
    // readUIMessageStream yields updated versions of the message as it's built
    // We want to collect the final state of each message
    // Messages are identified by their id, so we update in place
    const existingIndex = messages.findIndex(m => m.id === message.id);
    if (existingIndex >= 0) {
      messages[existingIndex] = message;
    } else {
      messages.push(message);
    }
  }

  return messages;
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
  toolCall: ParsedToolCall,
  providerExecutedToolResults?: Map<string, ProviderExecutedToolResult>,
): ToolResultPart {
  const streamResult = providerExecutedToolResults?.get(toolCall.toolCallId);
  if (!streamResult) {
    console.warn(
      `[DurableAgent] Provider-executed tool "${toolCall.toolName}" (${toolCall.toolCallId}) ` +
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
  toolCall: ParsedToolCall,
  tools: ToolSet,
  messages: ModelMessage[],
  experimentalContext?: unknown,
): Promise<ToolResultPart> {
  const tool = tools[toolCall.toolName];
  if (!tool) throw new Error(`Tool "${toolCall.toolName}" not found`);
  if (typeof tool.execute !== 'function') {
    throw new Error(
      `Tool "${toolCall.toolName}" does not have an execute function. ` +
        `Client-side tools should be filtered before calling executeTool.`,
    );
  }

  // Input is already parsed by streamModelCall's createStreamTextPartTransform
  const parsedInput = toolCall.input;

  try {
    // Extract execute function to avoid binding `this` to the tool object.
    const { execute } = tool;
    const toolResult = await execute(parsedInput, {
      toolCallId: toolCall.toolCallId,
      messages,
      experimental_context: experimentalContext,
    });

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
