import { HttpResponse, http } from 'msw';
import { SetupServer, setupServer } from 'msw/node';

export class JsonTestServer {
  readonly server: SetupServer;

  responseHeaders: Record<string, string> = {};
  responseBodyJson: any = {};

  request: Request | undefined;

  constructor(url: string) {
    const responseBodyJson = () => this.responseBodyJson;

    this.server = setupServer(
      http.post(url, ({ request }) => {
        this.request = request;

        return HttpResponse.json(responseBodyJson(), {
          headers: {
            'Content-Type': 'application/json',
            ...this.responseHeaders,
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
    const requestHeaders = this.request!.headers;

    // convert headers to object for easier comparison
    const headersObject: Record<string, string> = {};
    requestHeaders.forEach((value, key) => {
      headersObject[key] = value;
    });

    return headersObject;
  }

  async getRequestUrlSearchParams() {
    expect(this.request).toBeDefined();
    return new URL(this.request!.url).searchParams;
  }

  async getRequestUrl() {
    expect(this.request).toBeDefined();
    return new URL(this.request!.url).toString();
  }

  setupTestEnvironment() {
    beforeAll(() => this.server.listen());
    beforeEach(() => {
      this.responseBodyJson = {};
      this.request = undefined;
    });
    afterEach(() => this.server.resetHandlers());
    afterAll(() => this.server.close());
  }
}
