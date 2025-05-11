import {
  createEventSourceParserStream,
  EventSourceChunk,
  safeParseJSON,
} from '@ai-sdk/provider-utils';
import {
  AsyncIterableStream,
  createAsyncIterableStream,
} from '../util/async-iterable-stream';
import { DataStreamPart, dataStreamPartSchema } from './data-stream-parts';

export function parseEncodedDataStream({
  stream,
  onError,
}: {
  stream: ReadableStream<Uint8Array>;
  onError: (error: Error) => void;
}): AsyncIterableStream<DataStreamPart> {
  return createAsyncIterableStream(
    stream
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(createEventSourceParserStream())
      .pipeThrough(
        new TransformStream<EventSourceChunk, DataStreamPart>({
          async transform({ data }, controller) {
            if (data === '[DONE]') {
              return;
            }

            const parseResult = await safeParseJSON({
              text: data,
              schema: dataStreamPartSchema,
            });

            if (!parseResult.success) {
              onError?.(parseResult.error);
              return;
            }

            controller.enqueue(parseResult.value);
          },
        }),
      ),
  );
}
