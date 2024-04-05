import { LanguageModelV1FinishReason } from '../../spec';
import { LanguageModelV1, LanguageModelV1CallWarning } from '../../spec/index';
import {
  AIStreamCallbacksAndOptions,
  createCallbacksTransformer,
  createStreamDataTransformer,
  readableFromAsyncIterable,
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
This is a number between 0 (almost no randomness) and 1 (very random).
It is recommended to set either `temperature` or `topP`, but not both.
@param topP - Nucleus sampling. This is a number between 0 and 1.
E.g. 0.1 would mean that only tokens with the top 10% probability mass are considered.
It is recommended to set either `temperature` or `topP`, but not both.
@param presencePenalty - Presence penalty setting. 
It affects the likelihood of the model to repeat information that is already in the prompt.
The presence penalty is a number between -1 (increase repetition) and 1 (maximum penalty, decrease repetition). 
0 means no penalty.
@param frequencyPenalty - Frequency penalty setting.
It affects the likelihood of the model to repeatedly use the same words or phrases.
The frequency penalty is a number between -1 (increase repetition) and 1 (maximum penalty, decrease repetition).
0 means no penalty.
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
  const { stream, warnings } = await retry(() =>
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
Warnings from the model provider (e.g. unsupported settings)
   */
  readonly warnings: LanguageModelV1CallWarning[] | undefined;

  constructor({
    stream,
    warnings,
  }: {
    stream: ReadableStream<TextStreamPart<TOOLS>>;
    warnings: LanguageModelV1CallWarning[] | undefined;
  }) {
    this.originalStream = stream;
    this.warnings = warnings;
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
You can use it as either an AsyncIterable or a ReadableStream. When an error occurs, the
stream will throw the error.
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
    // TODO add support for tool calls
    return readableFromAsyncIterable(this.textStream)
      .pipeThrough(createCallbacksTransformer(callbacks))
      .pipeThrough(
        createStreamDataTransformer(callbacks?.experimental_streamData),
      );
  }
}
