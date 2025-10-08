import {
  createTestServer,
  TestResponseController,
} from '@ai-sdk/test-server/with-vitest';
import { beforeEach, describe, expect, it } from 'vitest';
import { HttpMCPTransport } from './mcp-http-transport';
import { LATEST_PROTOCOL_VERSION } from './types';
import { MCPClientError } from '../../error/mcp-client-error';

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
    transport = new HttpMCPTransport({ url: 'http://localhost:4000/mcp' });
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

    expect(server.calls[1].requestMethod).toBe('POST');
    expect(server.calls[1].requestHeaders).toEqual({
      'mcp-protocol-version': LATEST_PROTOCOL_VERSION,
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
    });
  });

  it('should handle text/event-stream responses', async () => {
    transport = new HttpMCPTransport({ url: 'http://localhost:4000/stream' });
    const controller = new TestResponseController();

    server.urls['http://localhost:4000/stream'].response = {
      type: 'controlled-stream',
      controller,
      headers: { 'content-type': 'text/event-stream' },
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

  it('should report HTTP errors from POST', async () => {
    transport = new HttpMCPTransport({ url: 'http://localhost:4000/mcp' });

    // Ensure the optional inbound SSE GET succeeds first
    const controller = new TestResponseController();
    server.urls['http://localhost:4000/mcp'].response = {
      type: 'controlled-stream',
      controller,
      headers: { 'content-type': 'text/event-stream' },
    };

    await transport.start();

    // Wait until the optional inbound SSE GET has actually been initiated
    await new Promise<void>(resolve => {
      const check = () => {
        if (
          server.calls.length > 0 &&
          server.calls[0].requestMethod === 'GET'
        ) {
          resolve();
        } else {
          setTimeout(check, 0);
        }
      };
      check();
    });

    // Now make POST fail
    server.urls['http://localhost:4000/mcp'].response = {
      type: 'error',
      status: 500,
      body: 'Internal Server Error',
    };

    const errorPromise = new Promise(resolve => {
      transport.onerror = e => resolve(e);
    });

    await transport.send({
      jsonrpc: '2.0' as const,
      method: 'test',
      id: 3,
      params: {},
    });
    const error = await errorPromise;
    expect(error).toBeInstanceOf(MCPClientError);
    expect((error as Error).message).toContain('POSTing to endpoint');
  });

  it('should handle invalid JSON-RPC messages from inbound SSE', async () => {
    const controller = new TestResponseController();
    server.urls['http://localhost:4000/mcp'].response = {
      type: 'controlled-stream',
      controller,
      headers: { 'content-type': 'text/event-stream' },
    };

    const errorPromise = new Promise(resolve => {
      transport.onerror = e => resolve(e);
    });

    await transport.start();

    // Send invalid message over inbound SSE
    controller.write(
      `event: message\ndata: ${JSON.stringify({ foo: 'bar' })}\n\n`,
    );

    const error = await errorPromise;
    expect(error).toBeInstanceOf(MCPClientError);
    expect((error as Error).message).toContain('Failed to parse message');
  });

  it('should send custom headers with all requests', async () => {
    const controller = new TestResponseController();

    const customHeaders = {
      authorization: 'Bearer test-token',
      'x-custom-header': 'test-value',
    } as const;

    transport = new HttpMCPTransport({
      url: 'http://localhost:4000/mcp',
      headers: customHeaders as unknown as Record<string, string>,
    });

    // Make inbound SSE succeed
    server.urls['http://localhost:4000/mcp'].response = {
      type: 'controlled-stream',
      controller,
      headers: { 'content-type': 'text/event-stream' },
    };

    await transport.start();

    const message = {
      jsonrpc: '2.0' as const,
      method: 'test',
      params: { foo: 'bar' },
      id: '1',
    };

    await transport.send(message);

    // Verify inbound SSE GET headers
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
      accept: 'application/json, text/event-stream',
      ...customHeaders,
    });
    expect(server.calls[1].requestUserAgent).toContain('ai-sdk/');
  });
});
