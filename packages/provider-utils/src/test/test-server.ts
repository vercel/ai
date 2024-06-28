import { HttpResponse, JsonBodyType, http } from 'msw';
import { setupServer } from 'msw/node';
import { convertArrayToReadableStream } from './convert-array-to-readable-stream';

export type TestServerJsonBodyType = JsonBodyType;

export type TestServerResponse = {
  url: string;
  headers?: Record<string, string>;
} & (
  | {
      type: 'json-value';
      content: TestServerJsonBodyType;
    }
  | {
      type: 'stream-values';
      content: Array<string>;
    }
);

class TestServerCall {
  constructor(private request: Request) {}

  async getRequestBodyJson() {
    expect(this.request).toBeDefined();
    return JSON.parse(await this.request!.text());
  }

  getRequestHeaders() {
    expect(this.request).toBeDefined();
    const requestHeaders = this.request!.headers;

    // convert headers to object for easier comparison
    const headersObject: Record<string, string> = {};
    requestHeaders.forEach((value, key) => {
      headersObject[key] = value;
    });

    return headersObject;
  }

  getRequestUrlSearchParams() {
    expect(this.request).toBeDefined();
    return new URL(this.request!.url).searchParams;
  }
}

function createServer({
  responses,
  pushCall,
}: {
  responses: TestServerResponse[];
  pushCall: (call: TestServerCall) => void;
}) {
  return setupServer(
    ...responses.map(response => {
      return http.post(response.url, ({ request }) => {
        pushCall(new TestServerCall(request));

        switch (response.type) {
          case 'json-value': {
            return HttpResponse.json(response.content, {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                ...response.headers,
              },
            });
          }

          case 'stream-values': {
            return new HttpResponse(
              convertArrayToReadableStream(response.content).pipeThrough(
                new TextEncoderStream(),
              ),
              {
                status: 200,
                headers: {
                  'Content-Type': 'text/event-stream',
                  'Cache-Control': 'no-cache',
                  Connection: 'keep-alive',
                  ...response.headers,
                },
              },
            );
          }
        }
      });
    }),
  );
}

export function withTestServer(
  responses: Array<TestServerResponse>,
  testFunction: (options: {
    calls: () => Array<TestServerCall>;
    call: (index: number) => TestServerCall;
  }) => void,
) {
  return () => {
    const calls: Array<TestServerCall> = [];
    const server = createServer({
      responses,
      pushCall: call => calls.push(call),
    });

    try {
      server.listen();

      testFunction({
        calls: () => calls,
        call: (index: number) => calls[index],
      });
    } finally {
      server.close();
    }
  };
}

export function describeWithTestServer(
  description: string,
  responses: Array<TestServerResponse>,
  testFunction: (options: {
    calls: () => Array<TestServerCall>;
    call: (index: number) => TestServerCall;
  }) => void,
) {
  describe(description, () => {
    let calls: Array<TestServerCall>;
    let server: ReturnType<typeof setupServer>;

    beforeAll(() => {
      server = createServer({
        responses,
        pushCall: call => calls.push(call),
      });
      server.listen();
    });

    beforeEach(() => {
      calls = [];
      server.resetHandlers();
    });

    afterAll(() => {
      server.close();
    });

    testFunction({
      calls: () => calls,
      call: (index: number) => calls[index],
    });
  });
}
