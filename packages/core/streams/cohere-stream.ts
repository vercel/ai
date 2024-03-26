import {
  type AIStreamCallbacksAndOptions,
  createCallbacksTransformer,
  readableFromAsyncIterable,
} from './ai-stream';
import { createStreamDataTransformer } from './stream-data';

const utf8Decoder = new TextDecoder('utf-8');

// Full types
// @see: https://github.com/cohere-ai/cohere-typescript/blob/c2eceb4a845098240ba0bc44e3787ccf75e268e8/src/api/types/StreamedChatResponse.ts
interface StreamChunk {
  text?: string;
  eventType:
    | 'stream-start'
    | 'search-queries-generation'
    | 'search-results'
    | 'text-generation'
    | 'citation-generation'
    | 'stream-end';
}

async function processLines(
  lines: string[],
  controller: ReadableStreamDefaultController<string>,
) {
  for (const line of lines) {
    const { text, is_finished } = JSON.parse(line);

    // closing the reader is handed in readAndProcessLines
    if (!is_finished) {
      controller.enqueue(text);
    }
  }
}

async function readAndProcessLines(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  controller: ReadableStreamDefaultController<string>,
) {
  let segment = '';

  while (true) {
    const { value: chunk, done } = await reader.read();
    if (done) {
      break;
    }

    segment += utf8Decoder.decode(chunk, { stream: true });

    const linesArray = segment.split(/\r\n|\n|\r/g);
    segment = linesArray.pop() || '';

    await processLines(linesArray, controller);
  }

  if (segment) {
    const linesArray = [segment];
    await processLines(linesArray, controller);
  }

  controller.close();
}

function createParser(res: Response) {
  const reader = res.body?.getReader();

  return new ReadableStream<string>({
    async start(controller): Promise<void> {
      if (!reader) {
        controller.close();
        return;
      }

      await readAndProcessLines(reader, controller);
    },
  });
}

async function* streamable(stream: AsyncIterable<StreamChunk>) {
  for await (const chunk of stream) {
    if (chunk.eventType === 'text-generation') {
      const text = chunk.text;
      if (text) yield text;
    }
  }
}

export function CohereStream(
  reader: Response | AsyncIterable<StreamChunk>,
  callbacks?: AIStreamCallbacksAndOptions,
): ReadableStream {
  if (Symbol.asyncIterator in reader) {
    return readableFromAsyncIterable(streamable(reader))
      .pipeThrough(createCallbacksTransformer(callbacks))
      .pipeThrough(createStreamDataTransformer());
  } else {
    return createParser(reader)
      .pipeThrough(createCallbacksTransformer(callbacks))
      .pipeThrough(createStreamDataTransformer());
  }
}
