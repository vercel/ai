import { JSONValue } from '@ai-sdk/provider';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

export type UrlHandler =
  | {
      type: 'json-value';
      response?: {
        headers?: Record<string, string>;
        body: JSONValue;
      };
    }
  | {
      type: 'binary';
      response?: {
        headers?: Record<string, string>;
        body: Buffer;
      };
    };

export type FullUrlHandler =
  | {
      type: 'json-value';
      response:
        | {
            headers: Record<string, string> | undefined;
            body: JSONValue;
          }
        | undefined;
    }
  | {
      type: 'binary';
      response:
        | {
            headers: Record<string, string> | undefined;
            body: Buffer;
          }
        | undefined;
    };

// Mapped type for URLS
export type FullHandlers<URLS extends { [url: string]: UrlHandler }> = {
  [url in keyof URLS]: URLS[url] extends { type: 'json-value' }
    ? {
        type: 'json-value';
        response:
          | {
              headers?: Record<string, string>;
              body: JSONValue;
            }
          | undefined;
      }
    : {
        type: 'binary';
        response:
          | {
              headers?: Record<string, string>;
              body: Buffer;
            }
          | undefined;
      };
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
  const mswServer = setupServer(
    ...Object.entries(routes).map(([url, handler]) => {
      return http.all(url, ({ request, params }) => {
        calls.push(new TestServerCall(request));

        const handlerType = handler.type;
        switch (handlerType) {
          case 'json-value':
            return HttpResponse.json(handler.response?.body, {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                ...handler.response?.headers,
              },
            });

          case 'binary': {
            return HttpResponse.arrayBuffer(handler.response?.body, {
              status: 200,
              headers: handler.response?.headers,
            });
          }

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
