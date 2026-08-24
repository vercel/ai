import { createServer, type ServerResponse } from 'node:http';
import { createMCPClient, type MCPClient } from '@ai-sdk/mcp';

const expectedToolNames = ['page1_tool', 'page2_tool_a', 'page2_tool_b'];

const tool = (name: string) => ({
  name,
  description: `stub ${name}`,
  inputSchema: { type: 'object' as const, properties: {} },
});

async function main() {
  let client: MCPClient | undefined;
  let sseResponse: ServerResponse | undefined;
  let toolsListCalls = 0;

  const server = createServer((request, response) => {
    const address = server.address();
    if (address == null || typeof address === 'string') {
      response.writeHead(500).end();
      return;
    }

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
      let raw = '';
      request.setEncoding('utf8');
      request.on('data', chunk => {
        raw += chunk;
      });
      request.on('end', () => {
        const body = JSON.parse(raw) as {
          id?: number;
          method?: string;
          params?: { cursor?: string };
        };

        response.writeHead(200).end();

        if (body.id == null) {
          return;
        }

        const reply = (result: unknown) => {
          sseResponse?.write(
            `event: message\ndata: ${JSON.stringify({
              jsonrpc: '2.0',
              id: body.id,
              result,
            })}\n\n`,
          );
        };

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
          toolsListCalls += 1;
          const cursor = body.params?.cursor;

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

  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });

    const address = server.address();
    if (address == null || typeof address === 'string') {
      throw new Error('Stub MCP server did not bind to a TCP port');
    }

    client = await createMCPClient({
      transport: {
        type: 'sse',
        url: `http://127.0.0.1:${address.port}/sse`,
      },
    });

    const tools = await client.tools();
    const actualToolNames = Object.keys(tools);
    const missingToolNames = expectedToolNames.filter(
      name => !actualToolNames.includes(name),
    );

    console.log(`tools() returned: ${JSON.stringify(actualToolNames)}`);
    console.log(`tools/list requests made: ${toolsListCalls}`);

    if (missingToolNames.length > 0) {
      throw new Error(
        `MCP tools pagination bug: client.tools() omitted paginated tools: ${missingToolNames.join(
          ', ',
        )}`,
      );
    }
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
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
