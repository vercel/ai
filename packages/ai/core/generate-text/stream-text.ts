import { LanguageModelV2, LanguageModelV2CallWarning } from '@ai-sdk/provider';
import { createIdGenerator, IdGenerator } from '@ai-sdk/provider-utils';
import { Span } from '@opentelemetry/api';
import { ServerResponse } from 'node:http';
import { NoOutputSpecifiedError } from '../../src/error/no-output-specified-error';
import { createTextStreamResponse } from '../../src/text-stream/create-text-stream-response';
import { pipeTextStreamToResponse } from '../../src/text-stream/pipe-text-stream-to-response';
import { UIDataTypes, UIMessage } from '../../src/ui';
import { createUIMessageStreamResponse } from '../../src/ui-message-stream/create-ui-message-stream-response';
import { handleUIMessageStreamFinish } from '../../src/ui-message-stream/handle-ui-message-stream-finish';
import { pipeUIMessageStreamToResponse } from '../../src/ui-message-stream/pipe-ui-message-stream-to-response';
import {
  InferUIMessageStreamPart,
  UIMessageStreamPart,
} from '../../src/ui-message-stream/ui-message-stream-parts';
import {
  InferUIMessageData,
  InferUIMessageMetadata,
} from '../../src/ui/ui-messages';
import { asArray } from '../../src/util/as-array';
import {
  AsyncIterableStream,
  createAsyncIterableStream,
} from '../../src/util/async-iterable-stream';
import { consumeStream } from '../../src/util/consume-stream';
import { createStitchableStream } from '../../src/util/create-stitchable-stream';
import { DelayedPromise } from '../../src/util/delayed-promise';
import { now as originalNow } from '../../src/util/now';
import { prepareRetries } from '../../src/util/prepare-retries';
import { CallSettings } from '../prompt/call-settings';
import { convertToLanguageModelPrompt } from '../prompt/convert-to-language-model-prompt';
import { prepareCallSettings } from '../prompt/prepare-call-settings';
import { prepareToolsAndToolChoice } from '../prompt/prepare-tools-and-tool-choice';
import { Prompt } from '../prompt/prompt';
import { resolveLanguageModel } from '../prompt/resolve-language-model';
import { standardizePrompt } from '../prompt/standardize-prompt';
import { wrapGatewayError } from '../prompt/wrap-gateway-error';
import { assembleOperationName } from '../telemetry/assemble-operation-name';
import { getBaseTelemetryAttributes } from '../telemetry/get-base-telemetry-attributes';
import { getTracer } from '../telemetry/get-tracer';
import { recordSpan } from '../telemetry/record-span';
import { selectTelemetryAttributes } from '../telemetry/select-telemetry-attributes';
import { stringifyForTelemetry } from '../telemetry/stringify-for-telemetry';
import { TelemetrySettings } from '../telemetry/telemetry-settings';
import { LanguageModelRequestMetadata } from '../types';
import {
  CallWarning,
  FinishReason,
  LanguageModel,
  ToolChoice,
} from '../types/language-model';
import { ProviderMetadata, ProviderOptions } from '../types/provider-metadata';
import { addLanguageModelUsage, LanguageModelUsage } from '../types/usage';
import { ContentPart } from './content-part';
import { Output } from './output';
import { PrepareStepFunction } from './prepare-step';
import { ResponseMessage } from './response-message';
import {
  runToolsTransformation,
  SingleRequestTextStreamPart,
} from './run-tools-transformation';
import { DefaultStepResult, StepResult } from './step-result';
import {
  isStopConditionMet,
  stepCountIs,
  StopCondition,
} from './stop-condition';
import {
  ConsumeStreamOptions,
  StreamTextResult,
  TextStreamPart,
  UIMessageStreamOptions,
} from './stream-text-result';
import { toResponseMessages } from './to-response-messages';
import { ToolCallUnion } from './tool-call';
import { ToolCallRepairFunction } from './tool-call-repair-function';
import { ToolResultUnion } from './tool-result';
import { ToolSet } from './tool-set';
import { getResponseUIMessageId } from '../../src/ui-message-stream/get-response-ui-message-id';
import { UIMessageStreamResponseInit } from '../../src/ui-message-stream/ui-message-stream-response-init';

const originalGenerateId = createIdGenerator({
  prefix: 'aitxt',
  size: 24,
});

/**
A transformation that is applied to the stream.

@param stopStream - A function that stops the source stream.
@param tools - The tools that are accessible to and can be called by the model. The model needs to support calling tools.
 */
export type StreamTextTransform<TOOLS extends ToolSet> = (options: {
  tools: TOOLS; // for type inference
  stopStream: () => void;
}) => TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>;

/**
Callback that is set using the `onError` option.

@param event - The event that is passed to the callback.
 */
export type StreamTextOnErrorCallback = (event: {
  error: unknown;
}) => Promise<void> | void;

/**
Callback that is set using the `onStepFinish` option.

@param stepResult - The result of the step.
 */
export type StreamTextOnStepFinishCallback<TOOLS extends ToolSet> = (
  stepResult: StepResult<TOOLS>,
) => Promise<void> | void;

/**
Callback that is set using the `onChunk` option.

@param event - The event that is passed to the callback.
 */
export type StreamTextOnChunkCallback<TOOLS extends ToolSet> = (event: {
  chunk: Extract<
    TextStreamPart<TOOLS>,
    {
      type:
        | 'text'
        | 'reasoning'
        | 'source'
        | 'tool-call'
        | 'tool-call-streaming-start'
        | 'tool-call-delta'
        | 'tool-result'
        | 'raw';
    }
  >;
}) => Promise<void> | void;

/**
Callback that is set using the `onFinish` option.

@param event - The event that is passed to the callback.
 */
export type StreamTextOnFinishCallback<TOOLS extends ToolSet> = (
  event: StepResult<TOOLS> & {
    /**
Details for all steps.
   */
    readonly steps: StepResult<TOOLS>[];

    /**
Total usage for all steps. This is the sum of the usage of all steps.
     */
    readonly totalUsage: LanguageModelUsage;
  },
) => Promise<void> | void;

/**
Generate a text and call tools for a given prompt using a language model.

This function streams the output. If you do not want to stream the output, use `generateText` instead.

@param model - The language model to use.
@param tools - Tools that are accessible to and can be called by the model. The model needs to support calling tools.

@param system - A system message that will be part of the prompt.
@param prompt - A simple text prompt. You can either use `prompt` or `messages` but not both.
@param messages - A list of messages. You can either use `prompt` or `messages` but not both.

@param maxOutputTokens - Maximum number of tokens to generate.
@param temperature - Temperature setting.
The value is passed through to the provider. The range depends on the provider and model.
It is recommended to set either `temperature` or `topP`, but not both.
@param topP - Nucleus sampling.
The value is passed through to the provider. The range depends on the provider and model.
It is recommended to set either `temperature` or `topP`, but not both.
@param topK - Only sample from the top K options for each subsequent token.
Used to remove "long tail" low probability responses.
Recommended for advanced use cases only. You usually only need to use temperature.
@param presencePenalty - Presence penalty setting.
It affects the likelihood of the model to repeat information that is already in the prompt.
The value is passed through to the provider. The range depends on the provider and model.
@param frequencyPenalty - Frequency penalty setting.
It affects the likelihood of the model to repeatedly use the same words or phrases.
The value is passed through to the provider. The range depends on the provider and model.
@param stopSequences - Stop sequences.
If set, the model will stop generating text when one of the stop sequences is generated.
@param seed - The seed (integer) to use for random sampling.
If set and supported by the model, calls will generate deterministic results.

@param maxRetries - Maximum number of retries. Set to 0 to disable retries. Default: 2.
@param abortSignal - An optional abort signal that can be used to cancel the call.
@param headers - Additional HTTP headers to be sent with the request. Only applicable for HTTP-based providers.

@param maxSteps - Maximum number of sequential LLM calls (steps), e.g. when you use tool calls.

@param onChunk - Callback that is called for each chunk of the stream. The stream processing will pause until the callback promise is resolved.
@param onError - Callback that is called when an error occurs during streaming. You can use it to log errors.
@param onStepFinish - Callback that is called when each step (LLM call) is finished, including intermediate steps.
@param onFinish - Callback that is called when the LLM response and all request tool executions
(for tools that have an `execute` function) are finished.

@return
A result object for accessing different stream types and additional information.
 */
export function streamText<
  TOOLS extends ToolSet,
  OUTPUT = never,
  PARTIAL_OUTPUT = never,
>({
  model,
  tools,
  toolChoice,
  system,
  prompt,
  messages,
  maxRetries,
  abortSignal,
  headers,
  stopWhen = stepCountIs(1),
  experimental_output: output,
  experimental_telemetry: telemetry,
  prepareStep,
  providerOptions,
  experimental_activeTools,
  activeTools = experimental_activeTools,
  experimental_repairToolCall: repairToolCall,
  experimental_transform: transform,
  includeRawChunks = false,
  onChunk,
  onError = ({ error }) => {
    console.error(error);
  },
  onFinish,
  onStepFinish,
  _internal: {
    now = originalNow,
    generateId = originalGenerateId,
    currentDate = () => new Date(),
  } = {},
  ...settings
}: CallSettings &
  Prompt & {
    /**
The language model to use.
     */
    model: LanguageModel;

    /**
The tools that the model can call. The model needs to support calling tools.
    */
    tools?: TOOLS;

    /**
The tool choice strategy. Default: 'auto'.
     */
    toolChoice?: ToolChoice<TOOLS>;

    /**
Condition for stopping the generation when there are tool results in the last step.
When the condition is an array, any of the conditions can be met to stop the generation.

@default stepCountIs(1)
     */
    stopWhen?:
      | StopCondition<NoInfer<TOOLS>>
      | Array<StopCondition<NoInfer<TOOLS>>>;

    /**
Optional telemetry configuration (experimental).
     */
    experimental_telemetry?: TelemetrySettings;

    /**
Additional provider-specific options. They are passed through
to the provider from the AI SDK and enable provider-specific
functionality that can be fully encapsulated in the provider.
 */
    providerOptions?: ProviderOptions;

    /**
     * @deprecated Use `activeTools` instead.
     */
    experimental_activeTools?: Array<keyof NoInfer<TOOLS>>;

    /**
   Limits the tools that are available for the model to call without
   changing the tool call and result types in the result.
        */
    activeTools?: Array<keyof NoInfer<TOOLS>>;

    /**
Optional specification for parsing structured outputs from the LLM response.
     */
    experimental_output?: Output<OUTPUT, PARTIAL_OUTPUT>;

    /**
Optional function that you can use to provide different settings for a step.

@param options - The options for the step.
@param options.steps - The steps that have been executed so far.
@param options.stepNumber - The number of the step that is being executed.
@param options.model - The model that is being used.

@returns An object that contains the settings for the step.
If you return undefined (or for undefined settings), the settings from the outer level will be used.
    */
    prepareStep?: PrepareStepFunction<NoInfer<TOOLS>>;

    /**
A function that attempts to repair a tool call that failed to parse.
     */
    experimental_repairToolCall?: ToolCallRepairFunction<TOOLS>;

    /**
Optional stream transformations.
They are applied in the order they are provided.
The stream transformations must maintain the stream structure for streamText to work correctly.
     */
    experimental_transform?:
      | StreamTextTransform<TOOLS>
      | Array<StreamTextTransform<TOOLS>>;

    /**
Whether to include raw chunks from the provider in the stream.
When enabled, you will receive raw chunks with type 'raw' that contain the unprocessed data from the provider.
This allows access to cutting-edge provider features not yet wrapped by the AI SDK.
Defaults to false.
     */
    includeRawChunks?: boolean;

    /**
Callback that is called for each chunk of the stream.
The stream processing will pause until the callback promise is resolved.
     */
    onChunk?: StreamTextOnChunkCallback<TOOLS>;

    /**
Callback that is invoked when an error occurs during streaming.
You can use it to log errors.
The stream processing will pause until the callback promise is resolved.
     */
    onError?: StreamTextOnErrorCallback;

    /**
Callback that is called when the LLM response and all request tool executions
(for tools that have an `execute` function) are finished.

The usage is the combined usage of all steps.
     */
    onFinish?: StreamTextOnFinishCallback<TOOLS>;

    /**
Callback that is called when each step (LLM call) is finished, including intermediate steps.
    */
    onStepFinish?: StreamTextOnStepFinishCallback<TOOLS>;

    /**
Internal. For test use only. May change without notice.
     */
    _internal?: {
      now?: () => number;
      generateId?: IdGenerator;
      currentDate?: () => Date;
    };
  }): StreamTextResult<TOOLS, PARTIAL_OUTPUT> {
  return new DefaultStreamTextResult<TOOLS, OUTPUT, PARTIAL_OUTPUT>({
    model: resolveLanguageModel(model),
    telemetry,
    headers,
    settings,
    maxRetries,
    abortSignal,
    system,
    prompt,
    messages,
    tools,
    toolChoice,
    transforms: asArray(transform),
    activeTools,
    repairToolCall,
    stopConditions: asArray(stopWhen),
    output,
    providerOptions,
    prepareStep,
    includeRawChunks,
    onChunk,
    onError,
    onFinish,
    onStepFinish,
    now,
    currentDate,
    generateId,
  });
}

type EnrichedStreamPart<TOOLS extends ToolSet, PARTIAL_OUTPUT> = {
  part: TextStreamPart<TOOLS>;
  partialOutput: PARTIAL_OUTPUT | undefined;
};

function createOutputTransformStream<
  TOOLS extends ToolSet,
  OUTPUT,
  PARTIAL_OUTPUT,
>(
  output: Output<OUTPUT, PARTIAL_OUTPUT> | undefined,
): TransformStream<
  TextStreamPart<TOOLS>,
  EnrichedStreamPart<TOOLS, PARTIAL_OUTPUT>
> {
  if (!output) {
    return new TransformStream<
      TextStreamPart<TOOLS>,
      EnrichedStreamPart<TOOLS, PARTIAL_OUTPUT>
    >({
      transform(chunk, controller) {
        controller.enqueue({ part: chunk, partialOutput: undefined });
      },
    });
  }

  let text = '';
  let textChunk = '';
  let lastPublishedJson = '';

  function publishTextChunk({
    controller,
    partialOutput = undefined,
  }: {
    controller: TransformStreamDefaultController<
      EnrichedStreamPart<TOOLS, PARTIAL_OUTPUT>
    >;
    partialOutput?: PARTIAL_OUTPUT;
  }) {
    controller.enqueue({
      part: { type: 'text', text: textChunk },
      partialOutput,
    });
    textChunk = '';
  }

  return new TransformStream<
    TextStreamPart<TOOLS>,
    EnrichedStreamPart<TOOLS, PARTIAL_OUTPUT>
  >({
    async transform(chunk, controller) {
      // ensure that we publish the last text chunk before the step finish:
      if (chunk.type === 'finish-step') {
        publishTextChunk({ controller });
      }

      if (chunk.type !== 'text') {
        controller.enqueue({ part: chunk, partialOutput: undefined });
        return;
      }

      text += chunk.text;
      textChunk += chunk.text;

      // only publish if partial json can be parsed:
      const result = await output.parsePartial({ text });
      if (result != null) {
        // only send new json if it has changed:
        const currentJson = JSON.stringify(result.partial);
        if (currentJson !== lastPublishedJson) {
          publishTextChunk({ controller, partialOutput: result.partial });
          lastPublishedJson = currentJson;
        }
      }
    },

    flush(controller) {
      // publish remaining text (there should be none if the content was correctly formatted):
      if (textChunk.length > 0) {
        publishTextChunk({ controller });
      }
    },
  });
}

class DefaultStreamTextResult<TOOLS extends ToolSet, OUTPUT, PARTIAL_OUTPUT>
  implements StreamTextResult<TOOLS, PARTIAL_OUTPUT>
{
  private readonly _totalUsage = new DelayedPromise<
    Awaited<StreamTextResult<TOOLS, PARTIAL_OUTPUT>['usage']>
  >();
  private readonly _finishReason = new DelayedPromise<
    Awaited<StreamTextResult<TOOLS, PARTIAL_OUTPUT>['finishReason']>
  >();
  private readonly _steps = new DelayedPromise<
    Awaited<StreamTextResult<TOOLS, PARTIAL_OUTPUT>['steps']>
  >();

  private readonly addStream: (
    stream: ReadableStream<TextStreamPart<TOOLS>>,
  ) => void;

  private readonly closeStream: () => void;

  private baseStream: ReadableStream<EnrichedStreamPart<TOOLS, PARTIAL_OUTPUT>>;

  private output: Output<OUTPUT, PARTIAL_OUTPUT> | undefined;

  private includeRawChunks: boolean;

  private generateId: () => string;

  constructor({
    model,
    telemetry,
    headers,
    settings,
    maxRetries: maxRetriesArg,
    abortSignal,
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
    providerOptions,
    prepareStep,
    includeRawChunks,
    now,
    currentDate,
    generateId,
    onChunk,
    onError,
    onFinish,
    onStepFinish,
  }: {
    model: LanguageModelV2;
    telemetry: TelemetrySettings | undefined;
    headers: Record<string, string | undefined> | undefined;
    settings: Omit<CallSettings, 'abortSignal' | 'headers'>;
    maxRetries: number | undefined;
    abortSignal: AbortSignal | undefined;
    system: Prompt['system'];
    prompt: Prompt['prompt'];
    messages: Prompt['messages'];
    tools: TOOLS | undefined;
    toolChoice: ToolChoice<TOOLS> | undefined;
    transforms: Array<StreamTextTransform<TOOLS>>;
    activeTools: Array<keyof TOOLS> | undefined;
    repairToolCall: ToolCallRepairFunction<TOOLS> | undefined;
    stopConditions: Array<StopCondition<NoInfer<TOOLS>>>;
    output: Output<OUTPUT, PARTIAL_OUTPUT> | undefined;
    providerOptions: ProviderOptions | undefined;
    prepareStep: PrepareStepFunction<NoInfer<TOOLS>> | undefined;
    includeRawChunks: boolean;
    now: () => number;
    currentDate: () => Date;
    generateId: () => string;

    // callbacks:
    onChunk: undefined | StreamTextOnChunkCallback<TOOLS>;
    onError: StreamTextOnErrorCallback;
    onFinish: undefined | StreamTextOnFinishCallback<TOOLS>;
    onStepFinish: undefined | StreamTextOnStepFinishCallback<TOOLS>;
  }) {
    this.output = output;
    this.includeRawChunks = includeRawChunks;
    this.generateId = generateId;

    // promise to ensure that the step has been fully processed by the event processor
    // before a new step is started. This is required because the continuation condition
    // needs the updated steps to determine if another step is needed.
    let stepFinish!: DelayedPromise<void>;

    let activeReasoningPart:
      | undefined
      | (ContentPart<TOOLS> & { type: 'reasoning' }) = undefined;

    let recordedContent: Array<ContentPart<TOOLS>> = [];
    const recordedResponseMessages: Array<ResponseMessage> = [];
    let recordedFinishReason: FinishReason | undefined = undefined;
    let recordedTotalUsage: LanguageModelUsage | undefined = undefined;
    let recordedRequest: LanguageModelRequestMetadata = {};
    let recordedWarnings: Array<CallWarning> = [];
    const recordedSteps: StepResult<TOOLS>[] = [];

    let rootSpan!: Span;

    const eventProcessor = new TransformStream<
      EnrichedStreamPart<TOOLS, PARTIAL_OUTPUT>,
      EnrichedStreamPart<TOOLS, PARTIAL_OUTPUT>
    >({
      async transform(chunk, controller) {
        controller.enqueue(chunk); // forward the chunk to the next stream

        const { part } = chunk;

        if (
          part.type === 'text' ||
          part.type === 'reasoning' ||
          part.type === 'source' ||
          part.type === 'tool-call' ||
          part.type === 'tool-result' ||
          part.type === 'tool-call-streaming-start' ||
          part.type === 'tool-call-delta' ||
          part.type === 'raw'
        ) {
          await onChunk?.({ chunk: part });
        }

        if (part.type === 'error') {
          await onError({ error: wrapGatewayError(part.error) });
        }

        if (part.type === 'text') {
          const latestContent = recordedContent[recordedContent.length - 1];
          if (latestContent?.type === 'text') {
            latestContent.text += part.text;
          } else {
            recordedContent.push({ type: 'text', text: part.text });
          }
        }

        if (part.type === 'reasoning') {
          if (activeReasoningPart == null) {
            activeReasoningPart = {
              type: 'reasoning',
              text: part.text,
              providerMetadata: part.providerMetadata,
            };
            recordedContent.push(activeReasoningPart);
          } else {
            activeReasoningPart.text += part.text;
            activeReasoningPart.providerMetadata = part.providerMetadata;
          }
        }

        if (
          part.type === 'reasoning-part-finish' &&
          activeReasoningPart != null
        ) {
          activeReasoningPart = undefined;
        }

        if (part.type === 'file') {
          recordedContent.push({ type: 'file', file: part.file });
        }

        if (part.type === 'source') {
          recordedContent.push(part);
        }

        if (part.type === 'tool-call') {
          recordedContent.push(part);
        }

        if (part.type === 'tool-result') {
          recordedContent.push(part);
        }

        if (part.type === 'start-step') {
          recordedRequest = part.request;
          recordedWarnings = part.warnings;
        }

        if (part.type === 'finish-step') {
          const stepMessages = toResponseMessages({
            content: recordedContent,
            tools: tools ?? ({} as TOOLS),
          });

          // Add step information (after response messages are updated):
          const currentStepResult: StepResult<TOOLS> = new DefaultStepResult({
            content: recordedContent,
            finishReason: part.finishReason,
            usage: part.usage,
            warnings: recordedWarnings,
            request: recordedRequest,
            response: {
              ...part.response,
              messages: [...recordedResponseMessages, ...stepMessages],
            },
            providerMetadata: part.providerMetadata,
          });

          await onStepFinish?.(currentStepResult);

          recordedSteps.push(currentStepResult);

          recordedContent = [];
          activeReasoningPart = undefined;

          recordedResponseMessages.push(...stepMessages);

          // resolve the promise to signal that the step has been fully processed
          // by the event processor:
          stepFinish.resolve();
        }

        if (part.type === 'finish') {
          recordedTotalUsage = part.totalUsage;
          recordedFinishReason = part.finishReason;
        }
      },

      async flush(controller) {
        try {
          if (recordedSteps.length === 0) {
            return; // no steps recorded (e.g. in error scenario)
          }

          // derived:
          const finishReason = recordedFinishReason ?? 'unknown';
          const totalUsage = recordedTotalUsage ?? {
            inputTokens: undefined,
            outputTokens: undefined,
            totalTokens: undefined,
          };

          // from finish:
          self._finishReason.resolve(finishReason);
          self._totalUsage.resolve(totalUsage);

          // aggregate results:
          self._steps.resolve(recordedSteps);

          // call onFinish callback:
          const finalStep = recordedSteps[recordedSteps.length - 1];
          await onFinish?.({
            finishReason,
            totalUsage,
            usage: finalStep.usage,
            content: finalStep.content,
            text: finalStep.text,
            reasoningText: finalStep.reasoningText,
            reasoning: finalStep.reasoning,
            files: finalStep.files,
            sources: finalStep.sources,
            toolCalls: finalStep.toolCalls,
            toolResults: finalStep.toolResults,
            request: finalStep.request,
            response: finalStep.response,
            warnings: finalStep.warnings,
            providerMetadata: finalStep.providerMetadata,
            steps: recordedSteps,
          });

          // Add response information to the root span:
          rootSpan.setAttributes(
            selectTelemetryAttributes({
              telemetry,
              attributes: {
                'ai.response.finishReason': finishReason,
                'ai.response.text': { output: () => finalStep.text },
                'ai.response.toolCalls': {
                  output: () =>
                    finalStep.toolCalls?.length
                      ? JSON.stringify(finalStep.toolCalls)
                      : undefined,
                },

                'ai.usage.inputTokens': totalUsage.inputTokens,
                'ai.usage.outputTokens': totalUsage.outputTokens,
                'ai.usage.totalTokens': totalUsage.totalTokens,
                'ai.usage.reasoningTokens': totalUsage.reasoningTokens,
                'ai.usage.cachedInputTokens': totalUsage.cachedInputTokens,
              },
            }),
          );
        } catch (error) {
          controller.error(error);
        } finally {
          rootSpan.end();
        }
      },
    });

    // initialize the stitchable stream and the transformed stream:
    const stitchableStream = createStitchableStream<TextStreamPart<TOOLS>>();
    this.addStream = stitchableStream.addStream;
    this.closeStream = stitchableStream.close;

    let stream = stitchableStream.stream;

    // add a stream that emits a start event:
    stream = stream.pipeThrough(
      new TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>({
        start(controller) {
          controller.enqueue({ type: 'start' });
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
          },
        }),
      );
    }

    this.baseStream = stream
      .pipeThrough(createOutputTransformStream(output))
      .pipeThrough(eventProcessor);

    const { maxRetries, retry } = prepareRetries({
      maxRetries: maxRetriesArg,
    });

    const tracer = getTracer(telemetry);

    const callSettings = prepareCallSettings(settings);

    const baseTelemetryAttributes = getBaseTelemetryAttributes({
      model,
      telemetry,
      headers,
      settings: { ...callSettings, maxRetries },
    });

    const self = this;

    recordSpan({
      name: 'ai.streamText',
      attributes: selectTelemetryAttributes({
        telemetry,
        attributes: {
          ...assembleOperationName({ operationId: 'ai.streamText', telemetry }),
          ...baseTelemetryAttributes,
          // specific settings that only make sense on the outer level:
          'ai.prompt': {
            input: () => JSON.stringify({ system, prompt, messages }),
          },
        },
      }),
      tracer,
      endWhenDone: false,
      fn: async rootSpanArg => {
        rootSpan = rootSpanArg;

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

          stepFinish = new DelayedPromise<void>();

          const initialPrompt = await standardizePrompt({
            system,
            prompt,
            messages,
          });

          const stepInputMessages = [
            ...initialPrompt.messages,
            ...responseMessages,
          ];

          const prepareStepResult = await prepareStep?.({
            model,
            steps: recordedSteps,
            stepNumber: recordedSteps.length,
          });

          const promptMessages = await convertToLanguageModelPrompt({
            prompt: {
              system: prepareStepResult?.system ?? initialPrompt.system,
              messages: stepInputMessages,
            },
            supportedUrls: await model.supportedUrls,
          });

          const stepModel = resolveLanguageModel(
            prepareStepResult?.model ?? model,
          );

          const { toolChoice: stepToolChoice, tools: stepTools } =
            prepareToolsAndToolChoice({
              tools,
              toolChoice: prepareStepResult?.toolChoice ?? toolChoice,
              activeTools: prepareStepResult?.activeTools ?? activeTools,
            });

          const {
            result: { stream, response, request },
            doStreamSpan,
            startTimestampMs,
          } = await retry(() =>
            recordSpan({
              name: 'ai.streamText.doStream',
              attributes: selectTelemetryAttributes({
                telemetry,
                attributes: {
                  ...assembleOperationName({
                    operationId: 'ai.streamText.doStream',
                    telemetry,
                  }),
                  ...baseTelemetryAttributes,
                  // model:
                  'ai.model.provider': stepModel.provider,
                  'ai.model.id': stepModel.modelId,
                  // prompt:
                  'ai.prompt.messages': {
                    input: () => stringifyForTelemetry(promptMessages),
                  },
                  'ai.prompt.tools': {
                    // convert the language model level tools:
                    input: () => stepTools?.map(tool => JSON.stringify(tool)),
                  },
                  'ai.prompt.toolChoice': {
                    input: () =>
                      stepToolChoice != null
                        ? JSON.stringify(stepToolChoice)
                        : undefined,
                  },

                  // standardized gen-ai llm span attributes:
                  'gen_ai.system': stepModel.provider,
                  'gen_ai.request.model': stepModel.modelId,
                  'gen_ai.request.frequency_penalty':
                    callSettings.frequencyPenalty,
                  'gen_ai.request.max_tokens': callSettings.maxOutputTokens,
                  'gen_ai.request.presence_penalty':
                    callSettings.presencePenalty,
                  'gen_ai.request.stop_sequences': callSettings.stopSequences,
                  'gen_ai.request.temperature': callSettings.temperature,
                  'gen_ai.request.top_k': callSettings.topK,
                  'gen_ai.request.top_p': callSettings.topP,
                },
              }),
              tracer,
              endWhenDone: false,
              fn: async doStreamSpan => {
                return {
                  startTimestampMs: now(), // get before the call
                  doStreamSpan,
                  result: await stepModel.doStream({
                    ...callSettings,
                    tools: stepTools,
                    toolChoice: stepToolChoice,
                    responseFormat: output?.responseFormat,
                    prompt: promptMessages,
                    providerOptions,
                    abortSignal,
                    headers,
                    includeRawChunks,
                  }),
                };
              },
            }),
          );

          const streamWithToolResults = runToolsTransformation({
            tools,
            generatorStream: stream,
            tracer,
            telemetry,
            system,
            messages: stepInputMessages,
            repairToolCall,
            abortSignal,
          });

          const stepRequest = request ?? {};
          const stepToolCalls: ToolCallUnion<TOOLS>[] = [];
          const stepToolResults: ToolResultUnion<TOOLS>[] = [];
          let warnings: LanguageModelV2CallWarning[] | undefined;
          const stepContent: Array<ContentPart<TOOLS>> = [];

          let activeReasoningPart:
            | undefined
            | (ContentPart<TOOLS> & { type: 'reasoning' }) = undefined;

          let stepFinishReason: FinishReason = 'unknown';
          let stepUsage: LanguageModelUsage = {
            inputTokens: undefined,
            outputTokens: undefined,
            totalTokens: undefined,
          };
          let stepProviderMetadata: ProviderMetadata | undefined;
          let stepFirstChunk = true;
          let stepText = '';
          let stepResponse: { id: string; timestamp: Date; modelId: string } = {
            id: generateId(),
            timestamp: currentDate(),
            modelId: model.modelId,
          };

          async function publishTextChunk({
            controller,
            chunk,
          }: {
            controller: TransformStreamDefaultController<TextStreamPart<TOOLS>>;
            chunk: TextStreamPart<TOOLS> & { type: 'text' };
          }) {
            controller.enqueue(chunk);

            stepText += chunk.text;
          }

          self.addStream(
            streamWithToolResults.pipeThrough(
              new TransformStream<
                SingleRequestTextStreamPart<TOOLS>,
                TextStreamPart<TOOLS>
              >({
                async transform(chunk, controller): Promise<void> {
                  if (chunk.type === 'stream-start') {
                    warnings = chunk.warnings;
                    return; // stream start chunks are sent immediately and do not count as first chunk
                  }

                  if (stepFirstChunk) {
                    // Telemetry for first chunk:
                    const msToFirstChunk = now() - startTimestampMs;

                    stepFirstChunk = false;

                    doStreamSpan.addEvent('ai.stream.firstChunk', {
                      'ai.response.msToFirstChunk': msToFirstChunk,
                    });

                    doStreamSpan.setAttributes({
                      'ai.response.msToFirstChunk': msToFirstChunk,
                    });

                    // Step start:
                    controller.enqueue({
                      type: 'start-step',
                      request: stepRequest,
                      warnings: warnings ?? [],
                    });
                  }

                  // Filter out empty text deltas
                  if (chunk.type === 'text' && chunk.text.length === 0) {
                    return;
                  }

                  const chunkType = chunk.type;
                  switch (chunkType) {
                    case 'text': {
                      await publishTextChunk({ controller, chunk });
                      break;
                    }

                    case 'reasoning': {
                      controller.enqueue(chunk);

                      if (activeReasoningPart == null) {
                        activeReasoningPart = {
                          type: 'reasoning',
                          text: chunk.text,
                          providerMetadata: chunk.providerMetadata,
                        };
                        stepContent.push(activeReasoningPart);
                      } else {
                        activeReasoningPart.text += chunk.text;
                        activeReasoningPart.providerMetadata =
                          chunk.providerMetadata;
                      }

                      break;
                    }

                    case 'reasoning-part-finish': {
                      activeReasoningPart = undefined;
                      controller.enqueue(chunk);
                      break;
                    }

                    case 'tool-call': {
                      controller.enqueue(chunk);
                      // store tool calls for onFinish callback and toolCalls promise:
                      stepToolCalls.push(chunk);
                      stepContent.push(chunk);
                      break;
                    }

                    case 'tool-result': {
                      controller.enqueue(chunk);
                      // store tool results for onFinish callback and toolResults promise:
                      stepToolResults.push(chunk);
                      stepContent.push(chunk);
                      break;
                    }

                    case 'response-metadata': {
                      stepResponse = {
                        id: chunk.id ?? stepResponse.id,
                        timestamp: chunk.timestamp ?? stepResponse.timestamp,
                        modelId: chunk.modelId ?? stepResponse.modelId,
                      };
                      break;
                    }

                    case 'finish': {
                      // Note: tool executions might not be finished yet when the finish event is emitted.
                      // store usage and finish reason for promises and onFinish callback:
                      stepUsage = chunk.usage;
                      stepFinishReason = chunk.finishReason;
                      stepProviderMetadata = chunk.providerMetadata;

                      // Telemetry for finish event timing
                      // (since tool executions can take longer and distort calculations)
                      const msToFinish = now() - startTimestampMs;
                      doStreamSpan.addEvent('ai.stream.finish');
                      doStreamSpan.setAttributes({
                        'ai.response.msToFinish': msToFinish,
                        'ai.response.avgOutputTokensPerSecond':
                          (1000 * (stepUsage.outputTokens ?? 0)) / msToFinish,
                      });

                      break;
                    }

                    case 'file': {
                      stepContent.push(chunk);
                      controller.enqueue(chunk);
                      break;
                    }

                    case 'source': {
                      stepContent.push(chunk);
                      controller.enqueue(chunk);
                      break;
                    }

                    case 'tool-call-streaming-start': {
                      const tool = tools?.[chunk.toolName];

                      if (tool?.onInputStart != null) {
                        await tool.onInputStart({
                          toolCallId: chunk.toolCallId,
                          messages: stepInputMessages,
                          abortSignal,
                        });
                      }

                      controller.enqueue(chunk);
                      break;
                    }

                    case 'tool-call-delta': {
                      const tool = tools?.[chunk.toolName];

                      if (tool?.onInputDelta != null) {
                        await tool.onInputDelta({
                          inputTextDelta: chunk.inputTextDelta,
                          toolCallId: chunk.toolCallId,
                          messages: stepInputMessages,
                          abortSignal,
                        });
                      }

                      controller.enqueue(chunk);
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
                },

                // invoke onFinish callback and resolve toolResults promise when the stream is about to close:
                async flush(controller) {
                  const stepToolCallsJson =
                    stepToolCalls.length > 0
                      ? JSON.stringify(stepToolCalls)
                      : undefined;

                  // record telemetry information first to ensure best effort timing
                  try {
                    doStreamSpan.setAttributes(
                      selectTelemetryAttributes({
                        telemetry,
                        attributes: {
                          'ai.response.finishReason': stepFinishReason,
                          'ai.response.text': { output: () => stepText },
                          'ai.response.toolCalls': {
                            output: () => stepToolCallsJson,
                          },
                          'ai.response.id': stepResponse.id,
                          'ai.response.model': stepResponse.modelId,
                          'ai.response.timestamp':
                            stepResponse.timestamp.toISOString(),

                          'ai.usage.inputTokens': stepUsage.inputTokens,
                          'ai.usage.outputTokens': stepUsage.outputTokens,
                          'ai.usage.totalTokens': stepUsage.totalTokens,
                          'ai.usage.reasoningTokens': stepUsage.reasoningTokens,
                          'ai.usage.cachedInputTokens':
                            stepUsage.cachedInputTokens,

                          // standardized gen-ai llm span attributes:
                          'gen_ai.response.finish_reasons': [stepFinishReason],
                          'gen_ai.response.id': stepResponse.id,
                          'gen_ai.response.model': stepResponse.modelId,
                          'gen_ai.usage.input_tokens': stepUsage.inputTokens,
                          'gen_ai.usage.output_tokens': stepUsage.outputTokens,
                        },
                      }),
                    );
                  } catch (error) {
                    // ignore error setting telemetry attributes
                  } finally {
                    // finish doStreamSpan before other operations for correct timing:
                    doStreamSpan.end();
                  }

                  controller.enqueue({
                    type: 'finish-step',
                    finishReason: stepFinishReason,
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

                  if (
                    stepToolCalls.length > 0 &&
                    // all current tool calls have results:
                    stepToolResults.length === stepToolCalls.length &&
                    // continue until a stop condition is met:
                    !(await isStopConditionMet({
                      stopConditions,
                      steps: recordedSteps,
                    }))
                  ) {
                    // append to messages for the next step:
                    responseMessages.push(
                      ...toResponseMessages({
                        content: stepContent,
                        tools: tools ?? ({} as TOOLS),
                      }),
                    );

                    await streamStep({
                      currentStep: currentStep + 1,
                      responseMessages,
                      usage: combinedUsage,
                    });
                  } else {
                    controller.enqueue({
                      type: 'finish',
                      finishReason: stepFinishReason,
                      totalUsage: combinedUsage,
                    });

                    self.closeStream(); // close the stitchable stream
                  }
                },
              }),
            ),
          );
        }

        // add the initial stream to the stitchable stream
        await streamStep({
          currentStep: 0,
          responseMessages: [],
          usage: {
            inputTokens: undefined,
            outputTokens: undefined,
            totalTokens: undefined,
          },
        });
      },
    }).catch(error => {
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
    return this.finalStep.then(step => step.reasoning);
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

  get toolResults() {
    return this.finalStep.then(step => step.toolResults);
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
    return this._totalUsage.promise;
  }

  get finishReason() {
    return this._finishReason.promise;
  }

  /**
Split out a new stream from the original stream.
The original stream is replaced to allow for further splitting,
since we do not know how many times the stream will be split.

Note: this leads to buffering the stream content on the server.
However, the LLM results are expected to be small enough to not cause issues.
   */
  private teeStream() {
    const [stream1, stream2] = this.baseStream.tee();
    this.baseStream = stream2;
    return stream1;
  }

  get textStream(): AsyncIterableStream<string> {
    return createAsyncIterableStream(
      this.teeStream().pipeThrough(
        new TransformStream<EnrichedStreamPart<TOOLS, PARTIAL_OUTPUT>, string>({
          transform({ part }, controller) {
            if (part.type === 'text') {
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
          EnrichedStreamPart<TOOLS, PARTIAL_OUTPUT>,
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

  get experimental_partialOutputStream(): AsyncIterableStream<PARTIAL_OUTPUT> {
    if (this.output == null) {
      throw new NoOutputSpecifiedError();
    }

    return createAsyncIterableStream(
      this.teeStream().pipeThrough(
        new TransformStream<
          EnrichedStreamPart<TOOLS, PARTIAL_OUTPUT>,
          PARTIAL_OUTPUT
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

  toUIMessageStream<UI_MESSAGE extends UIMessage>({
    originalMessages,
    onFinish,
    messageMetadata,
    sendReasoning = true,
    sendSources = false,
    sendStart = true,
    sendFinish = true,
    onError = () => 'An error occurred.', // mask error messages for safety by default
  }: UIMessageStreamOptions<UI_MESSAGE> = {}): ReadableStream<
    InferUIMessageStreamPart<UI_MESSAGE>
  > {
    const responseMessageId = getResponseUIMessageId({
      originalMessages,
      responseMessageId: this.generateId,
    });

    const baseStream = this.fullStream.pipeThrough(
      new TransformStream<
        TextStreamPart<TOOLS>,
        UIMessageStreamPart<
          InferUIMessageMetadata<UI_MESSAGE>,
          InferUIMessageData<UI_MESSAGE>
        >
      >({
        transform: async (part, controller) => {
          const messageMetadataValue = messageMetadata?.({ part });

          const partType = part.type;
          switch (partType) {
            case 'text': {
              controller.enqueue({
                type: 'text',
                text: part.text,
              });
              break;
            }

            case 'reasoning': {
              if (sendReasoning) {
                controller.enqueue({
                  type: 'reasoning',
                  text: part.text,
                  providerMetadata: part.providerMetadata,
                });
              }
              break;
            }

            case 'reasoning-part-finish': {
              if (sendReasoning) {
                controller.enqueue({ type: 'reasoning-part-finish' });
              }
              break;
            }

            case 'file': {
              controller.enqueue({
                type: 'file',
                mediaType: part.file.mediaType,
                url: `data:${part.file.mediaType};base64,${part.file.base64}`,
              });
              break;
            }

            case 'source': {
              if (sendSources && part.sourceType === 'url') {
                controller.enqueue({
                  type: 'source-url',
                  sourceId: part.id,
                  url: part.url,
                  title: part.title,
                  providerMetadata: part.providerMetadata,
                });
              }

              if (sendSources && part.sourceType === 'document') {
                controller.enqueue({
                  type: 'source-document',
                  sourceId: part.id,
                  mediaType: part.mediaType,
                  title: part.title,
                  filename: part.filename,
                  providerMetadata: part.providerMetadata,
                });
              }
              break;
            }

            case 'tool-call-streaming-start': {
              controller.enqueue({
                type: 'tool-input-start',
                toolCallId: part.toolCallId,
                toolName: part.toolName,
              });
              break;
            }

            case 'tool-call-delta': {
              controller.enqueue({
                type: 'tool-input-delta',
                toolCallId: part.toolCallId,
                inputTextDelta: part.inputTextDelta,
              });
              break;
            }

            case 'tool-call': {
              controller.enqueue({
                type: 'tool-input-available',
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                input: part.input,
              });
              break;
            }

            case 'tool-result': {
              controller.enqueue({
                type: 'tool-output-available',
                toolCallId: part.toolCallId,
                output: part.output,
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
                  messageId: responseMessageId,
                  messageMetadata: messageMetadataValue,
                });
              }
              break;
            }

            case 'finish': {
              if (sendFinish) {
                controller.enqueue({
                  type: 'finish',
                  messageMetadata: messageMetadataValue,
                });
              }
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

    return handleUIMessageStreamFinish<UI_MESSAGE>({
      stream: baseStream,
      messageId: responseMessageId ?? this.generateId(),
      originalMessages,
      onFinish,
    });
  }

  pipeUIMessageStreamToResponse<UI_MESSAGE extends UIMessage>(
    response: ServerResponse,
    {
      originalMessages,
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
