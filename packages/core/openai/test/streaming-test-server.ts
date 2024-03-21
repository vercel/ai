import { HttpResponse, http } from 'msw';
import { SetupServer, setupServer } from 'msw/node';

export class StreamingTestServer {
  readonly server: SetupServer;

  responseChunks: any[] = [];

  request: Request | undefined;

  constructor(url: string) {
    const responseChunks = () => this.responseChunks;

    this.server = setupServer(
      http.post(url, ({ request }) => {
        this.request = request;

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

  async getRequestBodyJson() {
    expect(this.request).toBeDefined();
    return JSON.parse(await this.request!.text());
  }

  async getRequestHeaders() {
    expect(this.request).toBeDefined();
    return this.request!.headers;
  }

  setupTestEnvironment() {
    beforeAll(() => this.server.listen());
    beforeEach(() => {
      this.responseChunks = [];
      this.request = undefined;
    });
    afterEach(() => this.server.resetHandlers());
    afterAll(() => this.server.close());
  }
}
