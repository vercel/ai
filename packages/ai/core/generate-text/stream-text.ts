import { createIdGenerator } from '@ai-sdk/provider-utils';
import { DataStreamString, formatDataStreamPart } from '@ai-sdk/ui-utils';
import { ServerResponse } from 'node:http';
import { InvalidArgumentError } from '../../errors/invalid-argument-error';
import { StreamData } from '../../streams/stream-data';
import { DelayedPromise } from '../../util/delayed-promise';
import { DataStreamWriter } from '../data-stream/data-stream-writer';
import { CallSettings } from '../prompt/call-settings';
import { convertToLanguageModelPrompt } from '../prompt/convert-to-language-model-prompt';
import { CoreAssistantMessage, CoreToolMessage } from '../prompt/message';
import { prepareCallSettings } from '../prompt/prepare-call-settings';
import { prepareRetries } from '../prompt/prepare-retries';
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
  CoreToolChoice,
  FinishReason,
  LanguageModel,
  LogProbs,
} from '../types/language-model';
import { ProviderMetadata } from '../types/provider-metadata';
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
import { ToolCallRepairFunction } from './tool-call-repair';
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
export function streamText<TOOLS extends Record<string, CoreTool>>({
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
  experimental_repairToolCall: repairToolCall,
  experimental_transform: transform,
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
A function that attempts to repair a tool call that failed to parse.
     */
    experimental_repairToolCall?: ToolCallRepairFunction<TOOLS>;

    /**
Enable streaming of tool call deltas as they are generated. Disabled by default.
     */
    experimental_toolCallStreaming?: boolean;

    /**
Optional transformation that is applied to the stream.
     */
    experimental_transform?: (options: {
      tools: TOOLS; // for type inference
    }) => TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>;

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
  }): StreamTextResult<TOOLS> {
  return new DefaultStreamTextResult({
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
    transform: transform?.({ tools: tools as TOOLS }),
    activeTools,
    repairToolCall,
    maxSteps,
    continueSteps,
    providerMetadata,
    onChunk,
    onFinish,
    onStepFinish,
    now,
    currentDate,
    generateId,
  });
}

class DefaultStreamTextResult<TOOLS extends Record<string, CoreTool>>
  implements StreamTextResult<TOOLS>
{
  private readonly warningsPromise = new DelayedPromise<
    Awaited<StreamTextResult<TOOLS>['warnings']>
  >();
  private readonly usagePromise = new DelayedPromise<
    Awaited<StreamTextResult<TOOLS>['usage']>
  >();
  private readonly finishReasonPromise = new DelayedPromise<
    Awaited<StreamTextResult<TOOLS>['finishReason']>
  >();
  private readonly providerMetadataPromise = new DelayedPromise<
    Awaited<StreamTextResult<TOOLS>['experimental_providerMetadata']>
  >();
  private readonly textPromise = new DelayedPromise<
    Awaited<StreamTextResult<TOOLS>['text']>
  >();
  private readonly toolCallsPromise = new DelayedPromise<
    Awaited<StreamTextResult<TOOLS>['toolCalls']>
  >();
  private readonly toolResultsPromise = new DelayedPromise<
    Awaited<StreamTextResult<TOOLS>['toolResults']>
  >();
  private readonly requestPromise = new DelayedPromise<
    Awaited<StreamTextResult<TOOLS>['request']>
  >();
  private readonly responsePromise = new DelayedPromise<
    Awaited<StreamTextResult<TOOLS>['response']>
  >();
  private readonly stepsPromise = new DelayedPromise<
    Awaited<StreamTextResult<TOOLS>['steps']>
  >();

  private readonly addStream: (
    stream: ReadableStream<TextStreamPart<TOOLS>>,
  ) => void;

  private readonly closeStream: () => void;

  private baseStream: ReadableStream<TextStreamPart<TOOLS>>;

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
    transform,
    activeTools,
    repairToolCall,
    maxSteps,
    continueSteps,
    providerMetadata,
    onChunk,
    onFinish,
    onStepFinish,
    now,
    currentDate,
    generateId,
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
    toolChoice: CoreToolChoice<TOOLS> | undefined;
    toolCallStreaming: boolean;
    transform:
      | TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>
      | undefined;
    activeTools: Array<keyof TOOLS> | undefined;
    repairToolCall: ToolCallRepairFunction<TOOLS> | undefined;
    maxSteps: number;
    continueSteps: boolean;
    providerMetadata: ProviderMetadata | undefined;
    onChunk:
      | undefined
      | ((event: {
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
        }) => Promise<void> | void);
    onFinish:
      | undefined
      | ((
          event: Omit<StepResult<TOOLS>, 'stepType' | 'isContinued'> & {
            readonly steps: StepResult<TOOLS>[];
          },
        ) => Promise<void> | void);
    onStepFinish:
      | undefined
      | ((event: StepResult<TOOLS>) => Promise<void> | void);
    now: () => number;
    currentDate: () => Date;
    generateId: () => string;
  }) {
    if (maxSteps < 1) {
      throw new InvalidArgumentError({
        parameter: 'maxSteps',
        value: maxSteps,
        message: 'maxSteps must be at least 1',
      });
    }

    // event processor for telemetry, invoking callbacks, etc.
    let recordedText = '';
    const eventProcessor = new TransformStream<
      TextStreamPart<TOOLS>,
      TextStreamPart<TOOLS>
    >({
      transform(chunk, controller) {
        controller.enqueue(chunk); // forward the chunk to the next stream

        if (chunk.type === 'text-delta') {
          recordedText += chunk.textDelta;
        }
      },

      flush(controller) {
        self.textPromise.resolve(recordedText);
      },
    });

    // initialize the stitchable stream and the transformed stream:
    const stitchableStream = createStitchableStream<TextStreamPart<TOOLS>>();
    this.addStream = stitchableStream.addStream;
    this.closeStream = stitchableStream.close;
    this.baseStream = (
      transform
        ? stitchableStream.stream.pipeThrough(transform)
        : stitchableStream.stream
    ).pipeThrough(eventProcessor);

    const { maxRetries, retry } = prepareRetries({
      maxRetries: maxRetriesArg,
    });

    const tracer = getTracer(telemetry);

    const baseTelemetryAttributes = getBaseTelemetryAttributes({
      model,
      telemetry,
      headers,
      settings: { ...settings, maxRetries },
    });

    const initialPrompt = standardizePrompt({
      prompt: { system, prompt, messages },
      tools,
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
      fn: async rootSpan => {
        // collect step results
        const stepResults: StepResult<TOOLS>[] = [];

        async function streamStep({
          currentStep,
          responseMessages,
          usage,
          stepType,
          previousStepText,
          hasLeadingWhitespace,
        }: {
          currentStep: number;
          responseMessages: Array<CoreAssistantMessage | CoreToolMessage>;
          usage: LanguageModelUsage;
          stepType: 'initial' | 'continue' | 'tool-result';
          previousStepText: string;
          hasLeadingWhitespace: boolean;
        }) {
          // after the 1st step, we need to switch to messages format:
          const promptFormat =
            responseMessages.length === 0 ? initialPrompt.type : 'messages';

          const stepInputMessages = [
            ...initialPrompt.messages,
            ...responseMessages,
          ];

          const promptMessages = await convertToLanguageModelPrompt({
            prompt: {
              type: promptFormat,
              system: initialPrompt.system,
              messages: stepInputMessages,
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
            modelId: model.modelId,
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

          self.addStream(
            transformedStream.pipeThrough(
              new TransformStream<
                SingleRequestTextStreamPart<TOOLS>,
                TextStreamPart<TOOLS>
              >({
                async transform(chunk, controller): Promise<void> {
                  // Telemetry for first chunk:
                  if (stepFirstChunk) {
                    const msToFirstChunk = now() - startTimestampMs;

                    stepFirstChunk = false;

                    doStreamSpan.addEvent('ai.stream.firstChunk', {
                      'ai.response.msToFirstChunk': msToFirstChunk,
                    });

                    doStreamSpan.setAttributes({
                      'ai.response.msToFirstChunk': msToFirstChunk,
                    });
                  }

                  // Filter out empty text deltas
                  if (
                    chunk.type === 'text-delta' &&
                    chunk.textDelta.length === 0
                  ) {
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
                      stepProviderMetadata =
                        chunk.experimental_providerMetadata;
                      stepLogProbs = chunk.logprobs;

                      // Telemetry for finish event timing
                      // (since tool executions can take longer and distort calculations)
                      const msToFinish = now() - startTimestampMs;
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
                  let nextStepType: 'done' | 'continue' | 'tool-result' =
                    'done';
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
                          'ai.usage.completionTokens':
                            stepUsage.completionTokens,

                          // standardized gen-ai llm span attributes:
                          'gen_ai.response.finish_reasons': [stepFinishReason],
                          'gen_ai.response.id': stepResponse.id,
                          'gen_ai.response.model': stepResponse.modelId,
                          'gen_ai.usage.input_tokens': stepUsage.promptTokens,
                          'gen_ai.usage.output_tokens':
                            stepUsage.completionTokens,
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
                    warnings,
                    logprobs: stepLogProbs,
                    request: stepRequest,
                    response: {
                      ...stepResponse,
                      headers: rawResponse?.headers,

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
                    // needs to add to stitchable stream
                    await streamStep({
                      currentStep: currentStep + 1,
                      responseMessages,
                      usage: combinedUsage,
                      stepType: nextStepType,
                      previousStepText: fullStepText,
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
                    self.closeStream();

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
                    self.usagePromise.resolve(combinedUsage);
                    self.finishReasonPromise.resolve(stepFinishReason!);

                    self.toolCallsPromise.resolve(stepToolCalls);
                    self.providerMetadataPromise.resolve(stepProviderMetadata);
                    self.toolResultsPromise.resolve(stepToolResults);
                    self.requestPromise.resolve(stepRequest);
                    self.responsePromise.resolve({
                      ...stepResponse,
                      headers: rawResponse?.headers,
                      messages: responseMessages,
                    });
                    self.stepsPromise.resolve(stepResults);
                    self.warningsPromise.resolve(warnings ?? []);

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
        await streamStep({
          currentStep: 0,
          responseMessages: [],
          usage: {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
          },
          previousStepText: '',
          stepType: 'initial',
          hasLeadingWhitespace: false,
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

  get warnings() {
    return this.warningsPromise.value;
  }

  get usage() {
    return this.usagePromise.value;
  }

  get finishReason() {
    return this.finishReasonPromise.value;
  }

  get experimental_providerMetadata() {
    return this.providerMetadataPromise.value;
  }

  get text() {
    return this.textPromise.value;
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
    getErrorMessage = () => 'An error occurred.', // mask error messages for safety by default
    sendUsage = true,
  }: {
    getErrorMessage?: (error: unknown) => string;
    sendUsage?: boolean;
  } = {}): ReadableStream<DataStreamString> {
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
      DataStreamString
    >({
      transform: async (chunk, controller) => {
        const chunkType = chunk.type;
        switch (chunkType) {
          case 'text-delta': {
            controller.enqueue(formatDataStreamPart('text', chunk.textDelta));
            break;
          }

          case 'tool-call-streaming-start': {
            controller.enqueue(
              formatDataStreamPart('tool_call_streaming_start', {
                toolCallId: chunk.toolCallId,
                toolName: chunk.toolName,
              }),
            );
            break;
          }

          case 'tool-call-delta': {
            controller.enqueue(
              formatDataStreamPart('tool_call_delta', {
                toolCallId: chunk.toolCallId,
                argsTextDelta: chunk.argsTextDelta,
              }),
            );
            break;
          }

          case 'tool-call': {
            controller.enqueue(
              formatDataStreamPart('tool_call', {
                toolCallId: chunk.toolCallId,
                toolName: chunk.toolName,
                args: chunk.args,
              }),
            );
            break;
          }

          case 'tool-result': {
            controller.enqueue(
              formatDataStreamPart('tool_result', {
                toolCallId: chunk.toolCallId,
                result: chunk.result,
              }),
            );
            break;
          }

          case 'error': {
            controller.enqueue(
              formatDataStreamPart('error', getErrorMessage(chunk.error)),
            );
            break;
          }

          case 'step-finish': {
            controller.enqueue(
              formatDataStreamPart('finish_step', {
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
              formatDataStreamPart('finish_message', {
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
      .pipeThrough(streamPartsTransformer);
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

  // TODO breaking change 5.0: remove pipeThrough(new TextEncoderStream())
  toDataStream(options?: {
    data?: StreamData;
    getErrorMessage?: (error: unknown) => string;
    sendUsage?: boolean;
  }) {
    const stream = this.toDataStreamInternal({
      getErrorMessage: options?.getErrorMessage,
      sendUsage: options?.sendUsage,
    }).pipeThrough(new TextEncoderStream());

    return options?.data ? mergeStreams(options?.data.stream, stream) : stream;
  }

  mergeIntoDataStream(writer: DataStreamWriter) {
    writer.merge(
      this.toDataStreamInternal({
        getErrorMessage: writer.onError,
      }),
    );
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
