import { LanguageModelV1Prompt } from '@ai-sdk/provider';
import { Span } from '@opentelemetry/api';
import { ServerResponse } from 'node:http';
import {
  AIStreamCallbacksAndOptions,
  formatStreamPart,
  StreamData,
  TextStreamPart,
} from '../../streams';
import { createResolvablePromise } from '../../util/create-resolvable-promise';
import { retryWithExponentialBackoff } from '../../util/retry-with-exponential-backoff';
import { CallSettings } from '../prompt/call-settings';
import {
  convertToLanguageModelMessage,
  convertToLanguageModelPrompt,
} from '../prompt/convert-to-language-model-prompt';
import { prepareCallSettings } from '../prompt/prepare-call-settings';
import { prepareToolsAndToolChoice } from '../prompt/prepare-tools-and-tool-choice';
import { Prompt } from '../prompt/prompt';
import { validatePrompt } from '../prompt/validate-prompt';
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
  LogProbs,
  ProviderMetadata,
} from '../types';
import { CompletionTokenUsage } from '../types/token-usage';
import {
  AsyncIterableStream,
  createAsyncIterableStream,
} from '../util/async-iterable-stream';
import { createStitchableStream } from '../util/create-stitchable-stream';
import { mergeStreams } from '../util/merge-streams';
import { now as originalNow } from '../util/now';
import { prepareResponseHeaders } from '../util/prepare-response-headers';
import {
  runToolsTransformation,
  SingleRequestTextStreamPart,
} from './run-tools-transformation';
import { StreamTextResult } from './stream-text-result';
import { toResponseMessages } from './to-response-messages';
import { ToToolCall } from './tool-call';
import { ToToolResult } from './tool-result';

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

@param maxToolRoundtrips - Maximal number of automatic roundtrips for tool calls.

@param onChunk - Callback that is called for each chunk of the stream. The stream processing will pause until the callback promise is resolved.
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
  maxToolRoundtrips = 0,
  experimental_telemetry: telemetry,
  experimental_toolCallStreaming: toolCallStreaming = false,
  onChunk,
  onFinish,
  _internal: { now = originalNow } = {},
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
Maximal number of automatic roundtrips for tool calls.

An automatic tool call roundtrip is another LLM call with the
tool call results when all tool calls of the last assistant
message have results.

A maximum number is required to prevent infinite loops in the
case of misconfigured tools.

By default, it's set to 0, which will disable the feature.
     */
    maxToolRoundtrips?: number;

    /**
Optional telemetry configuration (experimental).
     */
    experimental_telemetry?: TelemetrySettings;

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
     */
    onFinish?: (event: {
      /**
The reason why the generation finished.
       */
      finishReason: FinishReason;

      /**
The token usage of the generated response.
 */
      usage: CompletionTokenUsage;

      /**
The full text that has been generated.
       */
      text: string;

      /**
The tool calls that have been executed.
       */
      toolCalls?: ToToolCall<TOOLS>[];

      /**
The tool results that have been generated.
       */
      toolResults?: ToToolResult<TOOLS>[];

      /**
Optional raw response data.
       */
      rawResponse?: {
        /**
Response headers.
         */
        headers?: Record<string, string>;
      };

      /**
Warnings from the model provider (e.g. unsupported settings).
       */
      warnings?: CallWarning[];

      /**
Additional provider-specific metadata. They are passed through
from the provider to the AI SDK and enable provider-specific
results that can be fully encapsulated in the provider.
   */
      readonly experimental_providerMetadata: ProviderMetadata | undefined;
    }) => Promise<void> | void;

    /**
     * Internal. For test use only. May change without notice.
     */
    _internal?: {
      now?: () => number;
    };
  }): Promise<StreamTextResult<TOOLS>> {
  const baseTelemetryAttributes = getBaseTelemetryAttributes({
    model,
    telemetry,
    headers,
    settings: { ...settings, maxRetries },
  });

  const tracer = getTracer({ isEnabled: telemetry?.isEnabled ?? false });

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
      },
    }),
    tracer,
    endWhenDone: false,
    fn: async rootSpan => {
      const retry = retryWithExponentialBackoff({ maxRetries });

      const startRoundtrip: StartRoundtripFunction<TOOLS> = async ({
        promptMessages,
        promptType,
      }: {
        promptMessages: LanguageModelV1Prompt;
        promptType: 'prompt' | 'messages';
      }) => {
        const {
          result: { stream, warnings, rawResponse },
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
                  input: () => promptType,
                },
                'ai.prompt.messages': {
                  input: () => JSON.stringify(promptMessages),
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
                mode: {
                  type: 'regular',
                  ...prepareToolsAndToolChoice({ tools, toolChoice }),
                },
                ...prepareCallSettings(settings),
                inputFormat: promptType,
                prompt: promptMessages,
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
            }),
            warnings,
            rawResponse,
          },
          doStreamSpan,
          startTimestampMs,
        };
      };

      const promptMessages = await convertToLanguageModelPrompt({
        prompt: validatePrompt({ system, prompt, messages }),
        modelSupportsImageUrls: model.supportsImageUrls,
      });

      const {
        result: { stream, warnings, rawResponse },
        doStreamSpan,
        startTimestampMs,
      } = await startRoundtrip({
        promptType: validatePrompt({ system, prompt, messages }).type,
        promptMessages,
      });

      return new DefaultStreamTextResult({
        stream,
        warnings,
        rawResponse,
        onChunk,
        onFinish,
        rootSpan,
        doStreamSpan,
        telemetry,
        startTimestampMs,
        maxToolRoundtrips,
        startRoundtrip,
        promptMessages,
        now,
      });
    },
  });
}

type StartRoundtripFunction<TOOLS extends Record<string, CoreTool>> =
  (options: {
    promptMessages: LanguageModelV1Prompt;
    promptType: 'prompt' | 'messages';
  }) => Promise<{
    result: {
      stream: ReadableStream<SingleRequestTextStreamPart<TOOLS>>;
      warnings?: CallWarning[] | undefined;
      rawResponse?: {
        headers?: Record<string, string>;
      };
    };
    doStreamSpan: Span;
    startTimestampMs: number;
  }>;

class DefaultStreamTextResult<TOOLS extends Record<string, CoreTool>>
  implements StreamTextResult<TOOLS>
{
  private originalStream: ReadableStream<TextStreamPart<TOOLS>>;

  // TODO needs to be changed to readonly async in v4 (and only return value from last roundtrip)
  // (can't change before v4 because of backwards compatibility)
  warnings: StreamTextResult<TOOLS>['warnings'];
  rawResponse: StreamTextResult<TOOLS>['rawResponse'];

  readonly usage: StreamTextResult<TOOLS>['usage'];
  readonly finishReason: StreamTextResult<TOOLS>['finishReason'];
  readonly experimental_providerMetadata: StreamTextResult<TOOLS>['experimental_providerMetadata'];
  readonly text: StreamTextResult<TOOLS>['text'];
  readonly toolCalls: StreamTextResult<TOOLS>['toolCalls'];
  readonly toolResults: StreamTextResult<TOOLS>['toolResults'];

  constructor({
    stream,
    warnings,
    rawResponse,
    onChunk,
    onFinish,
    rootSpan,
    doStreamSpan,
    telemetry,
    startTimestampMs,
    maxToolRoundtrips,
    startRoundtrip,
    promptMessages,
    now,
  }: {
    stream: ReadableStream<SingleRequestTextStreamPart<TOOLS>>;
    warnings: StreamTextResult<TOOLS>['warnings'];
    rawResponse: StreamTextResult<TOOLS>['rawResponse'];
    onChunk: Parameters<typeof streamText>[0]['onChunk'];
    onFinish: Parameters<typeof streamText>[0]['onFinish'];
    rootSpan: Span;
    doStreamSpan: Span;
    telemetry: TelemetrySettings | undefined;
    startTimestampMs: number;
    maxToolRoundtrips: number;
    startRoundtrip: StartRoundtripFunction<TOOLS>;
    promptMessages: LanguageModelV1Prompt;
    now: () => number;
  }) {
    this.warnings = warnings;
    this.rawResponse = rawResponse;

    // initialize usage promise
    const { resolve: resolveUsage, promise: usagePromise } =
      createResolvablePromise<CompletionTokenUsage>();
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
      createResolvablePromise<ToToolCall<TOOLS>[]>();
    this.toolCalls = toolCallsPromise;

    // initialize toolResults promise
    const { resolve: resolveToolResults, promise: toolResultsPromise } =
      createResolvablePromise<ToToolResult<TOOLS>[]>();
    this.toolResults = toolResultsPromise;

    // initialize experimental_providerMetadata promise
    const {
      resolve: resolveProviderMetadata,
      promise: providerMetadataPromise,
    } = createResolvablePromise<ProviderMetadata | undefined>();
    this.experimental_providerMetadata = providerMetadataPromise;

    // create a stitchable stream to send roundtrips in a single response stream
    const {
      stream: stitchableStream,
      addStream,
      close: closeStitchableStream,
    } = createStitchableStream<TextStreamPart<TOOLS>>();

    this.originalStream = stitchableStream;

    const self = this;

    // add the roundtrip stream
    function addRoundtripStream({
      stream,
      startTimestamp,
      doStreamSpan,
      currentToolRoundtrip,
      promptMessages,
      usage = {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
    }: {
      stream: ReadableStream<TextStreamPart<TOOLS>>;
      startTimestamp: number;
      doStreamSpan: Span;
      currentToolRoundtrip: number;
      promptMessages: LanguageModelV1Prompt;
      usage: CompletionTokenUsage | undefined;
    }) {
      const roundtripToolCalls: ToToolCall<TOOLS>[] = [];
      const roundtripToolResults: ToToolResult<TOOLS>[] = [];
      let roundtripFinishReason: FinishReason = 'unknown';
      let roundtripUsage: CompletionTokenUsage = {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      };
      let roundtripProviderMetadata: ProviderMetadata | undefined;
      let roundtripFirstChunk = true;
      let roundtripText = '';
      let roundtripLogProbs: LogProbs | undefined;

      addStream(
        stream.pipeThrough(
          new TransformStream<
            SingleRequestTextStreamPart<TOOLS>,
            TextStreamPart<TOOLS>
          >({
            async transform(chunk, controller): Promise<void> {
              // Telemetry for first chunk:
              if (roundtripFirstChunk) {
                const msToFirstChunk = now() - startTimestamp;

                roundtripFirstChunk = false;

                doStreamSpan.addEvent('ai.stream.firstChunk', {
                  'ai.response.msToFirstChunk': msToFirstChunk,

                  // deprecated:
                  'ai.stream.msToFirstChunk': msToFirstChunk,
                });

                doStreamSpan.setAttributes({
                  'ai.response.msToFirstChunk': msToFirstChunk,

                  // deprecated:
                  'ai.stream.msToFirstChunk': msToFirstChunk,
                });
              }

              // Filter out empty text deltas
              if (chunk.type === 'text-delta' && chunk.textDelta.length === 0) {
                return;
              }

              const chunkType = chunk.type;
              switch (chunkType) {
                case 'text-delta':
                  controller.enqueue(chunk);
                  // create the full text from text deltas (for onFinish callback and text promise):
                  roundtripText += chunk.textDelta;
                  await onChunk?.({ chunk });
                  break;

                case 'tool-call':
                  controller.enqueue(chunk);
                  // store tool calls for onFinish callback and toolCalls promise:
                  roundtripToolCalls.push(chunk);
                  await onChunk?.({ chunk });
                  break;

                case 'tool-result':
                  controller.enqueue(chunk);
                  // store tool results for onFinish callback and toolResults promise:
                  roundtripToolResults.push(chunk);
                  // as any needed, bc type inferences mixed up tool-result with tool-call
                  await onChunk?.({ chunk: chunk as any });
                  break;

                case 'finish':
                  // Note: tool executions might not be finished yet when the finish event is emitted.
                  // store usage and finish reason for promises and onFinish callback:
                  roundtripUsage = chunk.usage;
                  roundtripFinishReason = chunk.finishReason;
                  roundtripProviderMetadata =
                    chunk.experimental_providerMetadata;
                  roundtripLogProbs = chunk.logprobs;

                  // Telemetry for finish event timing
                  // (since tool executions can take longer and distort calculations)
                  const msToFinish = now() - startTimestamp;
                  doStreamSpan.addEvent('ai.stream.finish');
                  doStreamSpan.setAttributes({
                    'ai.response.msToFinish': msToFinish,
                    'ai.response.avgCompletionTokensPerSecond':
                      (1000 * roundtripUsage.completionTokens) / msToFinish,
                  });

                  break;

                case 'tool-call-streaming-start':
                case 'tool-call-delta': {
                  controller.enqueue(chunk);
                  await onChunk?.({ chunk });
                  break;
                }

                case 'error':
                  controller.enqueue(chunk);
                  roundtripFinishReason = 'error';
                  break;

                default: {
                  const exhaustiveCheck: never = chunkType;
                  throw new Error(`Unknown chunk type: ${exhaustiveCheck}`);
                }
              }
            },

            // invoke onFinish callback and resolve toolResults promise when the stream is about to close:
            async flush(controller) {
              controller.enqueue({
                type: 'roundtrip-finish',
                finishReason: roundtripFinishReason,
                usage: roundtripUsage,
                experimental_providerMetadata: roundtripProviderMetadata,
                logprobs: roundtripLogProbs,
              });

              const telemetryToolCalls =
                roundtripToolCalls.length > 0
                  ? JSON.stringify(roundtripToolCalls)
                  : undefined;

              try {
                doStreamSpan.setAttributes(
                  selectTelemetryAttributes({
                    telemetry,
                    attributes: {
                      'ai.response.finishReason': roundtripFinishReason,
                      'ai.response.text': { output: () => roundtripText },
                      'ai.response.toolCalls': {
                        output: () => telemetryToolCalls,
                      },

                      'ai.usage.promptTokens': roundtripUsage.promptTokens,
                      'ai.usage.completionTokens':
                        roundtripUsage.completionTokens,

                      // deprecated
                      'ai.finishReason': roundtripFinishReason,
                      'ai.result.text': { output: () => roundtripText },
                      'ai.result.toolCalls': {
                        output: () => telemetryToolCalls,
                      },

                      // standardized gen-ai llm span attributes:
                      'gen_ai.response.finish_reasons': [roundtripFinishReason],
                      'gen_ai.usage.input_tokens': roundtripUsage.promptTokens,
                      'gen_ai.usage.output_tokens':
                        roundtripUsage.completionTokens,
                    },
                  }),
                );
              } catch (error) {
                // ignore error setting telemetry attributes
              } finally {
                // finish doStreamSpan before other operations for correct timing:
                doStreamSpan.end();
              }

              const combinedUsage = {
                promptTokens: usage.promptTokens + roundtripUsage.promptTokens,
                completionTokens:
                  usage.completionTokens + roundtripUsage.completionTokens,
                totalTokens: usage.totalTokens + roundtripUsage.totalTokens,
              };

              // check if another tool roundtrip is needed:
              if (
                // there are tool calls:
                roundtripToolCalls.length > 0 &&
                // all current tool calls have results:
                roundtripToolResults.length === roundtripToolCalls.length &&
                // the number of roundtrips is less than the maximum:
                currentToolRoundtrip < maxToolRoundtrips
              ) {
                // append to messages for potential next roundtrip:
                promptMessages.push(
                  ...toResponseMessages({
                    text: roundtripText,
                    toolCalls: roundtripToolCalls,
                    toolResults: roundtripToolResults,
                  }).map(message =>
                    convertToLanguageModelMessage(message, null),
                  ),
                );

                // create call and doStream span:
                const {
                  result,
                  doStreamSpan,
                  startTimestampMs: startTimestamp,
                } = await startRoundtrip({
                  promptType: 'messages',
                  promptMessages,
                });

                // update warnings and rawResponse:
                self.warnings = result.warnings;
                self.rawResponse = result.rawResponse;

                // needs to add to stitchable stream
                addRoundtripStream({
                  stream: result.stream,
                  startTimestamp,
                  doStreamSpan,
                  currentToolRoundtrip: currentToolRoundtrip + 1,
                  promptMessages,
                  usage: combinedUsage,
                });

                return;
              }

              try {
                // enqueue the finish chunk:
                controller.enqueue({
                  type: 'finish',
                  finishReason: roundtripFinishReason,
                  usage: combinedUsage,
                  experimental_providerMetadata: roundtripProviderMetadata,
                  logprobs: roundtripLogProbs,
                });

                // close the stitchable stream
                closeStitchableStream();

                // Add response information to the root span:
                rootSpan.setAttributes(
                  selectTelemetryAttributes({
                    telemetry,
                    attributes: {
                      'ai.response.finishReason': roundtripFinishReason,
                      'ai.response.text': { output: () => roundtripText },
                      'ai.response.toolCalls': {
                        output: () => telemetryToolCalls,
                      },

                      'ai.usage.promptTokens': combinedUsage.promptTokens,
                      'ai.usage.completionTokens':
                        combinedUsage.completionTokens,

                      // deprecated
                      'ai.finishReason': roundtripFinishReason,
                      'ai.result.text': { output: () => roundtripText },
                      'ai.result.toolCalls': {
                        output: () => telemetryToolCalls,
                      },
                    },
                  }),
                );

                // resolve promises:
                resolveUsage(combinedUsage);
                resolveFinishReason(roundtripFinishReason!);
                resolveText(roundtripText);
                resolveToolCalls(roundtripToolCalls);
                resolveProviderMetadata(roundtripProviderMetadata);
                resolveToolResults(roundtripToolResults);

                // call onFinish callback:
                await onFinish?.({
                  finishReason: roundtripFinishReason,
                  usage: combinedUsage,
                  text: roundtripText,
                  toolCalls: roundtripToolCalls,
                  // The tool results are inferred as a never[] type, because they are
                  // optional and the execute method with an inferred result type is
                  // optional as well. Therefore we need to cast the toolResults to any.
                  // The type exposed to the users will be correctly inferred.
                  toolResults: roundtripToolResults as any,
                  rawResponse,
                  warnings,
                  experimental_providerMetadata: roundtripProviderMetadata,
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
    addRoundtripStream({
      stream,
      startTimestamp: startTimestampMs,
      doStreamSpan,
      currentToolRoundtrip: 0,
      promptMessages,
      usage: undefined,
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

  toAIStream(callbacks: AIStreamCallbacksAndOptions = {}) {
    return this.toDataStream({ callbacks });
  }

  private toDataStream({
    callbacks = {},
    getErrorMessage = () => '', // mask error messages for safety by default
  }: {
    callbacks?: AIStreamCallbacksAndOptions;
    getErrorMessage?: (error: unknown) => string;
  } = {}) {
    let aggregatedResponse = '';

    const callbackTransformer = new TransformStream<
      TextStreamPart<TOOLS>,
      TextStreamPart<TOOLS>
    >({
      async start(): Promise<void> {
        if (callbacks.onStart) await callbacks.onStart();
      },

      async transform(chunk, controller): Promise<void> {
        controller.enqueue(chunk);

        if (chunk.type === 'text-delta') {
          const textDelta = chunk.textDelta;

          aggregatedResponse += textDelta;

          if (callbacks.onToken) await callbacks.onToken(textDelta);
          if (callbacks.onText) await callbacks.onText(textDelta);
        }
      },

      async flush(): Promise<void> {
        if (callbacks.onCompletion)
          await callbacks.onCompletion(aggregatedResponse);
        if (callbacks.onFinal) await callbacks.onFinal(aggregatedResponse);
      },
    });

    const streamPartsTransformer = new TransformStream<
      TextStreamPart<TOOLS>,
      string
    >({
      transform: async (chunk, controller) => {
        const chunkType = chunk.type;
        switch (chunkType) {
          case 'text-delta':
            controller.enqueue(formatStreamPart('text', chunk.textDelta));
            break;
          case 'tool-call-streaming-start':
            controller.enqueue(
              formatStreamPart('tool_call_streaming_start', {
                toolCallId: chunk.toolCallId,
                toolName: chunk.toolName,
              }),
            );
            break;
          case 'tool-call-delta':
            controller.enqueue(
              formatStreamPart('tool_call_delta', {
                toolCallId: chunk.toolCallId,
                argsTextDelta: chunk.argsTextDelta,
              }),
            );
            break;
          case 'tool-call':
            controller.enqueue(
              formatStreamPart('tool_call', {
                toolCallId: chunk.toolCallId,
                toolName: chunk.toolName,
                args: chunk.args,
              }),
            );
            break;
          case 'tool-result':
            controller.enqueue(
              formatStreamPart('tool_result', {
                toolCallId: chunk.toolCallId,
                result: chunk.result,
              }),
            );
            break;
          case 'error':
            controller.enqueue(
              formatStreamPart('error', getErrorMessage(chunk.error)),
            );
            break;
          case 'roundtrip-finish':
            controller.enqueue(
              formatStreamPart('finish_roundtrip', {
                finishReason: chunk.finishReason,
                usage: {
                  promptTokens: chunk.usage.promptTokens,
                  completionTokens: chunk.usage.completionTokens,
                },
              }),
            );
            break;
          case 'finish':
            controller.enqueue(
              formatStreamPart('finish_message', {
                finishReason: chunk.finishReason,
                usage: {
                  promptTokens: chunk.usage.promptTokens,
                  completionTokens: chunk.usage.completionTokens,
                },
              }),
            );
            break;
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

  pipeAIStreamToResponse(
    response: ServerResponse,
    init?: { headers?: Record<string, string>; status?: number },
  ): void {
    return this.pipeDataStreamToResponse(response, init);
  }

  pipeDataStreamToResponse(
    response: ServerResponse,
    init?: { headers?: Record<string, string>; status?: number },
  ) {
    response.writeHead(init?.status ?? 200, {
      'Content-Type': 'text/plain; charset=utf-8',
      ...init?.headers,
    });

    const reader = this.toDataStream().getReader();

    const read = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          response.write(value);
        }
      } catch (error) {
        throw error;
      } finally {
        response.end();
      }
    };

    read();
  }

  pipeTextStreamToResponse(
    response: ServerResponse,
    init?: { headers?: Record<string, string>; status?: number },
  ) {
    response.writeHead(init?.status ?? 200, {
      'Content-Type': 'text/plain; charset=utf-8',
      ...init?.headers,
    });

    const reader = this.textStream
      .pipeThrough(new TextEncoderStream())
      .getReader();

    const read = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          response.write(value);
        }
      } catch (error) {
        throw error;
      } finally {
        response.end();
      }
    };

    read();
  }

  toAIStreamResponse(
    options?: ResponseInit | { init?: ResponseInit; data?: StreamData },
  ): Response {
    return this.toDataStreamResponse(options);
  }

  toDataStreamResponse(
    options?:
      | ResponseInit
      | {
          init?: ResponseInit;
          data?: StreamData;
          getErrorMessage?: (error: unknown) => string;
        },
  ): Response {
    const init: ResponseInit | undefined =
      options == null
        ? undefined
        : 'init' in options
        ? options.init
        : {
            headers: 'headers' in options ? options.headers : undefined,
            status: 'status' in options ? options.status : undefined,
            statusText:
              'statusText' in options ? options.statusText : undefined,
          };

    const data: StreamData | undefined =
      options == null
        ? undefined
        : 'data' in options
        ? options.data
        : undefined;

    const getErrorMessage: ((error: unknown) => string) | undefined =
      options == null
        ? undefined
        : 'getErrorMessage' in options
        ? options.getErrorMessage
        : undefined;

    const stream = data
      ? mergeStreams(data.stream, this.toDataStream({ getErrorMessage }))
      : this.toDataStream({ getErrorMessage });

    return new Response(stream, {
      status: init?.status ?? 200,
      statusText: init?.statusText,
      headers: prepareResponseHeaders(init, {
        contentType: 'text/plain; charset=utf-8',
        dataStreamVersion: 'v1',
      }),
    });
  }

  toTextStreamResponse(init?: ResponseInit): Response {
    return new Response(this.textStream.pipeThrough(new TextEncoderStream()), {
      status: init?.status ?? 200,
      headers: prepareResponseHeaders(init, {
        contentType: 'text/plain; charset=utf-8',
      }),
    });
  }
}

/**
 * @deprecated Use `streamText` instead.
 */
export const experimental_streamText = streamText;
