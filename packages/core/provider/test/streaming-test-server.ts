import { HttpResponse, http } from 'msw';
import { SetupServer, setupServer } from 'msw/node';

export class StreamingTestServer {
  readonly server: SetupServer;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  responseChunks: any[] = [];

  constructor(url: string) {
    const responseChunks = () => this.responseChunks;

    this.server = setupServer(
      http.post(url, () => {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            try {
              for (const chunk of responseChunks()) {
                controller.enqueue(encoder.encode(chunk));
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
      }),
    );
  }

  setupTestEnvironment() {
    beforeAll(() => this.server.listen());
    beforeEach(() => {
      this.responseChunks = [];
    });
    afterEach(() => this.server.resetHandlers());
    afterAll(() => this.server.close());
  }
}
