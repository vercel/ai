import { ZodSchema } from 'zod';
import {
  createEventSourceParserStream,
  EventSourceChunk,
} from './event-source-parser-stream';
import { ParseResult, safeParseJSON } from './parse-json';

/**
 * Parses a JSON event stream into a stream of parsed JSON objects.
 */
export function parseJsonEventStream<T>({
  stream,
  schema,
}: {
  stream: ReadableStream<Uint8Array>;
  schema: ZodSchema<T>;
}): ReadableStream<ParseResult<T>> {
  return stream
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(createEventSourceParserStream())
    .pipeThrough(
      new TransformStream<EventSourceChunk, ParseResult<T>>({
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
