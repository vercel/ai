import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';

export const DEFAULT_TEST_URL = 'http://localhost/';

export function createMockServer<CHUNK>({
  chunks,
  formatChunk,
  url,
}: {
  chunks: Array<CHUNK>;
  formatChunk: (value: CHUNK) => string;
  url: string;
}) {
  const encoder = new TextEncoder();
  return setupServer(
    http.get(url, () => {
      const stream = new ReadableStream({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(encoder.encode(formatChunk(chunk)));
          }

          controller.close();
        },
      });

      return new HttpResponse(stream, {
        headers: { 'Content-Type': 'text/event-stream' },
      });
    }),
  );
}
