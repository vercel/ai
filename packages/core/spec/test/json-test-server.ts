import { HttpResponse, http } from 'msw';
import { SetupServer, setupServer } from 'msw/node';

export class JsonTestServer {
  readonly server: SetupServer;

  responseBodyJson: any = {};

  request: Request | undefined;

  constructor(url: string) {
    const responseBodyJson = () => this.responseBodyJson;

    this.server = setupServer(
      http.post(url, ({ request }) => {
        this.request = request;

        return HttpResponse.json(responseBodyJson());
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
      this.responseBodyJson = {};
      this.request = undefined;
    });
    afterEach(() => this.server.resetHandlers());
    afterAll(() => this.server.close());
  }
}
