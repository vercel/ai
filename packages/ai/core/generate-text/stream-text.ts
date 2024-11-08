import { createIdGenerator } from '@ai-sdk/provider-utils';
import { formatStreamPart } from '@ai-sdk/ui-utils';
import { Span } from '@opentelemetry/api';
import { ServerResponse } from 'node:http';
import { InvalidArgumentError } from '../../errors/invalid-argument-error';
import { StreamData } from '../../streams/stream-data';
import { createResolvablePromise } from '../../util/create-resolvable-promise';
import { retryWithExponentialBackoff } from '../../util/retry-with-exponential-backoff';
import { CallSettings } from '../prompt/call-settings';
import { convertToLanguageModelPrompt } from '../prompt/convert-to-language-model-prompt';
import { CoreAssistantMessage, CoreToolMessage } from '../prompt/message';
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
import { CoreTool } from '../tool';
import {
  CallWarning,
  CoreToolChoice,
  FinishReason,
  LanguageModel,
  LanguageModelRequestMetadata,
  LogProbs,
  ProviderMetadata,
} from '../types';
import { LanguageModelUsage } from '../types/usage';
import {
  AsyncIterableStream,
  createAsyncIterableStream,
} from '../util/async-iterable-stream';
import { createStitchableStream } from '../util/create-stitchable-stream';
import { mergeStreams } from '../util/merge-streams';
import { now as originalNow } from '../util/now';
import { prepareOutgoingHttpHeaders } from '../util/prepare-outgoing-http-headers';
import { prepareResponseHeaders } from '../util/prepare-response-headers';
import { splitOnLastWhitespace } from '../util/split-on-last-whitespace';
import { writeToServerResponse } from '../util/write-to-server-response';
import {
  runToolsTransformation,
  SingleRequestTextStreamPart,
} from './run-tools-transformation';
import { StepResult } from './step-result';
import { StreamTextResult, TextStreamPart } from './stream-text-result';
import { toResponseMessages } from './to-response-messages';
import { ToolCallUnion } from './tool-call';
import { ToolResultUnion } from './tool-result';

const originalGenerateId = createIdGenerator({ prefix: 'aitxt', size: 24 });

/**
Generate a text and call tools for a given prompt using a language model.

This function streams the output. If you do not want to stream the output, use `generateText` instead.

@param model - The language model to use.
@param tools - Tools that are accessible to and can be called by the model. The model needs to support calling tools.

@param system - A system message that will be part of the prompt.
@param prompt - A simple text prompt. You can either use `prompt` or `messages` but not both.
@param messages - A list of messages. You can either use `prompt` or `messages` but not both.

@param maxTokens - Maximum number of tokens to generate.
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
@param onStepFinish - Callback that is called when each step (LLM call) is finished, including intermediate steps.
@param onFinish - Callback that is called when the LLM response and all request tool executions
(for tools that have an `execute` function) are finished.

@return
A result object for accessing different stream types and additional information.
 */
export async function streamText<TOOLS extends Record<string, CoreTool>>({
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
  experimental_continueSteps: continueSteps = false,
  experimental_telemetry: telemetry,
  experimental_providerMetadata: providerMetadata,
  experimental_toolCallStreaming: toolCallStreaming = false,
  experimental_activeTools: activeTools,
  onChunk,
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
    toolChoice?: CoreToolChoice<TOOLS>;

    /**
Maximum number of sequential LLM calls (steps), e.g. when you use tool calls. Must be at least 1.

A maximum number is required to prevent infinite loops in the case of misconfigured tools.

By default, it's set to 1, which means that only a single LLM call is made.
 */
    maxSteps?: number;

    /**
When enabled, the model will perform additional steps if the finish reason is "length" (experimental).

By default, it's set to false.
     */
    experimental_continueSteps?: boolean;

    /**
Optional telemetry configuration (experimental).
     */
    experimental_telemetry?: TelemetrySettings;

    /**
Additional provider-specific metadata. They are passed through
to the provider from the AI SDK and enable provider-specific
functionality that can be fully encapsulated in the provider.
 */
    experimental_providerMetadata?: ProviderMetadata;

    /**
Limits the tools that are available for the model to call without
changing the tool call and result types in the result.
     */
    experimental_activeTools?: Array<keyof TOOLS>;

    /**
Enable streaming of tool call deltas as they are generated. Disabled by default.
     */
    experimental_toolCallStreaming?: boolean;

    /**
Callback that is called for each chunk of the stream. The stream processing will pause until the callback promise is resolved.
     */
    onChunk?: (event: {
      chunk: Extract<
        TextStreamPart<TOOLS>,
        {
          type:
            | 'text-delta'
            | 'tool-call'
            | 'tool-call-streaming-start'
            | 'tool-call-delta'
            | 'tool-result';
        }
      >;
    }) => Promise<void> | void;

    /**
Callback that is called when the LLM response and all request tool executions
(for tools that have an `execute` function) are finished.

The usage is the combined usage of all steps.
     */
    onFinish?: (
      event: Omit<StepResult<TOOLS>, 'stepType' | 'isContinued'> & {
        /**
Details for all steps.
       */
        readonly steps: StepResult<TOOLS>[];

        /**
The response messages that were generated during the call. It consists of an assistant message,
potentially containing tool calls.

When there are tool results, there is an additional tool message with the tool results that are available.
If there are tools that do not have execute functions, they are not included in the tool results and
need to be added separately.
     */
        readonly responseMessages: Array<
          CoreAssistantMessage | CoreToolMessage
        >;
      },
    ) => Promise<void> | void;

    /**
    Callback that is called when each step (LLM call) is finished, including intermediate steps.
    */
    onStepFinish?: (event: StepResult<TOOLS>) => Promise<void> | void;

    /**
     * Internal. For test use only. May change without notice.
     */
    _internal?: {
      now?: () => number;
      generateId?: () => string;
      currentDate?: () => Date;
    };
  }): Promise<StreamTextResult<TOOLS>> {
  if (maxSteps < 1) {
    throw new InvalidArgumentError({
      parameter: 'maxSteps',
      value: maxSteps,
      message: 'maxSteps must be at least 1',
    });
  }

  const baseTelemetryAttributes = getBaseTelemetryAttributes({
    model,
    telemetry,
    headers,
    settings: { ...settings, maxRetries },
  });

  const tracer = getTracer(telemetry);

  const initialPrompt = standardizePrompt({
    prompt: { system, prompt, messages },
    tools,
  });

  return recordSpan({
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
    fn: async rootSpan => {
      const retry = retryWithExponentialBackoff({ maxRetries });

      const startStep: StartStepFunction<TOOLS> = async ({
        responseMessages,
      }: {
        responseMessages: Array<CoreAssistantMessage | CoreToolMessage>;
      }) => {
        // after the 1st step, we need to switch to messages format:
        const promptFormat =
          responseMessages.length === 0 ? initialPrompt.type : 'messages';

        const promptMessages = await convertToLanguageModelPrompt({
          prompt: {
            type: promptFormat,
            system: initialPrompt.system,
            messages: [...initialPrompt.messages, ...responseMessages],
          },
          modelSupportsImageUrls: model.supportsImageUrls,
          modelSupportsUrl: model.supportsUrl,
        });

        const mode = {
          type: 'regular' as const,
          ...prepareToolsAndToolChoice({ tools, toolChoice, activeTools }),
        };

        const {
          result: { stream, warnings, rawResponse, request },
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
                'ai.prompt.format': {
                  input: () => promptFormat,
                },
                'ai.prompt.messages': {
                  input: () => JSON.stringify(promptMessages),
                },
                'ai.prompt.tools': {
                  // convert the language model level tools:
                  input: () => mode.tools?.map(tool => JSON.stringify(tool)),
                },
                'ai.prompt.toolChoice': {
                  input: () =>
                    mode.toolChoice != null
                      ? JSON.stringify(mode.toolChoice)
                      : undefined,
                },

                // standardized gen-ai llm span attributes:
                'gen_ai.system': model.provider,
                'gen_ai.request.model': model.modelId,
                'gen_ai.request.frequency_penalty': settings.frequencyPenalty,
                'gen_ai.request.max_tokens': settings.maxTokens,
                'gen_ai.request.presence_penalty': settings.presencePenalty,
                'gen_ai.request.stop_sequences': settings.stopSequences,
                'gen_ai.request.temperature': settings.temperature,
                'gen_ai.request.top_k': settings.topK,
                'gen_ai.request.top_p': settings.topP,
              },
            }),
            tracer,
            endWhenDone: false,
            fn: async doStreamSpan => ({
              startTimestampMs: now(), // get before the call
              doStreamSpan,
              result: await model.doStream({
                mode,
                ...prepareCallSettings(settings),
                inputFormat: promptFormat,
                prompt: promptMessages,
                providerMetadata,
                abortSignal,
                headers,
              }),
            }),
          }),
        );

        return {
          result: {
            stream: runToolsTransformation({
              tools,
              generatorStream: stream,
              toolCallStreaming,
              tracer,
              telemetry,
              abortSignal,
            }),
            warnings,
            request: request ?? {},
            rawResponse,
          },
          doStreamSpan,
          startTimestampMs,
        };
      };

      const {
        result: { stream, warnings, rawResponse, request },
        doStreamSpan,
        startTimestampMs,
      } = await startStep({ responseMessages: [] });

      return new DefaultStreamTextResult({
        stream,
        warnings,
        rawResponse,
        request,
        onChunk,
        onFinish,
        onStepFinish,
        rootSpan,
        doStreamSpan,
        telemetry,
        startTimestampMs,
        maxSteps,
        continueSteps,
        startStep,
        modelId: model.modelId,
        now,
        currentDate,
        generateId,
        tools,
      });
    },
  });
}

type StartStepFunction<TOOLS extends Record<string, CoreTool>> = (options: {
  responseMessages: Array<CoreAssistantMessage | CoreToolMessage>;
}) => Promise<{
  result: {
    stream: ReadableStream<SingleRequestTextStreamPart<TOOLS>>;
    warnings: CallWarning[] | undefined;
    rawResponse: { headers?: Record<string, string> } | undefined;
    request: LanguageModelRequestMetadata;
  };
  doStreamSpan: Span;
  startTimestampMs: number;
}>;

class DefaultStreamTextResult<TOOLS extends Record<string, CoreTool>>
  implements StreamTextResult<TOOLS>
{
  private originalStream: ReadableStream<TextStreamPart<TOOLS>>;
  private rawResponse: { headers?: Record<string, string> } | undefined;
  private rawWarnings: CallWarning[] | undefined;

  readonly warnings: StreamTextResult<TOOLS>['warnings'];
  readonly usage: StreamTextResult<TOOLS>['usage'];
  readonly finishReason: StreamTextResult<TOOLS>['finishReason'];
  readonly experimental_providerMetadata: StreamTextResult<TOOLS>['experimental_providerMetadata'];
  readonly text: StreamTextResult<TOOLS>['text'];
  readonly toolCalls: StreamTextResult<TOOLS>['toolCalls'];
  readonly toolResults: StreamTextResult<TOOLS>['toolResults'];
  readonly request: StreamTextResult<TOOLS>['request'];
  readonly response: StreamTextResult<TOOLS>['response'];
  readonly steps: StreamTextResult<TOOLS>['steps'];

  constructor({
    stream,
    warnings,
    rawResponse,
    request,
    onChunk,
    onFinish,
    onStepFinish,
    rootSpan,
    doStreamSpan,
    telemetry,
    startTimestampMs,
    maxSteps,
    continueSteps,
    startStep,
    modelId,
    now,
    currentDate,
    generateId,
    tools,
  }: {
    stream: ReadableStream<SingleRequestTextStreamPart<TOOLS>>;
    warnings: DefaultStreamTextResult<TOOLS>['rawWarnings'];
    rawResponse: DefaultStreamTextResult<TOOLS>['rawResponse'];
    request: Awaited<StreamTextResult<TOOLS>['request']>;
    onChunk: Parameters<typeof streamText>[0]['onChunk'];
    onFinish:
      | ((
          event: Omit<StepResult<TOOLS>, 'stepType' | 'isContinued'> & {
            steps: StepResult<TOOLS>[];
            responseMessages: Array<CoreAssistantMessage | CoreToolMessage>;
          },
        ) => Promise<void> | void)
      | undefined;
    onStepFinish:
      | ((event: StepResult<TOOLS>) => Promise<void> | void)
      | undefined;
    rootSpan: Span;
    doStreamSpan: Span;
    telemetry: TelemetrySettings | undefined;
    startTimestampMs: number;
    maxSteps: number;
    continueSteps: boolean;
    startStep: StartStepFunction<TOOLS>;
    modelId: string;
    now: () => number;
    currentDate: () => Date;
    generateId: () => string;
    tools: TOOLS | undefined;
  }) {
    this.rawWarnings = warnings;
    this.rawResponse = rawResponse;

    // initialize usage promise
    const { resolve: resolveUsage, promise: usagePromise } =
      createResolvablePromise<LanguageModelUsage>();
    this.usage = usagePromise;

    // initialize finish reason promise
    const { resolve: resolveFinishReason, promise: finishReasonPromise } =
      createResolvablePromise<FinishReason>();
    this.finishReason = finishReasonPromise;

    // initialize text promise
    const { resolve: resolveText, promise: textPromise } =
      createResolvablePromise<string>();
    this.text = textPromise;

    // initialize toolCalls promise
    const { resolve: resolveToolCalls, promise: toolCallsPromise } =
      createResolvablePromise<ToolCallUnion<TOOLS>[]>();
    this.toolCalls = toolCallsPromise;

    // initialize toolResults promise
    const { resolve: resolveToolResults, promise: toolResultsPromise } =
      createResolvablePromise<ToolResultUnion<TOOLS>[]>();
    this.toolResults = toolResultsPromise;

    // initialize steps promise
    const { resolve: resolveSteps, promise: stepsPromise } =
      createResolvablePromise<StepResult<TOOLS>[]>();
    this.steps = stepsPromise;

    // initialize experimental_providerMetadata promise
    const {
      resolve: resolveProviderMetadata,
      promise: providerMetadataPromise,
    } = createResolvablePromise<ProviderMetadata | undefined>();
    this.experimental_providerMetadata = providerMetadataPromise;

    // initialize request promise
    const { resolve: resolveRequest, promise: requestPromise } =
      createResolvablePromise<LanguageModelRequestMetadata>();
    this.request = requestPromise;

    // initialize response promise
    const { resolve: resolveResponse, promise: responsePromise } =
      createResolvablePromise<Awaited<StreamTextResult<TOOLS>['response']>>();
    this.response = responsePromise;

    // initialize warnings promise
    const { resolve: resolveWarnings, promise: warningsPromise } =
      createResolvablePromise<CallWarning[]>();
    this.warnings = warningsPromise;

    // create a stitchable stream to send steps in a single response stream
    const {
      stream: stitchableStream,
      addStream,
      close: closeStitchableStream,
    } = createStitchableStream<TextStreamPart<TOOLS>>();

    this.originalStream = stitchableStream;

    // collect step results
    const stepResults: StepResult<TOOLS>[] = [];

    const self = this;

    // add the steps stream
    function addStepStream({
      stream,
      startTimestamp,
      doStreamSpan,
      currentStep,
      responseMessages,
      usage = {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
      stepType,
      previousStepText = '',
      stepRequest,
      hasLeadingWhitespace,
    }: {
      stream: ReadableStream<SingleRequestTextStreamPart<TOOLS>>;
      startTimestamp: number;
      doStreamSpan: Span;
      currentStep: number;
      responseMessages: Array<CoreAssistantMessage | CoreToolMessage>;
      usage: LanguageModelUsage | undefined;
      stepType: 'initial' | 'continue' | 'tool-result';
      previousStepText?: string;
      stepRequest: LanguageModelRequestMetadata;
      hasLeadingWhitespace: boolean;
    }) {
      const stepToolCalls: ToolCallUnion<TOOLS>[] = [];
      const stepToolResults: ToolResultUnion<TOOLS>[] = [];
      let stepFinishReason: FinishReason = 'unknown';
      let stepUsage: LanguageModelUsage = {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      };
      let stepProviderMetadata: ProviderMetadata | undefined;
      let stepFirstChunk = true;
      let stepText = '';
      let fullStepText = stepType === 'continue' ? previousStepText : '';
      let stepLogProbs: LogProbs | undefined;
      let stepResponse: { id: string; timestamp: Date; modelId: string } = {
        id: generateId(),
        timestamp: currentDate(),
        modelId,
      };

      // chunk buffer when using continue:
      let chunkBuffer = '';
      let chunkTextPublished = false;
      let inWhitespacePrefix = true;
      let hasWhitespaceSuffix = false; // for next step. when true, step ended with whitespace

      async function publishTextChunk({
        controller,
        chunk,
      }: {
        controller: TransformStreamDefaultController<TextStreamPart<TOOLS>>;
        chunk: TextStreamPart<TOOLS> & { type: 'text-delta' };
      }) {
        controller.enqueue(chunk);

        stepText += chunk.textDelta;
        fullStepText += chunk.textDelta;
        chunkTextPublished = true;
        hasWhitespaceSuffix = chunk.textDelta.trimEnd() !== chunk.textDelta;

        await onChunk?.({ chunk });
      }

      addStream(
        stream.pipeThrough(
          new TransformStream<
            SingleRequestTextStreamPart<TOOLS>,
            TextStreamPart<TOOLS>
          >({
            async transform(chunk, controller): Promise<void> {
              // Telemetry for first chunk:
              if (stepFirstChunk) {
                const msToFirstChunk = now() - startTimestamp;

                stepFirstChunk = false;

                doStreamSpan.addEvent('ai.stream.firstChunk', {
                  'ai.response.msToFirstChunk': msToFirstChunk,
                });

                doStreamSpan.setAttributes({
                  'ai.response.msToFirstChunk': msToFirstChunk,
                });
              }

              // Filter out empty text deltas
              if (chunk.type === 'text-delta' && chunk.textDelta.length === 0) {
                return;
              }

              const chunkType = chunk.type;
              switch (chunkType) {
                case 'text-delta': {
                  if (continueSteps) {
                    // when a new step starts, leading whitespace is to be discarded
                    // when there is already preceding whitespace in the chunk buffer
                    const trimmedChunkText =
                      inWhitespacePrefix && hasLeadingWhitespace
                        ? chunk.textDelta.trimStart()
                        : chunk.textDelta;

                    if (trimmedChunkText.length === 0) {
                      break;
                    }

                    inWhitespacePrefix = false;
                    chunkBuffer += trimmedChunkText;

                    const split = splitOnLastWhitespace(chunkBuffer);

                    // publish the text until the last whitespace:
                    if (split != null) {
                      chunkBuffer = split.suffix;

                      await publishTextChunk({
                        controller,
                        chunk: {
                          type: 'text-delta',
                          textDelta: split.prefix + split.whitespace,
                        },
                      });
                    }
                  } else {
                    await publishTextChunk({ controller, chunk });
                  }

                  break;
                }

                case 'tool-call': {
                  controller.enqueue(chunk);
                  // store tool calls for onFinish callback and toolCalls promise:
                  stepToolCalls.push(chunk);
                  await onChunk?.({ chunk });
                  break;
                }

                case 'tool-result': {
                  controller.enqueue(chunk);
                  // store tool results for onFinish callback and toolResults promise:
                  stepToolResults.push(chunk);
                  // as any needed, bc type inferences mixed up tool-result with tool-call
                  await onChunk?.({ chunk: chunk as any });
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
                  stepProviderMetadata = chunk.experimental_providerMetadata;
                  stepLogProbs = chunk.logprobs;

                  // Telemetry for finish event timing
                  // (since tool executions can take longer and distort calculations)
                  const msToFinish = now() - startTimestamp;
                  doStreamSpan.addEvent('ai.stream.finish');
                  doStreamSpan.setAttributes({
                    'ai.response.msToFinish': msToFinish,
                    'ai.response.avgCompletionTokensPerSecond':
                      (1000 * stepUsage.completionTokens) / msToFinish,
                  });

                  break;
                }

                case 'tool-call-streaming-start':
                case 'tool-call-delta': {
                  controller.enqueue(chunk);
                  await onChunk?.({ chunk });
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

              // determine the next step type
              let nextStepType: 'done' | 'continue' | 'tool-result' = 'done';
              if (currentStep + 1 < maxSteps) {
                if (
                  continueSteps &&
                  stepFinishReason === 'length' &&
                  // only use continue when there are no tool calls:
                  stepToolCalls.length === 0
                ) {
                  nextStepType = 'continue';
                } else if (
                  // there are tool calls:
                  stepToolCalls.length > 0 &&
                  // all current tool calls have results:
                  stepToolResults.length === stepToolCalls.length
                ) {
                  nextStepType = 'tool-result';
                }
              }

              // when using continuation, publish buffer on final step or if there
              // was no whitespace in the step:
              if (
                continueSteps &&
                chunkBuffer.length > 0 &&
                (nextStepType !== 'continue' || // when the next step is a regular step, publish the buffer
                  (stepType === 'continue' && !chunkTextPublished)) // when the next step is a continue step, publish the buffer if no text was published in the step
              ) {
                await publishTextChunk({
                  controller,
                  chunk: {
                    type: 'text-delta',
                    textDelta: chunkBuffer,
                  },
                });
                chunkBuffer = '';
              }

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

                      'ai.usage.promptTokens': stepUsage.promptTokens,
                      'ai.usage.completionTokens': stepUsage.completionTokens,

                      // standardized gen-ai llm span attributes:
                      'gen_ai.response.finish_reasons': [stepFinishReason],
                      'gen_ai.response.id': stepResponse.id,
                      'gen_ai.response.model': stepResponse.modelId,
                      'gen_ai.usage.input_tokens': stepUsage.promptTokens,
                      'gen_ai.usage.output_tokens': stepUsage.completionTokens,
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
                experimental_providerMetadata: stepProviderMetadata,
                logprobs: stepLogProbs,
                response: {
                  ...stepResponse,
                },
                isContinued: nextStepType === 'continue',
              });

              // append to messages for the next step:
              if (stepType === 'continue') {
                // continue step: update the last assistant message
                // continue is only possible when there are no tool calls,
                // so we can assume that there is a single last assistant message:
                const lastMessage = responseMessages[
                  responseMessages.length - 1
                ] as CoreAssistantMessage;

                if (typeof lastMessage.content === 'string') {
                  lastMessage.content += stepText;
                } else {
                  lastMessage.content.push({
                    text: stepText,
                    type: 'text',
                  });
                }
              } else {
                responseMessages.push(
                  ...toResponseMessages({
                    text: stepText,
                    tools: tools ?? ({} as TOOLS),
                    toolCalls: stepToolCalls,
                    toolResults: stepToolResults,
                  }),
                );
              }

              // Add step information (after response messages are updated):
              const currentStepResult: StepResult<TOOLS> = {
                stepType,
                text: stepText,
                toolCalls: stepToolCalls,
                toolResults: stepToolResults,
                finishReason: stepFinishReason,
                usage: stepUsage,
                warnings: self.rawWarnings,
                logprobs: stepLogProbs,
                request: stepRequest,
                response: {
                  ...stepResponse,
                  headers: self.rawResponse?.headers,

                  // deep clone msgs to avoid mutating past messages in multi-step:
                  messages: JSON.parse(JSON.stringify(responseMessages)),
                },
                experimental_providerMetadata: stepProviderMetadata,
                isContinued: nextStepType === 'continue',
              };

              stepResults.push(currentStepResult);

              await onStepFinish?.(currentStepResult);

              const combinedUsage = {
                promptTokens: usage.promptTokens + stepUsage.promptTokens,
                completionTokens:
                  usage.completionTokens + stepUsage.completionTokens,
                totalTokens: usage.totalTokens + stepUsage.totalTokens,
              };

              if (nextStepType !== 'done') {
                // create call and doStream span:
                const {
                  result,
                  doStreamSpan,
                  startTimestampMs: startTimestamp,
                } = await startStep({ responseMessages });

                // update warnings and rawResponse:
                self.rawWarnings = result.warnings;
                self.rawResponse = result.rawResponse;

                // needs to add to stitchable stream
                addStepStream({
                  stream: result.stream,
                  startTimestamp,
                  doStreamSpan,
                  currentStep: currentStep + 1,
                  responseMessages,
                  usage: combinedUsage,
                  stepType: nextStepType,
                  previousStepText: fullStepText,
                  stepRequest: result.request,
                  hasLeadingWhitespace: hasWhitespaceSuffix,
                });

                return;
              }

              try {
                // enqueue the finish chunk:
                controller.enqueue({
                  type: 'finish',
                  finishReason: stepFinishReason,
                  usage: combinedUsage,
                  experimental_providerMetadata: stepProviderMetadata,
                  logprobs: stepLogProbs,
                  response: {
                    ...stepResponse,
                  },
                });

                // close the stitchable stream
                closeStitchableStream();

                // Add response information to the root span:
                rootSpan.setAttributes(
                  selectTelemetryAttributes({
                    telemetry,
                    attributes: {
                      'ai.response.finishReason': stepFinishReason,
                      'ai.response.text': { output: () => fullStepText },
                      'ai.response.toolCalls': {
                        output: () => stepToolCallsJson,
                      },

                      'ai.usage.promptTokens': combinedUsage.promptTokens,
                      'ai.usage.completionTokens':
                        combinedUsage.completionTokens,
                    },
                  }),
                );

                // resolve promises:
                resolveUsage(combinedUsage);
                resolveFinishReason(stepFinishReason!);
                resolveText(fullStepText);
                resolveToolCalls(stepToolCalls);
                resolveProviderMetadata(stepProviderMetadata);
                resolveToolResults(stepToolResults);
                resolveRequest(stepRequest);
                resolveResponse({
                  ...stepResponse,
                  headers: rawResponse?.headers,
                  messages: responseMessages,
                });
                resolveSteps(stepResults);
                resolveWarnings(self.rawWarnings ?? []);

                // call onFinish callback:
                await onFinish?.({
                  finishReason: stepFinishReason,
                  logprobs: stepLogProbs,
                  usage: combinedUsage,
                  text: fullStepText,
                  toolCalls: stepToolCalls,
                  // The tool results are inferred as a never[] type, because they are
                  // optional and the execute method with an inferred result type is
                  // optional as well. Therefore we need to cast the toolResults to any.
                  // The type exposed to the users will be correctly inferred.
                  toolResults: stepToolResults as any,
                  request: stepRequest,
                  response: {
                    ...stepResponse,
                    headers: rawResponse?.headers,
                    messages: responseMessages,
                  },
                  warnings,
                  experimental_providerMetadata: stepProviderMetadata,
                  steps: stepResults,
                  responseMessages,
                });
              } catch (error) {
                controller.error(error);
              } finally {
                rootSpan.end();
              }
            },
          }),
        ),
      );
    }

    // add the initial stream to the stitchable stream
    addStepStream({
      stream,
      startTimestamp: startTimestampMs,
      doStreamSpan,
      currentStep: 0,
      responseMessages: [],
      usage: undefined,
      stepType: 'initial',
      stepRequest: request,
      hasLeadingWhitespace: false,
    });
  }

  /**
Split out a new stream from the original stream.
The original stream is replaced to allow for further splitting,
since we do not know how many times the stream will be split.

Note: this leads to buffering the stream content on the server.
However, the LLM results are expected to be small enough to not cause issues.
   */
  private teeStream() {
    const [stream1, stream2] = this.originalStream.tee();
    this.originalStream = stream2;
    return stream1;
  }

  get textStream(): AsyncIterableStream<string> {
    return createAsyncIterableStream(this.teeStream(), {
      transform(chunk, controller) {
        if (chunk.type === 'text-delta') {
          controller.enqueue(chunk.textDelta);
        } else if (chunk.type === 'error') {
          controller.error(chunk.error);
        }
      },
    });
  }

  get fullStream(): AsyncIterableStream<TextStreamPart<TOOLS>> {
    return createAsyncIterableStream(this.teeStream(), {
      transform(chunk, controller) {
        controller.enqueue(chunk);
      },
    });
  }

  private toDataStreamInternal({
    getErrorMessage = () => '', // mask error messages for safety by default
    sendUsage = true,
  }: {
    getErrorMessage?: (error: unknown) => string;
    sendUsage?: boolean;
  } = {}) {
    let aggregatedResponse = '';

    const callbackTransformer = new TransformStream<
      TextStreamPart<TOOLS>,
      TextStreamPart<TOOLS>
    >({
      async transform(chunk, controller): Promise<void> {
        controller.enqueue(chunk);

        if (chunk.type === 'text-delta') {
          aggregatedResponse += chunk.textDelta;
        }
      },
    });

    const streamPartsTransformer = new TransformStream<
      TextStreamPart<TOOLS>,
      string
    >({
      transform: async (chunk, controller) => {
        const chunkType = chunk.type;
        switch (chunkType) {
          case 'text-delta': {
            controller.enqueue(formatStreamPart('text', chunk.textDelta));
            break;
          }

          case 'tool-call-streaming-start': {
            controller.enqueue(
              formatStreamPart('tool_call_streaming_start', {
                toolCallId: chunk.toolCallId,
                toolName: chunk.toolName,
              }),
            );
            break;
          }

          case 'tool-call-delta': {
            controller.enqueue(
              formatStreamPart('tool_call_delta', {
                toolCallId: chunk.toolCallId,
                argsTextDelta: chunk.argsTextDelta,
              }),
            );
            break;
          }

          case 'tool-call': {
            controller.enqueue(
              formatStreamPart('tool_call', {
                toolCallId: chunk.toolCallId,
                toolName: chunk.toolName,
                args: chunk.args,
              }),
            );
            break;
          }

          case 'tool-result': {
            controller.enqueue(
              formatStreamPart('tool_result', {
                toolCallId: chunk.toolCallId,
                result: chunk.result,
              }),
            );
            break;
          }

          case 'error': {
            controller.enqueue(
              formatStreamPart('error', getErrorMessage(chunk.error)),
            );
            break;
          }

          case 'step-finish': {
            controller.enqueue(
              formatStreamPart('finish_step', {
                finishReason: chunk.finishReason,
                usage: sendUsage
                  ? {
                      promptTokens: chunk.usage.promptTokens,
                      completionTokens: chunk.usage.completionTokens,
                    }
                  : undefined,
                isContinued: chunk.isContinued,
              }),
            );
            break;
          }

          case 'finish': {
            controller.enqueue(
              formatStreamPart('finish_message', {
                finishReason: chunk.finishReason,
                usage: sendUsage
                  ? {
                      promptTokens: chunk.usage.promptTokens,
                      completionTokens: chunk.usage.completionTokens,
                    }
                  : undefined,
              }),
            );
            break;
          }

          default: {
            const exhaustiveCheck: never = chunkType;
            throw new Error(`Unknown chunk type: ${exhaustiveCheck}`);
          }
        }
      },
    });

    return this.fullStream
      .pipeThrough(callbackTransformer)
      .pipeThrough(streamPartsTransformer)
      .pipeThrough(new TextEncoderStream());
  }

  pipeDataStreamToResponse(
    response: ServerResponse,
    {
      status,
      statusText,
      headers,
      data,
      getErrorMessage,
      sendUsage,
    }: ResponseInit & {
      data?: StreamData;
      getErrorMessage?: (error: unknown) => string;
      sendUsage?: boolean; // default to true (change to false in v4: secure by default)
    } = {},
  ) {
    writeToServerResponse({
      response,
      status,
      statusText,
      headers: prepareOutgoingHttpHeaders(headers, {
        contentType: 'text/plain; charset=utf-8',
        dataStreamVersion: 'v1',
      }),
      stream: this.toDataStream({ data, getErrorMessage, sendUsage }),
    });
  }

  pipeTextStreamToResponse(response: ServerResponse, init?: ResponseInit) {
    writeToServerResponse({
      response,
      status: init?.status,
      statusText: init?.statusText,
      headers: prepareOutgoingHttpHeaders(init?.headers, {
        contentType: 'text/plain; charset=utf-8',
      }),
      stream: this.textStream.pipeThrough(new TextEncoderStream()),
    });
  }

  toDataStream(options?: {
    data?: StreamData;
    getErrorMessage?: (error: unknown) => string;
    sendUsage?: boolean;
  }) {
    const stream = this.toDataStreamInternal({
      getErrorMessage: options?.getErrorMessage,
      sendUsage: options?.sendUsage,
    });

    return options?.data ? mergeStreams(options?.data.stream, stream) : stream;
  }

  toDataStreamResponse({
    headers,
    status,
    statusText,
    data,
    getErrorMessage,
    sendUsage,
  }: ResponseInit & {
    data?: StreamData;
    getErrorMessage?: (error: unknown) => string;
    sendUsage?: boolean;
  } = {}): Response {
    return new Response(
      this.toDataStream({ data, getErrorMessage, sendUsage }),
      {
        status,
        statusText,
        headers: prepareResponseHeaders(headers, {
          contentType: 'text/plain; charset=utf-8',
          dataStreamVersion: 'v1',
        }),
      },
    );
  }

  toTextStreamResponse(init?: ResponseInit): Response {
    return new Response(this.textStream.pipeThrough(new TextEncoderStream()), {
      status: init?.status ?? 200,
      headers: prepareResponseHeaders(init?.headers, {
        contentType: 'text/plain; charset=utf-8',
      }),
    });
  }
}
