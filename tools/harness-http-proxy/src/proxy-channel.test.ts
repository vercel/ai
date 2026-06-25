import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { type WebSocket, WebSocketServer } from 'ws';
import { ProxyChannel } from './proxy-channel';

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => {
    resolve = r;
  });
  return { promise, resolve };
}

/**
 * Minimal stand-in for the vendored Go proxy: completes the `ready`/`register`
 * handshake and lets the test push `request`/`connect` frames (the short aliases
 * the real binary emits) and capture what the channel sends back.
 */
async function startFakeProxy(opts?: { version?: string }) {
  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await new Promise<void>((resolve, reject) => {
    wss.once('listening', resolve);
    wss.once('error', reject);
  });
  const version = opts?.version ?? '2';
  const socketReady = deferred<WebSocket>();
  const sent: Array<Record<string, unknown>> = [];

  wss.on('connection', socket => {
    socket.on('message', data => {
      const msg = JSON.parse(data.toString());
      sent.push(msg);
      if (msg.type === 'ready') {
        socket.send(JSON.stringify({ type: 'ready-ack', version }));
      } else if (msg.type === 'register') {
        socket.send(
          JSON.stringify({
            type: 'register-ack',
            sessions: msg.sessions.map((s: { sessionId: string }) => ({
              sessionId: s.sessionId,
            })),
          }),
        );
        socketReady.resolve(socket);
      }
    });
  });

  const port = (wss.address() as AddressInfo).port;
  return {
    url: `ws://127.0.0.1:${port}/ws?token=test`,
    socketReady: socketReady.promise,
    sent,
    close: () => new Promise<void>(r => wss.close(() => r())),
  };
}

describe('ProxyChannel', () => {
  const channels: ProxyChannel[] = [];
  const servers: Array<{ close: () => Promise<void> }> = [];

  afterEach(async () => {
    await Promise.all(channels.map(c => c.close().catch(() => {})));
    await Promise.all(servers.map(s => s.close().catch(() => {})));
    channels.length = 0;
    servers.length = 0;
  });

  it('handshakes, registers, and round-trips an HTTP request (short alias)', async () => {
    const server = await startFakeProxy();
    servers.push(server);
    const channel = new ProxyChannel();
    channels.push(channel);

    await channel.connect(server.url);
    const env = await channel.register({
      sessionId: 's1',
      token: 't1',
      proxyPort: 41007,
      httpHandler: async req =>
        new Response(`OK ${new URL(req.url).pathname}`, { status: 200 }),
    });
    expect(env.HTTP_PROXY).toBe('http://s1:t1@127.0.0.1:41007');
    expect(env.NO_PROXY).toBe('127.0.0.1,localhost');

    const socket = await server.socketReady;
    const response = deferred<Record<string, unknown>>();
    socket.on('message', data => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'response') response.resolve(msg);
    });

    socket.send(
      JSON.stringify({
        type: 'request', // the Go binary's short alias for http-request
        requestId: 'r1',
        sessionId: 's1',
        method: 'GET',
        url: 'https://api.example.com/v1/models',
        headers: {},
      }),
    );

    const msg = await response.promise;
    expect(msg.type).toBe('response');
    expect(msg.requestId).toBe('r1');
    expect(msg.status).toBe(200);
    expect(Buffer.from(msg.body as string, 'base64').toString()).toBe(
      'OK /v1/models',
    );
  });

  it('answers a CONNECT request (allow-all by default)', async () => {
    const server = await startFakeProxy();
    servers.push(server);
    const channel = new ProxyChannel();
    channels.push(channel);

    await channel.connect(server.url);
    await channel.register({
      sessionId: 's1',
      token: 't1',
      proxyPort: 41007,
      httpHandler: async () => new Response('unused'),
    });

    const socket = await server.socketReady;
    const decision = deferred<Record<string, unknown>>();
    socket.on('message', data => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'connect-response') decision.resolve(msg);
    });

    socket.send(
      JSON.stringify({
        type: 'connect', // short alias for connect-request
        requestId: 'c1',
        sessionId: 's1',
        host: 'api.example.com:443',
      }),
    );

    const msg = await decision.promise;
    expect(msg.allow).toBe(true);
    expect(msg.requestId).toBe('c1');
  });

  it('rejects a protocol-version mismatch', async () => {
    const server = await startFakeProxy({ version: '1' });
    servers.push(server);
    const channel = new ProxyChannel();
    channels.push(channel);

    await expect(
      channel.connect(server.url, { timeoutMs: 800 }),
    ).rejects.toThrow(/protocol mismatch/i);
  });
});
