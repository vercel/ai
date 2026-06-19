// Live "101" proof for the bridge contract: a stock `ws` client dialing the URL
// returned by `getPortUrl` completes a real WebSocket upgrade, the appended
// `?agent_bridge_token=…` query arrives intact at the in-sandbox upgrade, and
// the URL is stable across reconnects.
//
// This is the end-to-end test the harness sandbox-provider issue asks every
// bridge-capable provider to pass (the same shape run for Sprites). It exercises
// the adapter's *own* `getPortUrl` code path rather than re-deriving the URL:
//
//   - The in-sandbox bridge is a real `WebSocketServer` that enforces the token
//     exactly as the harness bridge does (rejects mismatches with 401, accepts
//     matches with a 101 upgrade) — see packages/harness/src/bridge/index.ts.
//   - Tensorlake's authenticated TCP tunnel is modeled by a real `net` forward:
//     an ephemeral localhost listener that raw-pipes bytes to the bridge port.
//     That L4-transparent forward is precisely what the production adapter
//     relies on to pass the WS upgrade (query string included) through untouched.
//
// Node-only: it binds real loopback sockets.

import net, { type AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';
import { type Sandbox } from 'tensorlake';
import { createTensorlakeSandbox } from './tensorlake-sandbox';

const TOKEN = 'live-bridge-token';

const cleanups: Array<() => PromiseLike<void> | void> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

/**
 * A real `WebSocketServer` standing in for the in-sandbox harness bridge. It
 * verifies the `agent_bridge_token` query on the upgrade request the same way
 * the production bridge does, records every token it saw, and echoes messages
 * so a successful round-trip proves bytes flow through the tunnel.
 */
async function startBridgeServer(): Promise<{
  port: number;
  seenTokens: Array<string | null>;
}> {
  const seenTokens: Array<string | null> = [];
  const wss = new WebSocketServer({
    host: '127.0.0.1',
    port: 0,
    verifyClient: ({ req }, done) => {
      const url = new URL(req.url ?? '', 'http://localhost');
      const provided = url.searchParams.get('agent_bridge_token');
      // Record what reached the upgrade so the test can assert the query was
      // delivered intact, even when it is rejected as invalid.
      seenTokens.push(provided);
      if (provided !== TOKEN) {
        done(false, 401, 'Unauthorized');
        return;
      }
      done(true);
    },
  });
  wss.on('connection', socket => {
    socket.on('message', data => socket.send(data));
  });
  cleanups.push(() => new Promise<void>(resolve => wss.close(() => resolve())));
  await new Promise<void>((resolve, reject) => {
    wss.on('listening', resolve);
    wss.on('error', reject);
  });
  return { port: (wss.address() as AddressInfo).port, seenTokens };
}

/** Start a raw TCP forward `127.0.0.1:<ephemeral>` → `127.0.0.1:targetPort`. */
async function startTcpForward(
  targetPort: number,
): Promise<{ port: number; close: () => Promise<void> }> {
  const sockets = new Set<net.Socket>();
  const server = net.createServer(client => {
    sockets.add(client);
    const upstream = net.connect(targetPort, '127.0.0.1');
    sockets.add(upstream);
    client.pipe(upstream);
    upstream.pipe(client);
    const teardown = () => {
      sockets.delete(client);
      sockets.delete(upstream);
      client.destroy();
      upstream.destroy();
    };
    client.on('error', teardown);
    upstream.on('error', teardown);
    client.on('close', teardown);
    upstream.on('close', teardown);
  });
  await new Promise<void>((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    port: (server.address() as AddressInfo).port,
    close: () =>
      new Promise<void>(resolve => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}

/**
 * A fake `tensorlake` `Sandbox` whose `createTunnel` opens a *real* TCP forward
 * to `bridgePort` — the same authenticated-tunnel surface the adapter calls,
 * but pointed at the local bridge server.
 */
function fakeSandbox(bridgePort: number) {
  return {
    sandboxId: 'sbx_live',
    name: null,
    suspend: vi.fn(async () => {}),
    terminate: vi.fn(async () => {}),
    createTunnel: vi.fn(async (remotePort: number) => {
      const forward = await startTcpForward(bridgePort);
      cleanups.push(forward.close);
      return {
        remotePort,
        localHost: '127.0.0.1',
        localPort: forward.port,
        close: forward.close,
      };
    }),
  };
}

/** Dial a URL with a stock `ws` client, capturing the HTTP upgrade status. */
function dial(url: string): Promise<{ statusCode: number; socket: WebSocket }> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    cleanups.push(() => socket.terminate());
    let statusCode = 0;
    socket.on('upgrade', res => {
      statusCode = res.statusCode ?? 0;
    });
    socket.on('open', () => resolve({ statusCode, socket }));
    socket.on('unexpected-response', (_req, res) => {
      socket.terminate();
      reject(
        Object.assign(new Error(`unexpected-response ${res.statusCode}`), {
          statusCode: res.statusCode,
        }),
      );
    });
    socket.on('error', reject);
  });
}

function withToken(url: string, token: string): string {
  return `${url}?agent_bridge_token=${encodeURIComponent(token)}`;
}

describe('Tensorlake bridge: live WebSocket 101 upgrade through the tunnel', () => {
  it('completes a 101 upgrade and round-trips a message with the token appended', async () => {
    const bridge = await startBridgeServer();
    const sandbox = fakeSandbox(bridge.port);
    const session = await createTensorlakeSandbox({
      sandbox: sandbox as unknown as Sandbox,
    }).createSession();
    cleanups.push(() => session.destroy?.());

    // Drive the adapter's own getPortUrl — the bridge port is advertised first.
    const portUrl = await session.getPortUrl({
      port: session.ports[0],
      protocol: 'ws',
    });
    expect(portUrl).toMatch(/^ws:\/\/127\.0\.0\.1:\d+$/);

    const { statusCode, socket } = await dial(withToken(portUrl, TOKEN));
    expect(statusCode).toBe(101);

    const echoed = new Promise<string>(resolve => {
      socket.on('message', data => resolve(data.toString()));
    });
    socket.send('ping');
    expect(await echoed).toBe('ping');

    // The token reached the in-sandbox upgrade intact.
    expect(bridge.seenTokens).toContain(TOKEN);
  });

  it('enforces the token end-to-end: a missing or wrong token is rejected', async () => {
    const bridge = await startBridgeServer();
    const sandbox = fakeSandbox(bridge.port);
    const session = await createTensorlakeSandbox({
      sandbox: sandbox as unknown as Sandbox,
    }).createSession();
    cleanups.push(() => session.destroy?.());

    const portUrl = await session.getPortUrl({
      port: session.ports[0],
      protocol: 'ws',
    });

    await expect(dial(portUrl)).rejects.toMatchObject({ statusCode: 401 });
    await expect(dial(withToken(portUrl, 'wrong-token'))).rejects.toMatchObject(
      { statusCode: 401 },
    );

    // The wrong token still arrived intact at the upgrade — it was rejected on
    // value, not lost in transit.
    expect(bridge.seenTokens).toContain('wrong-token');
  });

  it('returns a stable URL across reconnects (one cached tunnel)', async () => {
    const bridge = await startBridgeServer();
    const sandbox = fakeSandbox(bridge.port);
    const session = await createTensorlakeSandbox({
      sandbox: sandbox as unknown as Sandbox,
    }).createSession();
    cleanups.push(() => session.destroy?.());

    const first = await session.getPortUrl({
      port: session.ports[0],
      protocol: 'ws',
    });
    const second = await session.getPortUrl({
      port: session.ports[0],
      protocol: 'ws',
    });

    expect(second).toBe(first);
    expect(sandbox.createTunnel).toHaveBeenCalledTimes(1);

    // Both an initial connect and a later reconnect succeed against the same URL.
    const initial = await dial(withToken(first, TOKEN));
    expect(initial.statusCode).toBe(101);
    initial.socket.close();

    const reconnect = await dial(withToken(second, TOKEN));
    expect(reconnect.statusCode).toBe(101);
  });
});
