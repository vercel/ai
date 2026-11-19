/*
 * Verifies that an E2B sandbox port carries what the bridge WebSocket of
 * bridge-backed harness adapters needs: a stock `ws` client receives HTTP 101
 * on the URL from `getPortEndpoint()` without any extra headers, the
 * in-sandbox upgrade sees that URL unchanged, frames pass in both directions
 * (bridge authentication is a challenge and a proof frame), WebSocket pings
 * reach the in-sandbox server and its pongs come back (the harness keepalive),
 * and the URL stays the same across reconnects and after reattaching to the
 * sandbox.
 */
import {
  createE2BNetworkSandboxSession,
  resumeE2BNetworkSandboxSession,
} from '@ai-sdk/sandbox-e2b';
import { WebSocket } from 'ws';
import { run } from '../lib/run';

const port = 4000;

/*
 * Dependency-free WebSocket server. After the upgrade it sends the request URL
 * exactly as it arrived inside the sandbox, echoes text frames, and answers a
 * ping with a pong plus a text frame that reports the ping, so the client can
 * tell that the ping reached the server rather than an intermediary.
 */
const serverSource = `
const { createHash } = require('node:crypto');
const { createServer } = require('node:http');

function frame(opcode, payload) {
  return Buffer.concat([Buffer.from([0x80 | opcode, payload.length]), payload]);
}

const server = createServer((request, response) => {
  response.writeHead(426).end();
});
server.on('upgrade', (request, socket) => {
  const accept = createHash('sha1')
    .update(request.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\\r\\n' +
      'Upgrade: websocket\\r\\n' +
      'Connection: Upgrade\\r\\n' +
      'Sec-WebSocket-Accept: ' + accept + '\\r\\n\\r\\n',
  );
  socket.write(frame(0x1, Buffer.from(request.url)));

  // Client frames are masked and, in this check, shorter than 126 bytes.
  let buffered = Buffer.alloc(0);
  socket.on('data', data => {
    buffered = Buffer.concat([buffered, data]);
    while (buffered.length >= 6 && buffered.length >= 6 + (buffered[1] & 0x7f)) {
      const opcode = buffered[0] & 0x0f;
      const length = buffered[1] & 0x7f;
      const mask = buffered.subarray(2, 6);
      const payload = Buffer.from(buffered.subarray(6, 6 + length));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
      buffered = buffered.subarray(6 + length);
      if (opcode === 0x1) {
        socket.write(frame(0x1, Buffer.concat([Buffer.from('echo:'), payload])));
      } else if (opcode === 0x9) {
        socket.write(frame(0xa, payload));
        socket.write(frame(0x1, Buffer.concat([Buffer.from('ping:'), payload])));
      } else if (opcode === 0x8) {
        socket.end(frame(0x8, Buffer.alloc(0)));
      }
    }
  });
});
server.listen(${port}, () => console.log('listening'));
`;

run(async () => {
  process.exitCode = 1;

  const session = await createE2BNetworkSandboxSession({
    ports: [port],
    timeoutMs: 5 * 60 * 1000,
  });
  try {
    await session.writeTextFile({ path: 'server.cjs', content: serverSource });
    const server = await session.spawn({ command: 'node server.cjs' });
    await waitForOutput({ stream: server.stdout, text: 'listening' });

    const endpoint = await session.getPortEndpoint({ port, protocol: 'ws' });
    console.log('endpoint:', endpoint);

    const first = await dial(endpoint.url);
    console.log('first connection:', first);
    const reconnect = await dial(endpoint.url);
    console.log('reconnect:', reconnect);

    const reattached = await resumeE2BNetworkSandboxSession({
      sandboxId: session.id,
    });
    const reattachedEndpoint = await reattached.getPortEndpoint({
      port,
      protocol: 'ws',
    });
    console.log('endpoint after reattaching:', reattachedEndpoint);
    console.log('ports after reattaching:', reattached.ports);
    const afterReattach = await dial(reattachedEndpoint.url);
    console.log('connection after reattaching:', afterReattach);

    if (endpoint.url !== `wss://${port}-${session.id}.e2b.app`) {
      throw new Error(`unexpected endpoint URL ${endpoint.url}`);
    }
    if (endpoint.headers != null) {
      throw new Error('the endpoint requires headers to connect');
    }
    if (reattachedEndpoint.url !== endpoint.url) {
      throw new Error('the URL changed after reattaching to the sandbox');
    }
    if (reattached.ports[0] !== port) {
      throw new Error('the reattached session does not list the bridge port');
    }
    for (const connection of [first, reconnect, afterReattach]) {
      if (connection.statusCode !== 101) {
        throw new Error(`expected HTTP 101, got ${connection.statusCode}`);
      }
      if (connection.requestUrl !== '/') {
        throw new Error(
          `the in-sandbox upgrade received ${connection.requestUrl} instead of /`,
        );
      }
    }

    console.log('ok: the E2B port carries the bridge WebSocket');
    process.exitCode = 0;
  } finally {
    await session.destroy();
  }
});

/*
 * Connects, then waits for the server's first frame before sending anything,
 * like the harness waits for the bridge's authentication challenge. Sends a
 * text frame and a ping and expects the echo, the pong, and the server's
 * report of the ping.
 */
function dial(url: string): Promise<{
  statusCode: number | undefined;
  requestUrl: string;
  echo: string;
  pong: string;
  serverSawPing: string;
}> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timeout = setTimeout(() => {
      socket.terminate();
      reject(new Error(`no complete exchange on ${url} within 30 seconds`));
    }, 30_000);
    let statusCode: number | undefined;
    let requestUrl: string | undefined;
    let echo: string | undefined;
    let pong: string | undefined;
    let serverSawPing: string | undefined;
    const finishIfComplete = () => {
      if (
        requestUrl === undefined ||
        echo === undefined ||
        pong === undefined ||
        serverSawPing === undefined
      ) {
        return;
      }
      clearTimeout(timeout);
      socket.close();
      if (echo !== 'echo:hello') {
        reject(new Error(`unexpected echo ${echo}`));
      } else if (pong !== 'keepalive' || serverSawPing !== 'ping:keepalive') {
        reject(new Error(`unexpected ping exchange ${pong} ${serverSawPing}`));
      } else {
        resolve({ statusCode, requestUrl, echo, pong, serverSawPing });
      }
    };
    socket.on('upgrade', response => {
      statusCode = response.statusCode;
    });
    socket.on('message', data => {
      const text = data.toString();
      if (requestUrl === undefined) {
        requestUrl = text;
        socket.send('hello');
        socket.ping('keepalive');
      } else if (text.startsWith('echo:')) {
        echo = text;
      } else if (text.startsWith('ping:')) {
        serverSawPing = text;
      }
      finishIfComplete();
    });
    socket.on('pong', data => {
      pong = data.toString();
      finishIfComplete();
    });
    socket.on('error', error => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

async function waitForOutput({
  stream,
  text,
}: {
  stream: ReadableStream<Uint8Array>;
  text: string;
}): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let output = '';
  try {
    while (!output.includes(text)) {
      const { value, done } = await reader.read();
      if (done) {
        throw new Error(`the process exited before printing "${text}"`);
      }
      output += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}
