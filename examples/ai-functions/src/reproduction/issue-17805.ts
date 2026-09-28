import { WorkflowChatTransport } from '@ai-sdk/workflow/client';
import { spawn, type ChildProcess } from 'node:child_process';
import {
  createServer as createNetServer,
  createConnection,
  type Server,
} from 'node:net';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const FIRST_BYTE_DEADLINE_MS = 750;
const PROXY_IDLE_TIMEOUT_MS = 250;
const TRANSPORT_OBSERVATION_MS = 1_500;

async function getFreePort(): Promise<number> {
  const server = createNetServer();

  await new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolvePromise);
  });

  const address = server.address();
  if (address == null || typeof address === 'string') {
    throw new Error('Could not allocate a local TCP port.');
  }

  const port = address.port;
  await new Promise<void>((resolvePromise, reject) => {
    server.close(error => {
      if (error) {
        reject(error);
        return;
      }
      resolvePromise();
    });
  });
  return port;
}

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
): Promise<void> {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout?.on('data', chunk => {
    output += String(chunk);
  });
  child.stderr?.on('data', chunk => {
    output += String(chunk);
  });

  const exitCode = await new Promise<number | null>(
    (resolvePromise, reject) => {
      child.once('error', reject);
      child.once('exit', resolvePromise);
    },
  );

  if (exitCode !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} exited with ${exitCode}:\n${output}`,
    );
  }
}

async function waitForServer(port: number, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    if (child.exitCode != null) {
      throw new Error(`Next.js exited during startup with ${child.exitCode}.`);
    }

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // The server is not accepting requests yet.
    }

    await new Promise(resolvePromise => setTimeout(resolvePromise, 100));
  }

  throw new Error('Timed out waiting for the Next.js reproduction server.');
}

async function stopChild(child: ChildProcess | undefined): Promise<void> {
  if (child == null || child.exitCode != null) {
    return;
  }

  child.kill('SIGTERM');
  await Promise.race([
    new Promise<void>(resolvePromise => {
      child.once('exit', () => resolvePromise());
    }),
    new Promise<void>(resolvePromise => {
      setTimeout(() => {
        if (child.exitCode == null) {
          child.kill('SIGKILL');
        }
        resolvePromise();
      }, 3_000);
    }),
  ]);
}

async function receivedAnyResponseBytes({
  port,
  path,
  deadlineMs,
}: {
  port: number;
  path: string;
  deadlineMs: number;
}): Promise<boolean> {
  return new Promise<boolean>((resolvePromise, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    let settled = false;

    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolvePromise(result);
    };

    const timer = setTimeout(() => finish(false), deadlineMs);
    socket.once('error', error => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    });
    socket.once('connect', () => {
      socket.write(
        `GET ${path} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`,
      );
    });
    socket.once('data', () => finish(true));
  });
}

async function closeServer(server: Server | undefined): Promise<void> {
  if (server == null) return;

  await new Promise<void>((resolvePromise, reject) => {
    server.close(error => {
      if (error) {
        reject(error);
        return;
      }
      resolvePromise();
    });
  });
}

async function startIdleTimeoutProxy({
  originPort,
  idleTimeoutMs,
}: {
  originPort: number;
  idleTimeoutMs: number;
}): Promise<{
  port: number;
  server: Server;
  getIdleTimeoutCount: () => number;
}> {
  let idleTimeoutCount = 0;

  const server = createNetServer(client => {
    const origin = createConnection({
      host: '127.0.0.1',
      port: originPort,
    });
    let idleTimer: ReturnType<typeof setTimeout> | undefined;

    const clearIdleTimer = () => {
      if (idleTimer != null) clearTimeout(idleTimer);
    };
    const resetIdleTimer = () => {
      clearIdleTimer();
      idleTimer = setTimeout(() => {
        idleTimeoutCount++;
        origin.destroy();
        client.destroy();
      }, idleTimeoutMs);
    };

    client.on('data', chunk => {
      if (!origin.destroyed) origin.write(chunk);
    });
    client.on('end', () => origin.end());
    client.on('close', clearIdleTimer);
    client.on('error', () => {});

    origin.on('data', chunk => {
      resetIdleTimer();
      if (!client.destroyed) client.write(chunk);
    });
    origin.on('end', () => client.end());
    origin.on('close', clearIdleTimer);
    origin.on('error', () => client.destroy());
  });

  await new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolvePromise);
  });

  const address = server.address();
  if (address == null || typeof address === 'string') {
    throw new Error('Could not start the local idle-timeout proxy.');
  }

  return {
    port: address.port,
    server,
    getIdleTimeoutCount: () => idleTimeoutCount,
  };
}

async function observeWorkflowReconnectFailure({
  originPort,
}: {
  originPort: number;
}): Promise<{ idleTimeoutCount: number; errorMessage: string | undefined }> {
  const proxy = await startIdleTimeoutProxy({
    originPort,
    idleTimeoutMs: PROXY_IDLE_TIMEOUT_MS,
  });
  const abortController = new AbortController();
  const observationTimer = setTimeout(
    () => abortController.abort(),
    TRANSPORT_OBSERVATION_MS,
  );

  try {
    const transport = new WorkflowChatTransport({
      api: `http://127.0.0.1:${proxy.port}/api/chat`,
      maxConsecutiveErrors: 3,
    });
    const stream = await transport.reconnectToStream({
      chatId: 'test-chat',
      abortSignal: abortController.signal,
      startIndex: 0,
    });
    const reader = stream!.getReader();
    let errorMessage: string | undefined;

    try {
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    }

    return {
      idleTimeoutCount: proxy.getIdleTimeoutCount(),
      errorMessage,
    };
  } finally {
    clearTimeout(observationTimer);
    abortController.abort();
    await closeServer(proxy.server);
  }
}

async function createNextApp(appDirectory: string): Promise<void> {
  const nextWorkflowDirectory = resolve(process.cwd(), '../next-workflow');

  await mkdir(join(appDirectory, 'app/api/health'), { recursive: true });
  await mkdir(join(appDirectory, 'app/api/idle'), { recursive: true });
  await mkdir(join(appDirectory, 'app/api/chat/[chatId]/stream'), {
    recursive: true,
  });
  await symlink(
    join(nextWorkflowDirectory, 'node_modules'),
    join(appDirectory, 'node_modules'),
    'dir',
  );

  await writeFile(
    join(appDirectory, 'package.json'),
    JSON.stringify({
      private: true,
      scripts: {},
      dependencies: {
        ai: '7.0.120',
        next: '16.3.3',
        react: '18.3.1',
        'react-dom': '18.3.1',
      },
    }),
  );
  await writeFile(
    join(appDirectory, 'next.config.mjs'),
    "export default { output: 'standalone' };\n",
  );
  await writeFile(
    join(appDirectory, 'app/api/health/route.ts'),
    "export function GET() { return new Response('ok'); }\n",
  );

  const responseFactory = `
import { createUIMessageStreamResponse, type UIMessageChunk } from 'ai';

export const dynamic = 'force-dynamic';

type KeepAliveOptions =
  Parameters<typeof createUIMessageStreamResponse>[0] & {
    keepAliveMs: number;
  };

function createIdleResponse() {
  return createUIMessageStreamResponse({
    stream: new ReadableStream<UIMessageChunk>(),
    keepAliveMs: 100,
  } as KeepAliveOptions);
}
`;

  await writeFile(
    join(appDirectory, 'app/api/idle/route.ts'),
    `${responseFactory}
export function GET() {
  return createIdleResponse();
}
`,
  );
  await writeFile(
    join(appDirectory, 'app/api/chat/[chatId]/stream/route.ts'),
    `${responseFactory}
const encoder = new TextEncoder();

export function GET() {
  const response = createIdleResponse();
  const reader = response.body!.getReader();
  let sentOpenComment = false;

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!sentOpenComment) {
        sentOpenComment = true;
        controller.enqueue(encoder.encode(': stream-open\\n\\n'));
        return;
      }

      const { done, value } = await reader.read();
      if (done) {
        controller.close();
      } else {
        controller.enqueue(value);
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
`,
  );
}

async function main(): Promise<void> {
  const temporaryRoot = await mkdtemp(
    join(process.cwd(), '.issue-17805-next-app-'),
  );
  const appDirectory = join(temporaryRoot, 'app');
  const nextBin = resolve(
    process.cwd(),
    '../next-workflow/node_modules/next/dist/bin/next',
  );
  const port = await getFreePort();
  let nextServer: ChildProcess | undefined;

  try {
    await mkdir(appDirectory);
    await createNextApp(appDirectory);
    await runCommand(process.execPath, [nextBin, 'build'], appDirectory);

    nextServer = spawn(
      process.execPath,
      [nextBin, 'start', '--hostname', '127.0.0.1', '--port', String(port)],
      {
        cwd: appDirectory,
        env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    let serverOutput = '';
    nextServer.stdout?.on('data', chunk => {
      serverOutput += String(chunk);
    });
    nextServer.stderr?.on('data', chunk => {
      serverOutput += String(chunk);
    });

    try {
      await waitForServer(port, nextServer);
    } catch (error) {
      throw new Error(`${String(error)}\n${serverOutput}`);
    }

    const idleResponseOpened = await receivedAnyResponseBytes({
      port,
      path: '/api/idle',
      deadlineMs: FIRST_BYTE_DEADLINE_MS,
    });
    const reconnect = await observeWorkflowReconnectFailure({
      originPort: port,
    });
    const exhaustedReconnectBudget =
      reconnect.idleTimeoutCount === 3 &&
      reconnect.errorMessage?.includes(
        'Failed to reconnect after 3 consecutive errors',
      ) === true;

    if (!idleResponseOpened && exhaustedReconnectBudget) {
      console.error(
        'ISSUE_17805_REPRODUCED: idle stream sent no first byte and heartbeat-free stream exhausted 3 reconnect attempts',
      );
      process.exitCode = 1;
      return;
    }

    if (!idleResponseOpened) {
      throw new Error(
        'Idle createUIMessageStreamResponse did not send an initial response byte.',
      );
    }
    if (exhaustedReconnectBudget) {
      throw new Error(
        'The stream was terminated by the idle-timeout proxy until WorkflowChatTransport exhausted its reconnect budget.',
      );
    }
    if (reconnect.idleTimeoutCount > 0) {
      throw new Error(
        `The idle-timeout proxy terminated ${reconnect.idleTimeoutCount} stream connection(s).`,
      );
    }
  } finally {
    await stopChild(nextServer);
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
