import { createMCPClient } from '@ai-sdk/mcp';
import { safeParseJSON } from '@ai-sdk/provider-utils';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';

const failureSignal =
  'ISSUE #10915 REPRODUCED: MCP client ignored a data-only SSE message';

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString('utf8');
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timeout: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(failureSignal)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  let sseResponse: ServerResponse | undefined;
  let receivedInitializedNotification = false;

  const server = createServer((request, response) => {
    void (async () => {
      if (request.method === 'GET' && request.url === '/sse') {
        sseResponse = response;
        response.writeHead(200, {
          'cache-control': 'no-cache',
          connection: 'keep-alive',
          'content-type': 'text/event-stream',
        });
        response.write(
          `event: endpoint\ndata: http://127.0.0.1:${(server.address() as { port: number }).port}/messages\n\n`,
        );
        return;
      }

      if (request.method === 'POST' && request.url === '/messages') {
        const parsed = await safeParseJSON({ text: await readBody(request) });
        if (
          !parsed.success ||
          parsed.value == null ||
          typeof parsed.value !== 'object' ||
          Array.isArray(parsed.value)
        ) {
          throw new Error('Received an invalid JSON-RPC request');
        }

        const message = parsed.value as {
          id?: number | string;
          method?: string;
          params?: { protocolVersion?: string };
        };

        response.writeHead(202).end();

        if (message.method === 'initialize') {
          if (sseResponse == null) {
            throw new Error('SSE connection was not established');
          }

          sseResponse.write(
            `data: ${JSON.stringify({
              jsonrpc: '2.0',
              id: message.id,
              result: {
                protocolVersion: message.params?.protocolVersion,
                capabilities: {},
                serverInfo: {
                  name: 'data-only-sse-server',
                  version: '1.0.0',
                },
              },
            })}\n\n`,
          );
        } else if (message.method === 'notifications/initialized') {
          receivedInitializedNotification = true;
        }
        return;
      }

      response.writeHead(404).end();
    })().catch(error => {
      if (!response.headersSent) {
        response.writeHead(500).end(String(error));
      } else {
        response.destroy(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (address == null || typeof address === 'string') {
    throw new Error('Local test server did not expose a TCP port');
  }

  let client: Awaited<ReturnType<typeof createMCPClient>> | undefined;

  try {
    client = await withTimeout(
      createMCPClient({
        transport: {
          type: 'sse',
          url: `http://127.0.0.1:${address.port}/sse`,
        },
      }),
      2_000,
    );

    if (client.serverInfo.name !== 'data-only-sse-server') {
      throw new Error(
        `${failureSignal}: initialize response was not delivered to the client`,
      );
    }

    if (!receivedInitializedNotification) {
      throw new Error(
        `${failureSignal}: initialization handshake did not complete`,
      );
    }

    console.log(
      'Issue #10915 not reproduced: createMCPClient initialized from a data-only SSE message.',
    );
  } finally {
    await client?.close();
    sseResponse?.end();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
