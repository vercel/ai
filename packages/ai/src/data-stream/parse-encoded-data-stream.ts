import {
  createEventSourceParserStream,
  EventSourceChunk,
  ParseResult,
  safeParseJSON,
} from '@ai-sdk/provider-utils';
import { createAsyncIterableStream } from '../util/async-iterable-stream';
import { DataStreamPart, dataStreamPartSchema } from './data-stream-parts';

export function parseEncodedDataStream(stream: ReadableStream<Uint8Array>) {
  return createAsyncIterableStream(
    stream
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(createEventSourceParserStream())
      .pipeThrough(
        new TransformStream<EventSourceChunk, ParseResult<DataStreamPart>>({
          async transform({ data }, controller) {
            if (data === '[DONE]') {
              return;
            }

            controller.enqueue(
              await safeParseJSON({
                text: data,
                schema: dataStreamPartSchema,
              }),
            );
          },
        }),
      ),
  );
}
