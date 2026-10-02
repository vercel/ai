import {
  type HarnessV1NetworkSandboxSession,
  type HarnessV1PortEndpoint,
} from '@ai-sdk/harness';
import { createCodex } from '@ai-sdk/harness-codex';
import { EventEmitter } from 'node:events';
import { type WebSocket, WebSocketServer } from 'ws';

type Emit = (eventName: string | symbol, ...args: unknown[]) => boolean;

function textStream(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      if (text.length > 0) {
        controller.enqueue(new TextEncoder().encode(text));
      }
      controller.close();
    },
  });
}

function createSandboxSession({
  endpoint,
}: {
  endpoint: HarnessV1PortEndpoint;
}): HarnessV1NetworkSandboxSession {
  const process = {
    stdout: textStream('{"type":"bridge-ready","port":4319}\n'),
    stderr: textStream(''),
    kill: async () => {},
    wait: async () => ({ exitCode: 0 }),
  };
  const restrictedSession = {
    run: async ({ command }: { command: string }) => ({
      exitCode: 0,
      stdout:
        command === 'pwd'
          ? '/vercel/sandbox\n'
          : command === 'printf "%s" "$HOME"'
            ? '/home/vercel-sandbox'
            : '',
      stderr: '',
    }),
    readTextFile: async () => null,
    writeTextFile: async () => {},
    spawn: async () => process,
  };

  return {
    id: 'issue-21955',
    defaultWorkingDirectory: '/vercel/sandbox',
    ports: [4319],
    restricted: () => restrictedSession,
    getPortEndpoint: async () => endpoint,
    getPortUrl: async () => endpoint.url,
    addRequestTransformations: async () => {},
    stop: async () => {},
    ...restrictedSession,
  } as unknown as HarnessV1NetworkSandboxSession;
}

async function waitFor(
  predicate: () => boolean,
  description: string,
): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for ${description}.`);
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

async function main(): Promise<void> {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const address = server.address();
  if (typeof address === 'string' || address == null) {
    throw new Error('Expected the WebSocket server to use a TCP port.');
  }

  const openedClients: WebSocket[] = [];
  const prototype = EventEmitter.prototype as unknown as { emit: Emit };
  const originalEmit = prototype.emit;
  prototype.emit = function (eventName, ...args) {
    if (
      eventName === 'open' &&
      typeof Reflect.get(this, 'url') === 'string' &&
      Reflect.get(this, 'url').startsWith('ws://')
    ) {
      openedClients.push(this as unknown as WebSocket);
    }
    return originalEmit.call(this, eventName, ...args);
  };

  let session:
    | Awaited<ReturnType<ReturnType<typeof createCodex>['doStart']>>
    | undefined;
  try {
    session = await createCodex({
      reconnect: {
        initialDelayMs: 1,
        maxDelayMs: 10,
        maxElapsedMs: 1_000,
      },
    }).doStart({
      sessionId: 'issue-21955',
      sandboxSession: createSandboxSession({
        endpoint: { url: `ws://127.0.0.1:${address.port}` },
      }),
      sessionWorkDir: '/vercel/sandbox/codex-issue-21955',
    });

    await waitFor(() => openedClients.length === 1, 'the initial connection');
    const initialClient = openedClients[0];
    const listenersAfterSessionStart = initialClient.listenerCount('error');

    let thrown: unknown;
    try {
      initialClient.emit('error', new Error('injected late ECONNRESET'));
    } catch (error) {
      thrown = error;
    }

    if (thrown != null) {
      throw new Error(
        `Late WebSocket error escaped as an uncaught EventEmitter error: ${String(thrown)}`,
      );
    }

    await waitFor(
      () => openedClients.length === 2,
      'SandboxChannel to reconnect',
    );

    console.log(
      JSON.stringify({
        listenersAfterSessionStart,
        clientErrorEvents: 1,
        connections: openedClients.length,
        outcome: 'late error handled and channel reconnected',
      }),
    );
  } finally {
    prototype.emit = originalEmit;
    await session?.doDestroy();
    for (const client of server.clients) {
      client.terminate();
    }
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
