import {
  EventSourceParserStream,
  type EventSourceMessage,
} from 'eventsource-parser/stream';
import { safeParseJSON, type ParseResult } from './parse-json';
import type { FlexibleSchema } from './schema';

/**
 * Parses a JSON event stream into a stream of parsed JSON objects.
 */
export function parseJsonEventStream<T>({
  stream,
  schema,
}: {
  stream: ReadableStream<Uint8Array>;
  schema: FlexibleSchema<T>;
}): ReadableStream<ParseResult<T>> {
  const decoder = new TextDecoder();

  return stream
    .pipeThrough(
      new TransformStream<Uint8Array, string>({
        transform(chunk, controller) {
          // Preserve partial UTF-8 characters across chunks without requiring
          // TextDecoderStream, which is unavailable in some runtimes (e.g. Expo).
          const text = decoder.decode(chunk, { stream: true });
          if (text.length > 0) {
            controller.enqueue(text);
          }
        },
        flush(controller) {
          const text = decoder.decode();
          if (text.length > 0) {
            controller.enqueue(text);
          }
        },
      }),
    )
    .pipeThrough(new EventSourceParserStream())
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
