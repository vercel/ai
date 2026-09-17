import {
  EventSourceParserStream,
  type EventSourceMessage,
} from 'eventsource-parser/stream';
import { safeParseJSON, type ParseResult } from './parse-json';
import type { FlexibleSchema } from './schema';
import { JsonStreamParser } from './json-stream-parser';

/**
 * Parses a JSON event stream into a stream of parsed JSON objects.
 */
export function parseJsonEventStream<T>({
  stream,
  schema,
}: {
  stream: ReadableStream<Uint8Array>;
  schema: FlexibleSchema<T> | JsonStreamParser<T>;
}): ReadableStream<ParseResult<T>> {
  return stream
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new EventSourceParserStream())
    .pipeThrough(
      new TransformStream<EventSourceMessage, ParseResult<T>>({
        async transform({ data }, controller) {
          // ignore the 'DONE' event that e.g. OpenAI sends:
          if (data === '[DONE]') {
            return;
          }

          controller.enqueue(
            await (schema instanceof JsonStreamParser
              ? schema.parse(data)
              : safeParseJSON({ text: data, schema })),
          );
        },
      }),
    );
}
