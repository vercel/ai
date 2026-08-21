import { createServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createMCPClient } from '@ai-sdk/mcp';

const tool = (name: string) => ({
  name,
  description: `stub ${name}`,
  inputSchema: { type: 'object', properties: {} },
});

async function main() {
  let sseResponse: ServerResponse | undefined;
  const toolsListCursors: Array<string | null> = [];

  const server = createServer((request, response) => {
    const address = server.address() as AddressInfo;
    const url = new URL(request.url ?? '/', `http://127.0.0.1:${address.port}`);

    if (request.method === 'GET' && url.pathname === '/sse') {
      response.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      sseResponse = response;
      response.write(
        `event: endpoint\ndata: http://127.0.0.1:${address.port}/post\n\n`,
      );
      return;
    }

    if (request.method === 'POST' && url.pathname === '/post') {
      let rawBody = '';
      request.on('data', chunk => {
        rawBody += chunk;
      });
      request.on('end', () => {
        const body = JSON.parse(rawBody) as {
          id?: string | number;
          method: string;
          params?: { cursor?: string };
        };

        const reply = (result: unknown) => {
          sseResponse?.write(
            `event: message\ndata: ${JSON.stringify({
              jsonrpc: '2.0',
              id: body.id,
              result,
            })}\n\n`,
          );
        };

        response.writeHead(200).end();

        if (body.id == null) {
          return;
        }

        if (body.method === 'initialize') {
          setImmediate(() =>
            reply({
              protocolVersion: '2025-11-25',
              capabilities: { tools: { listChanged: false } },
              serverInfo: { name: 'pagination-stub', version: '1.0.0' },
            }),
          );
          return;
        }

        if (body.method === 'tools/list') {
          const cursor = body.params?.cursor ?? null;
          toolsListCursors.push(cursor);

          setImmediate(() => {
            if (cursor == null) {
              reply({
                tools: [tool('page1_tool')],
                nextCursor: 'page-2',
              });
            } else {
              reply({
                tools: [tool('page2_tool_a'), tool('page2_tool_b')],
              });
            }
          });
          return;
        }

        setImmediate(() => reply({}));
      });
      return;
    }

    response.writeHead(404).end();
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address() as AddressInfo;
  let client: Awaited<ReturnType<typeof createMCPClient>> | undefined;

  try {
    client = await createMCPClient({
      transport: {
        type: 'sse',
        url: `http://127.0.0.1:${address.port}/sse`,
      },
    });

    const tools = await client.tools();
    const toolNames = Object.keys(tools).sort();
    const expectedToolNames = ['page1_tool', 'page2_tool_a', 'page2_tool_b'];

    console.log('tools() returned:', toolNames);
    console.log('tools/list cursors:', toolsListCursors);

    if (JSON.stringify(toolNames) !== JSON.stringify(expectedToolNames)) {
      throw new Error(
        `Issue #19240 reproduced: client.tools() omitted paginated tools; expected ${JSON.stringify(
          expectedToolNames,
        )}, received ${JSON.stringify(toolNames)}`,
      );
    }
  } finally {
    await client?.close();
    await new Promise<void>((resolve, reject) => {
      server.close(error => {
        if (error == null) {
          resolve();
        } else {
          reject(error);
        }
      });
    });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
