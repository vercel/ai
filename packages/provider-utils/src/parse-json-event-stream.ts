import { createParser } from 'eventsource-parser';
import { ParseResult, safeParseJSON } from './parse-json';
import { FlexibleSchema } from './schema';

/**
 * Parses a JSON event stream into a stream of parsed JSON objects.
 *
 * Uses the callback-based eventsource-parser API instead of EventSourceParserStream
 * for better compatibility with Cloudflare Workers runtime.
 * The EventSourceParserStream can hang indefinitely in Cloudflare Workers due to
 * differences in how async iteration on piped streams is handled compared to Node.js.
 */
export function parseJsonEventStream<T>({
  stream,
  schema,
}: {
  stream: ReadableStream<Uint8Array>;
  schema: FlexibleSchema<T>;
}): ReadableStream<ParseResult<T>> {
  // Buffer for events parsed by the SSE parser callback
  let eventBuffer: string[] = [];

  // Create the SSE parser with a callback that buffers events
  const parser = createParser({
    onEvent: event => {
      const { data } = event;
      // ignore the 'DONE' event that e.g. OpenAI sends:
      if (data === '[DONE]') {
        return;
      }
      eventBuffer.push(data);
    },
  });

  // Custom TransformStream that uses the callback-based parser
  const sseTransform = new TransformStream<string, string>({
    transform(chunk, controller) {
      // Clear the buffer before feeding
      eventBuffer = [];
      // Feed the chunk to the parser - this synchronously calls onEvent
      parser.feed(chunk);
      // Enqueue all parsed events
      for (const data of eventBuffer) {
        controller.enqueue(data);
      }
    },
    flush() {
      // Reset parser on stream end
      parser.reset();
    },
  });

  // JSON parsing transform
  const jsonTransform = new TransformStream<string, ParseResult<T>>({
    async transform(data, controller) {
      controller.enqueue(await safeParseJSON({ text: data, schema }));
    },
  });

  return stream
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(sseTransform)
    .pipeThrough(jsonTransform);
}
