import {
  EventSourceMessage,
  EventSourceParserStream,
} from 'eventsource-parser/stream';
import { ZodType } from 'zod/v4';
import { LazyValidator } from './lazy-validator';
import { ParseResult, safeParseJSON } from './parse-json';
import { Validator } from './validator';

/**
 * Parses a JSON event stream into a stream of parsed JSON objects.
 */
export function parseJsonEventStream<T>({
  stream,
  schema,
}: {
  stream: ReadableStream<Uint8Array>;
  schema: ZodType<T> | Validator<T> | LazyValidator<T>;
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

          controller.enqueue(await safeParseJSON({ text: data, schema }));
        },
      }),
    );
}
