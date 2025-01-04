import { HttpResponse, http } from 'msw';
import { SetupServer, setupServer } from 'msw/node';

export class BinaryTestServer {
  readonly server: SetupServer;

  responseBody: Buffer | null = null;
  responseHeaders: Record<string, string> = {};
  responseStatus = 200;

  request: Request | undefined;

  constructor(url: string) {
    this.server = setupServer(
      http.post(url, ({ request }) => {
        this.request = request;

        if (this.responseBody === null) {
          return new HttpResponse(null, { status: this.responseStatus });
        }

        return new HttpResponse(this.responseBody, {
          status: this.responseStatus,
          headers: this.responseHeaders,
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
      this.responseBody = null;
      this.request = undefined;
    });
    afterEach(() => this.server.resetHandlers());
    afterAll(() => this.server.close());
  }
}
