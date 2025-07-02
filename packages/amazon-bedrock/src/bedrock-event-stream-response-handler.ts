import { EmptyResponseBodyError } from '@ai-sdk/provider';
import {
  ParseResult,
  safeParseJSON,
  extractResponseHeaders,
  ResponseHandler,
  safeValidateTypes,
} from '@ai-sdk/provider-utils';
import { EventStreamCodec } from '@smithy/eventstream-codec';
import { toUtf8, fromUtf8 } from '@smithy/util-utf8';
import { ZodType } from 'zod/v4';

// https://docs.aws.amazon.com/lexv2/latest/dg/event-stream-encoding.html
export const createBedrockEventStreamResponseHandler =
  <T>(
    chunkSchema: ZodType<T, any>,
  ): ResponseHandler<ReadableStream<ParseResult<T>>> =>
  async ({ response }: { response: Response }) => {
    const responseHeaders = extractResponseHeaders(response);

    if (response.body == null) {
      throw new EmptyResponseBodyError({});
    }

    const codec = new EventStreamCodec(toUtf8, fromUtf8);
    let buffer = new Uint8Array(0);
    const textDecoder = new TextDecoder();

    return {
      responseHeaders,
      value: response.body.pipeThrough(
        new TransformStream<Uint8Array, ParseResult<T>>({
          async transform(chunk, controller) {
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
                // Decode exactly the sub-slice for this event.
                const subView = buffer.subarray(0, totalLength);
                const decoded = codec.decode(subView);

                // Slice the used bytes out of the buffer, removing this message.
                buffer = buffer.slice(totalLength);

                // Process the message.
                if (decoded.headers[':message-type']?.value === 'event') {
                  const data = textDecoder.decode(decoded.body);

                  // Wrap the data in the `:event-type` field to match the expected schema.
                  const parsedDataResult = await safeParseJSON({ text: data });
                  if (!parsedDataResult.success) {
                    controller.enqueue(parsedDataResult);
                    break;
                  }

                  // The `p` field appears to be padding or some other non-functional field.
                  delete (parsedDataResult.value as any).p;
                  let wrappedData = {
                    [decoded.headers[':event-type']?.value as string]:
                      parsedDataResult.value,
                  };

                  // Re-validate with the expected schema.
                  const validatedWrappedData = await safeValidateTypes<T>({
                    value: wrappedData,
                    schema: chunkSchema,
                  });
                  if (!validatedWrappedData.success) {
                    controller.enqueue(validatedWrappedData);
                  } else {
                    controller.enqueue({
                      success: true,
                      value: validatedWrappedData.value,
                      rawValue: wrappedData,
                    });
                  }
                }
              } catch (e) {
                // If we can't decode a complete message, wait for more data
                break;
              }
            }
          },
        }),
      ),
    };
  };
