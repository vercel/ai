import {
  LanguageModelV1,
  LanguageModelV1CallWarning,
  LanguageModelV1FinishReason,
  LanguageModelV1LogProbs,
} from '@ai-sdk/provider';
import { ServerResponse } from 'node:http';
import {
  AIStreamCallbacksAndOptions,
  StreamingTextResponse,
  createCallbacksTransformer,
  createStreamDataTransformer,
} from '../../streams';
import { CallSettings } from '../prompt/call-settings';
import { convertToLanguageModelPrompt } from '../prompt/convert-to-language-model-prompt';
import { getValidatedPrompt } from '../prompt/get-validated-prompt';
import { prepareCallSettings } from '../prompt/prepare-call-settings';
import { Prompt } from '../prompt/prompt';
import { ExperimentalTool } from '../tool';
import {
  AsyncIterableStream,
  createAsyncIterableStream,
} from '../util/async-iterable-stream';
import { convertZodToJSONSchema } from '../util/convert-zod-to-json-schema';
import { retryWithExponentialBackoff } from '../util/retry-with-exponential-backoff';
import { runToolsTransformation } from './run-tools-transformation';
import { ToToolCall } from './tool-call';
import { ToToolResult } from './tool-result';

/**
Generate a text and call tools for a given prompt using a language model.

This function streams the output. If you do not want to stream the output, use `experimental_generateText` instead.

@param model - The language model to use.
@param tools - The tools that the model can call. The model needs to support calling tools.

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
export async function experimental_streamText<
  TOOLS extends Record<string, ExperimentalTool>,
>({
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
    model: LanguageModelV1;

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

export type TextStreamPart<TOOLS extends Record<string, ExperimentalTool>> =
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
      finishReason: LanguageModelV1FinishReason;
      logprobs?: LanguageModelV1LogProbs;
      usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
      };
    };

/**
A result object for accessing different stream types and additional information.
 */
export class StreamTextResult<TOOLS extends Record<string, ExperimentalTool>> {
  private readonly originalStream: ReadableStream<TextStreamPart<TOOLS>>;

  /**
Warnings from the model provider (e.g. unsupported settings).
   */
  readonly warnings: LanguageModelV1CallWarning[] | undefined;

  /**
Optional raw response data. Only contains response headers. 
You can use this to e.g. extract request headers.
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
    warnings: LanguageModelV1CallWarning[] | undefined;
    rawResponse?: {
      headers?: Record<string, string>;
    };
  }) {
    this.originalStream = stream;
    this.warnings = warnings;
    this.rawResponse = rawResponse;
  }

  /**
A text stream that returns only the generated text deltas. You can use it
as either an AsyncIterable or a ReadableStream. When an error occurs, the
stream will throw the error.
   */
  get textStream(): AsyncIterableStream<string> {
    return createAsyncIterableStream(this.originalStream, {
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
You can use it as either an AsyncIterable or a ReadableStream.
   */
  get fullStream(): AsyncIterableStream<TextStreamPart<TOOLS>> {
    return createAsyncIterableStream(this.originalStream, {
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
  toAIStream(callbacks?: AIStreamCallbacksAndOptions) {
    return this.textStream
      .pipeThrough(createCallbacksTransformer(callbacks))
      .pipeThrough(createStreamDataTransformer());
  }

  /**
Writes stream data output to a Node.js ServerResponse object.
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

    const reader = this.textStream
      .pipeThrough(createCallbacksTransformer(undefined))
      .pipeThrough(createStreamDataTransformer())
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
    const encoder = new TextEncoder();
    return new Response(
      this.textStream.pipeThrough(
        new TransformStream({
          transform(chunk, controller) {
            controller.enqueue(encoder.encode(chunk));
          },
        }),
      ),
      {
        status: init?.status ?? 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          ...init?.headers,
        },
      },
    );
  }
}
