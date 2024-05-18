import { ServerResponse } from 'node:http';
import {
  AIStreamCallbacksAndOptions,
  StreamingTextResponse,
  formatStreamPart,
} from '../../streams';
import { CallSettings } from '../prompt/call-settings';
import { convertToLanguageModelPrompt } from '../prompt/convert-to-language-model-prompt';
import { getValidatedPrompt } from '../prompt/get-validated-prompt';
import { prepareCallSettings } from '../prompt/prepare-call-settings';
import { Prompt } from '../prompt/prompt';
import { CoreTool } from '../tool';
import { CallWarning, FinishReason, LanguageModel, LogProbs } from '../types';
import {
  AsyncIterableStream,
  createAsyncIterableStream,
} from '../util/async-iterable-stream';
import { convertZodToJSONSchema } from '../util/convert-zod-to-json-schema';
import { retryWithExponentialBackoff } from '../util/retry-with-exponential-backoff';
import { runToolsTransformation } from './run-tools-transformation';
import { TokenUsage } from './token-usage';
import { ToToolCall } from './tool-call';
import { ToToolResult } from './tool-result';
import { LanguageModelV1CallWarning } from '@ai-sdk/provider';

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
@param presencePenalty - Presence penalty setting. 
It affects the likelihood of the model to repeat information that is already in the prompt.
The value is passed through to the provider. The range depends on the provider and model.
@param frequencyPenalty - Frequency penalty setting.
It affects the likelihood of the model to repeatedly use the same words or phrases.
The value is passed through to the provider. The range depends on the provider and model.
@param seed - The seed (integer) to use for random sampling.
If set and supported by the model, calls will generate deterministic results.

@param maxRetries - Maximum number of retries. Set to 0 to disable retries. Default: 2.
@param abortSignal - An optional abort signal that can be used to cancel the call.

@return
A result object for accessing different stream types and additional information.
 */
export async function streamText<TOOLS extends Record<string, CoreTool>>({
  model,
  tools,
  system,
  prompt,
  messages,
  maxRetries,
  abortSignal,
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
  }): Promise<StreamTextResult<TOOLS>> {
  const retry = retryWithExponentialBackoff({ maxRetries });
  const validatedPrompt = getValidatedPrompt({ system, prompt, messages });
  const { stream, warnings, rawResponse } = await retry(() =>
    model.doStream({
      mode: {
        type: 'regular',
        tools:
          tools == null
            ? undefined
            : Object.entries(tools).map(([name, tool]) => ({
                type: 'function',
                name,
                description: tool.description,
                parameters: convertZodToJSONSchema(tool.parameters),
              })),
      },
      ...prepareCallSettings(settings),
      inputFormat: validatedPrompt.type,
      prompt: convertToLanguageModelPrompt(validatedPrompt),
      abortSignal,
    }),
  );

  return new StreamTextResult({
    stream: runToolsTransformation({
      tools,
      generatorStream: stream,
    }),
    warnings,
    rawResponse,
  });
}

export async function streamResponse<TOOLS extends Record<string, CoreTool>>({
  model,
  tools,
  system,
  prompt,
  messages,
  maxRetries,
  abortSignal,
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
  }): Promise<{
  stream: ReadableStream;
  warnings: LanguageModelV1CallWarning[] | undefined;
  rawResponse:
    | {
        headers?: Record<string, string>;
      }
    | undefined;
}> {
  const retry = retryWithExponentialBackoff({ maxRetries });
  const validatedPrompt = getValidatedPrompt({ system, prompt, messages });
  const { stream, warnings, rawResponse } = await retry(() => {
    if (!model.doRawStream) {
      throw new Error('The model does not support raw streaming.');
    }
    return model.doRawStream({
      mode: {
        type: 'regular',
        tools:
          tools == null
            ? undefined
            : Object.entries(tools).map(([name, tool]) => ({
                type: 'function',
                name,
                description: tool.description,
                parameters: convertZodToJSONSchema(tool.parameters),
              })),
      },
      ...prepareCallSettings(settings),
      inputFormat: validatedPrompt.type,
      prompt: convertToLanguageModelPrompt(validatedPrompt),
      abortSignal,
    });
  });

  return { stream, warnings, rawResponse };
}

export type TextStreamPart<TOOLS extends Record<string, CoreTool>> =
  | {
      type: 'text-delta';
      textDelta: string;
    }
  | ({
      type: 'tool-call';
    } & ToToolCall<TOOLS>)
  | {
      type: 'error';
      error: unknown;
    }
  | ({
      type: 'tool-result';
    } & ToToolResult<TOOLS>)
  | {
      type: 'finish';
      finishReason: FinishReason;
      logprobs?: LogProbs;
      usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
      };
    };

/**
A result object for accessing different stream types and additional information.
 */
export class StreamTextResult<TOOLS extends Record<string, CoreTool>> {
  private originalStream: ReadableStream<TextStreamPart<TOOLS>>;

  /**
Warnings from the model provider (e.g. unsupported settings).
   */
  readonly warnings: CallWarning[] | undefined;

  /**
The token usage of the generated text. Resolved when the response is finished.
   */
  readonly usage: Promise<TokenUsage>;

  /**
The reason why the generation finished. Resolved when the response is finished.
   */
  readonly finishReason: Promise<FinishReason>;

  /**
Optional raw response data.
   */
  rawResponse?: {
    /**
Response headers.
     */
    headers?: Record<string, string>;
  };

  constructor({
    stream,
    warnings,
    rawResponse,
  }: {
    stream: ReadableStream<TextStreamPart<TOOLS>>;
    warnings: CallWarning[] | undefined;
    rawResponse?: {
      headers?: Record<string, string>;
    };
  }) {
    this.warnings = warnings;
    this.rawResponse = rawResponse;

    // initialize usage promise
    let resolveUsage: (value: TokenUsage | PromiseLike<TokenUsage>) => void;
    this.usage = new Promise<TokenUsage>(resolve => {
      resolveUsage = resolve;
    });

    // initialize finish reason promise
    let resolveFinishReason: (
      value: FinishReason | PromiseLike<FinishReason>,
    ) => void;
    this.finishReason = new Promise<FinishReason>(resolve => {
      resolveFinishReason = resolve;
    });

    // pipe chunks through a transformation stream that extracts metadata:
    this.originalStream = stream.pipeThrough(
      new TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>({
        async transform(chunk, controller): Promise<void> {
          controller.enqueue(chunk);

          if (chunk.type === 'finish') {
            resolveUsage(chunk.usage);
            resolveFinishReason(chunk.finishReason);
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

  /**
A text stream that returns only the generated text deltas. You can use it
as either an AsyncIterable or a ReadableStream. When an error occurs, the
stream will throw the error.
   */
  get textStream(): AsyncIterableStream<string> {
    return createAsyncIterableStream(this.teeStream(), {
      transform(chunk, controller) {
        if (chunk.type === 'text-delta') {
          // do not stream empty text deltas:
          if (chunk.textDelta.length > 0) {
            controller.enqueue(chunk.textDelta);
          }
        } else if (chunk.type === 'error') {
          throw chunk.error;
        }
      },
    });
  }

  /**
A stream with all events, including text deltas, tool calls, tool results, and
errors.
You can use it as either an AsyncIterable or a ReadableStream. When an error occurs, the
stream will throw the error.
   */
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

  /**
Converts the result to an `AIStream` object that is compatible with `StreamingTextResponse`.
It can be used with the `useChat` and `useCompletion` hooks.

@param callbacks 
Stream callbacks that will be called when the stream emits events.

@returns an `AIStream` object.
   */
  toAIStream(callbacks: AIStreamCallbacksAndOptions = {}) {
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

    const streamDataTransformer = new TransformStream<
      TextStreamPart<TOOLS>,
      string
    >({
      transform: async (chunk, controller) => {
        switch (chunk.type) {
          case 'text-delta':
            controller.enqueue(formatStreamPart('text', chunk.textDelta));
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
                toolName: chunk.toolName,
                args: chunk.args,
                result: chunk.result,
              }),
            );
            break;
          case 'error':
            controller.enqueue(
              formatStreamPart('error', JSON.stringify(chunk.error)),
            );
            break;
        }
      },
    });

    return this.fullStream
      .pipeThrough(callbackTransformer)
      .pipeThrough(streamDataTransformer)
      .pipeThrough(new TextEncoderStream());
  }

  /**
Writes stream data output to a Node.js response-like object.
It sets a `Content-Type` header to `text/plain; charset=utf-8` and 
writes each stream data part as a separate chunk.

@param response A Node.js response-like object (ServerResponse).
@param init Optional headers and status code.
   */
  pipeAIStreamToResponse(
    response: ServerResponse,
    init?: { headers?: Record<string, string>; status?: number },
  ) {
    response.writeHead(init?.status ?? 200, {
      'Content-Type': 'text/plain; charset=utf-8',
      ...init?.headers,
    });

    const reader = this.toAIStream().getReader();

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

  /**
Writes text delta output to a Node.js response-like object.
It sets a `Content-Type` header to `text/plain; charset=utf-8` and 
writes each text delta as a separate chunk.

@param response A Node.js response-like object (ServerResponse).
@param init Optional headers and status code.
   */
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

  /**
Converts the result to a streamed response object with a stream data part stream.
It can be used with the `useChat` and `useCompletion` hooks.

@param init Optional headers.

@return A response object.
   */
  toAIStreamResponse(init?: ResponseInit): Response {
    return new StreamingTextResponse(this.toAIStream(), init);
  }

  /**
Creates a simple text stream response.
Each text delta is encoded as UTF-8 and sent as a separate chunk.
Non-text-delta events are ignored.

@param init Optional headers and status code.
   */
  toTextStreamResponse(init?: ResponseInit): Response {
    return new Response(this.textStream.pipeThrough(new TextEncoderStream()), {
      status: init?.status ?? 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        ...init?.headers,
      },
    });
  }
}

/**
 * @deprecated Use `streamText` instead.
 */
export const experimental_streamText = streamText;
