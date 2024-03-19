import { HttpResponse, http } from 'msw';
import { SetupServer, setupServer } from 'msw/node';

export class JsonTestServer {
  readonly server: SetupServer;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  responseBodyJson: any = {};

  constructor(url: string) {
    const responseBodyJson = () => this.responseBodyJson;

    this.server = setupServer(
      http.post(url, () => HttpResponse.json(responseBodyJson())),
    );
  }

  setupTestEnvironment() {
    beforeAll(() => this.server.listen());
    beforeEach(() => {
      this.responseBodyJson = {};
    });
    afterEach(() => this.server.resetHandlers());
    afterAll(() => this.server.close());
  }
}
