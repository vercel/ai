import { createServer, type ServerResponse } from 'node:http';
import { experimental_createMCPClient as createMCPClient } from '../../../../packages/mcp/src';

const timeoutMs = 2_000;

async function main() {
  let sseResponse: ServerResponse | undefined;

  const server = createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/sse') {
      sseResponse = response;
      response.writeHead(200, {
        'cache-control': 'no-cache',
        connection: 'keep-alive',
        'content-type': 'text/event-stream',
      });
      response.write('event: endpoint\ndata: /messages\n\n');
      return;
    }

    if (request.method === 'POST' && request.url === '/messages') {
      let body = '';
      request.setEncoding('utf8');
      request.on('data', chunk => {
        body += chunk;
      });
      request.on('end', () => {
        const message = JSON.parse(body) as {
          id?: number;
          method: string;
          params?: { protocolVersion?: string };
        };

        response.writeHead(202).end();

        if (message.method === 'initialize') {
          sseResponse?.write(
            `data: ${JSON.stringify({
              jsonrpc: '2.0',
              id: message.id,
              result: {
                protocolVersion: message.params?.protocolVersion,
                capabilities: {},
                serverInfo: {
                  name: 'issue-10915-reproduction',
                  version: '1.0.0',
                },
              },
            })}\n\n`,
          );
        }
      });
      return;
    }

    response.writeHead(404).end();
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Failed to determine reproduction server address');
  }

  let client: Awaited<ReturnType<typeof createMCPClient>> | undefined;

  try {
    client = await Promise.race([
      createMCPClient({
        transport: {
          type: 'sse',
          url: `http://127.0.0.1:${address.port}/sse`,
        },
      }),
      new Promise<never>((_, reject) => {
        setTimeout(
          () =>
            reject(
              new Error(
                'ISSUE_REPRODUCED: createMCPClient timed out after a data-only SSE initialization response',
              ),
            ),
          timeoutMs,
        );
      }),
    ]);

    console.log(
      'ISSUE_NOT_REPRODUCED: createMCPClient processed the data-only SSE initialization response',
    );
  } finally {
    await client?.close();
    sseResponse?.end();
    await new Promise<void>((resolve, reject) => {
      server.close(error => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
