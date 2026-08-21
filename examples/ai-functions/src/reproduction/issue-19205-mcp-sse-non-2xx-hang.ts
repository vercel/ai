import { createServer, type ServerResponse } from 'node:http';
import { createMCPClient, type MCPClient } from '@ai-sdk/mcp';

const SETTLEMENT_WINDOW_MS = 500;

type CallToolClient = MCPClient & {
  callTool(args: {
    name: string;
    args: Record<string, unknown>;
  }): Promise<unknown>;
};

type Outcome =
  | { kind: 'pending' }
  | { kind: 'resolved' }
  | { kind: 'rejected'; error: unknown };

async function observeOutcome(promise: Promise<unknown>): Promise<Outcome> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const outcome = await Promise.race<Outcome>([
    promise.then(
      () => ({ kind: 'resolved' }),
      error => ({ kind: 'rejected', error }),
    ),
    new Promise<Outcome>(resolve => {
      timeoutId = setTimeout(
        () => resolve({ kind: 'pending' }),
        SETTLEMENT_WINDOW_MS,
      );
    }),
  ]);

  if (timeoutId != null) {
    clearTimeout(timeoutId);
  }

  return outcome;
}

function assertExpectedRejection(
  operation: string,
  status: number,
  outcome: Outcome,
): boolean {
  if (outcome.kind === 'pending') {
    return false;
  }

  if (outcome.kind === 'resolved') {
    throw new Error(
      `${operation} unexpectedly resolved after the server returned HTTP ${status}`,
    );
  }

  const message =
    outcome.error instanceof Error
      ? outcome.error.message
      : String(outcome.error);

  if (!message.includes(`HTTP ${status}`)) {
    throw new Error(
      `${operation} rejected without the HTTP ${status} status: ${message}`,
    );
  }

  return true;
}

async function main() {
  let sseResponse: ServerResponse | undefined;
  let baseUrl = '';

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', baseUrl);

    if (request.method === 'GET' && url.pathname === '/sse') {
      response.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      sseResponse = response;
      response.write(`event: endpoint\ndata: ${baseUrl}/post\n\n`);
      return;
    }

    if (request.method === 'POST' && url.pathname === '/post') {
      let rawBody = '';
      request.setEncoding('utf8');
      request.on('data', chunk => {
        rawBody += chunk;
      });
      request.on('end', () => {
        const body = JSON.parse(rawBody) as {
          id?: number;
          method?: string;
        };

        if (body.method === 'tools/list') {
          response.writeHead(500, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ error: 'internal server error' }));
          return;
        }

        if (body.method === 'tools/call') {
          response.writeHead(503, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ error: 'service unavailable' }));
          return;
        }

        response.writeHead(200);
        response.end();

        if (body.id == null) {
          return;
        }

        const result =
          body.method === 'initialize'
            ? {
                protocolVersion: '2025-11-25',
                capabilities: { tools: { listChanged: false } },
                serverInfo: { name: 'issue-19205-stub', version: '1.0.0' },
              }
            : {};

        setImmediate(() => {
          sseResponse?.write(
            `event: message\ndata: ${JSON.stringify({
              jsonrpc: '2.0',
              id: body.id,
              result,
            })}\n\n`,
          );
        });
      });
      return;
    }

    response.writeHead(404);
    response.end();
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      const address = server.address();
      if (address == null || typeof address === 'string') {
        reject(new Error('Failed to determine stub server address'));
        return;
      }
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });

  let client: MCPClient | undefined;

  try {
    client = await createMCPClient({
      transport: { type: 'sse', url: `${baseUrl}/sse` },
    });

    const toolsOutcome = await observeOutcome(client.tools());
    const callToolOutcome = await observeOutcome(
      (client as CallToolClient).callTool({
        name: 'example',
        args: {},
      }),
    );

    const toolsRejected = assertExpectedRejection('tools()', 500, toolsOutcome);
    const callToolRejected = assertExpectedRejection(
      'callTool()',
      503,
      callToolOutcome,
    );

    if (!toolsRejected && !callToolRejected) {
      throw new Error(
        'ISSUE_19205_REPRODUCED: SSE HTTP errors left tools() pending after 500 and callTool() pending after 503',
      );
    }

    if (!toolsRejected) {
      throw new Error(
        'ISSUE_19205_REPRODUCED: SSE HTTP 500 left tools() pending',
      );
    }

    if (!callToolRejected) {
      throw new Error(
        'ISSUE_19205_REPRODUCED: SSE HTTP 503 left callTool() pending',
      );
    }

    console.log(
      'PASS: tools() and callTool() rejected with their SSE POST HTTP statuses',
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
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
