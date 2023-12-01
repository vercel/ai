import { HttpResponse, http, passthrough } from 'msw';
import { setupServer } from 'msw/node';

export const DEFAULT_TEST_URL = 'http://localhost:3030/';

export function createMockServer(
  testConfigs: Array<{
    url: string;
    chunks: any[];
    formatChunk: (chunk: any) => string;
    suffix?: string;
  }>,
  passthroughUrls?: string[],
) {
  return setupServer(
    ...testConfigs.map(({ url, chunks, formatChunk, suffix }) =>
      http.all(url, createHandler(chunks, formatChunk, suffix)),
    ),
    ...(passthroughUrls ?? []).map(url => http.all(url, () => passthrough())),
  );
}

function createHandler(
  chunks: any[],
  formatChunk: (chunk: any) => string,
  suffix?: string,
) {
  return () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for (const chunk of chunks) {
            controller.enqueue(encoder.encode(formatChunk(chunk)));
          }

          if (suffix != null) {
            controller.enqueue(encoder.encode(suffix));
          }
        } finally {
          controller.close();
        }
      },
    });

    return new HttpResponse(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  };
}
