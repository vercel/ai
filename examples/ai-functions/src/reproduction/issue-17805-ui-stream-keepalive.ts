import {
  createServer,
  request,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { createUIMessageStreamResponse, type UIMessageChunk } from 'ai';

const PROXY_TIMEOUT_MS = 300;
const CLIENT_TIMEOUT_MS = 2_000;

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  if (address == null || typeof address === 'string') {
    throw new Error('Expected the server to listen on a TCP port.');
  }

  return address.port;
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close(error => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
    server.closeAllConnections();
  });
}

function createIdleUIMessageStream({
  emitInitialChunk,
}: {
  emitInitialChunk: boolean;
}): ReadableStream<UIMessageChunk> {
  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      if (emitInitialChunk) {
        controller.enqueue({ type: 'text-start', id: 'text-1' });
      }
      // Intentionally remain open and idle, matching a resumable stream at its
      // live edge while the workflow waits for more work.
    },
  });
}

async function writeWebResponseToNodeResponse(
  webResponse: Response,
  nodeResponse: ServerResponse,
): Promise<void> {
  const headers: Record<string, string> = {};
  webResponse.headers.forEach((value, name) => {
    headers[name] = value;
  });
  nodeResponse.writeHead(webResponse.status, headers);

  const reader = webResponse.body!.getReader();
  const cancelReader = () => {
    reader.cancel(new Error('Client disconnected.')).catch(() => {});
  };
  nodeResponse.once('close', cancelReader);

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done || nodeResponse.destroyed) {
        break;
      }
      nodeResponse.write(value);
    }

    if (!nodeResponse.destroyed) {
      nodeResponse.end();
    }
  } finally {
    nodeResponse.off('close', cancelReader);
  }
}

function copyStreamHeaders(
  upstreamResponse: IncomingMessage,
): Record<string, string> {
  const headers: Record<string, string> = {};

  for (const name of [
    'cache-control',
    'content-type',
    'x-accel-buffering',
    'x-vercel-ai-ui-message-stream',
  ]) {
    const value = upstreamResponse.headers[name];
    if (typeof value === 'string') {
      headers[name] = value;
    }
  }

  return headers;
}

function createTimeoutProxy(originPort: number): Server {
  return createServer((clientRequest, clientResponse) => {
    const upstreamRequest = request(
      {
        host: '127.0.0.1',
        port: originPort,
        path: clientRequest.url,
        method: clientRequest.method,
      },
      upstreamResponse => {
        clearTimeout(originResponseTimer);

        clientResponse.writeHead(
          upstreamResponse.statusCode ?? 502,
          copyStreamHeaders(upstreamResponse),
        );

        let idleTimer = setTimeout(disconnectIdleStream, PROXY_TIMEOUT_MS);

        function disconnectIdleStream() {
          upstreamRequest.destroy();
          clientResponse.socket?.destroy();
        }

        upstreamResponse.on('data', chunk => {
          clearTimeout(idleTimer);
          clientResponse.write(chunk);
          idleTimer = setTimeout(disconnectIdleStream, PROXY_TIMEOUT_MS);
        });
        upstreamResponse.on('end', () => {
          clearTimeout(idleTimer);
          clientResponse.end();
        });
        upstreamResponse.on('error', () => {
          clearTimeout(idleTimer);
          clientResponse.socket?.destroy();
        });
      },
    );

    const originResponseTimer = setTimeout(() => {
      upstreamRequest.destroy();
      clientResponse.writeHead(524, { 'content-type': 'text/plain' });
      clientResponse.end('Simulated proxy origin response timeout.');
    }, PROXY_TIMEOUT_MS);

    upstreamRequest.on('error', () => {
      clearTimeout(originResponseTimer);
      if (!clientResponse.headersSent) {
        clientResponse.writeHead(502).end();
      }
    });
    clientResponse.on('close', () => {
      clearTimeout(originResponseTimer);
      upstreamRequest.destroy();
    });
    upstreamRequest.end();
  });
}

async function readCompletedResponse(url: URL): Promise<{
  statusCode: number;
  body: string;
}> {
  return new Promise((resolve, reject) => {
    const clientRequest = request(url, response => {
      const chunks: Buffer[] = [];
      response.on('data', chunk => chunks.push(Buffer.from(chunk)));
      response.on('end', () => {
        resolve({
          statusCode: response.statusCode ?? 0,
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });
    clientRequest.once('error', reject);
    clientRequest.setTimeout(CLIENT_TIMEOUT_MS, () => {
      clientRequest.destroy(new Error('Client timed out.'));
    });
    clientRequest.end();
  });
}

async function observePrematureDisconnect(url: URL): Promise<{
  statusCode: number;
  bodyBeforeDisconnect: string;
  prematurelyDisconnected: boolean;
}> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (result: {
      statusCode: number;
      bodyBeforeDisconnect: string;
      prematurelyDisconnected: boolean;
    }) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };

    const clientRequest = request(url, response => {
      const chunks: Buffer[] = [];
      response.on('data', chunk => chunks.push(Buffer.from(chunk)));
      response.on('end', () => {
        finish({
          statusCode: response.statusCode ?? 0,
          bodyBeforeDisconnect: Buffer.concat(chunks).toString('utf8'),
          prematurelyDisconnected: false,
        });
      });
      response.on('aborted', () => {
        finish({
          statusCode: response.statusCode ?? 0,
          bodyBeforeDisconnect: Buffer.concat(chunks).toString('utf8'),
          prematurelyDisconnected: true,
        });
      });
      response.on('error', () => {
        finish({
          statusCode: response.statusCode ?? 0,
          bodyBeforeDisconnect: Buffer.concat(chunks).toString('utf8'),
          prematurelyDisconnected: true,
        });
      });
    });

    clientRequest.once('error', reject);
    clientRequest.setTimeout(CLIENT_TIMEOUT_MS, () => {
      clientRequest.destroy(new Error('Client timed out.'));
    });
    clientRequest.end();
  });
}

async function main() {
  const origin = createServer((request, response) => {
    const webResponse = createUIMessageStreamResponse({
      stream: createIdleUIMessageStream({
        emitInitialChunk: request.url === '/first-byte-then-idle',
      }),
    });

    writeWebResponseToNodeResponse(webResponse, response).catch(error => {
      if (!response.destroyed) {
        response.destroy(error);
      }
    });
  });

  let proxy: Server | undefined;

  try {
    const originPort = await listen(origin);
    proxy = createTimeoutProxy(originPort);
    const proxyPort = await listen(proxy);

    const idleResult = await readCompletedResponse(
      new URL(`http://127.0.0.1:${proxyPort}/idle`),
    );
    const firstByteResult = await observePrematureDisconnect(
      new URL(`http://127.0.0.1:${proxyPort}/first-byte-then-idle`),
    );

    const initialSseChunk = 'data: {"type":"text-start","id":"text-1"}\n\n';
    const reproducedHeaderTimeout =
      idleResult.statusCode === 524 &&
      idleResult.body === 'Simulated proxy origin response timeout.';
    const reproducedIdleDisconnect =
      firstByteResult.statusCode === 200 &&
      firstByteResult.bodyBeforeDisconnect.includes(initialSseChunk) &&
      firstByteResult.prematurelyDisconnected;

    if (reproducedHeaderTimeout && reproducedIdleDisconnect) {
      throw new Error(
        'ISSUE #17805 REPRODUCED: idle UI stream timed out with 524 before headers; first-byte UI stream was disconnected after byte silence',
      );
    }

    if (idleResult.statusCode !== 200) {
      throw new Error(
        `Idle UI stream did not open successfully: status ${idleResult.statusCode}.`,
      );
    }
    if (firstByteResult.prematurelyDisconnected) {
      throw new Error(
        'First-byte UI stream was disconnected instead of remaining alive.',
      );
    }

    console.log(
      'Idle UI streams opened immediately and remained alive through the proxy timeout.',
    );
  } finally {
    if (proxy) {
      await close(proxy);
    }
    await close(origin);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
