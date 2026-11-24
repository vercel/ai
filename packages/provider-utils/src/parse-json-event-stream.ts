import {
  EventSourceParserStream,
  type EventSourceMessage,
} from 'eventsource-parser/stream';
import { safeParseJSON, type ParseResult } from './parse-json';
import type { FlexibleSchema } from './schema';

/**
 * Default maximum size of a single event in characters: 64 MiB.
 *
 * An event is buffered until it is complete, so a stream that never completes
 * an event would grow the buffer until the process runs out of memory. With
 * this limit, such a stream fails with an error that can be handled instead.
 */
const DEFAULT_MAX_EVENT_SIZE = 64 * 1024 * 1024;

/**
 * Parses a JSON event stream into a stream of parsed JSON objects.
 */
export function parseJsonEventStream<T>({
  stream,
  schema,
  maxEventSize = DEFAULT_MAX_EVENT_SIZE,
}: {
  stream: ReadableStream<Uint8Array>;
  schema: FlexibleSchema<T>;

  /**
   * Maximum size of a single event in characters. The returned stream fails
   * with an error when an event is larger. Defaults to 64 MiB.
   */
  maxEventSize?: number;
}): ReadableStream<ParseResult<T>> {
  return stream
    .pipeThrough(
      new TextDecoderStream() as ReadableWritablePair<string, Uint8Array>,
    )
    .pipeThrough(new EventSourceParserStream({ maxBufferSize: maxEventSize }))
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
