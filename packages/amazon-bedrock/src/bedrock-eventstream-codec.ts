import { EventStreamCodec } from '@smithy/eventstream-codec';
import { toUtf8, fromUtf8 } from '@smithy/util-utf8';
import { ZodSchema } from 'zod';
import { EmptyResponseBodyError } from '@ai-sdk/provider';
import { ParseResult, safeParseJSON } from '@ai-sdk/provider-utils';
import {
  extractResponseHeaders,
  ResponseHandler,
} from '@ai-sdk/provider-utils';

// https://docs.aws.amazon.com/lexv2/latest/dg/event-stream-encoding.html
export const createEventSourceResponseHandler =
  <T>(
    chunkSchema: ZodSchema<T>,
  ): ResponseHandler<ReadableStream<ParseResult<T>>> =>
  async ({ response }: { response: Response }) => {
    const responseHeaders = extractResponseHeaders(response);

    if (response.body == null) {
      throw new EmptyResponseBodyError({});
    }

    const codec = new EventStreamCodec(toUtf8, fromUtf8);
    let buffer = new Uint8Array(0);

    return {
      responseHeaders,
      value: response.body.pipeThrough(
        new TransformStream<Uint8Array, ParseResult<T>>({
          transform(chunk, controller) {
            // Append new chunk to buffer.
            const newBuffer = new Uint8Array(buffer.length + chunk.length);
            newBuffer.set(buffer);
            newBuffer.set(chunk, buffer.length);
            buffer = newBuffer;

            // Try to decode messages from buffer.
            while (buffer.length >= 4) {
              // The first 4 bytes are the total length (big-endian).
              const totalLength = new DataView(
                buffer.buffer,
                buffer.byteOffset,
                buffer.byteLength,
              ).getUint32(0, false);

              // If we don't have the full message yet, wait for more chunks.
              if (buffer.length < totalLength) {
                break;
              }

              try {
                // 3) Decode exactly the sub-slice for this event.
                const subView = buffer.subarray(0, totalLength);
                const decoded = codec.decode(subView);

                // Slice the used bytes out of the buffer, removing this message.
                buffer = buffer.slice(totalLength);

                // Process the message.
                if (decoded.headers[':message-type']?.value === 'event') {
                  const data = new TextDecoder().decode(decoded.body);

                  // Wrap the data in the `:event-type` field to match the expected schema.
                  const parsedDataResult = safeParseJSON({ text: data });
                  let wrappedData;
                  if (!parsedDataResult.success) {
                    controller.enqueue(parsedDataResult);
                    break;
                  }
                  // The `p` field appears to be padding or some other non-functional field.
                  delete (parsedDataResult.value as any).p;
                  wrappedData = {
                    [decoded.headers[':event-type']?.value as string]:
                      parsedDataResult.value,
                  };
                  const parsedWrappedData = safeParseJSON({
                    text: JSON.stringify(wrappedData),
                    schema: chunkSchema,
                  });
                  if (!parsedWrappedData.success) {
                    controller.enqueue(parsedWrappedData);
                    break;
                  }
                  controller.enqueue({
                    success: true,
                    value: parsedWrappedData.value,
                    rawValue: parsedWrappedData.rawValue,
                  });
                }
              } catch (e) {
                // If we can't decode a complete message, wait for more data
                console.log('error', e);
                break;
              }
            }
          },
        }),
      ),
    };
  };
