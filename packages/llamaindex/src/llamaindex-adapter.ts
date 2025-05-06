import { convertAsyncIteratorToReadableStream } from '@ai-sdk/provider-utils';
import { formatDataStreamPart } from 'ai';
import { createCallbacksTransformer, StreamCallbacks } from 'ai/internal';

type EngineResponse = {
  delta: string;
};

export function toDataStream(
  stream: AsyncIterable<EngineResponse>,
  callbacks?: StreamCallbacks,
) {
  const trimStart = trimStartOfStream();

  return convertAsyncIteratorToReadableStream(stream[Symbol.asyncIterator]())
    .pipeThrough(
      new TransformStream({
        async transform(message, controller): Promise<void> {
          controller.enqueue(trimStart(message.delta));
        },
      }),
    )
    .pipeThrough(createCallbacksTransformer(callbacks))
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(
      new TransformStream({
        transform: async (chunk, controller) => {
          controller.enqueue(formatDataStreamPart('text', chunk));
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
