import { HttpResponse, http } from 'msw';
import { SetupServer, setupServer } from 'msw/node';

export class BinaryTestServer {
  readonly server: SetupServer;
  private endpoints: Map<
    string,
    {
      responseBody: Buffer | null;
      responseHeaders: Record<string, string>;
      responseStatus: number;
      request: Request | undefined;
    }
  > = new Map();

  constructor(urls: string | string[]) {
    const urlList = Array.isArray(urls) ? urls : [urls];

    // Initialize endpoints
    urlList.forEach(url => {
      const normalizedUrl = this.normalizeUrl(url);
      this.endpoints.set(normalizedUrl, {
        responseBody: null,
        responseHeaders: {},
        responseStatus: 200,
        request: undefined,
      });
    });

    this.server = setupServer(
      ...urlList.map(url =>
        http.post(this.normalizeUrl(url), ({ request }) => {
          const endpoint = this.endpoints.get(this.normalizeUrl(request.url));
          if (!endpoint) {
            return new HttpResponse(null, { status: 500 });
          }
          endpoint.request = request;

          if (endpoint.responseBody === null) {
            return new HttpResponse(null, { status: endpoint.responseStatus });
          }

          return new HttpResponse(endpoint.responseBody, {
            status: endpoint.responseStatus,
            headers: endpoint.responseHeaders,
          });
        }),
      ),
    );
  }

  private normalizeUrl(url: string): string {
    try {
      // Parse URL and remove search params for endpoint matching
      const urlObj = new URL(url);
      urlObj.search = ''; // Clear search params for matching
      const normalized = urlObj.toString();
      return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
    } catch {
      // If not a valid URL, assume it's a path and return as-is
      return url.endsWith('/') ? url.slice(0, -1) : url;
    }
  }

  setResponseFor(
    url: string,
    options: {
      body?: Buffer | null;
      headers?: Record<string, string>;
      status?: number;
    },
  ) {
    // Normalize the URL before lookup
    const normalizedUrl = this.normalizeUrl(url);
    const endpoint = this.endpoints.get(normalizedUrl);
    if (!endpoint) {
      throw new Error(`No endpoint configured for URL: ${url}`);
    }
    if (options.body !== undefined) endpoint.responseBody = options.body;
    if (options.headers) endpoint.responseHeaders = options.headers;
    if (options.status) endpoint.responseStatus = options.status;
  }

  async getRequestDataFor(url: string) {
    // Normalize the URL before lookup
    const normalizedUrl = this.normalizeUrl(url);
    const endpoint = this.endpoints.get(normalizedUrl);
    if (!endpoint) {
      throw new Error(`No endpoint configured for URL: ${url}`);
    }
    expect(endpoint.request).toBeDefined();

    return {
      bodyJson: async () => {
        const text = await endpoint.request!.text();
        return JSON.parse(text);
      },
      bodyFormData: async () => {
        const contentType = endpoint.request!.headers.get('content-type');
        if (contentType?.includes('multipart/form-data')) {
          return endpoint.request!.formData();
        }
        throw new Error('Request content-type is not multipart/form-data');
      },
      headers: () => {
        const headersObject: Record<string, string> = {};
        endpoint.request!.headers.forEach((value, key) => {
          headersObject[key] = value;
        });
        return headersObject;
      },
      urlSearchParams: () => new URL(endpoint.request!.url).searchParams,
      url: () => new URL(endpoint.request!.url).toString(),
    };
  }

  setupTestEnvironment() {
    beforeAll(() => this.server.listen());
    beforeEach(() => {
      // Reset all endpoints
      this.endpoints.forEach(endpoint => {
        endpoint.responseBody = null;
        endpoint.request = undefined;
        endpoint.responseHeaders = {};
        endpoint.responseStatus = 200;
      });
    });
    afterEach(() => this.server.resetHandlers());
    afterAll(() => this.server.close());
  }
}
