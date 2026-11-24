import {
  EventSourceParserStream,
  type EventSourceMessage,
} from 'eventsource-parser/stream';
import { safeParseJSON, type ParseResult } from './parse-json';
import type { FlexibleSchema } from './schema';

/**
 * Maximum number of characters that are buffered for a single event: 64 MiB.
 *
 * An event is buffered until it is complete, so a stream that never completes
 * an event would grow the buffer until the process runs out of memory. With
 * this limit, such a stream fails with an error that can be handled instead.
 */
const MAX_EVENT_SIZE = 64 * 1024 * 1024;

/**
 * Parses a JSON event stream into a stream of parsed JSON objects.
 *
 * The returned stream fails with an error when a single event is larger than
 * 64 MiB.
 */
export function parseJsonEventStream<T>({
  stream,
  schema,
}: {
  stream: ReadableStream<Uint8Array>;
  schema: FlexibleSchema<T>;
}): ReadableStream<ParseResult<T>> {
  return stream
    .pipeThrough(
      new TextDecoderStream() as ReadableWritablePair<string, Uint8Array>,
    )
    .pipeThrough(new EventSourceParserStream({ maxBufferSize: MAX_EVENT_SIZE }))
    .pipeThrough(
      new TransformStream<EventSourceMessage, ParseResult<T>>({
        async transform({ data }, controller) {
          // ignore the 'DONE' event that e.g. OpenAI sends:
          if (data === '[DONE]') {
            return;
          }

          controller.enqueue(await safeParseJSON({ text: data, schema }));
        },
      }),
    );
}
