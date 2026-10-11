import type { UIMessageChunk } from 'ai';
import { convertAsyncIteratorToReadableStream } from 'ai/internal';
import {
  createCallbacksTransformer,
  type StreamCallbacks,
} from './stream-callbacks';
type EngineResponse = {
  delta: string;
};

export interface ToUIMessageStreamOptions extends StreamCallbacks {
  /**
   * Whether to remove leading whitespace from the start of the stream.
   *
   * @default true
   */
  trimStart?: boolean;
}

export function toUIMessageStream(
  stream: AsyncIterable<EngineResponse>,
  options?: ToUIMessageStreamOptions,
) {
  const trimStart =
    options?.trimStart === false ? (text: string) => text : trimStartOfStream();

  return convertAsyncIteratorToReadableStream(stream[Symbol.asyncIterator]())
    .pipeThrough(
      new TransformStream({
        async transform(message, controller): Promise<void> {
          controller.enqueue(trimStart(message.delta));
        },
      }),
    )
    .pipeThrough(createCallbacksTransformer(options))
    .pipeThrough(
      new TransformStream<string, UIMessageChunk>({
        start: async controller => {
          controller.enqueue({ type: 'text-start', id: '1' });
        },
        transform: async (chunk, controller) => {
          controller.enqueue({ type: 'text-delta', delta: chunk, id: '1' });
        },
        flush: async controller => {
          controller.enqueue({ type: 'text-end', id: '1' });
        },
      }),
    );
}

function trimStartOfStream(): (text: string) => string {
  let isStreamStart = true;

  return (text: string): string => {
    if (isStreamStart) {
      text = text.trimStart();
      if (text) isStreamStart = false;
    }
    return text;
  };
}
