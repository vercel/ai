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
  terminateOnDone = false,
}: {
  stream: ReadableStream<Uint8Array>;
  schema: FlexibleSchema<T>;
  /**
   * Whether to terminate the stream when a `[DONE]` event is received.
   * Defaults to `false`.
   */
  terminateOnDone?: boolean;
}): ReadableStream<ParseResult<T>> {
  return stream
    .pipeThrough(
      new TextDecoderStream() as ReadableWritablePair<string, Uint8Array>,
    )
    .pipeThrough(new EventSourceParserStream())
    .pipeThrough(
      new TransformStream<EventSourceMessage, ParseResult<T>>({
        async transform({ data }, controller) {
          // ignore the 'DONE' event that e.g. OpenAI sends:
          if (data === '[DONE]') {
            if (terminateOnDone) {
              controller.terminate();
            }
            return;
          }

          controller.enqueue(await safeParseJSON({ text: data, schema }));
        },
      }),
    );
}
