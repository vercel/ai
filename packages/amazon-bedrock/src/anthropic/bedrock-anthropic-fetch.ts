import { FetchFunction } from '@ai-sdk/provider-utils';
import { EventStreamCodec } from '@smithy/eventstream-codec';
import { toUtf8, fromUtf8 } from '@smithy/util-utf8';

/**
 * Creates a fetch function that wraps streaming responses from Bedrock's
 * event stream format into SSE format that Anthropic's parser expects.
 */
export function createBedrockAnthropicFetch(
  baseFetch: FetchFunction,
): FetchFunction {
  return async (url, options) => {
    const response = await baseFetch(url, options);

    // Check if this is a streaming response from Bedrock
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/vnd.amazon.eventstream')) {
      // Transform Bedrock's event stream to SSE
      const transformedBody = transformBedrockEventStreamToSSE(response.body!);

      // Create a new response with the transformed body and SSE content type
      return new Response(transformedBody, {
        status: response.status,
        statusText: response.statusText,
        headers: new Headers({
          ...Object.fromEntries(response.headers.entries()),
          'content-type': 'text/event-stream',
        }),
      });
    }

    return response;
  };
}

/**
 * Transforms Bedrock's event stream format to SSE format.
 * Bedrock uses AWS's proprietary event stream encoding, while Anthropic expects SSE.
 */
function transformBedrockEventStreamToSSE(
  body: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  const codec = new EventStreamCodec(toUtf8, fromUtf8);
  let buffer = new Uint8Array(0);
  const textEncoder = new TextEncoder();
  const textDecoder = new TextDecoder();

  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        // Append new chunk to buffer
        const newBuffer = new Uint8Array(buffer.length + chunk.length);
        newBuffer.set(buffer);
        newBuffer.set(chunk, buffer.length);
        buffer = newBuffer;

        // Try to decode messages from buffer
        while (buffer.length >= 4) {
          // The first 4 bytes are the total length (big-endian)
          const totalLength = new DataView(
            buffer.buffer,
            buffer.byteOffset,
            buffer.byteLength,
          ).getUint32(0, false);

          // If we don't have the full message yet, wait for more chunks
          if (buffer.length < totalLength) {
            break;
          }

          try {
            // Decode exactly the sub-slice for this event
            const subView = buffer.subarray(0, totalLength);
            const decoded = codec.decode(subView);

            // Slice the used bytes out of the buffer
            buffer = buffer.slice(totalLength);

            // Process the message
            if (decoded.headers[':message-type']?.value === 'event') {
              const eventType = decoded.headers[':event-type']?.value as string;

              // Get the payload data
              const data = textDecoder.decode(decoded.body);

              if (eventType === 'chunk') {
                // Parse the chunk to extract the bytes field which contains the actual Anthropic event
                try {
                  const chunkData = JSON.parse(data);
                  if (chunkData.bytes) {
                    // Decode base64 bytes to get the actual Anthropic SSE event
                    const anthropicEvent = atob(chunkData.bytes);
                    // Emit as SSE format
                    controller.enqueue(
                      textEncoder.encode(`data: ${anthropicEvent}\n\n`),
                    );
                  }
                } catch {
                  // If parsing fails, emit the raw data
                  controller.enqueue(textEncoder.encode(`data: ${data}\n\n`));
                }
              } else if (eventType === 'messageStop') {
                // End of stream - emit the done event for SSE
                controller.enqueue(textEncoder.encode('data: [DONE]\n\n'));
              }
            } else if (
              decoded.headers[':message-type']?.value === 'exception'
            ) {
              // Handle exceptions
              const errorData = textDecoder.decode(decoded.body);
              controller.enqueue(
                textEncoder.encode(
                  `data: {"type":"error","error":${errorData}}\n\n`,
                ),
              );
            }
          } catch {
            // If we can't decode a complete message, wait for more data
            break;
          }
        }
      },
    }),
  );
}
