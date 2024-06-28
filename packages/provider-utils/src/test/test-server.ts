import { HttpResponse, JsonBodyType, http } from 'msw';
import { setupServer } from 'msw/node';

export type TestServerJsonBodyType = JsonBodyType;

export type TestServerResponse = {
  url: string;
  type: 'json-value';
  content: TestServerJsonBodyType;
  headers?: Record<string, string>;
};

class TestServerCall {
  constructor(private request: Request) {}

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
}

export function withTestServer(
  responses: Array<TestServerResponse>,
  testFunction: (options: {
    calls: () => Array<TestServerCall>;
    call: (index: number) => TestServerCall;
  }) => Promise<void>,
) {
  return async () => {
    const calls: Array<TestServerCall> = [];
    const server = setupServer(
      ...responses.map(response => {
        return http.post(response.url, ({ request }) => {
          calls.push(new TestServerCall(request));

          return HttpResponse.json(response.content, {
            headers: {
              'Content-Type': 'application/json',
              ...response.headers,
            },
          });
        });
      }),
    );

    try {
      server.listen;
      testFunction({
        calls: () => calls,
        call: (index: number) => calls[index],
      });
    } finally {
      server.close();
    }
  };
}
