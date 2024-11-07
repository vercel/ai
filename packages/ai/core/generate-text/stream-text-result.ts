import { ServerResponse } from 'node:http';
import { StreamData } from '../../streams/stream-data';
import { CoreAssistantMessage, CoreToolMessage } from '../prompt/message';
import { CoreTool } from '../tool';
import {
  CallWarning,
  FinishReason,
  LanguageModelRequestMetadata,
  LogProbs,
  ProviderMetadata,
} from '../types';
import { LanguageModelResponseMetadata } from '../types/language-model-response-metadata';
import { LanguageModelUsage } from '../types/usage';
import { AsyncIterableStream } from '../util/async-iterable-stream';
import { StepResult } from './step-result';
import { ToolCallUnion } from './tool-call';
import { ToolResultUnion } from './tool-result';

/**
A result object for accessing different stream types and additional information.
 */
export interface StreamTextResult<TOOLS extends Record<string, CoreTool>> {
  /**
Warnings from the model provider (e.g. unsupported settings) for the first step.
     */
  // TODO change to async in v4 and use value from last step
  readonly warnings: CallWarning[] | undefined;

  /**
The total token usage of the generated response.
When there are multiple steps, the usage is the sum of all step usages.

Resolved when the response is finished.
     */
  readonly usage: Promise<LanguageModelUsage>;

  /**
The reason why the generation finished. Taken from the last step.

Resolved when the response is finished.
     */
  readonly finishReason: Promise<FinishReason>;

  /**
Additional provider-specific metadata from the last step.
Metadata is passed through from the provider to the AI SDK and
enables provider-specific results that can be fully encapsulated in the provider.
   */
  readonly experimental_providerMetadata: Promise<ProviderMetadata | undefined>;

  /**
The full text that has been generated by the last step.

Resolved when the response is finished.
     */
  readonly text: Promise<string>;

  /**
The tool calls that have been executed in the last step.

Resolved when the response is finished.
     */
  readonly toolCalls: Promise<ToolCallUnion<TOOLS>[]>;

  /**
The tool results that have been generated in the last step.

Resolved when the all tool executions are finished.
     */
  readonly toolResults: Promise<ToolResultUnion<TOOLS>[]>;

  /**
@deprecated use `response.messages` instead.
     */
  readonly responseMessages: Promise<
    Array<CoreAssistantMessage | CoreToolMessage>
  >;

  /**
Details for all steps.
You can use this to get information about intermediate steps,
such as the tool calls or the response headers.
   */
  readonly steps: Promise<Array<StepResult<TOOLS>>>;

  /**
Additional request information from the last step.
 */
  readonly request: Promise<LanguageModelRequestMetadata>;

  /**
Additional response information from the last step.
 */
  readonly response: Promise<
    LanguageModelResponseMetadata & {
      /**
The response messages that were generated during the call. It consists of an assistant message,
potentially containing tool calls.

When there are tool results, there is an additional tool message with the tool results that are available.
If there are tools that do not have execute functions, they are not included in the tool results and
need to be added separately.
       */
      messages: Array<CoreAssistantMessage | CoreToolMessage>;
    }
  >;

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
  Converts the result to a data stream.

  @param data an optional StreamData object that will be merged into the stream.
  @param getErrorMessage an optional function that converts an error to an error message.
  @param sendUsage whether to send the usage information to the client. Defaults to true.

  @return A data stream.
     */
  toDataStream(options?: {
    data?: StreamData;
    getErrorMessage?: (error: unknown) => string;
    sendUsage?: boolean; // default to true (change to false in v4: secure by default)
  }): ReadableStream<Uint8Array>;

  /**
  Writes data stream output to a Node.js response-like object.

  @param response A Node.js response-like object (ServerResponse).
  @param options An object with an init property (ResponseInit) and a data property.
  You can also pass in a ResponseInit directly (deprecated).
     */
  pipeDataStreamToResponse(
    response: ServerResponse,
    options?:
      | ResponseInit
      | {
          init?: ResponseInit;
          data?: StreamData;
          getErrorMessage?: (error: unknown) => string;
          sendUsage?: boolean; // default to true (change to false in v4: secure by default)
        },
  ): void;

  /**
  Writes text delta output to a Node.js response-like object.
  It sets a `Content-Type` header to `text/plain; charset=utf-8` and
  writes each text delta as a separate chunk.

  @param response A Node.js response-like object (ServerResponse).
  @param init Optional headers, status code, and status text.
     */
  pipeTextStreamToResponse(response: ServerResponse, init?: ResponseInit): void;

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
          sendUsage?: boolean; // default to true (change to false in v4: secure by default)
        },
  ): Response;

  /**
  Creates a simple text stream response.
  Each text delta is encoded as UTF-8 and sent as a separate chunk.
  Non-text-delta events are ignored.

  @param init Optional headers, status code, and status text.
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
    } & ToolCallUnion<TOOLS>)
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
    } & ToolResultUnion<TOOLS>)
  | {
      type: 'step-finish';
      finishReason: FinishReason;
      logprobs?: LogProbs;
      usage: LanguageModelUsage;
      response: LanguageModelResponseMetadata;
      experimental_providerMetadata?: ProviderMetadata;
      isContinued: boolean;
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
