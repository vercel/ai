import { UIMessageStreamPart } from 'ai';
import { convertAsyncIteratorToReadableStream } from 'ai/internal';
import {
  createCallbacksTransformer,
  StreamCallbacks,
} from './stream-callbacks';

type EngineResponse = {
  delta: string;
};

export function toUIMessageStream(
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
    .pipeThrough(
      new TransformStream<string, UIMessageStreamPart>({
        transform: async (chunk, controller) => {
          controller.enqueue({ type: 'text', text: chunk });
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
