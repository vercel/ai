import type { Context, ToolSet } from '@ai-sdk/provider-utils';
import type { Output } from './output';
import type { StreamTextResult } from './stream-text-result';

/** A single-consumer view of a text generation, without replay or final content getters. */
export type StreamTextSingleConsumerResult<
  TOOLS extends ToolSet,
  RUNTIME_CONTEXT extends Context,
  OUTPUT extends Output,
> = Pick<
  StreamTextResult<TOOLS, RUNTIME_CONTEXT, OUTPUT>,
  | 'textStream'
  | 'stream'
  | 'fullStream'
  | 'partialOutputStream'
  | 'elementStream'
  | 'totalUsage'
  | 'usage'
  | 'finishReason'
  | 'rawFinishReason'
  | 'consumeStream'
  | 'toUIMessageStream'
  | 'toUIMessageStreamResponse'
  | 'toTextStreamResponse'
  | 'pipeUIMessageStreamToResponse'
  | 'pipeTextStreamToResponse'
>;

/** Expose only the stream and completion metadata for a single consumer. */
export function createSingleConsumerStreamTextResult<
  TOOLS extends ToolSet,
  RUNTIME_CONTEXT extends Context,
  OUTPUT extends Output,
>(
  result: StreamTextResult<TOOLS, RUNTIME_CONTEXT, OUTPUT>,
): StreamTextSingleConsumerResult<TOOLS, RUNTIME_CONTEXT, OUTPUT> {
  // A concrete facade also prevents untyped callers from accidentally reading
  // a final-content getter when no result collector was configured.
  return {
    get textStream() {
      return result.textStream;
    },
    get stream() {
      return result.stream;
    },
    get fullStream() {
      return result.fullStream;
    },
    get partialOutputStream() {
      return result.partialOutputStream;
    },
    get elementStream() {
      return result.elementStream;
    },
    get totalUsage() {
      return result.totalUsage;
    },
    get usage() {
      return result.usage;
    },
    get finishReason() {
      return result.finishReason;
    },
    get rawFinishReason() {
      return result.rawFinishReason;
    },
    consumeStream: result.consumeStream.bind(result),
    toUIMessageStream: result.toUIMessageStream.bind(result),
    toUIMessageStreamResponse: result.toUIMessageStreamResponse.bind(result),
    toTextStreamResponse: result.toTextStreamResponse.bind(result),
    pipeUIMessageStreamToResponse:
      result.pipeUIMessageStreamToResponse.bind(result),
    pipeTextStreamToResponse: result.pipeTextStreamToResponse.bind(result),
  };
}
