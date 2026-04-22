import {
  getErrorMessage,
  LanguageModelV4,
  SharedV4Warning,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import type {
  Arrayable,
  Context,
  InferToolSetContext,
  ToolApprovalResponse,
  ToolSet,
} from '@ai-sdk/provider-utils';
import {
  asArray,
  createIdGenerator,
  DelayedPromise,
  filterNullable,
  IdGenerator,
  isAbortError,
  ProviderOptions,
  ToolContent,
} from '@ai-sdk/provider-utils';
import { ServerResponse } from 'node:http';
import { NoOutputGeneratedError } from '../error';
import { logWarnings } from '../logger/log-warnings';
import { resolveLanguageModel } from '../model/resolve-model';
import { createToolModelOutput } from '../prompt/create-tool-model-output';
import { LanguageModelCallOptions } from '../prompt/language-model-call-options';
import { prepareLanguageModelCallOptions } from '../prompt/prepare-language-model-call-options';
import { prepareToolChoice } from '../prompt/prepare-tool-choice';
import { prepareTools } from '../prompt/prepare-tools';
import { Prompt } from '../prompt/prompt';
import {
  getChunkTimeoutMs,
  getStepTimeoutMs,
  getTotalTimeoutMs,
  RequestOptions,
  TimeoutConfiguration,
} from '../prompt/request-options';
import { standardizePrompt } from '../prompt/standardize-prompt';
import { wrapGatewayError } from '../prompt/wrap-gateway-error';
import { createTelemetryDispatcher } from '../telemetry/create-telemetry-dispatcher';
import { TelemetryOptions } from '../telemetry/telemetry-options';
import { createTextStreamResponse } from '../text-stream/create-text-stream-response';
import { pipeTextStreamToResponse } from '../text-stream/pipe-text-stream-to-response';
import { LanguageModelRequestMetadata } from '../types';
import {
  CallWarning,
  FinishReason,
  LanguageModel,
  ToolChoice,
} from '../types/language-model';
import { ProviderMetadata } from '../types/provider-metadata';
import {
  addLanguageModelUsage,
  createNullLanguageModelUsage,
  LanguageModelUsage,
} from '../types/usage';
import { UIMessage } from '../ui';
import { createUIMessageStreamResponse } from '../ui-message-stream/create-ui-message-stream-response';
import { getResponseUIMessageId } from '../ui-message-stream/get-response-ui-message-id';
import { handleUIMessageStreamFinish } from '../ui-message-stream/handle-ui-message-stream-finish';
import { pipeUIMessageStreamToResponse } from '../ui-message-stream/pipe-ui-message-stream-to-response';
import {
  InferUIMessageChunk,
  UIMessageChunk,
} from '../ui-message-stream/ui-message-chunks';
import { UIMessageStreamResponseInit } from '../ui-message-stream/ui-message-stream-response-init';
import { InferUIMessageData, InferUIMessageMetadata } from '../ui/ui-messages';
import {
  AsyncIterableStream,
  createAsyncIterableStream,
} from '../util/async-iterable-stream';
import type { Callback } from '../util/callback';
import { consumeStream } from '../util/consume-stream';
import { createStitchableStream } from '../util/create-stitchable-stream';
import { DownloadFunction } from '../util/download/download-function';
import { mergeAbortSignals } from '../util/merge-abort-signals';
import { mergeObjects } from '../util/merge-objects';
import { notify } from '../util/notify';
import { now as originalNow } from '../util/now';
import { prepareRetries } from '../util/prepare-retries';
import { collectToolApprovals } from './collect-tool-approvals';
import { ContentPart } from './content-part';
import type {
  OnFinishEvent,
  OnStartEvent,
  OnStepFinishEvent,
  OnStepStartEvent,
} from './core-events';
import { createExecuteToolsTransformation } from './create-execute-tools-transformation';
import { executeToolCall } from './execute-tool-call';
import { filterActiveTools } from './filter-active-tool';
import { invokeToolCallbacksFromStream } from './invoke-tool-callbacks-from-stream';
import { Output, text } from './output';
import {
  InferCompleteOutput,
  InferElementOutput,
  InferPartialOutput,
} from './output-utils';
import { PrepareStepFunction } from './prepare-step';
import { convertToReasoningOutputs } from './reasoning-output';
import { ResponseMessage } from './response-message';
import { DefaultStepResult, StepResult } from './step-result';
import {
  isStepCount,
  isStopConditionMet,
  StopCondition,
} from './stop-condition';
import {
  LanguageModelStreamPart,
  streamLanguageModelCall,
} from './stream-language-model-call';
import {
  ConsumeStreamOptions,
  StreamTextResult,
  TextStreamPart,
  UIMessageStreamOptions,
} from './stream-text-result';
import { toResponseMessages } from './to-response-messages';
import { ToolApprovalConfiguration } from './tool-approval-configuration';
import { TypedToolCall } from './tool-call';
import { ToolCallRepairFunction } from './tool-call-repair-function';
import {
  OnToolExecutionEndCallback,
  OnToolExecutionStartCallback,
} from './tool-execution-events';
import { ToolOutput } from './tool-output';
import { StaticToolOutputDenied } from './tool-output-denied';
import { ToolsContextParameter } from './tools-context-parameter';

const originalGenerateId = createIdGenerator({
  prefix: 'aitxt',
  size: 24,
});

const originalGenerateCallId = createIdGenerator({
  prefix: 'call',
  size: 24,
});

/**
 * A transformation that is applied to the stream.
 *
 * @param stopStream - A function that stops the source stream.
 * @param tools - The tools that are accessible to and can be called by the model. The model needs to support calling tools.
 */
export type StreamTextTransform<TOOLS extends ToolSet> = (options: {
  tools: TOOLS; // for type inference
  stopStream: () => void;
}) => TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>;

/**
 * Callback that is set using the `onError` option.
 *
 * @param event - The event that is passed to the callback.
 */
export type StreamTextOnErrorCallback = Callback<{
  error: unknown;
}>;

/**
 * Callback that is set using the `onStepFinish` option.
 *
 * @param stepResult - The result of the step.
 */
export type StreamTextOnStepFinishCallback<
  TOOLS extends ToolSet,
  RUNTIME_CONTEXT extends Context,
> = Callback<OnStepFinishEvent<TOOLS, RUNTIME_CONTEXT>>;

/**
 * Callback that is set using the `onChunk` option.
 *
 * @param event - The event that is passed to the callback.
 */
export type StreamTextOnChunkCallback<TOOLS extends ToolSet> = (event: {
  chunk: Extract<
    TextStreamPart<TOOLS>,
    {
      type:
        | 'text-delta'
        | 'reasoning-delta'
        | 'custom'
        | 'source'
        | 'tool-call'
        | 'tool-input-start'
        | 'tool-input-delta'
        | 'tool-result'
        | 'raw';
    }
  >;
}) => PromiseLike<void> | void;

/**
 * Callback that is set using the `onFinish` option.
 *
 * @param event - The event that is passed to the callback.
 */
export type StreamTextOnFinishCallback<
  TOOLS extends ToolSet,
  RUNTIME_CONTEXT extends Context,
> = Callback<OnFinishEvent<TOOLS, RUNTIME_CONTEXT>>;

/**
 * Callback that is set using the `onAbort` option.
 *
 * @param event - The event that is passed to the callback.
 */
export type StreamTextOnAbortCallback<
  TOOLS extends ToolSet,
  RUNTIME_CONTEXT extends Context,
> = Callback<{
  /**
   * Details for all previously finished steps.
   */
  readonly steps: StepResult<TOOLS, RUNTIME_CONTEXT>[];
}>;

/**
 * Callback that is set using the `experimental_onStart` option.
 *
 * Called when the streamText operation begins, before any LLM calls.
 * Use this callback for logging, analytics, or initializing state at the
 * start of a generation.
 *
 * @param event - The event object containing generation configuration.
 */
export type StreamTextOnStartCallback<
  TOOLS extends ToolSet = ToolSet,
  RUNTIME_CONTEXT extends Context = Context,
  OUTPUT extends Output = Output,
> = Callback<OnStartEvent<TOOLS, RUNTIME_CONTEXT, OUTPUT>>;

/**
 * Callback that is set using the `experimental_onStepStart` option.
 *
 * Called when a step (LLM call) begins, before the provider is called.
 * Each step represents a single LLM invocation. Multiple steps occur when
 * using tool calls (the model may be called multiple times in a loop).
 *
 * @param event - The event object containing step configuration.
 */
export type StreamTextOnStepStartCallback<
  TOOLS extends ToolSet = ToolSet,
  RUNTIME_CONTEXT extends Context = Context,
  OUTPUT extends Output = Output,
> = Callback<OnStepStartEvent<TOOLS, RUNTIME_CONTEXT, OUTPUT>>;

/**
 * Generate a text and call tools for a given prompt using a language model.
 *
 * This function streams the output. If you do not want to stream the output, use `generateText` instead.
 *
 * @param model - The language model to use.
 * @param tools - Tools that are accessible to and can be called by the model. The model needs to support calling tools.
 *
 * @param system - A system message that will be part of the prompt.
 * @param prompt - A simple text prompt. You can either use `prompt` or `messages` but not both.
 * @param messages - A list of messages. You can either use `prompt` or `messages` but not both.
 *
 * @param maxOutputTokens - Maximum number of tokens to generate.
 * @param temperature - Temperature setting.
 * The value is passed through to the provider. The range depends on the provider and model.
 * It is recommended to set either `temperature` or `topP`, but not both.
 * @param topP - Nucleus sampling.
 * The value is passed through to the provider. The range depends on the provider and model.
 * It is recommended to set either `temperature` or `topP`, but not both.
 * @param topK - Only sample from the top K options for each subsequent token.
 * Used to remove "long tail" low probability responses.
 * Recommended for advanced use cases only. You usually only need to use temperature.
 * @param presencePenalty - Presence penalty setting.
 * It affects the likelihood of the model to repeat information that is already in the prompt.
 * The value is passed through to the provider. The range depends on the provider and model.
 * @param frequencyPenalty - Frequency penalty setting.
 * It affects the likelihood of the model to repeatedly use the same words or phrases.
 * The value is passed through to the provider. The range depends on the provider and model.
 * @param stopSequences - Stop sequences.
 * If set, the model will stop generating text when one of the stop sequences is generated.
 * @param seed - The seed (integer) to use for random sampling.
 * If set and supported by the model, calls will generate deterministic results.
 *
 * @param maxRetries - Maximum number of retries. Set to 0 to disable retries. Default: 2.
 * @param abortSignal - An optional abort signal that can be used to cancel the call.
 * @param timeout - An optional timeout in milliseconds. The call will be aborted if it takes longer than the specified timeout.
 * @param headers - Additional HTTP headers to be sent with the request. Only applicable for HTTP-based providers.
 *
 * @param runtimeContext - User-defined runtime context that flows through the entire generation lifecycle.
 *
 * @param onChunk - Callback that is called for each chunk of the stream. The stream processing will pause until the callback promise is resolved.
 * @param onError - Callback that is called when an error occurs during streaming. You can use it to log errors.
 * @param onStepFinish - Callback that is called when each step (LLM call) is finished, including intermediate steps.
 * @param onFinish - Callback that is called when all steps are finished and the response is complete.
 *
 * @returns
 * A result object for accessing different stream types and additional information.
 */
export function streamText<
  TOOLS extends ToolSet,
  RUNTIME_CONTEXT extends Context = Context,
  OUTPUT extends Output = Output<string, string, never>,
>({
  model,
  tools,
  toolChoice,
  system,
  prompt,
  messages,
  maxRetries,
  abortSignal,
  timeout,
  headers,
  stopWhen = isStepCount(1),
  output,
  toolApproval,
  experimental_telemetry,
  telemetry = experimental_telemetry,
  prepareStep,
  providerOptions,
  activeTools,
  experimental_repairToolCall: repairToolCall,
  experimental_transform: transform,
  experimental_download: download,
  includeRawChunks = false,
  onChunk,
  onError = ({ error }) => {
    console.error(error);
  },
  onFinish,
  onAbort,
  onStepFinish,
  experimental_onStart: onStart,
  experimental_onStepStart: onStepStart,
  experimental_onToolExecutionStart: onToolExecutionStart,
  experimental_onToolExecutionEnd: onToolExecutionEnd,
  runtimeContext = {} as RUNTIME_CONTEXT,
  toolsContext = {} as InferToolSetContext<TOOLS>,
  experimental_include: include,
  _internal: {
    now = originalNow,
    generateId = originalGenerateId,
    generateCallId = originalGenerateCallId,
  } = {},
  ...settings
}: LanguageModelCallOptions &
  RequestOptions<TOOLS> &
  Prompt &
  ToolsContextParameter<TOOLS> & {
    /**
     * The language model to use.
     */
    model: LanguageModel;

    /**
     * The tool choice strategy. Default: 'auto'.
     */
    toolChoice?: ToolChoice<TOOLS>;

    /**
     * Condition for stopping the generation when there are tool results in the last step.
     * When the condition is an array, any of the conditions can be met to stop the generation.
     *
     * @default isStepCount(1)
     */
    stopWhen?: Arrayable<StopCondition<NoInfer<TOOLS>, RUNTIME_CONTEXT>>;

    /**
     * Optional telemetry configuration.
     */
    telemetry?: TelemetryOptions;

    /**
     * Optional telemetry configuration.
     *
     * @deprecated Use `telemetry` instead. This alias will be removed in a future major release.
     */
    experimental_telemetry?: TelemetryOptions;

    /**
     * Additional provider-specific options. They are passed through
     * to the provider from the AI SDK and enable provider-specific
     * functionality that can be fully encapsulated in the provider.
     */
    providerOptions?: ProviderOptions;

    /**
     * Runtime context. Treat runtime context as immutable.
     * If you need to mutate runtime context, update it in `prepareStep`.
     */
    runtimeContext?: RUNTIME_CONTEXT;

    /**
     * Limits the tools that are available for the model to call without
     * changing the tool call and result types in the result.
     */
    activeTools?: Array<keyof NoInfer<TOOLS>>;

    /**
     * Optional specification for parsing structured outputs from the LLM response.
     */
    output?: OUTPUT;

    /**
     * Optional tool approval configuration.
     *
     * This configuration takes precedence over tool-defined approval settings.
     */
    toolApproval?: ToolApprovalConfiguration<TOOLS, RUNTIME_CONTEXT>;

    /**
     * Optional function that you can use to provide different settings for a step.
     *
     * @param options - The options for the step.
     * @param options.steps - The steps that have been executed so far.
     * @param options.stepNumber - The number of the step that is being executed.
     * @param options.model - The model that is being used.
     *
     * @returns An object that contains the settings for the step.
     * If you return undefined (or for undefined settings), the settings from the outer level will be used.
     */
    prepareStep?: PrepareStepFunction<NoInfer<TOOLS>, RUNTIME_CONTEXT>;

    /**
     * A function that attempts to repair a tool call that failed to parse.
     */
    experimental_repairToolCall?: ToolCallRepairFunction<TOOLS>;

    /**
     * Optional stream transformations.
     * They are applied in the order they are provided.
     * The stream transformations must maintain the stream structure for streamText to work correctly.
     */
    experimental_transform?: Arrayable<StreamTextTransform<TOOLS>>;

    /**
     * Custom download function to use for URLs.
     *
     * By default, files are downloaded if the model does not support the URL for the given media type.
     */
    experimental_download?: DownloadFunction | undefined;

    /**
     * Whether to include raw chunks from the provider in the stream.
     * When enabled, you will receive raw chunks with type 'raw' that contain the unprocessed data from the provider.
     * This allows access to cutting-edge provider features not yet wrapped by the AI SDK.
     * Defaults to false.
     */
    includeRawChunks?: boolean;

    /**
     * Callback that is called for each chunk of the stream.
     * The stream processing will pause until the callback promise is resolved.
     */
    onChunk?: StreamTextOnChunkCallback<TOOLS>;

    /**
     * Callback that is invoked when an error occurs during streaming.
     * You can use it to log errors.
     * The stream processing will pause until the callback promise is resolved.
     */
    onError?: StreamTextOnErrorCallback;

    /**
     * Callback that is called when the LLM response and all request tool executions
     * (for tools that have an `execute` function) are finished.
     *
     * The usage is the combined usage of all steps.
     */
    onFinish?: StreamTextOnFinishCallback<
      NoInfer<TOOLS>,
      NoInfer<RUNTIME_CONTEXT>
    >;

    onAbort?: StreamTextOnAbortCallback<
      NoInfer<TOOLS>,
      NoInfer<RUNTIME_CONTEXT>
    >;

    /**
     * Callback that is called when each step (LLM call) is finished, including intermediate steps.
     */
    onStepFinish?: StreamTextOnStepFinishCallback<
      NoInfer<TOOLS>,
      NoInfer<RUNTIME_CONTEXT>
    >;

    /**
     * Callback that is called when the streamText operation begins,
     * before any LLM calls are made.
     */
    experimental_onStart?: StreamTextOnStartCallback<
      NoInfer<TOOLS>,
      NoInfer<RUNTIME_CONTEXT>,
      NoInfer<OUTPUT>
    >;

    /**
     * Callback that is called when a step (LLM call) begins,
     * before the provider is called.
     */
    experimental_onStepStart?: StreamTextOnStepStartCallback<
      NoInfer<TOOLS>,
      NoInfer<RUNTIME_CONTEXT>,
      NoInfer<OUTPUT>
    >;

    /**
     * Callback that is called right before a tool's execute function runs.
     */
    experimental_onToolExecutionStart?: OnToolExecutionStartCallback<
      NoInfer<TOOLS>
    >;

    /**
     * Callback that is called right after a tool's execute function completes (or errors).
     */
    experimental_onToolExecutionEnd?: OnToolExecutionEndCallback<
      NoInfer<TOOLS>
    >;

    /**
     * Settings for controlling what data is included in step results.
     * Disabling inclusion can help reduce memory usage when processing
     * large payloads like images.
     *
     * By default, all data is included for backwards compatibility.
     */
    experimental_include?: {
      /**
       * Whether to retain the request body in step results.
       * The request body can be large when sending images or files.
       * @default true
       */
      requestBody?: boolean;
    };

    /**
     * Internal. For test use only. May change without notice.
     */
    _internal?: {
      now?: () => number;
      generateId?: IdGenerator;
      generateCallId?: IdGenerator;
    };
  }): StreamTextResult<TOOLS, RUNTIME_CONTEXT, OUTPUT> {
  const totalTimeoutMs = getTotalTimeoutMs(timeout);
  const stepTimeoutMs = getStepTimeoutMs(timeout);
  const chunkTimeoutMs = getChunkTimeoutMs(timeout);
  const stepAbortController =
    stepTimeoutMs != null ? new AbortController() : undefined;
  const chunkAbortController =
    chunkTimeoutMs != null ? new AbortController() : undefined;
  return new DefaultStreamTextResult<TOOLS, RUNTIME_CONTEXT, OUTPUT>({
    model: resolveLanguageModel(model),
    telemetry,
    headers,
    settings,
    maxRetries,
    abortSignal: mergeAbortSignals(
      abortSignal,
      totalTimeoutMs,
      stepAbortController?.signal,
      chunkAbortController?.signal,
    ),
    stepTimeoutMs,
    stepAbortController,
    chunkTimeoutMs,
    chunkAbortController,
    system,
    prompt,
    messages,
    tools,
    toolsContext,
    runtimeContext,
    toolChoice,
    transforms: asArray(transform),
    activeTools,
    repairToolCall,
    stopConditions: asArray(stopWhen),
    output,
    toolApproval,
    providerOptions,
    prepareStep,
    includeRawChunks,
    timeout,
    stopWhen,
    onChunk,
    onError,
    onFinish,
    onAbort,
    onStepFinish,
    onStart,
    onStepStart,
    onToolExecutionStart,
    onToolExecutionEnd,
    now,
    generateId,
    generateCallId,
    download,
    include,
  });
}

export type EnrichedStreamPart<TOOLS extends ToolSet, PARTIAL_OUTPUT> = {
  part: TextStreamPart<TOOLS>;
  partialOutput: PARTIAL_OUTPUT | undefined;
};

function createOutputTransformStream<
  TOOLS extends ToolSet,
  OUTPUT extends Output,
>(
  output: OUTPUT,
): TransformStream<
  TextStreamPart<TOOLS>,
  EnrichedStreamPart<TOOLS, InferPartialOutput<OUTPUT>>
> {
  let firstTextChunkId: string | undefined = undefined;
  let text = '';
  let textChunk = '';
  let textProviderMetadata: ProviderMetadata | undefined = undefined;
  let lastPublishedValue = '';

  function publishTextChunk({
    controller,
    partialOutput = undefined,
  }: {
    controller: TransformStreamDefaultController<
      EnrichedStreamPart<TOOLS, InferPartialOutput<OUTPUT>>
    >;
    partialOutput?: InferPartialOutput<OUTPUT>;
  }) {
    controller.enqueue({
      part: {
        type: 'text-delta',
        id: firstTextChunkId!,
        text: textChunk,
        providerMetadata: textProviderMetadata,
      },
      partialOutput,
    });
    textChunk = '';
  }

  return new TransformStream<
    TextStreamPart<TOOLS>,
    EnrichedStreamPart<TOOLS, InferPartialOutput<OUTPUT>>
  >({
    async transform(chunk, controller) {
      // ensure that we publish the last text chunk before the step finish:
      if (chunk.type === 'finish-step' && textChunk.length > 0) {
        publishTextChunk({ controller });
      }

      if (
        chunk.type !== 'text-delta' &&
        chunk.type !== 'text-start' &&
        chunk.type !== 'text-end'
      ) {
        controller.enqueue({ part: chunk, partialOutput: undefined });
        return;
      }

      // we have to pick a text chunk which contains the json text
      // since we are streaming, we have to pick the first text chunk
      if (firstTextChunkId == null) {
        firstTextChunkId = chunk.id;
      } else if (chunk.id !== firstTextChunkId) {
        controller.enqueue({ part: chunk, partialOutput: undefined });
        return;
      }

      if (chunk.type === 'text-start') {
        controller.enqueue({ part: chunk, partialOutput: undefined });
        return;
      }

      if (chunk.type === 'text-end') {
        if (textChunk.length > 0) {
          publishTextChunk({ controller });
        }
        controller.enqueue({ part: chunk, partialOutput: undefined });
        return;
      }

      text += chunk.text;
      textChunk += chunk.text;
      textProviderMetadata = chunk.providerMetadata ?? textProviderMetadata;

      // only publish if partial json can be parsed:
      const result = await output.parsePartialOutput({ text });

      // null should be allowed (valid JSON value) but undefined should not:
      if (result !== undefined) {
        // only send new value if it has changed:
        // For string partials (text output), compare directly to avoid unnecessary JSON.stringify overhead
        const currentValue =
          typeof result.partial === 'string'
            ? result.partial
            : JSON.stringify(result.partial);
        if (currentValue !== lastPublishedValue) {
          publishTextChunk({ controller, partialOutput: result.partial });
          lastPublishedValue = currentValue;
        }
      }
    },
  });
}

class DefaultStreamTextResult<
  TOOLS extends ToolSet,
  RUNTIME_CONTEXT extends Context,
  OUTPUT extends Output,
> implements StreamTextResult<TOOLS, RUNTIME_CONTEXT, OUTPUT> {
  private readonly _totalUsage = new DelayedPromise<
    Awaited<StreamTextResult<TOOLS, RUNTIME_CONTEXT, OUTPUT>['usage']>
  >();
  private readonly _finishReason = new DelayedPromise<
    Awaited<StreamTextResult<TOOLS, RUNTIME_CONTEXT, OUTPUT>['finishReason']>
  >();
  private readonly _rawFinishReason = new DelayedPromise<
    Awaited<StreamTextResult<TOOLS, RUNTIME_CONTEXT, OUTPUT>['rawFinishReason']>
  >();
  private readonly _steps = new DelayedPromise<
    Awaited<StreamTextResult<TOOLS, RUNTIME_CONTEXT, OUTPUT>['steps']>
  >();

  private readonly addStream: (
    stream: ReadableStream<TextStreamPart<TOOLS>>,
  ) => void;

  private readonly closeStream: () => void;

  private baseStream: ReadableStream<
    EnrichedStreamPart<TOOLS, InferPartialOutput<OUTPUT>>
  >;

  private outputSpecification: OUTPUT | undefined;

  private includeRawChunks: boolean;

  private tools: TOOLS | undefined;

  constructor({
    model,
    telemetry,
    headers,
    settings,
    maxRetries: maxRetriesArg,
    abortSignal,
    stepTimeoutMs,
    stepAbortController,
    chunkTimeoutMs,
    chunkAbortController,
    system,
    prompt,
    messages,
    tools,
    toolChoice,
    transforms,
    activeTools,
    repairToolCall,
    stopConditions,
    output,
    toolApproval,
    providerOptions,
    prepareStep,
    includeRawChunks,
    now,
    generateId,
    generateCallId,
    timeout,
    stopWhen,
    onChunk,
    onError,
    onFinish,
    onAbort,
    onStepFinish,
    onStart,
    onStepStart,
    onToolExecutionStart,
    onToolExecutionEnd,
    runtimeContext,
    toolsContext,
    download,
    include,
  }: {
    model: LanguageModelV4;
    telemetry: TelemetryOptions | undefined;
    headers: Record<string, string | undefined> | undefined;
    settings: LanguageModelCallOptions;
    maxRetries: number | undefined;
    abortSignal: AbortSignal | undefined;
    stepTimeoutMs: number | undefined;
    stepAbortController: AbortController | undefined;
    chunkTimeoutMs: number | undefined;
    chunkAbortController: AbortController | undefined;
    toolsContext: InferToolSetContext<TOOLS>;
    runtimeContext: RUNTIME_CONTEXT;
    system: Prompt['system'];
    prompt: Prompt['prompt'];
    messages: Prompt['messages'];
    tools: TOOLS | undefined;
    toolChoice: ToolChoice<TOOLS> | undefined;
    transforms: Array<StreamTextTransform<TOOLS>>;
    activeTools: Array<keyof TOOLS> | undefined;
    repairToolCall: ToolCallRepairFunction<TOOLS> | undefined;
    stopConditions: Array<
      StopCondition<NoInfer<TOOLS>, NoInfer<RUNTIME_CONTEXT>>
    >;
    output: OUTPUT | undefined;
    toolApproval: ToolApprovalConfiguration<TOOLS, RUNTIME_CONTEXT> | undefined;
    providerOptions: ProviderOptions | undefined;
    prepareStep:
      | PrepareStepFunction<NoInfer<TOOLS>, NoInfer<RUNTIME_CONTEXT>>
      | undefined;
    includeRawChunks: boolean;
    now: () => number;
    generateId: () => string;
    generateCallId: () => string;
    timeout: TimeoutConfiguration<TOOLS> | undefined;
    stopWhen: Arrayable<
      StopCondition<NoInfer<TOOLS>, NoInfer<RUNTIME_CONTEXT>>
    >;
    download: DownloadFunction | undefined;
    include: { requestBody?: boolean } | undefined;

    // callbacks:
    onChunk: undefined | StreamTextOnChunkCallback<TOOLS>;
    onError: StreamTextOnErrorCallback;
    onFinish:
      | undefined
      | StreamTextOnFinishCallback<NoInfer<TOOLS>, NoInfer<RUNTIME_CONTEXT>>;
    onAbort:
      | undefined
      | StreamTextOnAbortCallback<NoInfer<TOOLS>, NoInfer<RUNTIME_CONTEXT>>;
    onStepFinish:
      | undefined
      | StreamTextOnStepFinishCallback<
          NoInfer<TOOLS>,
          NoInfer<RUNTIME_CONTEXT>
        >;
    onStart:
      | undefined
      | StreamTextOnStartCallback<
          NoInfer<TOOLS>,
          NoInfer<RUNTIME_CONTEXT>,
          NoInfer<OUTPUT>
        >;
    onStepStart:
      | undefined
      | StreamTextOnStepStartCallback<
          NoInfer<TOOLS>,
          NoInfer<RUNTIME_CONTEXT>,
          NoInfer<OUTPUT>
        >;
    onToolExecutionStart: undefined | OnToolExecutionStartCallback<TOOLS>;
    onToolExecutionEnd: undefined | OnToolExecutionEndCallback<TOOLS>;
  }) {
    this.outputSpecification = output;
    this.includeRawChunks = includeRawChunks;
    this.tools = tools;

    const telemetryDispatcher = createTelemetryDispatcher({
      telemetry,
    });

    // promise to ensure that the step has been fully processed by the event processor
    // before a new step is started. This is required because the continuation condition
    // needs the updated steps to determine if another step is needed.
    let stepFinish!: DelayedPromise<void>;

    let recordedContent: Array<ContentPart<TOOLS>> = [];
    const recordedResponseMessages: Array<ResponseMessage> = [];
    let recordedFinishReason: FinishReason | undefined = undefined;
    let recordedRawFinishReason: string | undefined = undefined;
    let recordedTotalUsage: LanguageModelUsage | undefined = undefined;
    let recordedRequest: LanguageModelRequestMetadata = {};
    let recordedWarnings: Array<CallWarning> = [];
    const recordedSteps: StepResult<TOOLS, RUNTIME_CONTEXT>[] = [];

    // Track provider-executed tool calls that support deferred results
    // (e.g., code_execution in programmatic tool calling scenarios).
    // These tools may not return their results in the same turn as their call.
    const pendingDeferredToolCalls = new Map<string, { toolName: string }>();

    let activeTextContent: Record<
      string,
      {
        type: 'text';
        text: string;
        providerMetadata: ProviderMetadata | undefined;
      }
    > = {};

    let activeReasoningContent: Record<
      string,
      {
        type: 'reasoning';
        text: string;
        providerMetadata: ProviderMetadata | undefined;
      }
    > = {};

    const eventProcessor = new TransformStream<
      EnrichedStreamPart<TOOLS, InferPartialOutput<OUTPUT>>,
      EnrichedStreamPart<TOOLS, InferPartialOutput<OUTPUT>>
    >({
      async transform(chunk, controller) {
        controller.enqueue(chunk); // forward the chunk to the next stream

        const { part } = chunk;

        if (
          part.type === 'text-delta' ||
          part.type === 'reasoning-delta' ||
          part.type === 'custom' ||
          part.type === 'source' ||
          part.type === 'tool-call' ||
          part.type === 'tool-result' ||
          part.type === 'tool-input-start' ||
          part.type === 'tool-input-delta' ||
          part.type === 'raw'
        ) {
          await onChunk?.({ chunk: part });
        }

        if (part.type === 'error') {
          await onError({ error: wrapGatewayError(part.error) });
        }

        if (
          part.type === 'custom' ||
          part.type === 'source' ||
          part.type === 'tool-call' ||
          part.type === 'tool-approval-request' ||
          part.type === 'tool-approval-response' ||
          part.type === 'tool-error'
        ) {
          recordedContent.push(part);
        }

        if (part.type === 'text-start') {
          activeTextContent[part.id] = {
            type: 'text',
            text: '',
            providerMetadata: part.providerMetadata,
          };

          recordedContent.push(activeTextContent[part.id]);
        }

        if (part.type === 'text-delta') {
          const activeText = activeTextContent[part.id];

          if (activeText == null) {
            controller.enqueue({
              part: {
                type: 'error',
                error: `text part ${part.id} not found`,
              },
              partialOutput: undefined,
            });
            return;
          }

          activeText.text += part.text;
          activeText.providerMetadata =
            part.providerMetadata ?? activeText.providerMetadata;
        }

        if (part.type === 'text-end') {
          const activeText = activeTextContent[part.id];

          if (activeText == null) {
            controller.enqueue({
              part: {
                type: 'error',
                error: `text part ${part.id} not found`,
              },
              partialOutput: undefined,
            });
            return;
          }

          activeText.providerMetadata =
            part.providerMetadata ?? activeText.providerMetadata;

          delete activeTextContent[part.id];
        }

        if (part.type === 'reasoning-start') {
          activeReasoningContent[part.id] = {
            type: 'reasoning',
            text: '',
            providerMetadata: part.providerMetadata,
          };

          recordedContent.push(activeReasoningContent[part.id]);
        }

        if (part.type === 'reasoning-delta') {
          const activeReasoning = activeReasoningContent[part.id];

          if (activeReasoning == null) {
            controller.enqueue({
              part: {
                type: 'error',
                error: `reasoning part ${part.id} not found`,
              },
              partialOutput: undefined,
            });
            return;
          }

          activeReasoning.text += part.text;
          activeReasoning.providerMetadata =
            part.providerMetadata ?? activeReasoning.providerMetadata;
        }

        if (part.type === 'reasoning-end') {
          const activeReasoning = activeReasoningContent[part.id];

          if (activeReasoning == null) {
            controller.enqueue({
              part: {
                type: 'error',
                error: `reasoning part ${part.id} not found`,
              },
              partialOutput: undefined,
            });
            return;
          }

          activeReasoning.providerMetadata =
            part.providerMetadata ?? activeReasoning.providerMetadata;

          delete activeReasoningContent[part.id];
        }

        if (part.type === 'file' || part.type === 'reasoning-file') {
          recordedContent.push({
            type: part.type,
            file: part.file,
            ...(part.providerMetadata != null
              ? { providerMetadata: part.providerMetadata }
              : {}),
          });
        }

        if (part.type === 'tool-result' && !part.preliminary) {
          recordedContent.push(part);
        }

        if (part.type === 'start-step') {
          // reset the recorded data when a new step starts:
          recordedContent = [];
          activeReasoningContent = {};
          activeTextContent = {};

          recordedRequest = part.request;
          recordedWarnings = part.warnings;
        }

        if (part.type === 'finish-step') {
          const stepMessages = await toResponseMessages({
            content: recordedContent,
            tools,
          });

          // Add step information (after response messages are updated):
          const currentStepResult: StepResult<TOOLS, RUNTIME_CONTEXT> =
            new DefaultStepResult({
              callId,
              stepNumber: recordedSteps.length,
              provider: model.provider,
              modelId: model.modelId,
              runtimeContext,
              toolsContext,
              content: recordedContent,
              finishReason: part.finishReason,
              rawFinishReason: part.rawFinishReason,
              usage: part.usage,
              warnings: recordedWarnings,
              request: recordedRequest,
              response: {
                ...part.response,
                messages: [...recordedResponseMessages, ...stepMessages],
              },
              providerMetadata: part.providerMetadata,
            });

          await notify({
            event: currentStepResult,
            callbacks: [onStepFinish, telemetryDispatcher.onStepFinish],
          });

          logWarnings({
            warnings: recordedWarnings,
            provider: model.provider,
            model: model.modelId,
          });

          recordedSteps.push(currentStepResult);

          recordedResponseMessages.push(...stepMessages);

          // resolve the promise to signal that the step has been fully processed
          // by the event processor:
          stepFinish.resolve();
        }

        if (part.type === 'finish') {
          recordedTotalUsage = part.totalUsage;
          recordedFinishReason = part.finishReason;
          recordedRawFinishReason = part.rawFinishReason;
        }
      },

      async flush(controller) {
        try {
          if (recordedSteps.length === 0) {
            const error = abortSignal?.aborted
              ? abortSignal.reason
              : new NoOutputGeneratedError({
                  message: 'No output generated. Check the stream for errors.',
                });

            self._finishReason.reject(error);
            self._rawFinishReason.reject(error);
            self._totalUsage.reject(error);
            self._steps.reject(error);

            return; // no steps recorded (e.g. in error scenario)
          }

          // derived:
          const finishReason = recordedFinishReason ?? 'other';
          const totalUsage =
            recordedTotalUsage ?? createNullLanguageModelUsage();

          // from finish:
          self._finishReason.resolve(finishReason);
          self._rawFinishReason.resolve(recordedRawFinishReason);
          self._totalUsage.resolve(totalUsage);

          // aggregate results:
          self._steps.resolve(recordedSteps);

          // call onFinish callback:
          const finalStep = recordedSteps[recordedSteps.length - 1];

          await notify({
            event: {
              callId,
              toolsContext: finalStep.toolsContext,
              stepNumber: finalStep.stepNumber,
              model: finalStep.model,
              runtimeContext: finalStep.runtimeContext,
              finishReason: finalStep.finishReason,
              rawFinishReason: finalStep.rawFinishReason,
              totalUsage,
              usage: finalStep.usage,
              content: finalStep.content,
              text: finalStep.text,
              reasoningText: finalStep.reasoningText,
              reasoning: finalStep.reasoning,
              files: finalStep.files,
              sources: finalStep.sources,
              toolCalls: finalStep.toolCalls,
              staticToolCalls: finalStep.staticToolCalls,
              dynamicToolCalls: finalStep.dynamicToolCalls,
              toolResults: finalStep.toolResults,
              staticToolResults: finalStep.staticToolResults,
              dynamicToolResults: finalStep.dynamicToolResults,
              request: finalStep.request,
              response: finalStep.response,
              warnings: finalStep.warnings,
              providerMetadata: finalStep.providerMetadata,
              steps: recordedSteps,
            },
            callbacks: [
              onFinish,
              telemetryDispatcher.onFinish as
                | undefined
                | StreamTextOnFinishCallback<
                    NoInfer<TOOLS>,
                    NoInfer<RUNTIME_CONTEXT>
                  >,
            ],
          });
        } catch (error) {
          controller.error(error);
        }
      },
    });

    // initialize the stitchable stream and the transformed stream:
    const stitchableStream = createStitchableStream<TextStreamPart<TOOLS>>();
    this.addStream = stitchableStream.addStream;
    this.closeStream = stitchableStream.close;

    // resilient stream that handles abort signals and errors:
    const reader = stitchableStream.stream.getReader();
    let stream = new ReadableStream<TextStreamPart<TOOLS>>({
      async start(controller) {
        // send start event:
        controller.enqueue({ type: 'start' });
      },

      async pull(controller) {
        // abort handling:
        function abort() {
          onAbort?.({ steps: recordedSteps });
          controller.enqueue({
            type: 'abort',
            // The `reason` is usually of type DOMException, but it can also be of any type,
            // so we use getErrorMessage for serialization because it is already designed to accept values of the unknown type.
            // See: https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/reason
            ...(abortSignal?.reason !== undefined
              ? { reason: getErrorMessage(abortSignal.reason) }
              : {}),
          });
          controller.close();
        }

        try {
          const { done, value } = await reader.read();

          if (done) {
            controller.close();
            return;
          }

          if (abortSignal?.aborted) {
            abort();
            return;
          }

          controller.enqueue(value);
        } catch (error) {
          if (isAbortError(error) && abortSignal?.aborted) {
            abort();
          } else {
            controller.error(error);
          }
        }
      },

      cancel(reason) {
        return stitchableStream.stream.cancel(reason);
      },
    });

    // introduce a gate that prevent further tokens from
    // being emitted after a transform calls stopStream
    let isRunning = true;
    stream = stream.pipeThrough(
      new TransformStream({
        async transform(chunk, controller) {
          if (isRunning) {
            controller.enqueue(chunk);
          }
        },
      }),
    );

    // transform the stream before output parsing
    // to enable replacement of stream segments:
    for (const transform of transforms) {
      stream = stream.pipeThrough(
        transform({
          tools: tools as TOOLS,
          stopStream() {
            stitchableStream.terminate();
            isRunning = false;
          },
        }),
      );
    }

    this.baseStream = stream
      .pipeThrough(createOutputTransformStream(output ?? text()))
      .pipeThrough(eventProcessor);

    const { maxRetries } = prepareRetries({
      maxRetries: maxRetriesArg,
      abortSignal,
    });

    const callSettings = prepareLanguageModelCallOptions(settings);

    const self = this;

    const callId = generateCallId();

    (async () => {
      const initialPrompt = await standardizePrompt({
        system,
        prompt,
        messages,
      } as Prompt);

      await notify({
        event: {
          callId,
          operationId: 'ai.streamText',
          provider: model.provider,
          modelId: model.modelId,
          system,
          messages: initialPrompt.messages,
          tools,
          toolChoice,
          activeTools,
          maxOutputTokens: callSettings.maxOutputTokens,
          temperature: callSettings.temperature,
          topP: callSettings.topP,
          topK: callSettings.topK,
          presencePenalty: callSettings.presencePenalty,
          frequencyPenalty: callSettings.frequencyPenalty,
          stopSequences: callSettings.stopSequences,
          seed: callSettings.seed,
          reasoning: callSettings.reasoning,
          maxRetries,
          timeout,
          headers,
          providerOptions,
          stopWhen,
          output,
          runtimeContext,
          toolsContext,
        },
        callbacks: [
          onStart,
          telemetryDispatcher.onStart as
            | undefined
            | StreamTextOnStartCallback<TOOLS, RUNTIME_CONTEXT, OUTPUT>,
        ],
      });

      const initialMessages = initialPrompt.messages;
      const initialResponseMessages: Array<ResponseMessage> = [];

      const { approvedToolApprovals, deniedToolApprovals } =
        collectToolApprovals<TOOLS>({ messages: initialMessages });

      // initial tool execution step stream
      if (deniedToolApprovals.length > 0 || approvedToolApprovals.length > 0) {
        const localApprovedToolApprovals = approvedToolApprovals.filter(
          toolApproval => !toolApproval.toolCall.providerExecuted,
        );
        const localDeniedToolApprovals = deniedToolApprovals.filter(
          toolApproval => !toolApproval.toolCall.providerExecuted,
        );

        const deniedProviderExecutedToolApprovals = deniedToolApprovals.filter(
          toolApproval => toolApproval.toolCall.providerExecuted,
        );

        let toolExecutionStepStreamController:
          | ReadableStreamDefaultController<TextStreamPart<TOOLS>>
          | undefined;
        const toolExecutionStepStream = new ReadableStream<
          TextStreamPart<TOOLS>
        >({
          start(controller) {
            toolExecutionStepStreamController = controller;
          },
        });

        self.addStream(toolExecutionStepStream);

        try {
          for (const toolApproval of [
            ...localDeniedToolApprovals,
            ...deniedProviderExecutedToolApprovals,
          ]) {
            toolExecutionStepStreamController?.enqueue({
              type: 'tool-output-denied',
              toolCallId: toolApproval.toolCall.toolCallId,
              toolName: toolApproval.toolCall.toolName,
            } as StaticToolOutputDenied<TOOLS>);
          }

          const toolOutputs: Array<ToolOutput<TOOLS>> = [];

          await Promise.all(
            localApprovedToolApprovals.map(async toolApproval => {
              const result = await executeToolCall({
                toolCall: toolApproval.toolCall,
                tools,
                callId,
                messages: initialMessages,
                abortSignal,
                timeout,
                toolsContext,
                onToolExecutionStart: filterNullable(
                  onToolExecutionStart,
                  telemetryDispatcher.onToolExecutionStart as
                    | OnToolExecutionStartCallback<TOOLS>
                    | undefined,
                ),
                onToolExecutionEnd: filterNullable(
                  onToolExecutionEnd,
                  telemetryDispatcher.onToolExecutionEnd as
                    | OnToolExecutionEndCallback<TOOLS>
                    | undefined,
                ),
                executeToolInTelemetryContext: telemetryDispatcher.executeTool,
                onPreliminaryToolResult: result => {
                  toolExecutionStepStreamController?.enqueue(result);
                },
              });

              if (result != null) {
                toolExecutionStepStreamController?.enqueue(result);
                toolOutputs.push(result);
              }
            }),
          );

          // Local tool results (approved + denied) are sent as tool results:
          if (toolOutputs.length > 0 || localDeniedToolApprovals.length > 0) {
            const localToolContent: ToolContent = [];

            // add regular tool results for approved tool calls:
            for (const output of toolOutputs) {
              localToolContent.push({
                type: 'tool-result' as const,
                toolCallId: output.toolCallId,
                toolName: output.toolName,
                output: await createToolModelOutput({
                  toolCallId: output.toolCallId,
                  input: output.input,
                  tool: tools?.[output.toolName],
                  output:
                    output.type === 'tool-result'
                      ? output.output
                      : output.error,
                  errorMode: output.type === 'tool-error' ? 'text' : 'none',
                }),
              });
            }

            // add execution denied tool results for denied local tool approvals:
            for (const toolApproval of localDeniedToolApprovals) {
              localToolContent.push({
                type: 'tool-result' as const,
                toolCallId: toolApproval.toolCall.toolCallId,
                toolName: toolApproval.toolCall.toolName,
                output: {
                  type: 'execution-denied' as const,
                  reason: toolApproval.approvalResponse.reason,
                },
              });
            }

            initialResponseMessages.push({
              role: 'tool',
              content: localToolContent,
            });
          }
        } finally {
          toolExecutionStepStreamController?.close();
        }
      }

      recordedResponseMessages.push(...initialResponseMessages);

      async function streamStep({
        currentStep,
        responseMessages,
        usage,
      }: {
        currentStep: number;
        responseMessages: Array<ResponseMessage>;
        usage: LanguageModelUsage;
      }) {
        const includeRawChunks = self.includeRawChunks;

        // Set up step timeout if configured
        const stepTimeoutId =
          stepTimeoutMs != null
            ? setTimeout(() => stepAbortController!.abort(), stepTimeoutMs)
            : undefined;

        // Set up chunk timeout tracking (will be reset on each chunk)
        let chunkTimeoutId: ReturnType<typeof setTimeout> | undefined =
          undefined;

        function resetChunkTimeout() {
          if (chunkTimeoutMs != null) {
            if (chunkTimeoutId != null) {
              clearTimeout(chunkTimeoutId);
            }
            chunkTimeoutId = setTimeout(
              () => chunkAbortController!.abort(),
              chunkTimeoutMs,
            );
          }
        }

        function clearChunkTimeout() {
          if (chunkTimeoutId != null) {
            clearTimeout(chunkTimeoutId);
            chunkTimeoutId = undefined;
          }
        }

        function clearStepTimeout() {
          if (stepTimeoutId != null) {
            clearTimeout(stepTimeoutId);
          }
        }

        try {
          stepFinish = new DelayedPromise<void>();

          const stepInputMessages = [...initialMessages, ...responseMessages];

          const prepareStepResult = await prepareStep?.({
            model,
            steps: recordedSteps,
            stepNumber: recordedSteps.length,
            messages: stepInputMessages,
            toolsContext,
            runtimeContext,
          });

          const stepModel = resolveLanguageModel(
            prepareStepResult?.model ?? model,
          );

          const stepActiveTools = filterActiveTools({
            tools,
            activeTools: prepareStepResult?.activeTools ?? activeTools,
          });

          const stepTools = await prepareTools({
            tools: stepActiveTools,
          });

          const stepToolChoice = prepareToolChoice({
            toolChoice: prepareStepResult?.toolChoice ?? toolChoice,
          });

          runtimeContext = prepareStepResult?.runtimeContext ?? runtimeContext;
          toolsContext = prepareStepResult?.toolsContext ?? toolsContext;

          const stepMessages = prepareStepResult?.messages ?? stepInputMessages;
          const stepSystem = prepareStepResult?.system ?? initialPrompt.system;

          const stepProviderOptions = mergeObjects(
            providerOptions,
            prepareStepResult?.providerOptions,
          );

          const stepStartTimestampMs = now();

          const { retry } = prepareRetries({ maxRetries, abortSignal });

          const {
            stream: languageModelStream,
            request,
            response,
          } = await retry(async () =>
            streamLanguageModelCall({
              model: prepareStepResult?.model ?? model,
              tools: stepActiveTools,
              toolChoice: prepareStepResult?.toolChoice ?? toolChoice,
              system: stepSystem,
              messages: stepMessages,
              repairToolCall,
              abortSignal,
              headers,
              includeRawChunks,
              providerOptions: stepProviderOptions,
              download,
              output,
              onStart: async ({ promptMessages }) => {
                await notify({
                  event: {
                    callId,
                    provider: stepModel.provider,
                    modelId: stepModel.modelId,
                    system: stepSystem,
                    messages: stepMessages,
                    tools,
                    toolChoice: prepareStepResult?.toolChoice ?? toolChoice,
                    activeTools: prepareStepResult?.activeTools ?? activeTools,
                    steps: [...recordedSteps],
                    providerOptions: stepProviderOptions,
                    runtimeContext,
                    toolsContext,
                    output,
                    promptMessages,
                    stepTools,
                    stepToolChoice,
                  },
                  callbacks: [
                    onStepStart,
                    telemetryDispatcher.onStepStart as
                      | undefined
                      | StreamTextOnStepStartCallback<
                          TOOLS,
                          RUNTIME_CONTEXT,
                          OUTPUT
                        >,
                  ],
                });
              },
              ...callSettings,
            }),
          );

          const stream2 = invokeToolCallbacksFromStream({
            stream: languageModelStream,
            tools,
            stepInputMessages,
            abortSignal,
            runtimeContext,
          });

          const streamWithToolResults = stream2.pipeThrough(
            createExecuteToolsTransformation({
              tools,
              callId,
              messages: stepInputMessages,
              abortSignal,
              timeout,
              toolsContext,
              toolApproval,
              runtimeContext,
              generateId,
              onToolExecutionStart: filterNullable(
                onToolExecutionStart,
                telemetryDispatcher.onToolExecutionStart as
                  | OnToolExecutionStartCallback<TOOLS>
                  | undefined,
              ),
              onToolExecutionEnd: filterNullable(
                onToolExecutionEnd,
                telemetryDispatcher.onToolExecutionEnd as
                  | OnToolExecutionEndCallback<TOOLS>
                  | undefined,
              ),
              executeToolInTelemetryContext: telemetryDispatcher.executeTool,
            }),
          );

          // Conditionally include request.body based on include settings.
          // Large payloads (e.g., base64-encoded images) can cause memory issues.
          const stepRequest: LanguageModelRequestMetadata =
            (include?.requestBody ?? true)
              ? (request ?? {})
              : { ...request, body: undefined };
          const stepToolCalls: TypedToolCall<TOOLS>[] = [];
          const stepToolOutputs: ToolOutput<TOOLS>[] = [];
          const stepToolApprovalResponses: ToolApprovalResponse[] = [];
          let warnings: SharedV4Warning[] | undefined;

          let stepFinishReason: FinishReason = 'other';
          let stepRawFinishReason: string | undefined = undefined;

          let stepUsage: LanguageModelUsage = createNullLanguageModelUsage();
          let stepProviderMetadata: ProviderMetadata | undefined;
          let stepFirstChunk = true;
          let stepResponse: { id: string; timestamp: Date; modelId: string } = {
            id: generateId(),
            timestamp: new Date(),
            modelId: model.modelId,
          };

          self.addStream(
            streamWithToolResults.pipeThrough(
              new TransformStream<
                LanguageModelStreamPart<TOOLS>,
                TextStreamPart<TOOLS>
              >({
                async transform(chunk, controller): Promise<void> {
                  resetChunkTimeout();

                  if (chunk.type === 'model-call-start') {
                    warnings = chunk.warnings;
                    return; // stream start chunks are sent immediately and do not count as first chunk
                  }

                  if (stepFirstChunk) {
                    const msToFirstChunk = now() - stepStartTimestampMs;
                    stepFirstChunk = false;

                    // Step start:
                    controller.enqueue({
                      type: 'start-step',
                      request: stepRequest,
                      warnings: warnings ?? [],
                    });

                    void telemetryDispatcher.onChunk?.({
                      chunk: {
                        type: 'ai.stream.firstChunk',
                        callId,
                        stepNumber: recordedSteps.length,
                        attributes: {
                          'ai.response.msToFirstChunk': msToFirstChunk,
                        },
                      },
                    });
                  }

                  const chunkType = chunk.type;
                  switch (chunkType) {
                    case 'file':
                    case 'custom':
                    case 'source':
                    case 'text-start':
                    case 'text-end':
                    case 'reasoning-start':
                    case 'reasoning-end':
                    case 'reasoning-delta':
                    case 'reasoning-file':
                    case 'tool-input-start':
                    case 'tool-input-end':
                    case 'tool-input-delta':
                    case 'tool-approval-request': {
                      controller.enqueue(chunk);
                      break;
                    }

                    case 'text-delta': {
                      if (chunk.text.length > 0) {
                        controller.enqueue(chunk);
                      }
                      break;
                    }

                    case 'tool-call': {
                      controller.enqueue(chunk);
                      // store tool calls for onFinish callback and toolCalls promise:
                      stepToolCalls.push(chunk);
                      break;
                    }

                    case 'tool-approval-response': {
                      controller.enqueue(chunk);
                      stepToolApprovalResponses.push(chunk);
                      break;
                    }

                    case 'tool-result': {
                      controller.enqueue(chunk);

                      if (!chunk.preliminary) {
                        stepToolOutputs.push(chunk);
                      }

                      break;
                    }

                    case 'tool-error': {
                      controller.enqueue(chunk);
                      stepToolOutputs.push(chunk);
                      break;
                    }

                    case 'model-call-response-metadata': {
                      stepResponse = {
                        id: chunk.id ?? stepResponse.id,
                        timestamp: chunk.timestamp ?? stepResponse.timestamp,
                        modelId: chunk.modelId ?? stepResponse.modelId,
                      };
                      break;
                    }

                    case 'model-call-end': {
                      // Note: tool executions might not be finished yet when the finish event is emitted.
                      // store usage and finish reason for promises and onFinish callback:
                      stepUsage = chunk.usage;
                      stepFinishReason = chunk.finishReason;
                      stepRawFinishReason = chunk.rawFinishReason;
                      stepProviderMetadata = chunk.providerMetadata;
                      const msToFinish = now() - stepStartTimestampMs;
                      void telemetryDispatcher.onChunk?.({
                        chunk: {
                          type: 'ai.stream.finish',
                          callId,
                          stepNumber: recordedSteps.length,
                          attributes: {
                            'ai.response.msToFinish': msToFinish,
                            'ai.response.avgOutputTokensPerSecond':
                              (1000 * (stepUsage.outputTokens ?? 0)) /
                              msToFinish,
                          },
                        },
                      });

                      break;
                    }

                    case 'error': {
                      controller.enqueue(chunk);
                      stepFinishReason = 'error';
                      break;
                    }

                    case 'raw': {
                      if (includeRawChunks) {
                        controller.enqueue(chunk);
                      }
                      break;
                    }

                    default: {
                      const exhaustiveCheck: never = chunkType;
                      throw new Error(`Unknown chunk type: ${exhaustiveCheck}`);
                    }
                  }

                  if (
                    chunkType !== 'model-call-end' &&
                    chunkType !== 'model-call-response-metadata'
                  ) {
                    void telemetryDispatcher.onChunk?.({ chunk });
                  }
                },

                // invoke onFinish callback and resolve toolResults promise when the stream is about to close:
                async flush(controller) {
                  controller.enqueue({
                    type: 'finish-step',
                    finishReason: stepFinishReason,
                    rawFinishReason: stepRawFinishReason,
                    usage: stepUsage,
                    providerMetadata: stepProviderMetadata,
                    response: {
                      ...stepResponse,
                      headers: response?.headers,
                    },
                  });

                  const combinedUsage = addLanguageModelUsage(usage, stepUsage);

                  // wait for the step to be fully processed by the event processor
                  // to ensure that the recorded steps are complete:
                  await stepFinish.promise;

                  const clientToolCalls = stepToolCalls.filter(
                    toolCall => toolCall.providerExecuted !== true,
                  );
                  const clientToolOutputs = stepToolOutputs.filter(
                    toolOutput => toolOutput.providerExecuted !== true,
                  );
                  const deniedToolApprovalResponses =
                    stepToolApprovalResponses.filter(
                      toolApprovalResponse =>
                        toolApprovalResponse.approved === false,
                    );

                  // Track provider-executed tool calls that support deferred results.
                  // In programmatic tool calling, a server tool (e.g., code_execution) may
                  // trigger a client tool, and the server tool's result is deferred until
                  // the client tool's result is sent back.
                  for (const toolCall of stepToolCalls) {
                    if (toolCall.providerExecuted !== true) continue;
                    const tool = tools?.[toolCall.toolName];
                    if (
                      tool?.type === 'provider' &&
                      tool.supportsDeferredResults
                    ) {
                      // Check if this tool call already has a result in the current step
                      const hasResultInStep = stepToolOutputs.some(
                        output =>
                          (output.type === 'tool-result' ||
                            output.type === 'tool-error') &&
                          output.toolCallId === toolCall.toolCallId,
                      );
                      if (!hasResultInStep) {
                        pendingDeferredToolCalls.set(toolCall.toolCallId, {
                          toolName: toolCall.toolName,
                        });
                      }
                    }
                  }

                  // Mark deferred tool calls as resolved when we receive their results
                  for (const output of stepToolOutputs) {
                    if (
                      output.type === 'tool-result' ||
                      output.type === 'tool-error'
                    ) {
                      pendingDeferredToolCalls.delete(output.toolCallId);
                    }
                  }

                  // Clear the step and chunk timeouts before the next step is started
                  clearStepTimeout();
                  clearChunkTimeout();

                  if (
                    // Continue if:
                    // 1. There are client tool calls that have all been executed or denied, OR
                    // 2. There are pending deferred results from provider-executed tools, OR
                    ((clientToolCalls.length > 0 &&
                      clientToolCalls.length ===
                        clientToolOutputs.length +
                          deniedToolApprovalResponses.length) ||
                      pendingDeferredToolCalls.size > 0) &&
                    // continue until a stop condition is met:
                    !(await isStopConditionMet({
                      stopConditions,
                      steps: recordedSteps,
                    }))
                  ) {
                    // append to messages for the next step:
                    responseMessages.push(
                      ...(await toResponseMessages({
                        content:
                          // use transformed content to create the messages for the next step:
                          recordedSteps[recordedSteps.length - 1].content,
                        tools,
                      })),
                    );

                    try {
                      await streamStep({
                        currentStep: currentStep + 1,
                        responseMessages,
                        usage: combinedUsage,
                      });
                    } catch (error) {
                      controller.enqueue({
                        type: 'error',
                        error,
                      });

                      self.closeStream();
                    }
                  } else {
                    controller.enqueue({
                      type: 'finish',
                      finishReason: stepFinishReason,
                      rawFinishReason: stepRawFinishReason,
                      totalUsage: combinedUsage,
                    });

                    self.closeStream(); // close the stitchable stream
                  }
                },
              }),
            ),
          );
        } finally {
          clearStepTimeout();
          clearChunkTimeout();
        }
      }

      // add the initial stream to the stitchable stream
      await streamStep({
        currentStep: 0,
        responseMessages: initialResponseMessages,
        usage: createNullLanguageModelUsage(),
      });
    })().catch(async error => {
      await telemetryDispatcher.onError?.({ callId, error });

      // add an error stream part and close the streams:
      self.addStream(
        new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'error', error });
            controller.close();
          },
        }),
      );
      self.closeStream();
    });
  }

  get steps() {
    // when any of the promises are accessed, the stream is consumed
    // so it resolves without needing to consume the stream separately
    this.consumeStream();

    return this._steps.promise;
  }

  private get finalStep() {
    return this.steps.then(steps => steps[steps.length - 1]);
  }

  get content() {
    return this.finalStep.then(step => step.content);
  }

  get warnings() {
    return this.finalStep.then(step => step.warnings);
  }

  get providerMetadata() {
    return this.finalStep.then(step => step.providerMetadata);
  }

  get text() {
    return this.finalStep.then(step => step.text);
  }

  get reasoningText() {
    return this.finalStep.then(step => step.reasoningText);
  }

  get reasoning() {
    return this.finalStep.then(step =>
      convertToReasoningOutputs(step.reasoning),
    );
  }

  get sources() {
    return this.finalStep.then(step => step.sources);
  }

  get files() {
    return this.finalStep.then(step => step.files);
  }

  get toolCalls() {
    return this.finalStep.then(step => step.toolCalls);
  }

  get staticToolCalls() {
    return this.finalStep.then(step => step.staticToolCalls);
  }

  get dynamicToolCalls() {
    return this.finalStep.then(step => step.dynamicToolCalls);
  }

  get toolResults() {
    return this.finalStep.then(step => step.toolResults);
  }

  get staticToolResults() {
    return this.finalStep.then(step => step.staticToolResults);
  }

  get dynamicToolResults() {
    return this.finalStep.then(step => step.dynamicToolResults);
  }

  get usage() {
    return this.finalStep.then(step => step.usage);
  }

  get request() {
    return this.finalStep.then(step => step.request);
  }

  get response() {
    return this.finalStep.then(step => step.response);
  }

  get totalUsage() {
    // when any of the promises are accessed, the stream is consumed
    // so it resolves without needing to consume the stream separately
    this.consumeStream();

    return this._totalUsage.promise;
  }

  get finishReason() {
    // when any of the promises are accessed, the stream is consumed
    // so it resolves without needing to consume the stream separately
    this.consumeStream();

    return this._finishReason.promise;
  }

  get rawFinishReason() {
    // when any of the promises are accessed, the stream is consumed
    // so it resolves without needing to consume the stream separately
    this.consumeStream();

    return this._rawFinishReason.promise;
  }

  /**
   * Split out a new stream from the original stream.
   * The original stream is replaced to allow for further splitting,
   * since we do not know how many times the stream will be split.
   *
   * Note: this leads to buffering the stream content on the server.
   * However, the LLM results are expected to be small enough to not cause issues.
   */
  private teeStream() {
    const [stream1, stream2] = this.baseStream.tee();
    this.baseStream = stream2;
    return stream1;
  }

  get textStream(): AsyncIterableStream<string> {
    return createAsyncIterableStream(
      this.teeStream().pipeThrough(
        new TransformStream<
          EnrichedStreamPart<TOOLS, InferPartialOutput<OUTPUT>>,
          string
        >({
          transform({ part }, controller) {
            if (part.type === 'text-delta') {
              controller.enqueue(part.text);
            }
          },
        }),
      ),
    );
  }

  get fullStream(): AsyncIterableStream<TextStreamPart<TOOLS>> {
    return createAsyncIterableStream(
      this.teeStream().pipeThrough(
        new TransformStream<
          EnrichedStreamPart<TOOLS, InferPartialOutput<OUTPUT>>,
          TextStreamPart<TOOLS>
        >({
          transform({ part }, controller) {
            controller.enqueue(part);
          },
        }),
      ),
    );
  }

  async consumeStream(options?: ConsumeStreamOptions): Promise<void> {
    try {
      await consumeStream({
        stream: this.fullStream,
        onError: options?.onError,
      });
    } catch (error) {
      options?.onError?.(error);
    }
  }

  get experimental_partialOutputStream(): AsyncIterableStream<
    InferPartialOutput<OUTPUT>
  > {
    return this.partialOutputStream;
  }

  get partialOutputStream(): AsyncIterableStream<InferPartialOutput<OUTPUT>> {
    return createAsyncIterableStream(
      this.teeStream().pipeThrough(
        new TransformStream<
          EnrichedStreamPart<TOOLS, InferPartialOutput<OUTPUT>>,
          InferPartialOutput<OUTPUT>
        >({
          transform({ partialOutput }, controller) {
            if (partialOutput != null) {
              controller.enqueue(partialOutput);
            }
          },
        }),
      ),
    );
  }

  get elementStream(): AsyncIterableStream<InferElementOutput<OUTPUT>> {
    const transform = this.outputSpecification?.createElementStreamTransform();

    if (transform == null) {
      throw new UnsupportedFunctionalityError({
        functionality: `element streams in ${this.outputSpecification?.name ?? 'text'} mode`,
      });
    }

    return createAsyncIterableStream(this.teeStream().pipeThrough(transform));
  }

  get output(): Promise<InferCompleteOutput<OUTPUT>> {
    return this.finalStep.then(step => {
      const output = this.outputSpecification ?? text();
      return output.parseCompleteOutput(
        { text: step.text },
        {
          response: step.response,
          usage: step.usage,
          finishReason: step.finishReason,
        },
      );
    });
  }

  toUIMessageStream<UI_MESSAGE extends UIMessage>({
    originalMessages,
    generateMessageId,
    onFinish,
    messageMetadata,
    sendReasoning = true,
    sendSources = false,
    sendStart = true,
    sendFinish = true,
    onError = getErrorMessage,
  }: UIMessageStreamOptions<UI_MESSAGE> = {}): AsyncIterableStream<
    InferUIMessageChunk<UI_MESSAGE>
  > {
    const responseMessageId =
      generateMessageId != null
        ? getResponseUIMessageId({
            originalMessages,
            responseMessageId: generateMessageId,
          })
        : undefined;

    // TODO simplify once dynamic is no longer needed for invalid tool inputs
    const isDynamic = (part: { toolName: string; dynamic?: boolean }) => {
      const tool = this.tools?.[part.toolName];

      // provider-executed, dynamic tools are not listed in the tools object
      if (tool == null) {
        return part.dynamic;
      }

      return tool?.type === 'dynamic' ? true : undefined;
    };

    const baseStream = this.fullStream.pipeThrough(
      new TransformStream<
        TextStreamPart<TOOLS>,
        UIMessageChunk<
          InferUIMessageMetadata<UI_MESSAGE>,
          InferUIMessageData<UI_MESSAGE>
        >
      >({
        transform: async (part, controller) => {
          const messageMetadataValue = messageMetadata?.({ part });

          const partType = part.type;
          switch (partType) {
            case 'text-start': {
              controller.enqueue({
                type: 'text-start',
                id: part.id,
                ...(part.providerMetadata != null
                  ? { providerMetadata: part.providerMetadata }
                  : {}),
              });
              break;
            }

            case 'text-delta': {
              controller.enqueue({
                type: 'text-delta',
                id: part.id,
                delta: part.text,
                ...(part.providerMetadata != null
                  ? { providerMetadata: part.providerMetadata }
                  : {}),
              });
              break;
            }

            case 'text-end': {
              controller.enqueue({
                type: 'text-end',
                id: part.id,
                ...(part.providerMetadata != null
                  ? { providerMetadata: part.providerMetadata }
                  : {}),
              });
              break;
            }

            case 'reasoning-start':
            case 'reasoning-end': {
              if (sendReasoning) {
                controller.enqueue({
                  type: partType,
                  id: part.id,
                  ...(part.providerMetadata != null
                    ? { providerMetadata: part.providerMetadata }
                    : {}),
                });
              }
              break;
            }

            case 'reasoning-delta': {
              if (sendReasoning) {
                controller.enqueue({
                  type: 'reasoning-delta',
                  id: part.id,
                  delta: part.text,
                  ...(part.providerMetadata != null
                    ? { providerMetadata: part.providerMetadata }
                    : {}),
                });
              }
              break;
            }

            case 'file':
            case 'reasoning-file': {
              if (partType !== 'reasoning-file' || sendReasoning) {
                controller.enqueue({
                  type: part.type,
                  mediaType: part.file.mediaType,
                  url: `data:${part.file.mediaType};base64,${part.file.base64}`,
                  ...(part.providerMetadata != null
                    ? { providerMetadata: part.providerMetadata }
                    : {}),
                });
              }
              break;
            }

            case 'source': {
              if (sendSources && part.sourceType === 'url') {
                controller.enqueue({
                  type: 'source-url',
                  sourceId: part.id,
                  url: part.url,
                  title: part.title,
                  ...(part.providerMetadata != null
                    ? { providerMetadata: part.providerMetadata }
                    : {}),
                });
              }

              if (sendSources && part.sourceType === 'document') {
                controller.enqueue({
                  type: 'source-document',
                  sourceId: part.id,
                  mediaType: part.mediaType,
                  title: part.title,
                  filename: part.filename,
                  ...(part.providerMetadata != null
                    ? { providerMetadata: part.providerMetadata }
                    : {}),
                });
              }
              break;
            }

            case 'custom': {
              controller.enqueue({
                type: 'custom',
                kind: part.kind,
                ...(part.providerMetadata != null
                  ? { providerMetadata: part.providerMetadata }
                  : {}),
              });
              break;
            }

            case 'tool-input-start': {
              const dynamic = isDynamic(part);

              controller.enqueue({
                type: 'tool-input-start',
                toolCallId: part.id,
                toolName: part.toolName,
                ...(part.providerExecuted != null
                  ? { providerExecuted: part.providerExecuted }
                  : {}),
                ...(part.providerMetadata != null
                  ? { providerMetadata: part.providerMetadata }
                  : {}),
                ...(dynamic != null ? { dynamic } : {}),
                ...(part.title != null ? { title: part.title } : {}),
              });
              break;
            }

            case 'tool-input-delta': {
              controller.enqueue({
                type: 'tool-input-delta',
                toolCallId: part.id,
                inputTextDelta: part.delta,
              });
              break;
            }

            case 'tool-call': {
              const dynamic = isDynamic(part);

              if (part.invalid) {
                controller.enqueue({
                  type: 'tool-input-error',
                  toolCallId: part.toolCallId,
                  toolName: part.toolName,
                  input: part.input,
                  ...(part.providerExecuted != null
                    ? { providerExecuted: part.providerExecuted }
                    : {}),
                  ...(part.providerMetadata != null
                    ? { providerMetadata: part.providerMetadata }
                    : {}),
                  ...(dynamic != null ? { dynamic } : {}),
                  errorText: onError(part.error),
                  ...(part.title != null ? { title: part.title } : {}),
                });
              } else {
                controller.enqueue({
                  type: 'tool-input-available',
                  toolCallId: part.toolCallId,
                  toolName: part.toolName,
                  input: part.input,
                  ...(part.providerExecuted != null
                    ? { providerExecuted: part.providerExecuted }
                    : {}),
                  ...(part.providerMetadata != null
                    ? { providerMetadata: part.providerMetadata }
                    : {}),
                  ...(dynamic != null ? { dynamic } : {}),
                  ...(part.title != null ? { title: part.title } : {}),
                });
              }

              break;
            }

            case 'tool-approval-request': {
              controller.enqueue({
                type: 'tool-approval-request',
                approvalId: part.approvalId,
                toolCallId: part.toolCall.toolCallId,
                ...(part.isAutomatic != null
                  ? { isAutomatic: part.isAutomatic }
                  : {}),
              });
              break;
            }

            case 'tool-approval-response': {
              controller.enqueue({
                type: 'tool-approval-response',
                approvalId: part.approvalId,
                approved: part.approved,
                ...(part.reason != null ? { reason: part.reason } : {}),
                ...(part.providerExecuted != null
                  ? { providerExecuted: part.providerExecuted }
                  : {}),
              });
              break;
            }

            case 'tool-result': {
              const dynamic = isDynamic(part);

              controller.enqueue({
                type: 'tool-output-available',
                toolCallId: part.toolCallId,
                output: part.output,
                ...(part.providerExecuted != null
                  ? { providerExecuted: part.providerExecuted }
                  : {}),
                ...(part.providerMetadata != null
                  ? { providerMetadata: part.providerMetadata }
                  : {}),
                ...(part.preliminary != null
                  ? { preliminary: part.preliminary }
                  : {}),
                ...(dynamic != null ? { dynamic } : {}),
              });
              break;
            }

            case 'tool-error': {
              const dynamic = isDynamic(part);

              controller.enqueue({
                type: 'tool-output-error',
                toolCallId: part.toolCallId,
                errorText: part.providerExecuted
                  ? typeof part.error === 'string'
                    ? part.error
                    : JSON.stringify(part.error)
                  : onError(part.error),
                ...(part.providerExecuted != null
                  ? { providerExecuted: part.providerExecuted }
                  : {}),
                ...(part.providerMetadata != null
                  ? { providerMetadata: part.providerMetadata }
                  : {}),
                ...(dynamic != null ? { dynamic } : {}),
              });
              break;
            }

            case 'tool-output-denied': {
              controller.enqueue({
                type: 'tool-output-denied',
                toolCallId: part.toolCallId,
              });
              break;
            }

            case 'error': {
              controller.enqueue({
                type: 'error',
                errorText: onError(part.error),
              });
              break;
            }

            case 'start-step': {
              controller.enqueue({ type: 'start-step' });
              break;
            }

            case 'finish-step': {
              controller.enqueue({ type: 'finish-step' });
              break;
            }

            case 'start': {
              if (sendStart) {
                controller.enqueue({
                  type: 'start',
                  ...(messageMetadataValue != null
                    ? { messageMetadata: messageMetadataValue }
                    : {}),
                  ...(responseMessageId != null
                    ? { messageId: responseMessageId }
                    : {}),
                });
              }
              break;
            }

            case 'finish': {
              if (sendFinish) {
                controller.enqueue({
                  type: 'finish',
                  finishReason: part.finishReason,
                  ...(messageMetadataValue != null
                    ? { messageMetadata: messageMetadataValue }
                    : {}),
                });
              }
              break;
            }

            case 'abort': {
              controller.enqueue(part);
              break;
            }

            case 'tool-input-end': {
              break;
            }

            case 'raw': {
              // Raw chunks are not included in UI message streams
              // as they contain provider-specific data for developer use
              break;
            }

            default: {
              const exhaustiveCheck: never = partType;
              throw new Error(`Unknown chunk type: ${exhaustiveCheck}`);
            }
          }

          // start and finish events already have metadata
          // so we only need to send metadata for other parts
          if (
            messageMetadataValue != null &&
            partType !== 'start' &&
            partType !== 'finish'
          ) {
            controller.enqueue({
              type: 'message-metadata',
              messageMetadata: messageMetadataValue,
            });
          }
        },
      }),
    );

    return createAsyncIterableStream(
      handleUIMessageStreamFinish<UI_MESSAGE>({
        stream: baseStream,
        messageId: responseMessageId ?? generateMessageId?.(),
        originalMessages,
        onFinish,
        onError,
      }),
    );
  }

  pipeUIMessageStreamToResponse<UI_MESSAGE extends UIMessage>(
    response: ServerResponse,
    {
      originalMessages,
      generateMessageId,
      onFinish,
      messageMetadata,
      sendReasoning,
      sendSources,
      sendFinish,
      sendStart,
      onError,
      ...init
    }: UIMessageStreamResponseInit & UIMessageStreamOptions<UI_MESSAGE> = {},
  ) {
    pipeUIMessageStreamToResponse({
      response,
      stream: this.toUIMessageStream({
        originalMessages,
        generateMessageId,
        onFinish,
        messageMetadata,
        sendReasoning,
        sendSources,
        sendFinish,
        sendStart,
        onError,
      }),
      ...init,
    });
  }

  pipeTextStreamToResponse(response: ServerResponse, init?: ResponseInit) {
    pipeTextStreamToResponse({
      response,
      textStream: this.textStream,
      ...init,
    });
  }

  toUIMessageStreamResponse<UI_MESSAGE extends UIMessage>({
    originalMessages,
    generateMessageId,
    onFinish,
    messageMetadata,
    sendReasoning,
    sendSources,
    sendFinish,
    sendStart,
    onError,
    ...init
  }: UIMessageStreamResponseInit &
    UIMessageStreamOptions<UI_MESSAGE> = {}): Response {
    return createUIMessageStreamResponse({
      stream: this.toUIMessageStream({
        originalMessages,
        generateMessageId,
        onFinish,
        messageMetadata,
        sendReasoning,
        sendSources,
        sendFinish,
        sendStart,
        onError,
      }),
      ...init,
    });
  }

  toTextStreamResponse(init?: ResponseInit): Response {
    return createTextStreamResponse({
      textStream: this.textStream,
      ...init,
    });
  }
}
