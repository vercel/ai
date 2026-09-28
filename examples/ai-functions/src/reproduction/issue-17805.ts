import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import path from 'node:path';

const KEEP_ALIVE_MS = 100;
const PROXY_TIMEOUT_MS = 250;
const OBSERVATION_MS = PROXY_TIMEOUT_MS * 3;

type Observation = {
  closedByPeer: boolean;
  rawResponse: string;
};

async function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address == null || typeof address === 'string') {
        server.close();
        reject(new Error('Could not allocate a local TCP port.'));
        return;
      }

      server.close(error => {
        if (error) {
          reject(error);
        } else {
          resolve(address.port);
        }
      });
    });
  });
}

async function waitForServer(port: number, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    if (child.exitCode != null) {
      throw new Error(`Next.js exited early with code ${child.exitCode}.`);
    }

    try {
      const response = await fetch(
        `http://127.0.0.1:${port}/api/reproduction-17805?mode=warmup`,
      );
      await response.text();
      return;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  throw new Error('Timed out waiting for the Next.js reproduction server.');
}

async function observeRawResponse(
  port: number,
  mode: 'idle' | 'seeded',
  durationMs: number,
): Promise<Observation> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({
      host: '127.0.0.1',
      port,
    });
    const chunks: Buffer[] = [];
    let settled = false;

    const timer = setTimeout(() => {
      settled = true;
      socket.destroy();
      resolve({
        closedByPeer: false,
        rawResponse: Buffer.concat(chunks).toString('utf8'),
      });
    }, durationMs);

    socket.once('connect', () => {
      socket.write(
        [
          `GET /api/reproduction-17805?mode=${mode} HTTP/1.1`,
          `Host: 127.0.0.1:${port}`,
          'Accept: text/event-stream',
          'Connection: close',
          '',
          '',
        ].join('\r\n'),
      );
    });

    socket.on('data', chunk => {
      chunks.push(chunk);
    });

    socket.once('error', error => {
      clearTimeout(timer);
      reject(error);
    });

    socket.once('close', () => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      resolve({
        closedByPeer: true,
        rawResponse: Buffer.concat(chunks).toString('utf8'),
      });
    });
  });
}

async function startTimeoutProxy(originPort: number): Promise<{
  port: number;
  stop: () => Promise<void>;
}> {
  const sockets = new Set<net.Socket>();
  const server = net.createServer(client => {
    const origin = net.createConnection({
      host: '127.0.0.1',
      port: originPort,
    });
    sockets.add(client);
    sockets.add(origin);

    let responseStarted = false;
    let timeout: NodeJS.Timeout;

    const resetTimeout = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        if (!responseStarted) {
          client.end(
            [
              'HTTP/1.1 524 A Timeout Occurred',
              'Content-Length: 0',
              'Connection: close',
              '',
              '',
            ].join('\r\n'),
          );
        } else {
          client.destroy();
        }
        origin.destroy();
      }, PROXY_TIMEOUT_MS);
    };

    resetTimeout();
    client.pipe(origin);

    origin.on('data', chunk => {
      responseStarted = true;
      resetTimeout();
      client.write(chunk);
    });

    origin.once('close', () => {
      clearTimeout(timeout);
      client.end();
    });
    origin.once('error', () => client.destroy());
    client.once('error', () => origin.destroy());
    client.once('close', () => {
      clearTimeout(timeout);
      origin.destroy();
      sockets.delete(client);
      sockets.delete(origin);
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (address == null || typeof address === 'string') {
    server.close();
    throw new Error('Could not start the local timeout proxy.');
  }

  return {
    port: address.port,
    stop: async () => {
      for (const socket of sockets) {
        socket.destroy();
      }
      await new Promise<void>((resolve, reject) => {
        server.close(error => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    },
  };
}

async function stopServer(child: ChildProcess): Promise<void> {
  if (child.exitCode != null) {
    return;
  }

  child.kill('SIGTERM');

  await Promise.race([
    new Promise<void>(resolve => child.once('exit', () => resolve())),
    new Promise<void>(resolve =>
      setTimeout(() => {
        child.kill('SIGKILL');
        resolve();
      }, 3_000),
    ),
  ]);
}

async function main() {
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const repositoryRoot = path.resolve(scriptDirectory, '../../../..');
  const port = await getAvailablePort();
  const serverOutput: string[] = [];
  let stopProxy: (() => Promise<void>) | undefined;

  const child = spawn(
    'pnpm',
    [
      '-C',
      'examples/next',
      'exec',
      'next',
      'dev',
      '--hostname',
      '127.0.0.1',
      '--port',
      String(port),
    ],
    {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  child.stdout?.on('data', chunk => serverOutput.push(String(chunk)));
  child.stderr?.on('data', chunk => serverOutput.push(String(chunk)));

  try {
    await waitForServer(port, child);

    const proxy = await startTimeoutProxy(port);
    stopProxy = proxy.stop;

    const idle = await observeRawResponse(proxy.port, 'idle', OBSERVATION_MS);
    const seeded = await observeRawResponse(
      proxy.port,
      'seeded',
      OBSERVATION_MS,
    );

    const idleTimedOut = idle.rawResponse.startsWith(
      'HTTP/1.1 524 A Timeout Occurred',
    );
    const responseBody = seeded.rawResponse.split('\r\n\r\n', 2)[1] ?? '';
    const keepAliveObserved = /^:/m.test(responseBody);
    const seededDisconnected = seeded.closedByPeer;

    if (idleTimedOut && seededDisconnected && !keepAliveObserved) {
      console.error(
        'ISSUE_17805_REPRODUCED: idle stream timed out with 524 and seeded stream was disconnected after byte silence',
      );
      process.exitCode = 1;
      return;
    }

    if (idleTimedOut) {
      console.error('Expected the idle stream to avoid a proxy 524 timeout.');
      process.exitCode = 1;
      return;
    }

    if (seededDisconnected || !keepAliveObserved) {
      console.error(
        'Expected the seeded stream to emit keepalives and remain connected.',
      );
      process.exitCode = 1;
      return;
    }

    console.log(
      'Idle UI message responses flushed immediately and stayed active with keepalive bytes.',
    );
  } catch (error) {
    console.error(serverOutput.join(''));
    throw error;
  } finally {
    await stopProxy?.();
    await stopServer(child);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
