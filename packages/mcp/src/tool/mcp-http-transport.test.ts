import {
  createTestServer,
  TestResponseController,
} from '@ai-sdk/test-server/with-vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpMCPTransport } from './mcp-http-transport';
import { LATEST_PROTOCOL_VERSION } from './types';
import { MCPClientError } from '../error/mcp-client-error';
import type { OAuthClientProvider } from './oauth';

describe('HttpMCPTransport', () => {
  const server = createTestServer({
    'http://localhost:4000/mcp': {
      response: {
        type: 'json-value',
        body: { jsonrpc: '2.0', id: 1, result: { ok: true } },
        headers: { 'mcp-session-id': 'abc123' },
      },
    },
    'http://localhost:4000/stream': {},
  });

  let transport: HttpMCPTransport;

  beforeEach(() => {
    vi.useFakeTimers();
    transport = new HttpMCPTransport({ url: 'http://localhost:4000/mcp' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should POST JSON and receive JSON response', async () => {
    await transport.start();

    const message = {
      jsonrpc: '2.0' as const,
      method: 'initialize',
      id: 1,
      params: {},
    };

    const messagePromise = new Promise(resolve => {
      transport.onmessage = msg => resolve(msg);
    });

    await transport.send(message);

    const received = await messagePromise;
    expect(received).toEqual({ jsonrpc: '2.0', id: 1, result: { ok: true } });

    expect(server.calls[0].requestMethod).toBe('POST');
    expect(server.calls[0].requestHeaders).toEqual({
      'mcp-protocol-version': LATEST_PROTOCOL_VERSION,
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
    });
  });

  it('should handle text/event-stream responses', async () => {
    transport = new HttpMCPTransport({ url: 'http://localhost:4000/stream' });
    const controller = new TestResponseController();

    server.urls['http://localhost:4000/stream'].response = ({ callNumber }) => {
      switch (callNumber) {
        case 0:
          return {
            type: 'controlled-stream',
            controller,
            headers: { 'content-type': 'text/event-stream' },
          };
        default:
          return { type: 'empty', status: 200 };
      }
    };

    await transport.start();

    const msgPromise = new Promise(resolve => {
      transport.onmessage = msg => resolve(msg);
    });

    const message = {
      jsonrpc: '2.0' as const,
      method: 'initialize',
      id: 2,
      params: {},
    };
    await transport.send(message);

    controller.write(
      `event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: 2, result: { ok: true } })}\n\n`,
    );

    expect(await msgPromise).toEqual({
      jsonrpc: '2.0',
      id: 2,
      result: { ok: true },
    });
  });

  it('should (re)open inbound SSE after 202 Accepted', async () => {
    const controller = new TestResponseController();

    // Call 0 (POST send): 202 -> should trigger inbound SSE open
    // Call 1 (GET after 202): controlled stream opens successfully
    server.urls['http://localhost:4000/mcp'].response = ({ callNumber }) => {
      switch (callNumber) {
        case 0:
          return { type: 'empty', status: 202 };
        case 1:
          return { type: 'controlled-stream', controller };
        default:
          return { type: 'empty', status: 200 };
      }
    };

    await transport.start();

    // POST a request that gets 202
    await transport.send({
      jsonrpc: '2.0' as const,
      method: 'initialize',
      id: 1,
      params: {},
    });

    // openInboundSse() is fire-and-forget, so wait for the GET request to appear
    await vi.waitFor(() => {
      expect(server.calls[1]).toBeDefined();
    });

    expect(server.calls[1].requestMethod).toBe('GET');
    expect(server.calls[1].requestHeaders.accept).toBe('text/event-stream');
  });

  it('should defer inbound SSE until after initialize provides a session', async () => {
    const controller = new TestResponseController();

    server.urls['http://localhost:4000/mcp'].response = ({ callNumber }) => {
      switch (callNumber) {
        case 0:
          return {
            type: 'json-value',
            headers: { 'mcp-session-id': 'initialized-session' },
            body: { jsonrpc: '2.0', id: 1, result: { ok: true } },
          };
        case 1:
          return { type: 'controlled-stream', controller };
        default:
          return { type: 'empty', status: 200 };
      }
    };

    await transport.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(server.calls).toHaveLength(0);

    await transport.send({
      jsonrpc: '2.0' as const,
      method: 'initialize',
      id: 1,
      params: {},
    });

    await vi.waitFor(() => {
      expect(server.calls[1]?.requestMethod).toBe('GET');
    });

    expect(server.calls[1].requestHeaders['mcp-session-id']).toBe(
      'initialized-session',
    );
  });

  it('should cache unsupported inbound SSE until an explicit retry transition', async () => {
    const controller = new TestResponseController();

    server.urls['http://localhost:4000/mcp'].response = ({ callNumber }) => {
      switch (callNumber) {
        case 0:
          return {
            type: 'json-value',
            body: { jsonrpc: '2.0', id: 1, result: { ok: true } },
          };
        case 1:
          return { type: 'error', status: 405 };
        case 2:
          return {
            type: 'json-value',
            body: { jsonrpc: '2.0', id: 2, result: { ok: true } },
          };
        case 3:
          return { type: 'empty', status: 202 };
        case 4:
          return { type: 'controlled-stream', controller };
        default:
          return { type: 'empty', status: 200 };
      }
    };

    await transport.start();
    await transport.send({
      jsonrpc: '2.0' as const,
      method: 'initialize',
      id: 1,
      params: {},
    });

    await vi.waitFor(() => {
      expect(server.calls[1]?.requestMethod).toBe('GET');
    });

    await transport.send({
      jsonrpc: '2.0' as const,
      method: 'tools/list',
      id: 2,
      params: {},
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(server.calls).toHaveLength(3);
    expect(server.calls[2].requestMethod).toBe('POST');

    await transport.send({
      jsonrpc: '2.0' as const,
      method: 'notifications/initialized',
    });

    await vi.waitFor(() => {
      expect(server.calls[4]?.requestMethod).toBe('GET');
    });
    expect(server.calls[4].requestHeaders.accept).toBe('text/event-stream');
  });

  it('should honor forced inbound SSE retry requested while a probe is in flight', async () => {
    let postCalls = 0;
    let getCalls = 0;
    let resolveFirstGet!: (response: Response) => void;

    const fetchFn = vi.fn(
      async (_input: URL | RequestInfo, init?: RequestInit) => {
        if (init?.method === 'GET') {
          getCalls += 1;

          if (getCalls === 1) {
            return new Promise<Response>(resolve => {
              resolveFirstGet = resolve;
            });
          }

          return new Response(null, { status: 405 });
        }

        postCalls += 1;

        if (postCalls === 1) {
          return Response.json({
            jsonrpc: '2.0',
            id: 1,
            result: { ok: true },
          });
        }

        return new Response(null, { status: 202 });
      },
    );

    transport = new HttpMCPTransport({
      url: 'http://localhost:4000/mcp',
      fetch: fetchFn,
    });

    await transport.start();
    await transport.send({
      jsonrpc: '2.0' as const,
      method: 'initialize',
      id: 1,
      params: {},
    });

    await vi.waitFor(() => {
      expect(getCalls).toBe(1);
    });

    await transport.send({
      jsonrpc: '2.0' as const,
      method: 'notifications/initialized',
    });
    expect(getCalls).toBe(1);

    resolveFirstGet(new Response(null, { status: 405 }));

    await vi.waitFor(() => {
      expect(getCalls).toBe(2);
    });
  });

  it('should singleflight concurrent OAuth refreshes', async () => {
    let tokens = {
      access_token: 'expired-token',
      refresh_token: 'refresh-token',
      token_type: 'Bearer',
    };
    let tokenRequests = 0;

    const authProvider: OAuthClientProvider = {
      get redirectUrl() {
        return 'http://localhost:3000/callback';
      },
      get clientMetadata() {
        return {
          redirect_uris: ['http://localhost:3000/callback'],
          client_name: 'Test Client',
        };
      },
      clientInformation: vi.fn().mockResolvedValue({
        client_id: 'test-client',
        client_secret: 'test-secret',
      }),
      tokens: vi.fn(() => tokens),
      saveTokens: vi.fn(newTokens => {
        tokens = newTokens as typeof tokens;
      }),
      redirectToAuthorization: vi.fn(),
      saveCodeVerifier: vi.fn(),
      codeVerifier: vi.fn(),
    };

    const fetchFn = vi.fn(
      async (input: URL | RequestInfo, init?: RequestInit) => {
        const requestUrl =
          input instanceof Request ? input.url : input.toString();

        if (requestUrl === 'http://localhost:4000/mcp') {
          if (init?.method === 'POST') {
            const authorization = new Headers(init.headers).get(
              'authorization',
            );
            if (authorization === 'Bearer refreshed-token') {
              const body = JSON.parse(init.body as string);
              return Response.json({
                jsonrpc: '2.0',
                id: body.id,
                result: { ok: true },
              });
            }

            return new Response('Unauthorized', {
              status: 401,
              headers: {
                'www-authenticate':
                  'Bearer resource_metadata="http://localhost:4000/.well-known/oauth-protected-resource"',
              },
            });
          }

          return new Response(null, { status: 405 });
        }

        if (
          requestUrl ===
          'http://localhost:4000/.well-known/oauth-protected-resource'
        ) {
          return Response.json({
            resource: 'http://localhost:4000/mcp',
            authorization_servers: ['http://localhost:4000'],
          });
        }

        if (
          requestUrl ===
          'http://localhost:4000/.well-known/oauth-authorization-server'
        ) {
          return Response.json({
            issuer: 'http://localhost:4000',
            authorization_endpoint: 'http://localhost:4000/authorize',
            token_endpoint: 'http://localhost:4000/token',
            response_types_supported: ['code'],
            code_challenge_methods_supported: ['S256'],
          });
        }

        if (requestUrl === 'http://localhost:4000/token') {
          tokenRequests += 1;
          return Response.json({
            access_token: 'refreshed-token',
            refresh_token: 'next-refresh-token',
            token_type: 'Bearer',
            expires_in: 3600,
          });
        }

        throw new Error(`Unexpected fetch call: ${requestUrl}`);
      },
    );

    transport = new HttpMCPTransport({
      url: 'http://localhost:4000/mcp',
      authProvider,
      fetch: fetchFn as typeof fetch,
    });

    await transport.start();

    await Promise.all([
      transport.send({
        jsonrpc: '2.0' as const,
        method: 'tools/list',
        id: 1,
        params: {},
      }),
      transport.send({
        jsonrpc: '2.0' as const,
        method: 'prompts/list',
        id: 2,
        params: {},
      }),
    ]);

    expect(tokenRequests).toBe(1);
    expect(authProvider.saveTokens).toHaveBeenCalledTimes(1);
  });

  it('should DELETE to terminate session on close when session exists', async () => {
    // Call 0: POST returns JSON and sets mcp-session-id header
    // Call 1: GET after initialize returns 405 (skip SSE)
    // Call 2: DELETE on close to terminate session
    server.urls['http://localhost:4000/mcp'].response = ({ callNumber }) => {
      switch (callNumber) {
        case 0:
          return {
            type: 'json-value',
            headers: { 'mcp-session-id': 'xyz-session' },
            body: { jsonrpc: '2.0', id: 1, result: { ok: true } },
          };
        case 1:
          return { type: 'error', status: 405 };
        case 2:
          return { type: 'empty', status: 200 };
        default:
          return { type: 'empty', status: 200 };
      }
    };

    await transport.start();
    await transport.send({
      jsonrpc: '2.0' as const,
      method: 'initialize',
      id: 1,
      params: {},
    });

    await vi.waitFor(() => {
      expect(server.calls[1]).toBeDefined();
    });

    await transport.close();

    expect(server.calls[2].requestMethod).toBe('DELETE');
    expect(server.calls[2].requestHeaders['mcp-session-id']).toBe(
      'xyz-session',
    );
  });

  it('should report HTTP errors from POST', async () => {
    transport = new HttpMCPTransport({ url: 'http://localhost:4000/mcp' });

    await transport.start();

    // Now make POST fail
    server.urls['http://localhost:4000/mcp'].response = {
      type: 'error',
      status: 500,
      body: 'Internal Server Error',
    };

    const errorPromise = new Promise(resolve => {
      transport.onerror = e => resolve(e);
    });

    await expect(
      transport.send({
        jsonrpc: '2.0' as const,
        method: 'test',
        id: 3,
        params: {},
      }),
    ).rejects.toThrow('POSTing to endpoint');

    const error = await errorPromise;
    expect(error).toBeInstanceOf(MCPClientError);
    expect((error as Error).message).toContain('POSTing to endpoint');
  });

  it('should handle invalid JSON-RPC messages from inbound SSE', async () => {
    const controller = new TestResponseController();
    server.urls['http://localhost:4000/mcp'].response = ({ callNumber }) => {
      switch (callNumber) {
        case 0:
          return {
            type: 'json-value',
            body: { jsonrpc: '2.0', id: 1, result: { ok: true } },
          };
        case 1:
          return {
            type: 'controlled-stream',
            controller,
            headers: { 'content-type': 'text/event-stream' },
          };
        default:
          return { type: 'empty', status: 200 };
      }
    };

    const errorPromise = new Promise(resolve => {
      transport.onerror = e => resolve(e);
    });

    await transport.start();
    await transport.send({
      jsonrpc: '2.0' as const,
      method: 'initialize',
      id: 1,
      params: {},
    });

    await vi.waitFor(() => {
      expect(server.calls[1]?.requestMethod).toBe('GET');
    });

    controller.write(
      `event: message\ndata: ${JSON.stringify({ foo: 'bar' })}\n\n`,
    );

    const error = await errorPromise;
    expect(error).toBeInstanceOf(MCPClientError);
    expect((error as Error).message).toContain('Failed to parse message');
  });

  it('should handle non-JSON-RPC response for notifications', async () => {
    server.urls['http://localhost:4000/mcp'].response = ({ callNumber }) => {
      switch (callNumber) {
        case 0:
          return {
            type: 'json-value',
            body: { ok: true },
          };
        case 1:
          return { type: 'error', status: 405 };
        default:
          return { type: 'empty', status: 200 };
      }
    };

    await transport.start();

    // Send a notification (no 'id' field)
    const notification = {
      jsonrpc: '2.0' as const,
      method: 'notifications/initialized',
    };

    // Should not throw even though server returned non-JSON-RPC response
    await expect(transport.send(notification)).resolves.toBeUndefined();
  });

  it('should send custom headers with all requests', async () => {
    const customHeaders = {
      authorization: 'Bearer test-token',
      'x-custom-header': 'test-value',
    } as const;

    transport = new HttpMCPTransport({
      url: 'http://localhost:4000/mcp',
      headers: customHeaders as unknown as Record<string, string>,
    });

    server.urls['http://localhost:4000/mcp'].response = ({ callNumber }) => {
      switch (callNumber) {
        case 0:
          return {
            type: 'json-value',
            body: { jsonrpc: '2.0', id: 1, result: { ok: true } },
            headers: { 'content-type': 'application/json' },
          };
        case 1:
          return { type: 'error', status: 405 };
        default:
          return { type: 'empty', status: 200 };
      }
    };

    await transport.start();

    const message = {
      jsonrpc: '2.0' as const,
      method: 'test',
      params: { foo: 'bar' },
      id: '1',
    };

    await transport.send(message);

    await vi.waitFor(() => {
      expect(server.calls[1]).toBeDefined();
    });

    expect(server.calls[0].requestHeaders).toEqual({
      'content-type': 'application/json',
      'mcp-protocol-version': LATEST_PROTOCOL_VERSION,
      accept: 'application/json, text/event-stream',
      ...customHeaders,
    });
    expect(server.calls[0].requestUserAgent).toContain('ai-sdk/');

    expect(server.calls[1].requestHeaders).toEqual({
      'mcp-protocol-version': LATEST_PROTOCOL_VERSION,
      accept: 'text/event-stream',
      ...customHeaders,
    });
    expect(server.calls[1].requestUserAgent).toContain('ai-sdk/');
  });

  describe('redirect option', () => {
    it('should pass redirect: error to POST fetch on send()', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      transport = new HttpMCPTransport({
        url: 'http://localhost:4000/mcp',
        redirect: 'error',
      });

      server.urls['http://localhost:4000/mcp'].response = ({ callNumber }) => {
        switch (callNumber) {
          case 0:
            return {
              type: 'json-value',
              body: { jsonrpc: '2.0', id: 1, result: { ok: true } },
            };
          case 1:
            return { type: 'error', status: 405 };
          default:
            return { type: 'empty', status: 200 };
        }
      };

      await transport.start();
      fetchSpy.mockClear();

      await transport.send({
        jsonrpc: '2.0' as const,
        method: 'initialize',
        id: 1,
        params: {},
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ redirect: 'error' }),
      );

      fetchSpy.mockRestore();
    });

    it('should pass redirect: error to GET fetch after successful send()', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      transport = new HttpMCPTransport({
        url: 'http://localhost:4000/mcp',
        redirect: 'error',
      });

      server.urls['http://localhost:4000/mcp'].response = ({ callNumber }) => {
        switch (callNumber) {
          case 0:
            return { type: 'empty', status: 202 };
          case 1:
            return { type: 'error', status: 405 };
          default:
            return { type: 'empty', status: 200 };
        }
      };

      await transport.start();
      fetchSpy.mockClear();

      await transport.send({
        jsonrpc: '2.0' as const,
        method: 'initialize',
        id: 1,
        params: {},
      });

      await vi.waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          'http://localhost:4000/mcp',
          expect.objectContaining({ redirect: 'error', method: 'GET' }),
        );
      });

      fetchSpy.mockRestore();
    });

    it('should default redirect to error', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      transport = new HttpMCPTransport({
        url: 'http://localhost:4000/mcp',
      });

      server.urls['http://localhost:4000/mcp'].response = ({ callNumber }) => {
        switch (callNumber) {
          case 0:
            return { type: 'empty', status: 202 };
          case 1:
            return { type: 'error', status: 405 };
          default:
            return { type: 'empty', status: 200 };
        }
      };

      await transport.start();
      fetchSpy.mockClear();

      await transport.send({
        jsonrpc: '2.0' as const,
        method: 'initialize',
        id: 1,
        params: {},
      });

      await vi.waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          'http://localhost:4000/mcp',
          expect.objectContaining({ redirect: 'error', method: 'GET' }),
        );
      });

      fetchSpy.mockRestore();
    });
  });

  describe('custom fetch', () => {
    it('should use provided fetch function for inbound SSE after send()', async () => {
      const customFetch = vi.fn(globalThis.fetch);

      transport = new HttpMCPTransport({
        url: 'http://localhost:4000/mcp',
        fetch: customFetch,
      });

      server.urls['http://localhost:4000/mcp'].response = ({ callNumber }) => {
        switch (callNumber) {
          case 0:
            return { type: 'empty', status: 202 };
          case 1:
            return { type: 'error', status: 405 };
          default:
            return { type: 'empty', status: 200 };
        }
      };

      await transport.start();

      await transport.send({
        jsonrpc: '2.0' as const,
        method: 'initialize',
        id: 1,
        params: {},
      });

      await vi.waitFor(() => {
        expect(customFetch).toHaveBeenCalledWith(
          'http://localhost:4000/mcp',
          expect.objectContaining({ method: 'GET' }),
        );
      });
    });

    it('should use provided fetch function for POST send()', async () => {
      const customFetch = vi.fn(globalThis.fetch);

      transport = new HttpMCPTransport({
        url: 'http://localhost:4000/mcp',
        fetch: customFetch,
      });

      server.urls['http://localhost:4000/mcp'].response = {
        type: 'json-value',
        body: { jsonrpc: '2.0', id: 1, result: { ok: true } },
        headers: { 'mcp-session-id': 'abc123' },
      };

      await transport.start();

      const message = {
        jsonrpc: '2.0' as const,
        method: 'initialize',
        id: 1,
        params: {},
      };

      await transport.send(message);

      expect(customFetch).toHaveBeenCalledWith(
        'http://localhost:4000/mcp',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('protocol version downgrade', () => {
    it('should use LATEST_PROTOCOL_VERSION by default', async () => {
      await transport.start();

      const message = {
        jsonrpc: '2.0' as const,
        method: 'initialize',
        id: 1,
        params: {},
      };

      await transport.send(message);

      expect(server.calls[0].requestHeaders['mcp-protocol-version']).toBe(
        LATEST_PROTOCOL_VERSION,
      );
    });

    it('should use negotiated protocolVersion in headers after it is set', async () => {
      const negotiatedVersion = '2025-06-18';

      server.urls['http://localhost:4000/mcp'].response = {
        type: 'json-value',
        body: { jsonrpc: '2.0', id: 2, result: { ok: true } },
        headers: { 'mcp-session-id': 'abc123' },
      };

      await transport.start();

      // Simulate the client setting the negotiated version after initialize
      transport.protocolVersion = negotiatedVersion;

      const message = {
        jsonrpc: '2.0' as const,
        method: 'tools/list',
        id: 2,
        params: {},
      };

      const messagePromise = new Promise(resolve => {
        transport.onmessage = msg => resolve(msg);
      });

      await transport.send(message);

      await messagePromise;

      // The POST for tools/list should use the negotiated version
      const postCall = server.calls.find(
        c =>
          c.requestMethod === 'POST' &&
          c.requestBodyJson.then(body => body.method === 'tools/list'),
      );
      expect(postCall?.requestHeaders['mcp-protocol-version']).toBe(
        negotiatedVersion,
      );
    });
  });
});
