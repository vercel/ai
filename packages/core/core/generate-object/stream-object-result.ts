import { DeepPartial } from '@ai-sdk/ui-utils';
import { ServerResponse } from 'http';
import { CallWarning, FinishReason, LogProbs } from '../types';
import { CompletionTokenUsage } from '../types/token-usage';
import { AsyncIterableStream } from '../util/async-iterable-stream';

/**
The result of a `streamObject` call that contains the partial object stream and additional information.
 */
export interface StreamObjectResult<T> {
  /**
  Warnings from the model provider (e.g. unsupported settings)
     */
  readonly warnings: CallWarning[] | undefined;

  /**
  The token usage of the generated response. Resolved when the response is finished.
     */
  readonly usage: Promise<CompletionTokenUsage>;

  /**
  Optional raw response data.
     */
  readonly rawResponse?: {
    /**
  Response headers.
   */
    headers?: Record<string, string>;
  };

  /**
  The generated object (typed according to the schema). Resolved when the response is finished.
     */
  readonly object: Promise<T>;

  /**
  Stream of partial objects. It gets more complete as the stream progresses.

  Note that the partial object is not validated.
  If you want to be certain that the actual content matches your schema, you need to implement your own validation for partial results.
     */
  readonly partialObjectStream: AsyncIterableStream<DeepPartial<T>>;

  /**
  Text stream of the JSON representation of the generated object. It contains text chunks.
  When the stream is finished, the object is valid JSON that can be parsed.
     */
  readonly textStream: AsyncIterableStream<string>;

  /**
  Stream of different types of events, including partial objects, errors, and finish events.
  Only errors that stop the stream, such as network errors, are thrown.
     */
  readonly fullStream: AsyncIterableStream<ObjectStreamPart<T>>;

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
  Creates a simple text stream response.
  The response has a `Content-Type` header set to `text/plain; charset=utf-8`.
  Each text delta is encoded as UTF-8 and sent as a separate chunk.
  Non-text-delta events are ignored.

  @param init Optional headers and status code.
     */
  toTextStreamResponse(init?: ResponseInit): Response;
}

export type ObjectStreamInputPart =
  | {
      type: 'error';
      error: unknown;
    }
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

export type ObjectStreamPart<T> =
  | ObjectStreamInputPart
  | {
      type: 'object';
      object: DeepPartial<T>;
    }
  | {
      type: 'text-delta';
      textDelta: string;
    };
