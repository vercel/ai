import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';

export const DEFAULT_TEST_URL = 'http://localhost/';

export function createMockServer(
  testConfigs: Array<{
    url: string;
    chunks: any[];
    formatChunk: (chunk: any) => string;
    suffix?: string;
  }>,
) {
  return setupServer(
    ...testConfigs.map(({ url, chunks, formatChunk, suffix }) =>
      http.get(url, createHandler(chunks, formatChunk, suffix)),
    ),
    ...testConfigs.map(({ url, chunks, formatChunk, suffix }) =>
      http.post(url, createHandler(chunks, formatChunk, suffix)),
    ),
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
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(formatChunk(chunk)));
        }

        if (suffix != null) {
          controller.enqueue(encoder.encode(suffix));
        }

        controller.close();
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
