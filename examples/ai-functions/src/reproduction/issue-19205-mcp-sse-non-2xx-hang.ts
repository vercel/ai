import { createServer, type Server, type ServerResponse } from 'node:http';
import { createMCPClient } from '@ai-sdk/mcp';

type Method = 'tools/list' | 'tools/call';

type OperationOutcome =
  | { type: 'rejected'; error: unknown }
  | { type: 'resolved' }
  | { type: 'pending' };

async function observeOperation(
  operation: Promise<unknown>,
): Promise<OperationOutcome> {
  return Promise.race([
    operation.then<OperationOutcome, OperationOutcome>(
      () => ({ type: 'resolved' }),
      error => ({ type: 'rejected', error }),
    ),
    new Promise<OperationOutcome>(resolve => {
      setTimeout(() => resolve({ type: 'pending' }), 500);
    }),
  ]);
}

function sendSseResponse(
  response: ServerResponse | undefined,
  id: number,
  result: unknown,
) {
  response?.write(
    `event: message\ndata: ${JSON.stringify({
      jsonrpc: '2.0',
      id,
      result,
    })}\n\n`,
  );
}

async function closeServer(server: Server) {
  server.closeAllConnections();
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

async function runScenario({
  failedMethod,
  status,
}: {
  failedMethod: Method;
  status: number;
}): Promise<OperationOutcome> {
  let sseResponse: ServerResponse | undefined;

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
      let rawBody = '';
      request.setEncoding('utf8');
      request.on('data', chunk => {
        rawBody += chunk;
      });
      request.on('end', () => {
        const message = JSON.parse(rawBody) as {
          id?: number;
          method: string;
        };

        if (message.method === failedMethod) {
          response.writeHead(status, {
            'content-type': 'application/json',
          });
          response.end(
            JSON.stringify({
              error: `${failedMethod} deliberately failed`,
            }),
          );
          return;
        }

        response.writeHead(200).end();

        if (message.id == null) {
          return;
        }

        setImmediate(() => {
          if (message.method === 'initialize') {
            sendSseResponse(sseResponse, message.id!, {
              protocolVersion: '2025-11-25',
              capabilities: {
                tools: { listChanged: false },
              },
              serverInfo: {
                name: 'issue-19205-stub',
                version: '1.0.0',
              },
            });
          } else {
            sendSseResponse(sseResponse, message.id!, {});
          }
        });
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
    await closeServer(server);
    throw new Error('Stub server did not expose a TCP port');
  }

  const client = await createMCPClient({
    transport: {
      type: 'sse',
      url: `http://127.0.0.1:${address.port}/sse`,
    },
  });

  try {
    const operation =
      failedMethod === 'tools/list'
        ? client.tools()
        : client.callTool({
            name: 'deliberately-failing-tool',
            arguments: {},
          });

    return await observeOperation(operation);
  } finally {
    await client.close();
    await closeServer(server);
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function assertExpectedRejection(
  outcome: OperationOutcome,
  method: Method,
  status: number,
) {
  if (outcome.type === 'pending') {
    return;
  }

  if (outcome.type === 'resolved') {
    throw new Error(`${method} unexpectedly resolved after HTTP ${status}`);
  }

  const message = describeError(outcome.error);
  if (!message.includes(`HTTP ${status}`)) {
    throw new Error(
      `${method} rejected without the HTTP status; received: ${message}`,
    );
  }
}

async function main() {
  const toolsOutcome = await runScenario({
    failedMethod: 'tools/list',
    status: 500,
  });
  const callToolOutcome = await runScenario({
    failedMethod: 'tools/call',
    status: 503,
  });

  assertExpectedRejection(toolsOutcome, 'tools/list', 500);
  assertExpectedRejection(callToolOutcome, 'tools/call', 503);

  const pendingMethods = [
    toolsOutcome.type === 'pending' ? 'tools()' : undefined,
    callToolOutcome.type === 'pending' ? 'callTool()' : undefined,
  ].filter((method): method is string => method != null);

  if (pendingMethods.length > 0) {
    throw new Error(
      `ISSUE 19205 REPRODUCED: SSE ${pendingMethods.join(
        ' and ',
      )} remained pending after non-2xx POST responses`,
    );
  }

  console.log(
    'SSE tools() and callTool() rejected with errors containing their HTTP statuses.',
  );
}

main().catch(error => {
  console.error(describeError(error));
  process.exitCode = 1;
});
