import { http, HttpResponse, JsonBodyType } from 'msw';
import { setupServer } from 'msw/node';
import { convertArrayToReadableStream } from './convert-array-to-readable-stream';

export type UrlHandler = {
  response?:
    | {
        type: 'json-value';
        headers?: Record<string, string>;
        body: JsonBodyType;
      }
    | {
        type: 'stream-chunks';
        headers?: Record<string, string>;
        chunks: Array<string>;
      }
    | {
        type: 'binary';
        headers?: Record<string, string>;
        body: Buffer;
      }
    | {
        type: 'empty';
        headers?: Record<string, string>;
        status?: number;
      }
    | {
        type: 'error';
        headers?: Record<string, string>;
        status?: number;
        body?: string;
      }
    | {
        type: 'readable-stream';
        headers?: Record<string, string>;
        stream: ReadableStream;
      }
    | undefined;
};

export type FullUrlHandler = {
  response:
    | {
        type: 'json-value';
        headers?: Record<string, string>;
        body: JsonBodyType;
      }
    | {
        type: 'stream-chunks';
        headers?: Record<string, string>;
        chunks: Array<string>;
      }
    | {
        type: 'binary';
        headers?: Record<string, string>;
        body: Buffer;
      }
    | {
        type: 'error';
        headers?: Record<string, string>;
        status: number;
        body?: string;
      }
    | {
        type: 'empty';
        headers?: Record<string, string>;
        status?: number;
      }
    | {
        type: 'readable-stream';
        headers?: Record<string, string>;
        stream: ReadableStream;
      }
    | undefined;
};

export type FullHandlers<URLS extends { [url: string]: UrlHandler }> = {
  [url in keyof URLS]: FullUrlHandler;
};

class TestServerCall {
  constructor(private request: Request) {}

  get requestBody() {
    return this.request!.text().then(JSON.parse);
  }

  get requestHeaders() {
    const requestHeaders = this.request!.headers;

    // convert headers to object for easier comparison
    const headersObject: Record<string, string> = {};
    requestHeaders.forEach((value, key) => {
      headersObject[key] = value;
    });

    return headersObject;
  }

  get requestUrlSearchParams() {
    return new URL(this.request!.url).searchParams;
  }

  get requestUrl() {
    return this.request!.url;
  }

  get requestMethod() {
    return this.request!.method;
  }
}

export function createTestServer<URLS extends { [url: string]: UrlHandler }>(
  routes: URLS,
): {
  urls: FullHandlers<URLS>;
  calls: TestServerCall[];
} {
  const originalRoutes = structuredClone(routes); // deep copy

  const mswServer = setupServer(
    ...Object.entries(routes).map(([url, handler]) => {
      return http.all(url, ({ request, params }) => {
        calls.push(new TestServerCall(request));

        const response = handler.response;

        if (response === undefined) {
          return HttpResponse.json({ error: 'Not Found' }, { status: 404 });
        }

        const handlerType = response.type;

        switch (handlerType) {
          case 'json-value':
            return HttpResponse.json(response.body, {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                ...handler.response?.headers,
              },
            });

          case 'stream-chunks':
            return new HttpResponse(
              convertArrayToReadableStream(response.chunks).pipeThrough(
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

          case 'readable-stream': {
            return new HttpResponse(
              response.stream.pipeThrough(new TextEncoderStream()),
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

          case 'binary': {
            return HttpResponse.arrayBuffer(response.body, {
              status: 200,
              headers: handler.response?.headers,
            });
          }

          case 'error':
            return HttpResponse.text(response.body ?? 'Error', {
              status: response.status ?? 500,
              headers: response.headers,
            });

          case 'empty':
            return new HttpResponse(null, {
              status: response.status ?? 200,
            });

          default: {
            const _exhaustiveCheck: never = handlerType;
            throw new Error(`Unknown response type: ${_exhaustiveCheck}`);
          }
        }
      });
    }),
  );

  let calls: TestServerCall[] = [];

  beforeAll(() => {
    mswServer.listen();
  });

  beforeEach(() => {
    mswServer.resetHandlers();

    // set the responses back to the original values
    Object.entries(originalRoutes).forEach(([url, handler]) => {
      routes[url].response = handler.response;
    });

    calls = [];
  });

  afterAll(() => {
    mswServer.close();
  });

  return {
    urls: routes as FullHandlers<URLS>,
    get calls() {
      return calls;
    },
  };
}
