import { createMCPClient } from '@ai-sdk/mcp';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo, Socket } from 'node:net';

const OBSERVATION_WINDOW_MS = 250;

type LocalServer = {
  url: string;
  close: () => Promise<void>;
};

type PromiseState = 'pending' | 'rejected' | 'resolved';

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function observePromise(
  promise: Promise<unknown>,
  milliseconds = OBSERVATION_WINDOW_MS,
): Promise<PromiseState> {
  return Promise.race([
    promise.then(
      () => 'resolved' as const,
      () => 'rejected' as const,
    ),
    delay(milliseconds).then(() => 'pending' as const),
  ]);
}

async function readJsonRpcMessage(
  request: IncomingMessage,
): Promise<{ id?: number; method?: string }> {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
  }
  return JSON.parse(body);
}

async function startLocalServer(
  handler: (
    request: IncomingMessage,
    response: ServerResponse,
  ) => Promise<void>,
): Promise<LocalServer> {
  const sockets = new Set<Socket>();
  const server = createServer((request, response) => {
    void handler(request, response).catch(error => {
      response.destroy(
        error instanceof Error ? error : new Error(String(error)),
      );
    });
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

  return {
    url: `http://127.0.0.1:${address.port}/mcp`,
    close: async () => {
      for (const socket of sockets) {
        socket.destroy();
      }
      await new Promise<void>((resolve, reject) => {
        server.close(error => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}

async function reproduceUnboundedInitialization(): Promise<{
  state: PromiseState;
  responseStillOpen: boolean;
}> {
  let initializeResponseClosed = false;

  const server = await startLocalServer(async (request, response) => {
    if (request.method === 'GET') {
      response.writeHead(405).end();
      return;
    }

    const message = await readJsonRpcMessage(request);
    if (message.method !== 'initialize') {
      response.writeHead(202).end();
      return;
    }

    response.on('close', () => {
      initializeResponseClosed = true;
    });
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.write(
      `data: ${JSON.stringify({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          protocolVersion: '2025-11-25',
          capabilities: { tools: {} },
          serverInfo: { name: 'unterminated-sse', version: '1.0.0' },
        },
      })}\n`,
    );
  });

  const clientPromise = createMCPClient({
    transport: { type: 'http', url: server.url },
  });

  const state = await observePromise(clientPromise);
  const responseStillOpen = !initializeResponseClosed;

  await server.close();
  await observePromise(clientPromise, 50);

  return { state, responseStillOpen };
}

async function reproduceIgnoredRequestTimeouts(): Promise<{
  timeoutState: PromiseState;
  maxTotalTimeoutState: PromiseState;
  openToolResponses: number;
}> {
  const openToolResponses = new Set<ServerResponse>();

  const server = await startLocalServer(async (request, response) => {
    if (request.method === 'GET') {
      response.writeHead(405).end();
      return;
    }

    const message = await readJsonRpcMessage(request);

    if (message.method === 'initialize') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          jsonrpc: '2.0',
          id: message.id,
          result: {
            protocolVersion: '2025-11-25',
            capabilities: { tools: {} },
            serverInfo: { name: 'silent-tools', version: '1.0.0' },
          },
        }),
      );
      return;
    }

    if (message.method === 'notifications/initialized') {
      response.writeHead(202).end();
      return;
    }

    if (message.method === 'tools/list') {
      openToolResponses.add(response);
      response.on('close', () => openToolResponses.delete(response));
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.write(': request intentionally left unanswered\n\n');
      return;
    }

    response.writeHead(404).end();
  });

  const client = await createMCPClient({
    transport: { type: 'http', url: server.url },
  });

  const timeoutRequest = client.listTools({
    options: { timeout: 50 },
  });
  const maxTotalTimeoutRequest = client.listTools({
    options: { maxTotalTimeout: 50 },
  });

  const [timeoutState, maxTotalTimeoutState] = await Promise.all([
    observePromise(timeoutRequest),
    observePromise(maxTotalTimeoutRequest),
  ]);
  const openResponseCount = openToolResponses.size;

  await client.close();
  await Promise.all([
    observePromise(timeoutRequest, 50),
    observePromise(maxTotalTimeoutRequest, 50),
  ]);
  await server.close();

  return {
    timeoutState,
    maxTotalTimeoutState,
    openToolResponses: openResponseCount,
  };
}

async function main() {
  const initialization = await reproduceUnboundedInitialization();
  const requests = await reproduceIgnoredRequestTimeouts();

  const initializationReproduced =
    initialization.state === 'pending' && initialization.responseStillOpen;
  const requestTimeoutsReproduced =
    requests.timeoutState === 'pending' &&
    requests.maxTotalTimeoutState === 'pending' &&
    requests.openToolResponses === 2;

  console.log(
    JSON.stringify(
      {
        expected: {
          initialization:
            'Initialization can be bounded or aborted and closes its transport when the deadline expires.',
          requests:
            'timeout and maxTotalTimeout reject unanswered requests and clean up their response handling.',
        },
        observed: {
          initialization,
          requests,
        },
      },
      null,
      2,
    ),
  );

  if (initializationReproduced && requestTimeoutsReproduced) {
    throw new Error(
      'ISSUE_18075_REPRODUCED: initialization and timed MCP requests remained pending with their HTTP responses open',
    );
  }

  throw new Error(
    'Issue #18075 was not fully reproduced: at least one reported timeout behavior settled or closed its response',
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
