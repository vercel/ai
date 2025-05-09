import { LanguageModelV2CallWarning } from '@ai-sdk/provider';
import { createIdGenerator, IdGenerator } from '@ai-sdk/provider-utils';
import { Span } from '@opentelemetry/api';
import { ServerResponse } from 'node:http';
import { createDataStreamResponse } from '../../src/data-stream/create-data-stream-response';
import { DataStreamPart } from '../../src/data-stream/data-stream-parts';
import { pipeDataStreamToResponse } from '../../src/data-stream/pipe-data-stream-to-response';
import { InvalidArgumentError } from '../../src/error/invalid-argument-error';
import { NoOutputSpecifiedError } from '../../src/error/no-output-specified-error';
import { createTextStreamResponse } from '../../src/text-stream/create-text-stream-response';
import { pipeTextStreamToResponse } from '../../src/text-stream/pipe-text-stream-to-response';
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
import { standardizePrompt } from '../prompt/standardize-prompt';
import { assembleOperationName } from '../telemetry/assemble-operation-name';
import { getBaseTelemetryAttributes } from '../telemetry/get-base-telemetry-attributes';
import { getTracer } from '../telemetry/get-tracer';
import { recordSpan } from '../telemetry/record-span';
import { selectTelemetryAttributes } from '../telemetry/select-telemetry-attributes';
import { TelemetrySettings } from '../telemetry/telemetry-settings';
import {
  FinishReason,
  LanguageModel,
  ToolChoice,
} from '../types/language-model';
import { LanguageModelResponseMetadata } from '../types/language-model-response-metadata';
import { ProviderMetadata, ProviderOptions } from '../types/provider-metadata';
import { addLanguageModelUsage, LanguageModelUsage } from '../types/usage';
import { ContentPart } from './content-part';
import { Output } from './output';
import { ResponseMessage } from './response-message';
import {
  runToolsTransformation,
  SingleRequestTextStreamPart,
} from './run-tools-transformation';
import { DefaultStepResult, StepResult } from './step-result';
import {
  ConsumeStreamOptions,
  DataStreamOptions,
  StreamTextResult,
  TextStreamPart,
} from './stream-text-result';
import { toResponseMessages } from './to-response-messages';
import { ToolCallUnion } from './tool-call';
import { ToolCallRepairFunction } from './tool-call-repair';
import { ToolResultUnion } from './tool-result';
import { ToolSet } from './tool-set';

const originalGenerateId = createIdGenerator({
  prefix: 'aitxt',
  size: 24,
});

const originalGenerateMessageId = createIdGenerator({
  prefix: 'msg',
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
        | 'tool-result';
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
@param experimental_generateMessageId - Generate a unique ID for each message.

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
  maxSteps = 1,
  experimental_generateMessageId: generateMessageId = originalGenerateMessageId,
  experimental_output: output,
  experimental_telemetry: telemetry,
  providerOptions,
  experimental_toolCallStreaming = false,
  toolCallStreaming = experimental_toolCallStreaming,
  experimental_activeTools: activeTools,
  experimental_repairToolCall: repairToolCall,
  experimental_transform: transform,
  onChunk,
  onError,
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
Maximum number of sequential LLM calls (steps), e.g. when you use tool calls. Must be at least 1.

A maximum number is required to prevent infinite loops in the case of misconfigured tools.

By default, it's set to 1, which means that only a single LLM call is made.
 */
    maxSteps?: number;

    /**
Generate a unique ID for each message.
     */
    experimental_generateMessageId?: IdGenerator;

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
Limits the tools that are available for the model to call without
changing the tool call and result types in the result.
     */
    experimental_activeTools?: Array<keyof TOOLS>;

    /**
Optional specification for parsing structured outputs from the LLM response.
     */
    experimental_output?: Output<OUTPUT, PARTIAL_OUTPUT>;

    /**
A function that attempts to repair a tool call that failed to parse.
     */
    experimental_repairToolCall?: ToolCallRepairFunction<TOOLS>;

    /**
Enable streaming of tool call deltas as they are generated. Disabled by default.
     */
    toolCallStreaming?: boolean;

    /**
@deprecated Use `toolCallStreaming` instead.
     */
    experimental_toolCallStreaming?: boolean;

    /**
Optional stream transformations.
They are applied in the order they are provided.
The stream transformations must maintain the stream structure for streamText to work correctly.
     */
    experimental_transform?:
      | StreamTextTransform<TOOLS>
      | Array<StreamTextTransform<TOOLS>>;

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
    model,
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
    toolCallStreaming,
    transforms: asArray(transform),
    activeTools,
    repairToolCall,
    maxSteps,
    output,
    providerOptions,
    onChunk,
    onError,
    onFinish,
    onStepFinish,
    now,
    currentDate,
    generateId,
    generateMessageId,
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
      if (chunk.type === 'step-finish') {
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
  private readonly warningsPromise = new DelayedPromise<
    Awaited<StreamTextResult<TOOLS, PARTIAL_OUTPUT>['warnings']>
  >();
  private readonly usagePromise = new DelayedPromise<
    Awaited<StreamTextResult<TOOLS, PARTIAL_OUTPUT>['usage']>
  >();
  private readonly finishReasonPromise = new DelayedPromise<
    Awaited<StreamTextResult<TOOLS, PARTIAL_OUTPUT>['finishReason']>
  >();
  private readonly providerMetadataPromise = new DelayedPromise<
    Awaited<StreamTextResult<TOOLS, PARTIAL_OUTPUT>['providerMetadata']>
  >();
  private readonly textPromise = new DelayedPromise<
    Awaited<StreamTextResult<TOOLS, PARTIAL_OUTPUT>['text']>
  >();
  private readonly reasoningPromise = new DelayedPromise<
    Awaited<StreamTextResult<TOOLS, PARTIAL_OUTPUT>['reasoningText']>
  >();
  private readonly reasoningDetailsPromise = new DelayedPromise<
    Awaited<StreamTextResult<TOOLS, PARTIAL_OUTPUT>['reasoning']>
  >();
  private readonly sourcesPromise = new DelayedPromise<
    Awaited<StreamTextResult<TOOLS, PARTIAL_OUTPUT>['sources']>
  >();
  private readonly filesPromise = new DelayedPromise<
    Awaited<StreamTextResult<TOOLS, PARTIAL_OUTPUT>['files']>
  >();
  private readonly toolCallsPromise = new DelayedPromise<
    Awaited<StreamTextResult<TOOLS, PARTIAL_OUTPUT>['toolCalls']>
  >();
  private readonly toolResultsPromise = new DelayedPromise<
    Awaited<StreamTextResult<TOOLS, PARTIAL_OUTPUT>['toolResults']>
  >();
  private readonly requestPromise = new DelayedPromise<
    Awaited<StreamTextResult<TOOLS, PARTIAL_OUTPUT>['request']>
  >();
  private readonly responsePromise = new DelayedPromise<
    Awaited<StreamTextResult<TOOLS, PARTIAL_OUTPUT>['response']>
  >();
  private readonly stepsPromise = new DelayedPromise<
    Awaited<StreamTextResult<TOOLS, PARTIAL_OUTPUT>['steps']>
  >();
  private readonly contentPromise = new DelayedPromise<
    Awaited<StreamTextResult<TOOLS, PARTIAL_OUTPUT>['content']>
  >();

  private readonly addStream: (
    stream: ReadableStream<TextStreamPart<TOOLS>>,
  ) => void;

  private readonly closeStream: () => void;

  private baseStream: ReadableStream<EnrichedStreamPart<TOOLS, PARTIAL_OUTPUT>>;

  private output: Output<OUTPUT, PARTIAL_OUTPUT> | undefined;

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
    toolCallStreaming,
    transforms,
    activeTools,
    repairToolCall,
    maxSteps,
    output,
    providerOptions,
    now,
    currentDate,
    generateId,
    generateMessageId,
    onChunk,
    onError,
    onFinish,
    onStepFinish,
  }: {
    model: LanguageModel;
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
    toolCallStreaming: boolean;
    transforms: Array<StreamTextTransform<TOOLS>>;
    activeTools: Array<keyof TOOLS> | undefined;
    repairToolCall: ToolCallRepairFunction<TOOLS> | undefined;
    maxSteps: number;
    output: Output<OUTPUT, PARTIAL_OUTPUT> | undefined;
    providerOptions: ProviderOptions | undefined;
    now: () => number;
    currentDate: () => Date;
    generateId: () => string;
    generateMessageId: () => string;

    // callbacks:
    onChunk: undefined | StreamTextOnChunkCallback<TOOLS>;
    onError: undefined | StreamTextOnErrorCallback;
    onFinish: undefined | StreamTextOnFinishCallback<TOOLS>;
    onStepFinish: undefined | StreamTextOnStepFinishCallback<TOOLS>;
  }) {
    if (maxSteps < 1) {
      throw new InvalidArgumentError({
        parameter: 'maxSteps',
        value: maxSteps,
        message: 'maxSteps must be at least 1',
      });
    }

    this.output = output;

    let activeReasoningPart:
      | undefined
      | (ContentPart<TOOLS> & { type: 'reasoning' }) = undefined;

    let recordedContent: Array<ContentPart<TOOLS>> = [];
    const recordedResponse: LanguageModelResponseMetadata & {
      messages: Array<ResponseMessage>;
    } = {
      id: generateId(),
      timestamp: currentDate(),
      modelId: model.modelId,
      messages: [],
    };
    let recordedFinishReason: FinishReason | undefined = undefined;
    let recordedUsage: LanguageModelUsage | undefined = undefined;

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
          part.type === 'tool-call-delta'
        ) {
          await onChunk?.({ chunk: part });
        }

        if (part.type === 'error') {
          await onError?.({ error: part.error });
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

        if (part.type === 'step-finish') {
          const stepMessages = toResponseMessages({
            content: recordedContent,
            tools: tools ?? ({} as TOOLS),
            messageId: part.messageId,
            generateMessageId,
          });

          // Add step information (after response messages are updated):
          const currentStepResult: StepResult<TOOLS> = new DefaultStepResult({
            content: recordedContent,
            finishReason: part.finishReason,
            usage: part.usage,
            warnings: part.warnings,
            request: part.request,
            response: {
              ...part.response,
              messages: [...recordedResponse.messages, ...stepMessages],
            },
            providerMetadata: part.providerMetadata,
          });

          await onStepFinish?.(currentStepResult);

          recordedSteps.push(currentStepResult);

          recordedContent = [];
          activeReasoningPart = undefined;

          recordedResponse.messages.push(...stepMessages);
        }

        if (part.type === 'finish') {
          recordedResponse.id = part.response.id;
          recordedResponse.timestamp = part.response.timestamp;
          recordedResponse.modelId = part.response.modelId;
          recordedResponse.headers = part.response.headers;
          recordedUsage = part.usage;
          recordedFinishReason = part.finishReason;
        }
      },

      async flush(controller) {
        try {
          if (recordedSteps.length === 0) {
            return; // no steps recorded (e.g. in error scenario)
          }

          // from last step (when there are errors there may be no last step)
          const lastStep = recordedSteps[recordedSteps.length - 1];

          self.contentPromise.resolve(lastStep.content);
          self.warningsPromise.resolve(lastStep.warnings);
          self.requestPromise.resolve(lastStep.request);
          self.responsePromise.resolve(lastStep.response);
          self.toolCallsPromise.resolve(lastStep.toolCalls);
          self.toolResultsPromise.resolve(lastStep.toolResults);
          self.providerMetadataPromise.resolve(lastStep.providerMetadata);
          self.reasoningPromise.resolve(lastStep.reasoningText);
          self.reasoningDetailsPromise.resolve(lastStep.reasoning);
          self.textPromise.resolve(lastStep.text);
          self.sourcesPromise.resolve(lastStep.sources);
          self.filesPromise.resolve(lastStep.files);

          // derived:
          const finishReason = recordedFinishReason ?? 'unknown';
          const usage = recordedUsage ?? {
            inputTokens: undefined,
            outputTokens: undefined,
            totalTokens: undefined,
          };

          // from finish:
          self.finishReasonPromise.resolve(finishReason);
          self.usagePromise.resolve(usage);

          // aggregate results:
          self.stepsPromise.resolve(recordedSteps);

          // call onFinish callback:
          await onFinish?.({
            finishReason,
            usage,
            content: lastStep.content,
            text: lastStep.text,
            reasoningText: lastStep.reasoningText,
            reasoning: lastStep.reasoning,
            files: lastStep.files,
            sources: lastStep.sources,
            toolCalls: lastStep.toolCalls,
            toolResults: lastStep.toolResults,
            request: lastStep.request,
            response: lastStep.response,
            warnings: lastStep.warnings,
            providerMetadata: lastStep.providerMetadata,
            steps: recordedSteps,
          });

          // Add response information to the root span:
          rootSpan.setAttributes(
            selectTelemetryAttributes({
              telemetry,
              attributes: {
                'ai.response.finishReason': finishReason,
                'ai.response.text': { output: () => lastStep.text },
                'ai.response.toolCalls': {
                  output: () =>
                    lastStep.toolCalls?.length
                      ? JSON.stringify(lastStep.toolCalls)
                      : undefined,
                },

                'ai.usage.inputTokens': usage.inputTokens,
                'ai.usage.outputTokens': usage.outputTokens,
                'ai.usage.totalTokens': usage.totalTokens,
                'ai.usage.reasoningTokens': usage.reasoningTokens,
                'ai.usage.cachedInputTokens': usage.cachedInputTokens,
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
          'ai.settings.maxSteps': maxSteps,
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
          messageId,
        }: {
          currentStep: number;
          responseMessages: Array<ResponseMessage>;
          usage: LanguageModelUsage;
          messageId: string;
        }) {
          const initialPrompt = await standardizePrompt({
            system,
            prompt,
            messages,
          });

          const stepInputMessages = [
            ...initialPrompt.messages,
            ...responseMessages,
          ];

          const promptMessages = await convertToLanguageModelPrompt({
            prompt: {
              system: initialPrompt.system,
              messages: stepInputMessages,
            },
            supportedUrls: await model.supportedUrls,
          });

          const toolsAndToolChoice = {
            ...prepareToolsAndToolChoice({ tools, toolChoice, activeTools }),
          };

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
                  'ai.prompt.messages': {
                    input: () => JSON.stringify(promptMessages),
                  },
                  'ai.prompt.tools': {
                    // convert the language model level tools:
                    input: () =>
                      toolsAndToolChoice.tools?.map(tool =>
                        JSON.stringify(tool),
                      ),
                  },
                  'ai.prompt.toolChoice': {
                    input: () =>
                      toolsAndToolChoice.toolChoice != null
                        ? JSON.stringify(toolsAndToolChoice.toolChoice)
                        : undefined,
                  },

                  // standardized gen-ai llm span attributes:
                  'gen_ai.system': model.provider,
                  'gen_ai.request.model': model.modelId,
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
                  result: await model.doStream({
                    ...callSettings,
                    ...toolsAndToolChoice,
                    responseFormat: output?.responseFormat,
                    prompt: promptMessages,
                    providerOptions,
                    abortSignal,
                    headers,
                  }),
                };
              },
            }),
          );

          const transformedStream = runToolsTransformation({
            tools,
            generatorStream: stream,
            toolCallStreaming,
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
            transformedStream.pipeThrough(
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
                      type: 'step-start',
                      messageId,
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

                    // forward:
                    case 'tool-call-streaming-start':
                    case 'tool-call-delta': {
                      controller.enqueue(chunk);
                      break;
                    }

                    case 'error': {
                      controller.enqueue(chunk);
                      stepFinishReason = 'error';
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
                    type: 'step-finish',
                    finishReason: stepFinishReason,
                    usage: stepUsage,
                    providerMetadata: stepProviderMetadata,
                    request: stepRequest,
                    response: {
                      ...stepResponse,
                      headers: response?.headers,
                    },
                    warnings,
                    messageId,
                  });

                  const combinedUsage = addLanguageModelUsage(usage, stepUsage);

                  if (
                    currentStep + 1 < maxSteps && // there are tool calls:
                    stepToolCalls.length > 0 &&
                    // all current tool calls have results:
                    stepToolResults.length === stepToolCalls.length
                  ) {
                    // append to messages for the next step:
                    responseMessages.push(
                      ...toResponseMessages({
                        content: stepContent,
                        tools: tools ?? ({} as TOOLS),
                        messageId,
                        generateMessageId,
                      }),
                    );

                    await streamStep({
                      currentStep: currentStep + 1,
                      responseMessages,
                      usage: combinedUsage,
                      messageId: generateMessageId(),
                    });
                  } else {
                    controller.enqueue({
                      type: 'finish',
                      finishReason: stepFinishReason,
                      usage: combinedUsage,
                      providerMetadata: stepProviderMetadata,
                      response: {
                        ...stepResponse,
                        headers: response?.headers,
                      },
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
          messageId: generateMessageId(),
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

  get content() {
    return this.contentPromise.value;
  }

  get warnings() {
    return this.warningsPromise.value;
  }

  get usage() {
    return this.usagePromise.value;
  }

  get finishReason() {
    return this.finishReasonPromise.value;
  }

  get providerMetadata() {
    return this.providerMetadataPromise.value;
  }

  get text() {
    return this.textPromise.value;
  }

  get reasoningText() {
    return this.reasoningPromise.value;
  }

  get reasoning() {
    return this.reasoningDetailsPromise.value;
  }

  get sources() {
    return this.sourcesPromise.value;
  }

  get files() {
    return this.filesPromise.value;
  }

  get toolCalls() {
    return this.toolCallsPromise.value;
  }

  get toolResults() {
    return this.toolResultsPromise.value;
  }

  get request() {
    return this.requestPromise.value;
  }

  get response() {
    return this.responsePromise.value;
  }

  get steps() {
    return this.stepsPromise.value;
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

  toDataStream({
    onError = () => 'An error occurred.', // mask error messages for safety by default
    sendUsage = true,
    sendReasoning = false,
    sendSources = false,
    experimental_sendFinish = true,
  }: DataStreamOptions = {}): ReadableStream<DataStreamPart> {
    return this.fullStream.pipeThrough(
      new TransformStream<TextStreamPart<TOOLS>, DataStreamPart>({
        transform: async (chunk, controller) => {
          const chunkType = chunk.type;
          switch (chunkType) {
            case 'text': {
              controller.enqueue({ type: 'text', value: chunk.text });
              break;
            }

            case 'reasoning': {
              if (sendReasoning) {
                controller.enqueue({ type: 'reasoning', value: chunk });
              }
              break;
            }

            case 'reasoning-part-finish': {
              if (sendReasoning) {
                controller.enqueue({
                  type: 'reasoning-part-finish',
                  value: null,
                });
              }
              break;
            }

            case 'file': {
              controller.enqueue({
                type: 'file',
                value: {
                  mediaType: chunk.file.mediaType,
                  url: `data:${chunk.file.mediaType};base64,${chunk.file.base64}`,
                },
              });
              break;
            }

            case 'source': {
              if (sendSources) {
                controller.enqueue({ type: 'source', value: chunk });
              }
              break;
            }

            case 'tool-call-streaming-start': {
              controller.enqueue({
                type: 'tool-call-streaming-start',
                value: {
                  toolCallId: chunk.toolCallId,
                  toolName: chunk.toolName,
                },
              });
              break;
            }

            case 'tool-call-delta': {
              controller.enqueue({
                type: 'tool-call-delta',
                value: {
                  toolCallId: chunk.toolCallId,
                  argsTextDelta: chunk.argsTextDelta,
                },
              });
              break;
            }

            case 'tool-call': {
              controller.enqueue({
                type: 'tool-call',
                value: {
                  toolCallId: chunk.toolCallId,
                  toolName: chunk.toolName,
                  args: chunk.args,
                },
              });
              break;
            }

            case 'tool-result': {
              controller.enqueue({
                type: 'tool-result',
                value: {
                  toolCallId: chunk.toolCallId,
                  result: chunk.result,
                },
              });
              break;
            }

            case 'error': {
              controller.enqueue({
                type: 'error',
                value: onError(chunk.error),
              });
              break;
            }

            case 'step-start': {
              controller.enqueue({
                type: 'start-step',
                value: {
                  messageId: chunk.messageId,
                },
              });
              break;
            }

            case 'step-finish': {
              controller.enqueue({
                type: 'finish-step',
                value: {
                  finishReason: chunk.finishReason,
                  usage: sendUsage ? chunk.usage : undefined,
                },
              });
              break;
            }

            case 'finish': {
              if (experimental_sendFinish) {
                controller.enqueue({
                  type: 'finish-message',
                  value: {
                    finishReason: chunk.finishReason,
                    usage: sendUsage ? chunk.usage : undefined,
                  },
                });
              }
              break;
            }

            default: {
              const exhaustiveCheck: never = chunkType;
              throw new Error(`Unknown chunk type: ${exhaustiveCheck}`);
            }
          }
        },
      }),
    );
  }

  pipeDataStreamToResponse(
    response: ServerResponse,
    {
      onError,
      sendUsage,
      sendReasoning,
      sendSources,
      experimental_sendFinish,
      experimental_sendStart,
      ...init
    }: ResponseInit & DataStreamOptions = {},
  ) {
    pipeDataStreamToResponse({
      response,
      dataStream: this.toDataStream({
        onError,
        sendUsage,
        sendReasoning,
        sendSources,
        experimental_sendFinish,
        experimental_sendStart,
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

  toDataStreamResponse({
    onError,
    sendUsage,
    sendReasoning,
    sendSources,
    experimental_sendFinish,
    experimental_sendStart,
    ...init
  }: ResponseInit & DataStreamOptions = {}): Response {
    return createDataStreamResponse({
      dataStream: this.toDataStream({
        onError,
        sendUsage,
        sendReasoning,
        sendSources,
        experimental_sendFinish,
        experimental_sendStart,
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
