import {
  createEventSourceParserStream,
  EventSourceChunk,
  safeParseJSON,
} from '@ai-sdk/provider-utils';
import { DataStreamPart, dataStreamPartSchema } from './data-stream-parts';

export function parseEncodedDataStream({
  stream,
  onError,
}: {
  stream: ReadableStream<Uint8Array>;
  onError: (error: Error) => void;
}): ReadableStream<DataStreamPart> {
  return stream
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
    );
}
