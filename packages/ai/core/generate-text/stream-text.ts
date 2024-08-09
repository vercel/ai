import { Span } from '@opentelemetry/api';
import { ServerResponse } from 'node:http';
import {
  AIStreamCallbacksAndOptions,
  StreamData,
  TextStreamPart,
  formatStreamPart,
} from '../../streams';
import { createResolvablePromise } from '../../util/create-resolvable-promise';
import { retryWithExponentialBackoff } from '../../util/retry-with-exponential-backoff';
import { CallSettings } from '../prompt/call-settings';
import { convertToLanguageModelPrompt } from '../prompt/convert-to-language-model-prompt';
import { getValidatedPrompt } from '../prompt/get-validated-prompt';
import { prepareCallSettings } from '../prompt/prepare-call-settings';
import { prepareToolsAndToolChoice } from '../prompt/prepare-tools-and-tool-choice';
import { Prompt } from '../prompt/prompt';
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
} from '../types';
import { CompletionTokenUsage } from '../types/token-usage';
import {
  AsyncIterableStream,
  createAsyncIterableStream,
} from '../util/async-iterable-stream';
import { mergeStreams } from '../util/merge-streams';
import { prepareResponseHeaders } from '../util/prepare-response-headers';
import { runToolsTransformation } from './run-tools-transformation';
import { StreamTextResult } from './stream-text-result';
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
  experimental_telemetry: telemetry,
  experimental_toolCallStreaming: toolCallStreaming = false,
  onFinish,
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
Optional telemetry configuration (experimental).
     */
    experimental_telemetry?: TelemetrySettings;

    /**
Enable streaming of tool call deltas as they are generated. Disabled by default.
     */
    experimental_toolCallStreaming?: boolean;

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
    }) => Promise<void> | void;
  }): Promise<DefaultStreamTextResult<TOOLS>> {
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
        ...assembleOperationName({ operationName: 'ai.streamText', telemetry }),
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
      const validatedPrompt = getValidatedPrompt({ system, prompt, messages });
      const promptMessages = await convertToLanguageModelPrompt({
        prompt: validatedPrompt,
        modelSupportsImageUrls: model.supportsImageUrls,
      });

      const {
        result: { stream, warnings, rawResponse },
        doStreamSpan,
      } = await retry(() =>
        recordSpan({
          name: 'ai.streamText.doStream',
          attributes: selectTelemetryAttributes({
            telemetry,
            attributes: {
              ...assembleOperationName({
                operationName: 'ai.streamText.doStream',
                telemetry,
              }),
              ...baseTelemetryAttributes,
              'ai.prompt.format': {
                input: () => validatedPrompt.type,
              },
              'ai.prompt.messages': {
                input: () => JSON.stringify(promptMessages),
              },

              // standardized gen-ai llm span attributes:
              'gen_ai.request.model': model.modelId,
              'gen_ai.system': model.provider,
              'gen_ai.request.max_tokens': settings.maxTokens,
              'gen_ai.request.temperature': settings.temperature,
              'gen_ai.request.top_p': settings.topP,
            },
          }),
          tracer,
          endWhenDone: false,
          fn: async doStreamSpan => {
            return {
              result: await model.doStream({
                mode: {
                  type: 'regular',
                  ...prepareToolsAndToolChoice({ tools, toolChoice }),
                },
                ...prepareCallSettings(settings),
                inputFormat: validatedPrompt.type,
                prompt: promptMessages,
                abortSignal,
                headers,
              }),
              doStreamSpan,
            };
          },
        }),
      );

      return new DefaultStreamTextResult({
        stream: runToolsTransformation({
          tools,
          generatorStream: stream,
          toolCallStreaming,
          tracer,
          telemetry,
        }),
        warnings,
        rawResponse,
        onFinish,
        rootSpan,
        doStreamSpan,
        telemetry,
      });
    },
  });
}

class DefaultStreamTextResult<TOOLS extends Record<string, CoreTool>>
  implements StreamTextResult<TOOLS>
{
  private originalStream: ReadableStream<TextStreamPart<TOOLS>>;
  private onFinish?: Parameters<typeof streamText>[0]['onFinish'];

  readonly warnings: StreamTextResult<TOOLS>['warnings'];
  readonly usage: StreamTextResult<TOOLS>['usage'];
  readonly finishReason: StreamTextResult<TOOLS>['finishReason'];
  readonly text: StreamTextResult<TOOLS>['text'];
  readonly toolCalls: StreamTextResult<TOOLS>['toolCalls'];
  readonly toolResults: StreamTextResult<TOOLS>['toolResults'];
  readonly rawResponse: StreamTextResult<TOOLS>['rawResponse'];

  constructor({
    stream,
    warnings,
    rawResponse,
    onFinish,
    rootSpan,
    doStreamSpan,
    telemetry,
  }: {
    stream: ReadableStream<TextStreamPart<TOOLS>>;
    warnings: StreamTextResult<TOOLS>['warnings'];
    rawResponse: StreamTextResult<TOOLS>['rawResponse'];
    onFinish?: Parameters<typeof streamText>[0]['onFinish'];
    rootSpan: Span;
    doStreamSpan: Span;
    telemetry: TelemetrySettings | undefined;
  }) {
    this.warnings = warnings;
    this.rawResponse = rawResponse;
    this.onFinish = onFinish;

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

    // store information for onFinish callback:
    let finishReason: FinishReason | undefined;
    let usage: CompletionTokenUsage | undefined;
    let text = '';
    const toolCalls: ToToolCall<TOOLS>[] = [];
    const toolResults: ToToolResult<TOOLS>[] = [];
    let firstChunk = true;

    // pipe chunks through a transformation stream that extracts metadata:
    const self = this;
    this.originalStream = stream.pipeThrough(
      new TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>({
        async transform(chunk, controller): Promise<void> {
          controller.enqueue(chunk);

          // Telemetry event for first chunk:
          if (firstChunk) {
            firstChunk = false;
            doStreamSpan.addEvent('ai.stream.firstChunk');
          }

          const chunkType = chunk.type;
          switch (chunkType) {
            case 'text-delta':
              // create the full text from text deltas (for onFinish callback and text promise):
              text += chunk.textDelta;
              break;

            case 'tool-call':
              // store tool calls for onFinish callback and toolCalls promise:
              toolCalls.push(chunk);
              break;

            case 'tool-result':
              // store tool results for onFinish callback and toolResults promise:
              toolResults.push(chunk);
              break;

            case 'finish':
              // Note: tool executions might not be finished yet when the finish event is emitted.
              // store usage and finish reason for promises and onFinish callback:
              usage = chunk.usage;
              finishReason = chunk.finishReason;

              // resolve promises that can be resolved now:
              resolveUsage(usage);
              resolveFinishReason(finishReason);
              resolveText(text);
              resolveToolCalls(toolCalls);
              break;

            case 'tool-call-streaming-start':
            case 'tool-call-delta':
            case 'error':
              // ignored
              break;

            default: {
              const exhaustiveCheck: never = chunkType;
              throw new Error(`Unknown chunk type: ${exhaustiveCheck}`);
            }
          }
        },

        // invoke onFinish callback and resolve toolResults promise when the stream is about to close:
        async flush(controller) {
          try {
            const finalUsage = usage ?? {
              promptTokens: NaN,
              completionTokens: NaN,
              totalTokens: NaN,
            };
            const finalFinishReason = finishReason ?? 'unknown';
            const telemetryToolCalls =
              toolCalls.length > 0 ? JSON.stringify(toolCalls) : undefined;

            doStreamSpan.setAttributes(
              selectTelemetryAttributes({
                telemetry,
                attributes: {
                  'ai.finishReason': finalFinishReason,
                  'ai.usage.promptTokens': finalUsage.promptTokens,
                  'ai.usage.completionTokens': finalUsage.completionTokens,
                  'ai.result.text': { output: () => text },
                  'ai.result.toolCalls': { output: () => telemetryToolCalls },

                  // standardized gen-ai llm span attributes:
                  'gen_ai.response.finish_reasons': [finalFinishReason],
                  'gen_ai.usage.prompt_tokens': finalUsage.promptTokens,
                  'gen_ai.usage.completion_tokens': finalUsage.completionTokens,
                },
              }),
            );

            // finish doStreamSpan before other operations for correct timing:
            doStreamSpan.end();

            // Add response information to the root span:
            rootSpan.setAttributes(
              selectTelemetryAttributes({
                telemetry,
                attributes: {
                  'ai.finishReason': finalFinishReason,
                  'ai.usage.promptTokens': finalUsage.promptTokens,
                  'ai.usage.completionTokens': finalUsage.completionTokens,
                  'ai.result.text': { output: () => text },
                  'ai.result.toolCalls': { output: () => telemetryToolCalls },
                },
              }),
            );

            // resolve toolResults promise:
            resolveToolResults(toolResults);

            // call onFinish callback:
            await self.onFinish?.({
              finishReason: finalFinishReason,
              usage: finalUsage,
              text,
              toolCalls,
              // The tool results are inferred as a never[] type, because they are
              // optional and the execute method with an inferred result type is
              // optional as well. Therefore we need to cast the toolResults to any.
              // The type exposed to the users will be correctly inferred.
              toolResults: toolResults as any,
              rawResponse,
              warnings,
            });
          } catch (error) {
            controller.error(error);
          } finally {
            rootSpan.end();
          }
        },
      }),
    );
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
          // do not stream empty text deltas:
          if (chunk.textDelta.length > 0) {
            controller.enqueue(chunk.textDelta);
          }
        } else if (chunk.type === 'error') {
          controller.error(chunk.error);
        }
      },
    });
  }

  get fullStream(): AsyncIterableStream<TextStreamPart<TOOLS>> {
    return createAsyncIterableStream(this.teeStream(), {
      transform(chunk, controller) {
        if (chunk.type === 'text-delta') {
          // do not stream empty text deltas:
          if (chunk.textDelta.length > 0) {
            controller.enqueue(chunk);
          }
        } else {
          controller.enqueue(chunk);
        }
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
