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
  | {
      type: 'controlled-stream';
      id?: string;
    }
  | {
      type: 'error';
      status: number;
      content?: string;
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
  pushController,
}: {
  responses: Array<TestServerResponse> | TestServerResponse;
  pushCall: (call: TestServerCall) => void;
  pushController: (
    id: string,
    controller: () => ReadableStreamDefaultController<string>,
  ) => void;
}) {
  // group responses by url
  const responsesArray = Array.isArray(responses) ? responses : [responses];
  const responsesByUrl = responsesArray.reduce((responsesByUrl, response) => {
    if (!responsesByUrl[response.url]) {
      responsesByUrl[response.url] = [];
    }
    responsesByUrl[response.url].push(response);
    return responsesByUrl;
  }, {} as Record<string, Array<TestServerResponse>>);

  // create stream/streamController pairs for controlled-stream responses
  const streams = {} as Record<string, ReadableStream<string>>;
  responsesArray
    .filter(
      (
        response,
      ): response is TestServerResponse & { type: 'controlled-stream' } =>
        response.type === 'controlled-stream',
    )
    .forEach(response => {
      let streamController: ReadableStreamDefaultController<string>;

      const stream = new ReadableStream<string>({
        start(controller) {
          streamController = controller;
        },
      });

      pushController(response.id ?? '', () => streamController);
      streams[response.id ?? ''] = stream;
    });

  // keep track of url invocation counts:
  const urlInvocationCounts = Object.fromEntries(
    Object.entries(responsesByUrl).map(([url]) => [url, 0]),
  );

  return setupServer(
    ...Object.entries(responsesByUrl).map(([url, responses]) => {
      return http.post(url, ({ request }) => {
        pushCall(new TestServerCall(request));

        const invocationCount = urlInvocationCounts[url]++;
        const response =
          responses[
            invocationCount > responses.length
              ? responses.length - 1
              : invocationCount
          ];

        switch (response.type) {
          case 'json-value':
            return HttpResponse.json(response.content, {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                ...response.headers,
              },
            });

          case 'stream-values':
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

          case 'controlled-stream': {
            return new HttpResponse(
              streams[response.id ?? ''].pipeThrough(new TextEncoderStream()),
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

          case 'error':
            return HttpResponse.text(response.content ?? 'Error', {
              status: response.status,
              headers: {
                ...response.headers,
              },
            });
        }
      });
    }),
  );
}

export function withTestServer(
  responses: Array<TestServerResponse> | TestServerResponse,
  testFunction: (options: {
    calls: () => Array<TestServerCall>;
    call: (index: number) => TestServerCall;
    getStreamController: (
      id: string,
    ) => ReadableStreamDefaultController<string>;
    streamController: ReadableStreamDefaultController<string>;
  }) => Promise<void>,
) {
  return async () => {
    const calls: Array<TestServerCall> = [];
    const controllers: Record<
      string,
      () => ReadableStreamDefaultController<string>
    > = {};
    const server = createServer({
      responses,
      pushCall: call => calls.push(call),
      pushController: (id, controller) => {
        controllers[id] = controller;
      },
    });

    try {
      server.listen();

      await testFunction({
        calls: () => calls,
        call: (index: number) => calls[index],
        getStreamController: (id: string) => {
          return controllers[id]();
        },
        get streamController() {
          return controllers['']();
        },
      });
    } finally {
      server.close();
    }
  };
}

export function describeWithTestServer(
  description: string,
  responses: Array<TestServerResponse> | TestServerResponse,
  testFunction: (options: {
    calls: () => Array<TestServerCall>;
    call: (index: number) => TestServerCall;
    getStreamController: (
      id: string,
    ) => ReadableStreamDefaultController<string>;
    streamController: ReadableStreamDefaultController<string>;
  }) => void,
) {
  describe(description, () => {
    let calls: Array<TestServerCall>;
    let controllers: Record<
      string,
      () => ReadableStreamDefaultController<string>
    >;
    let server: ReturnType<typeof setupServer>;

    beforeAll(() => {
      server = createServer({
        responses,
        pushCall: call => calls.push(call),
        pushController: (id, controller) => {
          controllers[id] = controller;
        },
      });
      server.listen();
    });

    beforeEach(() => {
      calls = [];
      controllers = {};
      server.resetHandlers();
    });

    afterAll(() => {
      server.close();
    });

    testFunction({
      calls: () => calls,
      call: (index: number) => calls[index],
      getStreamController: (id: string) => controllers[id](),
      get streamController() {
        return controllers['']();
      },
    });
  });
}
