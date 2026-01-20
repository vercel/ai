import { FetchFunction, safeParseJSON } from '@ai-sdk/provider-utils';
import { createBedrockEventStreamDecoder } from '../bedrock-event-stream-decoder';

export function createBedrockAnthropicFetch(
  baseFetch: FetchFunction,
): FetchFunction {
  return async (url, options) => {
    const response = await baseFetch(url, options);

    const contentType = response.headers.get('content-type');
    if (
      contentType?.includes('application/vnd.amazon.eventstream') &&
      response.body != null
    ) {
      const transformedBody = transformBedrockEventStreamToSSE(response.body);

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

function transformBedrockEventStreamToSSE(
  body: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  const textEncoder = new TextEncoder();

  return createBedrockEventStreamDecoder(body, async (event, controller) => {
    if (event.messageType === 'event') {
      if (event.eventType === 'chunk') {
        const parsed = await safeParseJSON({ text: event.data });
        if (!parsed.success) {
          controller.enqueue(textEncoder.encode(`data: ${event.data}\n\n`));
          return;
        }
        const bytes = (parsed.value as { bytes?: string }).bytes;
        if (bytes) {
          const anthropicEvent = atob(bytes);
          controller.enqueue(textEncoder.encode(`data: ${anthropicEvent}\n\n`));
        } else {
          controller.enqueue(textEncoder.encode(`data: ${event.data}\n\n`));
        }
      } else if (event.eventType === 'messageStop') {
        controller.enqueue(textEncoder.encode('data: [DONE]\n\n'));
      }
    } else if (event.messageType === 'exception') {
      controller.enqueue(
        textEncoder.encode(
          `data: ${JSON.stringify({ type: 'error', error: event.data })}\n\n`,
        ),
      );
    }
  });
}
