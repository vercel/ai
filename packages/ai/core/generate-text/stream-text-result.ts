import { ServerResponse } from 'node:http';
import { AIStreamCallbacksAndOptions, StreamData } from '../../streams';
import { CoreTool } from '../tool';
import {
  CallWarning,
  FinishReason,
  LanguageModelResponseMetadata,
  LanguageModelResponseMetadataWithHeaders,
  LogProbs,
  ProviderMetadata,
} from '../types';
import { LanguageModelUsage } from '../types/usage';
import { AsyncIterableStream } from '../util/async-iterable-stream';
import { ToToolCall } from './tool-call';
import { ToToolResult } from './tool-result';

/**
A result object for accessing different stream types and additional information.
 */
export interface StreamTextResult<TOOLS extends Record<string, CoreTool>> {
  /**
Warnings from the model provider (e.g. unsupported settings) for the first roundtrip.
     */
  // TODO change to async in v4 and use value from last roundtrip
  readonly warnings: CallWarning[] | undefined;

  /**
The total token usage of the generated response.
When there are multiple roundtrips, the usage is the sum of all roundtrip usages.

Resolved when the response is finished.
     */
  readonly usage: Promise<LanguageModelUsage>;

  /**
The reason why the generation finished. Taken from the last roundtrip.

Resolved when the response is finished.
     */
  readonly finishReason: Promise<FinishReason>;

  /**
Additional provider-specific metadata from the last roundtrip.
Metadata is passed through from the provider to the AI SDK and
enables provider-specific results that can be fully encapsulated in the provider.
   */
  readonly experimental_providerMetadata: Promise<ProviderMetadata | undefined>;

  /**
The full text that has been generated by the last roundtrip.

Resolved when the response is finished.
     */
  readonly text: Promise<string>;

  /**
The tool calls that have been executed in the last roundtrip.

Resolved when the response is finished.
     */
  readonly toolCalls: Promise<ToToolCall<TOOLS>[]>;

  /**
The tool results that have been generated in the last roundtrip.

Resolved when the all tool executions are finished.
     */
  readonly toolResults: Promise<ToToolResult<TOOLS>[]>;

  /**
Optional raw response data.

@deprecated Use `response` instead.
     */
  // TODO removed in v4
  readonly rawResponse?: {
    /**
  Response headers.
       */
    headers?: Record<string, string>;
  };

  /**
Additional response information.
 */
  readonly response: Promise<LanguageModelResponseMetadataWithHeaders>;

  /**
  A text stream that returns only the generated text deltas. You can use it
  as either an AsyncIterable or a ReadableStream. When an error occurs, the
  stream will throw the error.
     */
  readonly textStream: AsyncIterableStream<string>;

  /**
  A stream with all events, including text deltas, tool calls, tool results, and
  errors.
  You can use it as either an AsyncIterable or a ReadableStream.
  Only errors that stop the stream, such as network errors, are thrown.
     */
  readonly fullStream: AsyncIterableStream<TextStreamPart<TOOLS>>;

  /**
  Converts the result to an `AIStream` object that is compatible with `StreamingTextResponse`.
  It can be used with the `useChat` and `useCompletion` hooks.

  @param callbacks
  Stream callbacks that will be called when the stream emits events.

  @returns A data stream.

  @deprecated Use `toDataStreamResponse` instead.
     */
  toAIStream(
    callbacks?: AIStreamCallbacksAndOptions,
  ): ReadableStream<Uint8Array>;

  /**
  Writes stream data output to a Node.js response-like object.
  It sets a `Content-Type` header to `text/plain; charset=utf-8` and
  writes each stream data part as a separate chunk.

  @param response A Node.js response-like object (ServerResponse).
  @param init Optional headers and status code.

  @deprecated Use `pipeDataStreamToResponse` instead.
     */
  pipeAIStreamToResponse(
    response: ServerResponse,
    init?: { headers?: Record<string, string>; status?: number },
  ): void;

  /**
  Writes data stream output to a Node.js response-like object.
  It sets a `Content-Type` header to `text/plain; charset=utf-8` and
  writes each data stream part as a separate chunk.

  @param response A Node.js response-like object (ServerResponse).
  @param init Optional headers and status code.
     */
  pipeDataStreamToResponse(
    response: ServerResponse,
    init?: { headers?: Record<string, string>; status?: number },
  ): void;

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
  ): void;

  /**
  Converts the result to a streamed response object with a stream data part stream.
  It can be used with the `useChat` and `useCompletion` hooks.

  @param options An object with an init property (ResponseInit) and a data property.
  You can also pass in a ResponseInit directly (deprecated).

  @return A response object.

  @deprecated Use `toDataStreamResponse` instead.
     */
  toAIStreamResponse(
    options?: ResponseInit | { init?: ResponseInit; data?: StreamData },
  ): Response;

  /**
  Converts the result to a streamed response object with a stream data part stream.
  It can be used with the `useChat` and `useCompletion` hooks.

  @param options An object with an init property (ResponseInit) and a data property.
  You can also pass in a ResponseInit directly (deprecated).

  @return A response object.
     */
  toDataStreamResponse(
    options?:
      | ResponseInit
      | {
          init?: ResponseInit;
          data?: StreamData;
          getErrorMessage?: (error: unknown) => string;
        },
  ): Response;

  /**
  Creates a simple text stream response.
  Each text delta is encoded as UTF-8 and sent as a separate chunk.
  Non-text-delta events are ignored.

  @param init Optional headers and status code.
     */
  toTextStreamResponse(init?: ResponseInit): Response;
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
      type: 'tool-call-streaming-start';
      toolCallId: string;
      toolName: string;
    }
  | {
      type: 'tool-call-delta';
      toolCallId: string;
      toolName: string;
      argsTextDelta: string;
    }
  | ({
      type: 'tool-result';
    } & ToToolResult<TOOLS>)
  | {
      type: 'roundtrip-finish';
      finishReason: FinishReason;
      logprobs?: LogProbs;
      usage: LanguageModelUsage;
      response: LanguageModelResponseMetadata;
      experimental_providerMetadata?: ProviderMetadata;
    }
  | {
      type: 'finish';
      finishReason: FinishReason;
      logprobs?: LogProbs;
      usage: LanguageModelUsage;
      response: LanguageModelResponseMetadata;
      experimental_providerMetadata?: ProviderMetadata;
    }
  | {
      type: 'error';
      error: unknown;
    };
