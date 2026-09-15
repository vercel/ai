import { openai } from '@ai-sdk/openai';
import { createServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';

// Local example: authenticate and authorize upgrades before exposing a relay.
const port = Number(process.env.PORT ?? 4318);
const allowedOrigin = process.env.ALLOWED_ORIGIN ?? 'http://localhost:3000';
const model = openai.experimental_live('gpt-live-1');
const server = createServer((_, response) => {
  response.writeHead(200, { 'Content-Type': 'text/plain' });
  response.end('OpenAI Live WebSocket relay. Connect on /live.');
});
const clients = new WebSocketServer({ noServer: true, maxPayload: 128 * 1024 });

server.on('upgrade', (request, socket, head) => {
  if (request.url !== '/live' || request.headers.origin !== allowedOrigin) {
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    return;
  }
  clients.handleUpgrade(request, socket, head, client => {
    const { url, headers } = model.getServerWebSocketConfig();
    const upstream = new WebSocket(url, { headers, handshakeTimeout: 10_000 });
    const queued: Buffer[] = [];
    let queuedBytes = 0;
    const timeout = setTimeout(() => stop(), 10 * 60 * 1000);
    const stop = () => {
      clearTimeout(timeout);
      queued.length = 0;
      queuedBytes = 0;
      if (upstream.readyState !== WebSocket.CLOSED) upstream.terminate();
      if (client.readyState === WebSocket.OPEN) client.close();
    };
    const forward = (target: WebSocket, data: Buffer) => {
      if (target.bufferedAmount + data.byteLength > 1024 * 1024) {
        stop();
        return;
      }
      target.send(data, { binary: false });
    };
    client.on('message', (data, binary) => {
      if (binary) return stop();
      const bytes = Buffer.isBuffer(data)
        ? data
        : Array.isArray(data)
          ? Buffer.concat(data)
          : Buffer.from(data);
      if (upstream.readyState === WebSocket.OPEN) forward(upstream, bytes);
      else if (upstream.readyState === WebSocket.CONNECTING) {
        queuedBytes += bytes.byteLength;
        if (queuedBytes > 1024 * 1024) return stop();
        queued.push(bytes);
      }
    });
    upstream.on('open', () => {
      for (const data of queued) {
        if (upstream.readyState !== WebSocket.OPEN) break;
        forward(upstream, data);
      }
      queued.length = 0;
      queuedBytes = 0;
    });
    upstream.on('message', (data, binary) => {
      if (binary) return stop();
      if (client.readyState !== WebSocket.OPEN) return;
      forward(
        client,
        Buffer.isBuffer(data)
          ? data
          : Array.isArray(data)
            ? Buffer.concat(data)
            : Buffer.from(data),
      );
    });
    client.on('error', stop);
    client.on('close', stop);
    upstream.on('error', stop);
    upstream.on('close', stop);
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Live relay: ws://localhost:${port}/live (${allowedOrigin})`);
});
