/*
 * Verifies that an E2B sandbox port carries the bridge WebSocket contract of
 * bridge-backed harness adapters: a stock `ws` client receives HTTP 101 on
 * the URL from `getPortEndpoint()` plus `?agent_bridge_token=...` without any
 * extra headers, the in-sandbox upgrade sees that query unchanged, and the URL
 * stays the same across reconnects and after reattaching to the sandbox.
 */
import { randomBytes } from 'node:crypto';
import {
  createE2BNetworkSandboxSession,
  resumeE2BNetworkSandboxSession,
} from '@ai-sdk/sandbox-e2b';
import { WebSocket } from 'ws';
import { run } from '../lib/run';

const port = 4000;

// Reserved characters prove that the encoded value is not rewritten in transit.
const token = `${randomBytes(16).toString('hex')}/+&=?# %`;
const bridgeQuery = `?agent_bridge_token=${encodeURIComponent(token)}`;

/*
 * Dependency-free WebSocket server that completes the upgrade and sends back
 * the request URL exactly as it arrived inside the sandbox.
 */
const serverSource = `
const { createHash } = require('node:crypto');
const { createServer } = require('node:http');

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
  const payload = Buffer.from(request.url);
  socket.write(Buffer.concat([Buffer.from([0x81, payload.length]), payload]));
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

    const first = await dial(endpoint.url + bridgeQuery);
    console.log('first connection:', first);
    const reconnect = await dial(endpoint.url + bridgeQuery);
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
    const afterReattach = await dial(reattachedEndpoint.url + bridgeQuery);
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
      if (connection.requestUrl !== `/${bridgeQuery}`) {
        throw new Error(
          `the in-sandbox upgrade received ${connection.requestUrl} instead of /${bridgeQuery}`,
        );
      }
    }

    console.log('ok: the E2B port satisfies the bridge WebSocket contract');
    process.exitCode = 0;
  } finally {
    await session.destroy();
  }
});

function dial(url: string): Promise<{
  statusCode: number | undefined;
  statusMessage: string | undefined;
  requestUrl: string;
}> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    let statusCode: number | undefined;
    let statusMessage: string | undefined;
    socket.on('upgrade', response => {
      statusCode = response.statusCode;
      statusMessage = response.statusMessage;
    });
    socket.on('message', data => {
      socket.terminate();
      resolve({ statusCode, statusMessage, requestUrl: data.toString() });
    });
    socket.on('error', reject);
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
