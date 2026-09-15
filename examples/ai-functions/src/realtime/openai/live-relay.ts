import { openai } from '@ai-sdk/openai';
import { createServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { relayLiveConnection } from './live-relay-connection';

// Local example: authenticate and authorize upgrades before exposing a relay.
const port = Number(process.env.PORT ?? 4318);
const allowedOrigin = process.env.ALLOWED_ORIGIN ?? 'http://localhost:3000';
const model = openai.experimental_realtime('gpt-live-1');
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
    try {
      const { url, headers } = model.getServerWebSocketConfig();
      relayLiveConnection(
        client,
        new WebSocket(url, { headers, handshakeTimeout: 10_000 }),
      );
    } catch {
      client.on('error', () => client.terminate());
      client.close(1011, 'Relay setup failed');
    }
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Live relay: ws://localhost:${port}/live (${allowedOrigin})`);
});
