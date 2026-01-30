import type {
  LanguageModelV2CallOptions,
  LanguageModelV2Prompt,
  LanguageModelV2StreamPart,
  LanguageModelV2ToolCall,
  LanguageModelV2ToolResultPart,
  SharedV2ProviderOptions,
} from '@ai-sdk/provider';
import {
  asSchema,
  type FinishReason,
  type LanguageModelResponseMetadata,
  type LanguageModelUsage,
  type ModelMessage,
  Output,
  readUIMessageStream,
  type StepResult,
  type StopCondition,
  type StreamTextOnStepFinishCallback,
  type ToolChoice,
  type ToolSet,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';
import { convertToLanguageModelPrompt, standardizePrompt } from 'ai/internal';
import { streamTextIterator } from './stream-text-iterator.js';
import type { CompatibleLanguageModel } from './types.js';

// Re-export for consumers
export type { CompatibleLanguageModel } from './types.js';

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
  readonly type: 'object' | 'text';
  responseFormat: LanguageModelV2CallOptions['responseFormat'];
  parsePartial(options: {
    text: string;
  }): Promise<{ partial: PARTIAL } | undefined>;
  parseOutput(
    options: { text: string },
    context: {
      response: LanguageModelResponseMetadata;
      usage: LanguageModelUsage;
      finishReason: FinishReason;
    },
  ): Promise<OUTPUT>;
}

/**
 * Provider-specific options type. This is equivalent to SharedV2ProviderOptions from @ai-sdk/provider.
 */
export type ProviderOptions = SharedV2ProviderOptions;

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
}) => TransformStream<LanguageModelV2StreamPart, LanguageModelV2StreamPart>;

/**
 * Function to repair a tool call that failed to parse.
 */
export type ToolCallRepairFunction<TTools extends ToolSet> = (options: {
  toolCall: LanguageModelV2ToolCall;
  tools: TTools;
  error: unknown;
  messages: LanguageModelV2Prompt;
}) => Promise<LanguageModelV2ToolCall | null> | LanguageModelV2ToolCall | null;

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
 * These map directly to LanguageModelV2CallOptions.
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
   * The function should return a LanguageModel instance (V2 or V3 depending on AI SDK version).
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
   * This is the LanguageModelV2Prompt format used internally.
   */
  messages: LanguageModelV2Prompt;

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
   * The function should return a LanguageModel instance (V2 or V3 depending on AI SDK version).
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
  messages?: LanguageModelV2Prompt;

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
export interface DurableAgentOptions extends GenerationSettings {
  /**
   * The model provider to use for the agent.
   *
   * This should be a string compatible with the Vercel AI Gateway (e.g., 'anthropic/claude-opus'),
   * or a step function that returns a LanguageModel instance (V2 or V3 depending on AI SDK version).
   */
  model: string | (() => Promise<CompatibleLanguageModel>);

  /**
   * A set of tools available to the agent.
   * Tools can be implemented as workflow steps for automatic retries and persistence,
   * or as regular workflow-level logic using core library features like sleep() and Hooks.
   */
  tools?: ToolSet;

  /**
   * Optional system prompt to guide the agent's behavior.
   */
  system?: string;

  /**
   * The tool choice strategy. Default: 'auto'.
   */
  toolChoice?: ToolChoice<ToolSet>;

  /**
   * Optional telemetry configuration (experimental).
   */
  experimental_telemetry?: TelemetrySettings;
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
   * If true, sends a 'start' chunk at the beginning of the stream.
   * Defaults to true.
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
   * import { Output } from '@ai-sdk/durable-agent';
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
 *   system: 'You are a helpful weather assistant.',
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
  private tools: TBaseTools;
  private system?: string;
  private generationSettings: GenerationSettings;
  private toolChoice?: ToolChoice<TBaseTools>;
  private telemetry?: TelemetrySettings;

  constructor(options: DurableAgentOptions & { tools?: TBaseTools }) {
    this.model = options.model;
    this.tools = (options.tools ?? {}) as TBaseTools;
    this.system = options.system;
    this.toolChoice = options.toolChoice as ToolChoice<TBaseTools>;
    this.telemetry = options.experimental_telemetry;

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
      system: options.system || this.system,
      messages: options.messages,
    });

    const modelPrompt = await convertToLanguageModelPrompt({
      prompt,
      supportedUrls: {},
      download: options.experimental_download,
    });

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
      ...(options.abortSignal !== undefined && {
        abortSignal: options.abortSignal,
      }),
      ...(options.headers !== undefined && { headers: options.headers }),
      ...(options.providerOptions !== undefined && {
        providerOptions: options.providerOptions,
      }),
    };

    // Determine effective tool choice
    const effectiveToolChoice = options.toolChoice ?? this.toolChoice;

    // Filter tools if activeTools is specified
    const effectiveTools =
      options.activeTools && options.activeTools.length > 0
        ? filterTools(this.tools, options.activeTools as string[])
        : this.tools;

    // Initialize context
    let experimentalContext = options.experimental_context;

    const steps: StepResult<TTools>[] = [];

    // Check for abort before starting
    if (mergedGenerationSettings.abortSignal?.aborted) {
      if (options.onAbort) {
        await options.onAbort({ steps });
      }
      return {
        messages: options.messages as unknown as ModelMessage[],
        steps,
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
      prompt: modelPrompt as LanguageModelV2Prompt,
      stopConditions: options.stopWhen,
      maxSteps: options.maxSteps,
      sendStart: options.sendStart ?? true,
      onStepFinish: options.onStepFinish,
      onError: options.onError,
      prepareStep: options.prepareStep,
      generationSettings: mergedGenerationSettings,
      toolChoice: effectiveToolChoice as ToolChoice<ToolSet>,
      experimental_context: experimentalContext,
      experimental_telemetry: options.experimental_telemetry ?? this.telemetry,
      includeRawChunks: options.includeRawChunks ?? false,
      experimental_transform: options.experimental_transform as
        | StreamTextTransform<ToolSet>
        | Array<StreamTextTransform<ToolSet>>,
      responseFormat: options.experimental_output?.responseFormat,
      collectUIChunks,
    });

    // Track the final conversation messages from the iterator
    let finalMessages: LanguageModelV2Prompt | undefined;
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
          const clientToolCalls = toolCalls.filter(tc => !tc.providerExecuted);
          const providerToolCalls = toolCalls.filter(tc => tc.providerExecuted);

          // Execute client tools
          const clientToolResults = await Promise.all(
            clientToolCalls.map(
              (toolCall): Promise<LanguageModelV2ToolResultPart> =>
                executeTool(
                  toolCall,
                  effectiveTools as ToolSet,
                  iterMessages,
                  experimentalContext,
                  options.experimental_repairToolCall as ToolCallRepairFunction<ToolSet>,
                ),
            ),
          );

          // For provider-executed tools, use the results from the stream
          const providerToolResults: LanguageModelV2ToolResultPart[] =
            providerToolCalls.map(toolCall => {
              const streamResult = providerExecutedToolResults?.get(
                toolCall.toolCallId,
              );
              if (streamResult) {
                // Use the appropriate output type based on the result and error status
                // AI SDK supports 'text'/'error-text' for strings and 'json'/'error-json' for objects
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
                          value:
                            result as LanguageModelV2ToolResultPart['output'] extends {
                              type: 'json';
                              value: infer V;
                            }
                              ? V
                              : never,
                        }
                      : {
                          type: 'json' as const,
                          value:
                            result as LanguageModelV2ToolResultPart['output'] extends {
                              type: 'json';
                              value: infer V;
                            }
                              ? V
                              : never,
                        },
                };
              }
              // If no result from stream, return an empty result
              // This can happen if the provider didn't send a tool-result stream part
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
            });

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

          result = await iterator.next(toolResults);
        } else {
          // Final step with no tool calls - just advance the iterator
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

    const sendFinish = options.sendFinish ?? true;
    const preventClose = options.preventClose ?? false;

    // Handle stream closing
    if (sendFinish || !preventClose) {
      await closeStream(options.writable, preventClose, sendFinish);
    }

    // Use the final messages from the iterator, or fall back to original messages
    const messages = (finalMessages ??
      options.messages) as unknown as ModelMessage[];

    // Parse structured output if experimental_output is specified
    let experimentalOutput: OUTPUT = undefined as OUTPUT;
    if (options.experimental_output && steps.length > 0) {
      const lastStep = steps[steps.length - 1];
      const text = lastStep.text;
      if (text) {
        try {
          experimentalOutput = await options.experimental_output.parseOutput(
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
    if (options.onFinish && !wasAborted) {
      await options.onFinish({
        steps,
        messages: messages as ModelMessage[],
        experimental_context: experimentalContext,
        experimental_output: experimentalOutput,
      });
    }

    // Re-throw any error that occurred
    if (encounteredError) {
      throw encounteredError;
    }

    // Collect accumulated UI messages if requested
    const uiMessages = collectUIChunks
      ? await convertChunksToUIMessages(allUIChunks)
      : undefined;

    return {
      messages: messages as ModelMessage[],
      steps,
      experimental_output: experimentalOutput,
      uiMessages,
    };
  }
}

/**
 * Filter tools to only include the specified active tools.
 */
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

async function executeTool(
  toolCall: LanguageModelV2ToolCall,
  tools: ToolSet,
  messages: LanguageModelV2Prompt,
  experimentalContext?: unknown,
  repairToolCall?: ToolCallRepairFunction<ToolSet>,
): Promise<LanguageModelV2ToolResultPart> {
  const tool = tools[toolCall.toolName];
  if (!tool) throw new Error(`Tool "${toolCall.toolName}" not found`);
  if (typeof tool.execute !== 'function')
    throw new Error(
      `Tool "${toolCall.toolName}" does not have an execute function`,
    );
  const schema = asSchema(tool.inputSchema);

  let parsedInput: unknown;
  try {
    const input = await schema.validate?.(JSON.parse(toolCall.input || '{}'));
    if (!input?.success) {
      // Try to repair the tool call if a repair function is provided
      if (repairToolCall) {
        const repairedToolCall = await repairToolCall({
          toolCall,
          tools,
          error: input?.error,
          messages,
        });
        if (repairedToolCall) {
          // Retry with repaired tool call
          return executeTool(
            repairedToolCall,
            tools,
            messages,
            experimentalContext,
            undefined, // Don't pass repair function to prevent infinite loops
          );
        }
      }
      throw new Error(
        `Invalid input for tool "${toolCall.toolName}": ${input?.error?.message}`,
      );
    }
    parsedInput = input.value;
  } catch (parseError) {
    // Try to repair the tool call if a repair function is provided
    if (repairToolCall) {
      const repairedToolCall = await repairToolCall({
        toolCall,
        tools,
        error: parseError,
        messages,
      });
      if (repairedToolCall) {
        // Retry with repaired tool call
        return executeTool(
          repairedToolCall,
          tools,
          messages,
          experimentalContext,
          undefined, // Don't pass repair function to prevent infinite loops
        );
      }
    }
    throw parseError;
  }

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
      // Pass experimental context to the tool
      experimental_context: experimentalContext,
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
    // Re-throw all errors for retry handling
    // Note: In workflow context, FatalError would be handled differently
    throw error;
  }
}
