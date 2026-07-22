import { createServer, type ServerResponse } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { createMCPClient, type MCPClient } from '@ai-sdk/mcp';

const timeoutMs = 2_000;

async function readBody(request: NodeJS.ReadableStream): Promise<string> {
  let body = '';

  for await (const chunk of request) {
    body += chunk;
  }

  return body;
}

async function main() {
  let sseResponse: ServerResponse | undefined;
  let client: MCPClient | undefined;
  const sockets = new Set<Socket>();

  const server = createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/sse') {
      sseResponse = response;
      response.writeHead(200, {
        'cache-control': 'no-cache',
        connection: 'keep-alive',
        'content-type': 'text/event-stream',
      });

      const address = server.address() as AddressInfo;
      response.write(
        `event: endpoint\ndata: http://127.0.0.1:${address.port}/messages\n\n`,
      );
      return;
    }

    if (request.method === 'POST' && request.url === '/messages') {
      const message = JSON.parse(await readBody(request));
      response.writeHead(202).end();

      if (message.method === 'initialize') {
        if (sseResponse == null) {
          throw new Error('SSE connection was not established');
        }

        // Per the SSE specification, omitting `event:` defaults this to a
        // `message` event. @ai-sdk/mcp@0.0.11 dropped this response.
        sseResponse.write(
          `data: ${JSON.stringify({
            jsonrpc: '2.0',
            id: message.id,
            result: {
              protocolVersion: message.params.protocolVersion,
              capabilities: {},
              serverInfo: {
                name: 'issue-10915-server',
                version: '1.0.0',
              },
            },
          })}\n\n`,
        );
      }
      return;
    }

    response.writeHead(404).end();
  });

  server.on('connection', socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address() as AddressInfo;
  const initialization = createMCPClient({
    transport: {
      type: 'sse',
      url: `http://127.0.0.1:${address.port}/sse`,
    },
  });
  void initialization.catch(() => {});

  let timer: NodeJS.Timeout | undefined;

  try {
    client = await Promise.race([
      initialization,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                'BUG REPRODUCED: MCP client ignored a data-only SSE initialization response',
              ),
            ),
          timeoutMs,
        );
      }),
    ]);

    if (client.serverInfo.name !== 'issue-10915-server') {
      throw new Error(
        `Unexpected MCP server info: ${JSON.stringify(client.serverInfo)}`,
      );
    }

    console.log(
      'PASS: MCP client processed a data-only SSE event as a message and completed initialization',
    );
  } finally {
    if (timer != null) {
      clearTimeout(timer);
    }
    await client?.close();
    for (const socket of sockets) {
      socket.destroy();
    }
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
