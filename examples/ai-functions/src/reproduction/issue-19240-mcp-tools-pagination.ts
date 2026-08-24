import { createServer, type ServerResponse } from 'node:http';
import { experimental_createMCPClient as createMCPClient } from '../../../../packages/mcp/src/index';

const failureSignal =
  'ISSUE_19240_REPRODUCED: client.tools() omitted page-2 tools';

const tool = (name: string) => ({
  name,
  description: `stub ${name}`,
  inputSchema: { type: 'object' as const, properties: {} },
});

async function main() {
  let sseResponse: ServerResponse | undefined;
  let toolsListCalls = 0;
  const requestedCursors: Array<string | null> = [];

  const server = createServer((request, response) => {
    const address = server.address();
    if (address == null || typeof address === 'string') {
      response.writeHead(500).end();
      return;
    }

    const origin = `http://127.0.0.1:${address.port}`;
    const url = new URL(request.url ?? '/', origin);

    if (request.method === 'GET' && url.pathname === '/sse') {
      response.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      sseResponse = response;
      response.write(`event: endpoint\ndata: ${origin}/post\n\n`);
      return;
    }

    if (request.method === 'POST' && url.pathname === '/post') {
      let raw = '';
      request.on('data', chunk => {
        raw += chunk;
      });
      request.on('end', () => {
        const body = raw.length > 0 ? JSON.parse(raw) : {};
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
              protocolVersion: '2025-06-18',
              capabilities: { tools: { listChanged: false } },
              serverInfo: { name: 'pagination-stub', version: '1.0.0' },
            }),
          );
          return;
        }

        if (body.method === 'tools/list') {
          toolsListCalls += 1;
          const cursor = body.params?.cursor ?? null;
          requestedCursors.push(cursor);
          console.log(
            `[stub] tools/list call #${toolsListCalls}, cursor = ${JSON.stringify(cursor)}`,
          );

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

  const address = server.address();
  if (address == null || typeof address === 'string') {
    throw new Error('Stub server did not bind to a TCP port');
  }

  let client: Awaited<ReturnType<typeof createMCPClient>> | undefined;

  try {
    client = await createMCPClient({
      transport: {
        type: 'sse',
        url: `http://127.0.0.1:${address.port}/sse`,
      },
    });

    const tools = await client.tools();
    const returnedTools = Object.keys(tools);
    const expectedTools = ['page1_tool', 'page2_tool_a', 'page2_tool_b'];
    const missingTools = expectedTools.filter(name => !(name in tools));

    console.log('tools() returned:', returnedTools);
    console.log('tools/list cursors:', requestedCursors);

    if (missingTools.length > 0) {
      throw new Error(
        `${failureSignal}; missing ${missingTools.join(', ')}; returned ${returnedTools.join(', ')}`,
      );
    }

    console.log('PASS: client.tools() returned tools from every page');
  } finally {
    await client?.close();
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
