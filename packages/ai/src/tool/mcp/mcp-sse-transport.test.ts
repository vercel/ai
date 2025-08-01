import {
  createTestServer,
  TestResponseController,
} from '@ai-sdk/provider-utils/test';
import { MCPClientError } from '../../error/mcp-client-error';
import { SseMCPTransport } from './mcp-sse-transport';

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

  it('should handle POST request errors', async () => {
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

    const errorPromise = new Promise<unknown>(resolve => {
      transport.onerror = err => resolve(err);
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

    const error = await errorPromise;
    expect(error).toBeInstanceOf(MCPClientError);
    expect((error as Error).message).toContain('Error: POSTing to endpoint');
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
      accept: 'text/event-stream',
      ...customHeaders,
    });

    // Verify POST request headers
    expect(server.calls[1].requestHeaders).toEqual({
      'content-type': 'application/json',
      ...customHeaders,
    });

    await transport.close();
  });
});
