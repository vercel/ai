import { createClaudeCode } from '@ai-sdk/harness-claude-code';
import type { HarnessV1NetworkSandboxSession } from '@ai-sdk/harness';
import { createServer, type Socket } from 'node:net';

const ISSUE_ERROR =
  'WebSocket was closed before the connection was established';
const STARTUP_TIMEOUT_ERROR =
  'claude-code bridge did not complete WebSocket handshake within';
const REPRODUCTION_SIGNAL =
  'ISSUE #19731 REPRODUCED: bridge timeout cleanup emitted an uncaught WebSocket error';

function textStream(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

async function main(): Promise<void> {
  const sockets = new Set<Socket>();
  const server = createServer(socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    // Deliberately do not answer the HTTP upgrade request, leaving the
    // WebSocket in CONNECTING until the harness startup timeout expires.
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (address == null || typeof address === 'string') {
    throw new Error('Failed to resolve the stalled bridge server address.');
  }

  const sandboxProcess = {
    stdout: textStream('{"type":"bridge-ready","port":4319}\n'),
    stderr: textStream(''),
    kill: async () => {},
    wait: () => new Promise<never>(() => {}),
  };
  const restrictedSandbox = {
    run: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    readTextFile: async () => null,
    writeTextFile: async () => {},
    spawn: async () => sandboxProcess,
  };
  const sandboxSession = {
    id: 'issue-19731',
    defaultWorkingDirectory: '/tmp/issue-19731',
    ports: [4319],
    restricted: () => restrictedSandbox,
    getPortEndpoint: async () => ({
      url: `ws://127.0.0.1:${address.port}`,
    }),
    getPortUrl: async () => `ws://127.0.0.1:${address.port}`,
    stop: async () => {},
    destroy: async () => {},
    addRequestTransformations: async () => {},
    ...restrictedSandbox,
  } as unknown as HarnessV1NetworkSandboxSession;

  const uncaughtErrors: Error[] = [];
  const onUncaughtException = (error: Error) => {
    uncaughtErrors.push(error);
  };
  process.on('uncaughtException', onUncaughtException);

  let startupError: unknown;
  try {
    await createClaudeCode({ startupTimeoutMs: 40 }).doStart({
      sessionId: 'issue-19731',
      sandboxSession,
      sessionWorkDir: '/tmp/issue-19731/session',
    });
  } catch (error) {
    startupError = error;
  }

  await new Promise(resolve => setImmediate(resolve));
  process.off('uncaughtException', onUncaughtException);

  for (const socket of sockets) socket.destroy();
  await new Promise<void>(resolve => server.close(() => resolve()));

  const startupMessage =
    startupError instanceof Error ? startupError.message : String(startupError);
  if (!startupMessage.includes(STARTUP_TIMEOUT_ERROR)) {
    throw new Error(
      `Expected the original bridge startup timeout, received: ${startupMessage}`,
    );
  }

  const cleanupError = uncaughtErrors.find(
    error => error.message === ISSUE_ERROR,
  );
  if (cleanupError) {
    console.error(REPRODUCTION_SIGNAL);
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
