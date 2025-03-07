import { SSEClientTransport } from './mcp-sse-transport';
import { createTestServer } from '../../../../provider-utils/src/test/unified-test-server'; // TODO: update import
import { MCPClientError } from '../../../errors';

describe('SSEClientTransport', () => {
  const server = createTestServer({
    'http://localhost:3000/sse': {
      response: undefined,
    },
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
  });

  beforeEach(() => {
    server.urls['http://localhost:3000/sse'].response = undefined;
  });

  it('should establish connection and receive endpoint', async () => {
    const controller = new TransformStreamController();
    const stream = controller.readable;

    server.urls['http://localhost:3000/sse'].response = {
      type: 'readable-stream',
      stream,
      headers: {
        'Content-Type': 'text/event-stream',
      },
    };

    const transport = new SSEClientTransport({
      url: 'http://localhost:3000/sse',
      type: 'sse',
    });
    const connectPromise = transport.start();

    controller.enqueue(
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
    const controller = new TransformStreamController();
    const stream = controller.readable;

    server.urls['http://localhost:3000/sse'].response = {
      type: 'error',
      status: 500,
      body: 'Internal Server Error',
    };

    const transport = new SSEClientTransport({
      url: 'http://localhost:3000/sse',
      type: 'sse',
    });
    const connectPromise = transport.start();

    controller.enqueue(
      'event: endpoint\ndata: http://localhost:3000/messages\n\n',
    );

    await expect(connectPromise).rejects.toThrow();
  });

  it('should handle valid JSON-RPC messages', async () => {
    const controller = new TransformStreamController();
    const stream = controller.readable;

    server.urls['http://localhost:3000/sse'].response = {
      type: 'readable-stream',
      stream,
      headers: {
        'Content-Type': 'text/event-stream',
      },
    };

    const transport = new SSEClientTransport({
      url: 'http://localhost:3000/sse',
      type: 'sse',
    });

    const messagePromise = new Promise(resolve => {
      transport.onMessage = msg => resolve(msg);
    });

    const connectPromise = transport.start();
    controller.enqueue(
      'event: endpoint\ndata: http://localhost:3000/messages\n\n',
    );
    await connectPromise;

    const testMessage = {
      jsonrpc: '2.0' as const,
      method: 'test',
      params: { foo: 'bar' },
      id: '1',
    };

    controller.enqueue(
      `event: message\ndata: ${JSON.stringify(testMessage)}\n\n`,
    );

    const receivedMessage = await messagePromise;
    expect(receivedMessage).toEqual(testMessage);

    await transport.close();
  });

  it('should handle invalid JSON-RPC messages', async () => {
    const controller = new TransformStreamController();
    const stream = controller.readable;

    server.urls['http://localhost:3000/sse'].response = {
      type: 'readable-stream',
      stream,
      headers: {
        'Content-Type': 'text/event-stream',
      },
    };

    const transport = new SSEClientTransport({
      url: 'http://localhost:3000/sse',
      type: 'sse',
    });

    const errorPromise = new Promise<unknown>(resolve => {
      transport.onError = err => resolve(err);
    });

    const messagePromise = new Promise<unknown>(resolve => {
      transport.onMessage = msg => resolve(msg);
    });

    const connectPromise = transport.start();
    controller.enqueue(
      'event: endpoint\ndata: http://localhost:3000/messages\n\n',
    );
    await connectPromise;

    const invalidMessage = {
      foo: 'bar',
    };

    controller.enqueue(
      `event: message\ndata: ${JSON.stringify(invalidMessage)}\n\n`,
    );

    const error = await errorPromise;
    expect(error).toBeInstanceOf(MCPClientError);
    expect((error as Error).message).toContain('Failed to parse message');

    await transport.close();
  });

  it('should send messages as POST requests', async () => {
    const controller = new TransformStreamController();
    const stream = controller.readable;

    server.urls['http://localhost:3000/sse'].response = {
      type: 'readable-stream',
      stream,
      headers: {
        'Content-Type': 'text/event-stream',
      },
    };

    const transport = new SSEClientTransport({
      url: 'http://localhost:3000/sse',
      type: 'sse',
    });

    const connectPromise = transport.start();
    controller.enqueue(
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
    expect(await server.calls[1].requestBody).toEqual(message);

    await transport.close();
  });

  it('should handle POST request errors', async () => {
    const controller = new TransformStreamController();
    const stream = controller.readable;

    server.urls['http://localhost:3000/sse'].response = {
      type: 'readable-stream',
      stream,
      headers: {
        'Content-Type': 'text/event-stream',
      },
    };
    server.urls['http://localhost:3000/messages'].response = {
      type: 'error',
      status: 500,
      body: 'Internal Server Error',
    };

    const transport = new SSEClientTransport({
      url: 'http://localhost:3000/sse',
      type: 'sse',
    });

    const errorPromise = new Promise<unknown>(resolve => {
      transport.onError = err => resolve(err);
    });

    const connectPromise = transport.start();
    controller.enqueue(
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
    const transport = new SSEClientTransport({
      url: 'http://localhost:3333/sse',
      type: 'sse',
    });

    const errorPromise = new Promise<unknown>(resolve => {
      transport.onError = err => resolve(err);
    });

    const connectPromise = transport.start();

    await expect(connectPromise).rejects.toThrow();

    const error = await errorPromise;
    expect((error as Error).message).toContain('fetch failed');
  });
});

class TransformStreamController {
  private readonly stream: TransformStream;
  private readonly writer: WritableStreamDefaultWriter;

  constructor() {
    this.stream = new TransformStream();
    this.writer = this.stream.writable.getWriter();
  }

  get readable(): ReadableStream {
    return this.stream.readable;
  }

  async enqueue(chunk: string): Promise<void> {
    await this.writer.write(chunk);
  }

  async close(): Promise<void> {
    await this.writer.close();
  }
}
