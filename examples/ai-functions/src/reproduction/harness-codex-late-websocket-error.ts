import { createCodex } from '@ai-sdk/harness-codex';
import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';
import { WebSocket, WebSocketServer } from 'ws';

const FAILURE_SIGNAL =
  'ISSUE #21955 reproduced: a late WebSocket error reached uncaughtException';

async function waitUntil({
  predicate,
  timeoutMs,
}: {
  predicate: () => boolean;
  timeoutMs: number;
}): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error('Timed out waiting for the Codex channel to reconnect.');
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

async function listen(server: WebSocketServer): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  if (address == null || typeof address === 'string') {
    throw new Error('Expected the WebSocket server to listen on a TCP port.');
  }
  return address.port;
}

async function closeServer(server: WebSocketServer): Promise<void> {
  for (const client of server.clients) {
    client.terminate();
  }
  await new Promise<void>(resolve => server.close(() => resolve()));
}

async function main(): Promise<void> {
  const server = new WebSocketServer({ port: 0 });
  const port = await listen(server);
  const endpointUrl = `ws://127.0.0.1:${port}`;
  let connectionCount = 0;
  let clientErrorCount = 0;
  let firstConnection: WebSocket | undefined;
  const originalEmit = WebSocket.prototype.emit;
  WebSocket.prototype.emit = function (
    this: WebSocket,
    eventName: string | symbol,
    ...args: unknown[]
  ): boolean {
    if (
      eventName === 'error' &&
      this.url.startsWith(endpointUrl) &&
      this.url !== endpointUrl
    ) {
      clientErrorCount++;
    }
    return originalEmit.call(this, eventName, ...args);
  } as typeof WebSocket.prototype.emit;

  server.on('connection', socket => {
    connectionCount++;
    firstConnection ??= socket;
  });

  const sandboxSession = {
    async run() {
      return {
        exitCode: 0,
        stdout: '/tmp/ai-sdk-issue-21955\n',
        stderr: '',
      };
    },
  } as unknown as Experimental_SandboxSession;

  const harness = createCodex({
    port,
    portEndpoint: { url: endpointUrl },
    reconnect: {
      maxElapsedMs: 1_000,
      initialDelayMs: 10,
      maxDelayMs: 20,
    },
  });

  let uncaughtException: unknown;
  const onUncaughtException = (error: unknown) => {
    uncaughtException = error;
  };
  process.once('uncaughtException', onUncaughtException);

  let session: Awaited<ReturnType<(typeof harness)['doStart']>> | undefined;

  try {
    session = await harness.doStart({
      sessionId: 'issue-21955',
      sandboxSession,
      sessionWorkDir: '/tmp/ai-sdk-issue-21955',
      resumeFrom: {
        type: 'resume-session',
        harnessId: 'codex',
        specificationVersion: 'harness-v1',
        data: {
          bridge: {
            port,
            token: 'reproduction-token',
            lastSeenEventId: 0,
          },
        },
      },
    });

    if (firstConnection == null) {
      throw new Error('The Codex harness did not establish a WebSocket.');
    }

    // Send a malformed server frame after doStart has completed. `ws` emits
    // `error` and then `close` for this established connection, exercising the
    // same late-error path as a transport failure without provider access.
    const transport = (
      firstConnection as WebSocket & {
        _socket: { write(data: Uint8Array): void };
      }
    )._socket;
    transport.write(Uint8Array.from([0xc1, 0x00]));

    await waitUntil({
      predicate: () =>
        uncaughtException != null ||
        (clientErrorCount >= 1 && connectionCount >= 2),
      timeoutMs: 2_000,
    });

    if (uncaughtException != null) {
      throw new Error(FAILURE_SIGNAL, { cause: uncaughtException });
    }

    console.log(
      `Late WebSocket error was handled; observed ${clientErrorCount} client error event and ${connectionCount} connections.`,
    );
  } finally {
    WebSocket.prototype.emit = originalEmit;
    process.removeListener('uncaughtException', onUncaughtException);
    await session?.doDestroy();
    await closeServer(server);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
