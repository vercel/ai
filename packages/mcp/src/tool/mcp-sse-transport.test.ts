import {
  createTestServer,
  TestResponseController,
} from '@ai-sdk/test-server/with-vitest';
import { MCPClientError } from '../error/mcp-client-error';
import { deserializeMessage, SseMCPTransport } from './mcp-sse-transport';
import { beforeEach, describe, expect, it, vi } from 'vitest';
<<<<<<< HEAD
import { LATEST_PROTOCOL_VERSION } from './types';
=======
import { LATEST_LEGACY_PROTOCOL_VERSION } from './types';
import type { OAuthClientProvider } from './oauth';
import type { OAuthTokens } from './oauth-types';

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => {};
  const promise = new Promise<void>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
>>>>>>> 4b5cb49077 (fix: Prevent redundant legacy SSE OAuth refreshes for concurrent or late stale-token 401 responses (#20943))

describe('SseMCPTransport', () => {
  const server = createTestServer({
    'http://localhost:3000/sse': {},
    'http://localhost:3000/messages': {
      response: {
        type: 'json-value',
        body: {
          ok: true,
          message: 'Created',
          code: 201,
        },
      },
    },
    'http://localhost:3333/sse': {},
    'http://localhost:3333/messages': {
      response: {
        type: 'json-value',
        body: {
          ok: true,
        },
      },
    },
  });

  let transport: SseMCPTransport;

  beforeEach(() => {
    transport = new SseMCPTransport({
      url: 'http://localhost:3000/sse',
    });
  });

  it('should establish connection and receive endpoint', async () => {
    const controller = new TestResponseController();

    server.urls['http://localhost:3000/sse'].response = {
      type: 'controlled-stream',
      controller,
    };

    const connectPromise = transport.start();

    controller.write(
      'event: endpoint\ndata: http://localhost:3000/messages\n\n',
    );

    await connectPromise;
    await transport.close();

    expect(server.calls).toHaveLength(1);
    expect(server.calls[0].requestMethod).toBe('GET');
    expect(server.calls[0].requestUrl).toBe('http://localhost:3000/sse');
    expect(server.calls[0].requestHeaders).toEqual({
      'mcp-protocol-version': LATEST_PROTOCOL_VERSION,
      accept: 'text/event-stream',
    });
  });

  it('should throw if server returns non-200 status', async () => {
    server.urls['http://localhost:3000/sse'].response = {
      type: 'error',
      status: 500,
      body: 'Internal Server Error',
    };

    await expect(transport.start()).rejects.toThrow();
  });

  it('should handle valid JSON-RPC messages', async () => {
    const controller = new TestResponseController();

    server.urls['http://localhost:3000/sse'].response = {
      type: 'controlled-stream',
      controller,
    };

    const messagePromise = new Promise(resolve => {
      transport.onmessage = msg => resolve(msg);
    });

    const connectPromise = transport.start();

    controller.write(
      'event: endpoint\ndata: http://localhost:3000/messages\n\n',
    );

    await connectPromise;

    const testMessage = {
      jsonrpc: '2.0' as const,
      method: 'test',
      params: { foo: 'bar' },
      id: '1',
    };

    controller.write(
      `event: message\ndata: ${JSON.stringify(testMessage)}\n\n`,
    );

    expect(await messagePromise).toEqual(testMessage);

    await transport.close();
  });

  it('should handle JSON-RPC messages without explicit event field', async () => {
    const controller = new TestResponseController();

    server.urls['http://localhost:3000/sse'].response = {
      type: 'controlled-stream',
      controller,
    };

    const messagePromise = new Promise(resolve => {
      transport.onmessage = msg => resolve(msg);
    });

    const connectPromise = transport.start();

    controller.write(
      'event: endpoint\ndata: http://localhost:3000/messages\n\n',
    );

    await connectPromise;

    const testMessage = {
      jsonrpc: '2.0' as const,
      method: 'test',
      params: { foo: 'bar' },
      id: '1',
    };

    controller.write(`data: ${JSON.stringify(testMessage)}\n\n`);

    expect(await messagePromise).toEqual(testMessage);

    await transport.close();
  });

  it('should handle invalid JSON-RPC messages', async () => {
    const controller = new TestResponseController();

    server.urls['http://localhost:3000/sse'].response = {
      type: 'controlled-stream',
      controller,
    };

    const errorPromise = new Promise<unknown>(resolve => {
      transport.onerror = err => resolve(err);
    });

    const connectPromise = transport.start();

    controller.write(
      'event: endpoint\ndata: http://localhost:3000/messages\n\n',
    );
    await connectPromise;

    const invalidMessage = { foo: 'bar' };
    controller.write(
      `event: message\ndata: ${JSON.stringify(invalidMessage)}\n\n`,
    );

    const error = await errorPromise;
    expect(error).toBeInstanceOf(MCPClientError);
    expect((error as Error).message).toContain('Failed to parse message');

    await transport.close();
  });

  it('should reject SSE messages containing __proto__ (prototype pollution)', async () => {
    const controller = new TestResponseController();

    server.urls['http://localhost:3000/sse'].response = {
      type: 'controlled-stream',
      controller,
    };

    const errorPromise = new Promise<unknown>(resolve => {
      transport.onerror = err => resolve(err);
    });

    const connectPromise = transport.start();

    controller.write(
      'event: endpoint\ndata: http://localhost:3000/messages\n\n',
    );
    await connectPromise;

    const malicious =
      '{"jsonrpc":"2.0","id":1,"result":{"__proto__":{"polluted":true}}}';
    controller.write(`event: message\ndata: ${malicious}\n\n`);

    const error = await errorPromise;
    expect(error).toBeInstanceOf(MCPClientError);
    expect({
      message: (error as Error).message,
      cause: ((error as { cause?: Error }).cause as Error | undefined)?.message,
    }).toMatchInlineSnapshot(`
      {
        "cause": "JSON parsing failed: Text: {"jsonrpc":"2.0","id":1,"result":{"__proto__":{"polluted":true}}}.
      Error message: Object contains forbidden prototype property",
        "message": "MCP SSE Transport Error: Failed to parse message",
      }
    `);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();

    await transport.close();
  });

  it('should send messages as POST requests', async () => {
    const controller = new TestResponseController();

    server.urls['http://localhost:3000/sse'].response = {
      type: 'controlled-stream',
      controller,
    };

    const connectPromise = transport.start();
    controller.write(
      'event: endpoint\ndata: http://localhost:3000/messages\n\n',
    );
    await connectPromise;

    const message = {
      jsonrpc: '2.0' as const,
      method: 'test',
      params: { foo: 'bar' },
      id: '1',
    };

    await transport.send(message);

    expect(server.calls).toHaveLength(2);
    expect(server.calls[1].requestMethod).toBe('POST');
    expect(server.calls[1].requestUrl).toBe('http://localhost:3000/messages');
    expect(await server.calls[1].requestBodyJson).toEqual(message);

    await transport.close();
  });

  it.each(['simultaneous', 'after-save'] as const)(
    'should share one OAuth refresh for %s stale 401 responses',
    async timing => {
      const serverUrl = 'https://mcp.test/';
      const endpointUrl = `${serverUrl}messages`;
      const authorizationServerUrl = 'https://auth.test/';
      const tokenEndpoint = `${authorizationServerUrl}token`;
      const firstRefreshSaved = deferred();
      const bothOldTokenRequestsStarted = deferred();
      let streamController:
        | ReadableStreamDefaultController<Uint8Array>
        | undefined;
      let tokens: OAuthTokens = {
        access_token: 'access-old',
        refresh_token: 'refresh-stable',
        token_type: 'Bearer',
        issuer: authorizationServerUrl,
        authorization_server: authorizationServerUrl,
        token_endpoint: tokenEndpoint,
      };
      let validAccessToken = tokens.access_token;
      let refreshes = 0;
      let oldTokenRequests = 0;

      const authProvider: OAuthClientProvider = {
        tokens: () => tokens,
        saveTokens: nextTokens => {
          tokens = nextTokens;
          firstRefreshSaved.resolve();
        },
        redirectToAuthorization: vi.fn(),
        saveCodeVerifier: vi.fn(),
        codeVerifier: () => 'verifier',
        redirectUrl: 'https://app.test/oauth/callback',
        clientMetadata: {
          redirect_uris: ['https://app.test/oauth/callback'],
        },
        clientInformation: () => ({ client_id: 'client' }),
      };

      const fetch = vi.fn(
        async (
          input: RequestInfo | URL,
          init?: RequestInit,
        ): Promise<Response> => {
          const request = new Request(input, init);

          if (request.url === serverUrl && request.method === 'GET') {
            return new Response(
              new ReadableStream<Uint8Array>({
                start(controller) {
                  streamController = controller;
                  controller.enqueue(
                    new TextEncoder().encode(
                      `event: endpoint\ndata: ${endpointUrl}\n\n`,
                    ),
                  );
                },
              }),
              { headers: { 'content-type': 'text/event-stream' } },
            );
          }

          if (request.url.endsWith('/.well-known/oauth-protected-resource')) {
            return Response.json({
              resource: serverUrl,
              authorization_servers: [authorizationServerUrl],
            });
          }

          if (
            request.url ===
            `${authorizationServerUrl}.well-known/oauth-authorization-server`
          ) {
            return Response.json({
              issuer: authorizationServerUrl,
              authorization_endpoint: `${authorizationServerUrl}authorize`,
              token_endpoint: tokenEndpoint,
              response_types_supported: ['code'],
              grant_types_supported: ['refresh_token'],
              token_endpoint_auth_methods_supported: ['none'],
            });
          }

          if (request.url === tokenEndpoint && request.method === 'POST') {
            if (timing === 'simultaneous') {
              await bothOldTokenRequestsStarted.promise;
            }
            refreshes += 1;
            validAccessToken = `access-${refreshes}`;
            return Response.json({
              access_token: validAccessToken,
              refresh_token: 'refresh-stable',
              token_type: 'Bearer',
            });
          }

          if (request.url === endpointUrl && request.method === 'POST') {
            if (
              request.headers.get('authorization') !==
              `Bearer ${validAccessToken}`
            ) {
              oldTokenRequests += 1;
              if (oldTokenRequests === 2) {
                bothOldTokenRequestsStarted.resolve();
              }
              if (timing === 'after-save' && oldTokenRequests === 2) {
                await firstRefreshSaved.promise;
              }
              return new Response(null, { status: 401 });
            }

            return new Response(null, { status: 202 });
          }

          return new Response(null, { status: 404 });
        },
      );

      transport = new SseMCPTransport({
        url: serverUrl,
        authProvider,
        fetch,
      });
      await transport.start();
      validAccessToken = 'access-invalidated';

      await Promise.all([
        transport.send({
          jsonrpc: '2.0',
          method: 'resources/list',
          id: 1,
        }),
        transport.send({
          jsonrpc: '2.0',
          method: 'resources/list',
          id: 2,
        }),
      ]);

      expect(refreshes).toBe(1);
      expect(oldTokenRequests).toBe(2);
      expect(streamController).toBeDefined();
      await transport.close();
    },
  );

  it('should abort a hanging POST with the request signal', async () => {
    let resolveSseController: (
      controller: ReadableStreamDefaultController<Uint8Array>,
    ) => void;
    const sseControllerPromise = new Promise<
      ReadableStreamDefaultController<Uint8Array>
    >(resolve => {
      resolveSseController = resolve;
    });
    let resolvePostStarted: () => void;
    const postStarted = new Promise<void>(resolve => {
      resolvePostStarted = resolve;
    });
    let postAborted = false;
    const fetch = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method !== 'POST') {
          return new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                resolveSseController(controller);
              },
            }),
            { headers: { 'content-type': 'text/event-stream' } },
          );
        }

        resolvePostStarted();
        return new Promise<Response>((_, reject) => {
          const signal = init.signal as AbortSignal;
          signal.addEventListener(
            'abort',
            () => {
              postAborted = true;
              reject(signal.reason);
            },
            { once: true },
          );
        });
      },
    );
    transport = new SseMCPTransport({
      url: 'http://localhost:3000/sse',
      fetch,
    });

    const connectPromise = transport.start();
    const sseController = await sseControllerPromise;
    sseController.enqueue(
      new TextEncoder().encode(
        'event: endpoint\ndata: http://localhost:3000/messages\n\n',
      ),
    );
    await connectPromise;

    const abortController = new AbortController();
    const abortReason = new Error('stop POST');
    const sendPromise = transport.send(
      {
        jsonrpc: '2.0' as const,
        method: 'test',
        params: {},
        id: '1',
      },
      { signal: abortController.signal },
    );

    await postStarted;
    abortController.abort(abortReason);

    await expect(sendPromise).rejects.toBe(abortReason);
    expect(postAborted).toBe(true);
    await transport.close();
  });

  it('should reject cross-origin endpoints before connecting', async () => {
    const controller = new TestResponseController();

    server.urls['http://localhost:3000/sse'].response = {
      type: 'controlled-stream',
      controller,
    };

    const errorPromise = new Promise<unknown>(resolve => {
      transport.onerror = err => resolve(err);
    });

    const connectPromise = transport.start();
    controller.write(
      'event: endpoint\ndata: http://localhost:3333/messages\n\n',
    );

    await expect(connectPromise).rejects.toThrow(
      'Endpoint origin does not match connection origin: http://localhost:3333',
    );

    const error = await errorPromise;
    expect(error).toBeInstanceOf(MCPClientError);
    expect(transport['connected']).toBe(false);
    expect(transport['endpoint']).toBeUndefined();

    await expect(
      transport.send({
        jsonrpc: '2.0' as const,
        method: 'test',
        params: {},
        id: '1',
      }),
    ).rejects.toThrow('Not connected');

    await transport.close();
  });

  it('should ignore endpoint events after connecting', async () => {
    const controller = new TestResponseController();

    server.urls['http://localhost:3000/sse'].response = {
      type: 'controlled-stream',
      controller,
    };

    const connectPromise = transport.start();
    controller.write(
      'event: endpoint\ndata: http://localhost:3000/messages\n\n',
    );
    await connectPromise;

    controller.write(
      'event: endpoint\ndata: http://localhost:3333/messages\n\n',
    );
    await new Promise(resolve => setTimeout(resolve, 0));

    const message = {
      jsonrpc: '2.0' as const,
      method: 'test',
      params: { foo: 'bar' },
      id: '1',
    };

    await transport.send(message);

    const postCalls = server.calls.filter(c => c.requestMethod === 'POST');
    expect(postCalls).toHaveLength(1);
    expect(postCalls[0].requestUrl).toBe('http://localhost:3000/messages');

    await transport.close();
  });

  it('should reject non-2xx POST responses with HTTP details', async () => {
    const controller = new TestResponseController();

    server.urls['http://localhost:3000/sse'].response = {
      type: 'controlled-stream',
      controller,
    };

    server.urls['http://localhost:3000/messages'].response = {
      type: 'error',
      status: 500,
      body: 'Internal Server Error',
    };

    let reportedError: unknown;
    transport.onerror = error => {
      reportedError = error;
    };

    const connectPromise = transport.start();
    controller.write(
      'event: endpoint\ndata: http://localhost:3000/messages\n\n',
    );
    await connectPromise;

    const message = {
      jsonrpc: '2.0' as const,
      method: 'test',
      params: { foo: 'bar' },
      id: '1',
    };

    await expect(transport.send(message)).rejects.toMatchObject({
      message:
        'MCP SSE Transport Error: POSTing to endpoint (HTTP 500): Internal Server Error',
      statusCode: 500,
      url: 'http://localhost:3000/messages',
      responseBody: 'Internal Server Error',
    });
    expect(reportedError).toBeInstanceOf(MCPClientError);
    expect(reportedError).toMatchObject({
      statusCode: 500,
      url: 'http://localhost:3000/messages',
      responseBody: 'Internal Server Error',
    });
    expect(transport['connected']).toBe(true);

    await transport.close();
  });

  it('should handle invalid endpoint URLs', async () => {
    server.urls['http://localhost:3333/sse'].response = {
      type: 'error',
      status: 500,
      body: 'Internal Server Error',
    };

    transport = new SseMCPTransport({
      url: 'http://localhost:3333/sse',
    });

    const errorPromise = new Promise<unknown>(resolve => {
      transport.onerror = err => resolve(err);
    });

    const connectPromise = transport.start();

    await expect(connectPromise).rejects.toThrow();

    const error = await errorPromise;
    expect((error as Error).message).toContain(
      'MCP SSE Transport Error: 500 Internal Server Error',
    );
  });

  it('should send custom headers with all requests', async () => {
    const controller = new TestResponseController();

    server.urls['http://localhost:3000/sse'].response = {
      type: 'controlled-stream',
      controller,
    };

    const customHeaders = {
      authorization: 'Bearer test-token',
      'x-custom-header': 'test-value',
    };

    transport = new SseMCPTransport({
      url: 'http://localhost:3000/sse',
      headers: customHeaders,
    });

    const connectPromise = transport.start();

    controller.write(
      'event: endpoint\ndata: http://localhost:3000/messages\n\n',
    );

    await connectPromise;

    const message = {
      jsonrpc: '2.0' as const,
      method: 'test',
      params: { foo: 'bar' },
      id: '1',
    };

    await transport.send(message);

    // Verify SSE connection headers
    expect(server.calls[0].requestHeaders).toEqual({
      'mcp-protocol-version': LATEST_PROTOCOL_VERSION,
      accept: 'text/event-stream',
      ...customHeaders,
    });
    expect(server.calls[0].requestUserAgent).toContain('ai-sdk/');

    // Verify POST request headers
    expect(server.calls[1].requestHeaders).toEqual({
      'content-type': 'application/json',
      'mcp-protocol-version': LATEST_PROTOCOL_VERSION,
      ...customHeaders,
    });
    expect(server.calls[1].requestUserAgent).toContain('ai-sdk/');

    await transport.close();
  });

  describe('redirect option', () => {
    it('should pass redirect: error to GET fetch on start()', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const controller = new TestResponseController();
      server.urls['http://localhost:3000/sse'].response = {
        type: 'controlled-stream',
        controller,
      };

      transport = new SseMCPTransport({
        url: 'http://localhost:3000/sse',
        redirect: 'error',
      });

      const connectPromise = transport.start();
      controller.write(
        'event: endpoint\ndata: http://localhost:3000/messages\n\n',
      );
      await connectPromise;

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:3000/sse',
        expect.objectContaining({ redirect: 'error' }),
      );

      await transport.close();
      fetchSpy.mockRestore();
    });

    it('should pass redirect: error to POST fetch on send()', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const controller = new TestResponseController();
      server.urls['http://localhost:3000/sse'].response = {
        type: 'controlled-stream',
        controller,
      };

      transport = new SseMCPTransport({
        url: 'http://localhost:3000/sse',
        redirect: 'error',
      });

      const connectPromise = transport.start();
      controller.write(
        'event: endpoint\ndata: http://localhost:3000/messages\n\n',
      );
      await connectPromise;

      fetchSpy.mockClear();

      await transport.send({
        jsonrpc: '2.0' as const,
        method: 'test',
        params: {},
        id: '1',
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ redirect: 'error' }),
      );

      await transport.close();
      fetchSpy.mockRestore();
    });

    it('should default redirect to follow', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const controller = new TestResponseController();
      server.urls['http://localhost:3000/sse'].response = {
        type: 'controlled-stream',
        controller,
      };

      transport = new SseMCPTransport({
        url: 'http://localhost:3000/sse',
      });

      const connectPromise = transport.start();
      controller.write(
        'event: endpoint\ndata: http://localhost:3000/messages\n\n',
      );
      await connectPromise;

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:3000/sse',
        expect.objectContaining({ redirect: 'follow' }),
      );

      await transport.close();
      fetchSpy.mockRestore();
    });
  });

  describe('custom fetch', () => {
    it('should use provided fetch function for SSE connection', async () => {
      const controller = new TestResponseController();
      server.urls['http://localhost:3000/sse'].response = {
        type: 'controlled-stream',
        controller,
      };

      const customFetch = vi.fn(globalThis.fetch);

      transport = new SseMCPTransport({
        url: 'http://localhost:3000/sse',
        fetch: customFetch,
      });

      const connectPromise = transport.start();
      controller.write(
        'event: endpoint\ndata: http://localhost:3000/messages\n\n',
      );
      await connectPromise;

      expect(customFetch).toHaveBeenCalledWith(
        'http://localhost:3000/sse',
        expect.objectContaining({ headers: expect.anything() }),
      );

      await transport.close();
    });

    it('should use provided fetch function for POST send()', async () => {
      const controller = new TestResponseController();
      server.urls['http://localhost:3000/sse'].response = {
        type: 'controlled-stream',
        controller,
      };
      server.urls['http://localhost:3000/messages'].response = {
        type: 'empty',
        status: 200,
      };

      const customFetch = vi.fn(globalThis.fetch);

      transport = new SseMCPTransport({
        url: 'http://localhost:3000/sse',
        fetch: customFetch,
      });

      const connectPromise = transport.start();
      controller.write(
        'event: endpoint\ndata: http://localhost:3000/messages\n\n',
      );
      await connectPromise;

      customFetch.mockClear();

      await transport.send({
        jsonrpc: '2.0' as const,
        method: 'test',
        params: {},
        id: '1',
      });

      expect(customFetch).toHaveBeenCalledWith(
        'http://localhost:3000/messages',
        expect.objectContaining({ method: 'POST' }),
      );

      await transport.close();
    });
  });

  describe('protocol version downgrade', () => {
    it('should use negotiated protocolVersion in POST headers after it is set', async () => {
      const controller = new TestResponseController();

      server.urls['http://localhost:3000/sse'].response = {
        type: 'controlled-stream',
        controller,
        headers: { 'content-type': 'text/event-stream' },
      };

      const connectPromise = transport.start();
      controller.write(
        'event: endpoint\ndata: http://localhost:3000/messages\n\n',
      );
      await connectPromise;

      // Simulate protocol version negotiation
      transport.protocolVersion = '2025-06-18';

      await transport.send({
        jsonrpc: '2.0' as const,
        method: 'tools/list',
        params: {},
        id: '1',
      });

      const postCall = server.calls.find(c => c.requestMethod === 'POST');
      expect(postCall?.requestHeaders['mcp-protocol-version']).toBe(
        '2025-06-18',
      );

      await transport.close();
    });
  });
});

describe('deserializeMessage', () => {
  it('should reject payloads containing __proto__ (prototype pollution)', async () => {
    const malicious =
      '{"jsonrpc":"2.0","id":1,"result":{"__proto__":{"polluted":true}}}';

    await expect(
      deserializeMessage(malicious),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `
      [AI_JSONParseError: JSON parsing failed: Text: {"jsonrpc":"2.0","id":1,"result":{"__proto__":{"polluted":true}}}.
      Error message: Object contains forbidden prototype property]
    `,
    );
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('should reject payloads containing constructor.prototype', async () => {
    const malicious =
      '{"jsonrpc":"2.0","id":1,"result":{"constructor":{"prototype":{"polluted":true}}}}';

    await expect(
      deserializeMessage(malicious),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `
      [AI_JSONParseError: JSON parsing failed: Text: {"jsonrpc":"2.0","id":1,"result":{"constructor":{"prototype":{"polluted":true}}}}.
      Error message: Object contains forbidden prototype property]
    `,
    );
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
