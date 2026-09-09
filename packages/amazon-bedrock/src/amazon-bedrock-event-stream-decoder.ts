import { EventStreamCodec } from '@smithy/eventstream-codec';
import { toUtf8, fromUtf8 } from '@smithy/util-utf8';

export interface DecodedEvent {
  messageType: string;
  eventType?: string;
  exceptionType?: string;
  data: string;
}

export function createAmazonBedrockEventStreamDecoder<T>(
  body: ReadableStream<Uint8Array>,
  processEvent: (
    event: DecodedEvent,
    controller: TransformStreamDefaultController<T>,
  ) => void | Promise<void>,
): ReadableStream<T> {
  const codec = new EventStreamCodec(toUtf8, fromUtf8);
  let buffer = new Uint8Array(0);
  const textDecoder = new TextDecoder();

  return body.pipeThrough(
    new TransformStream<Uint8Array, T>({
      async transform(chunk, controller) {
        const newBuffer = new Uint8Array(buffer.length + chunk.length);
        newBuffer.set(buffer);
        newBuffer.set(chunk, buffer.length);
        buffer = newBuffer;

        while (buffer.length >= 4) {
          const totalLength = new DataView(
            buffer.buffer,
            buffer.byteOffset,
            buffer.byteLength,
          ).getUint32(0, false);

          if (buffer.length < totalLength) {
            break;
          }

          const subView = buffer.subarray(0, totalLength);
          const decoded = codec.decode(subView);

          buffer = buffer.slice(totalLength);

          const messageType = decoded.headers[':message-type']?.value as string;
          const eventType = decoded.headers[':event-type']?.value as
            | string
            | undefined;
          const exceptionType = decoded.headers[':exception-type']?.value as
            | string
            | undefined;
          const data = textDecoder.decode(decoded.body);

          await processEvent(
            { messageType, eventType, exceptionType, data },
            controller,
          );
        }
      },
      flush() {
        if (buffer.length > 0) {
          throw new Error(
            `Incomplete Amazon Bedrock event-stream frame: ${buffer.length} buffered bytes remain at end of stream.`,
          );
        }
      },
    }),
  );
}
