// packages/core/streams/inkeep-stream.ts
import {
  AIStream,
  readableFromAsyncIterable,
  type AIStreamCallbacksAndOptions,
  createCallbacksTransformer,
} from './ai-stream';
import { createStreamDataTransformer } from './stream-data';
import { createParser } from 'eventsource-parser';

interface InkeepContentChunk {
  chat_session_id: string;
  message_chunk: string;
}

async function* createInkeepContentChunkIterable(
  stream: ReadableStream<string>,
): AsyncIterable<InkeepContentChunk> {
  const reader = stream.getReader();
  const queue: InkeepContentChunk[] = [];

  const parser = createParser(event => {
    if (event.type === 'event') {
      const inkeepContentChunk = JSON.parse(event.data) as InkeepContentChunk;
      queue.push(inkeepContentChunk);
    }
  });

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    parser.feed(value);

    while (queue.length > 0) {
      yield queue.shift()!;
    }
  }
}

async function* streamableInkeep(stream: ReadableStream<string>) {
  for await (const chunk of createInkeepContentChunkIterable(stream)) {
    const text = chunk.message_chunk;
    if (text) yield text;
  }
}

export function InkeepStream(
  res: Response,
  cb?: AIStreamCallbacksAndOptions,
): ReadableStream {
  if (!res.body) {
    throw new Error('Response body is null');
  }

  const textDecoder = new TextDecoder();
  const stringStream = new TransformStream({
    transform(chunk, controller) {
      controller.enqueue(textDecoder.decode(chunk));
    },
  });

  const stringBody = res.body.pipeThrough(stringStream);

  const inkeepStream = readableFromAsyncIterable(streamableInkeep(stringBody));

  return inkeepStream
    .pipeThrough(createCallbacksTransformer(cb))
    .pipeThrough(createStreamDataTransformer(cb?.experimental_streamData));
}
