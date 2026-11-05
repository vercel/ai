// End-to-end proof: the real host-side `SandboxChannel` talking to the real
// in-sandbox `runBridge` over a loopback WebSocket. A mid-turn socket drop must
// be invisible to the consumer — the bridge keeps the turn running, the channel
// reconnects and resumes from its cursor, and every event arrives in order
// exactly once.
//
// Node-only (binds real sockets); excluded from the edge run via the
// `**/src/bridge/**` pattern in vitest.edge.config.js.

import { createConnection, createServer, type Socket } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { z } from 'zod/v4';
import { runBridge, type BridgeHandle, type BridgeTurn } from './index';
import { SandboxChannel } from '../utils/sandbox-channel';

const TOKEN = 'integ-token';
const outboundSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('bridge-hello'),
    state: z.string().optional(),
    lastSeq: z.number().optional(),
  }),
  z.object({
    type: z.literal('text-delta'),
    id: z.string(),
    delta: z.string(),
  }),
  z.object({ type: z.literal('finish') }),
  z.object({ type: z.literal('error'), error: z.unknown() }),
]);
type Outbound = z.infer<typeof outboundSchema>;
type Inbound = { type: 'start' } | { type: 'resume'; lastSeenEventId: number };

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

async function startBridge(
  onStart: (s: { type: 'start' }, t: BridgeTurn) => Promise<void>,
): Promise<BridgeHandle> {
  const handle = await runBridge<{ type: 'start' }>({
    bridgeType: 'test',
    bridgeStateDir: `${process.env.TMPDIR ?? '/tmp'}/harness-reconnect-${Math.floor(performance.now())}`,
    port: 0,
    token: TOKEN,
    onStart,
    onExit: () => {},
  });
  cleanups.push(() => handle.close());
  return handle;
}

describe('SandboxChannel ↔ runBridge reconnect', () => {
  it('transparently reconnects mid-turn and delivers every event in order, once', async () => {
    let release!: () => void;
    const gate = new Promise<void>(r => (release = r));

    const handle = await startBridge(async (_s, turn) => {
      turn.emit({ type: 'text-delta', id: 'm', delta: 'one' }); // seq 1
      turn.emit({ type: 'text-delta', id: 'm', delta: 'two' }); // seq 2
      await gate; // socket is dropped while we wait here
      // Emitted AFTER the drop — proves the turn was not aborted by the
      // disconnect, and these reach the host over the reconnected socket.
      turn.emit({ type: 'text-delta', id: 'm', delta: 'three' }); // seq 3
      turn.emit({ type: 'finish' }); // seq 4
    });

    const url = `ws://127.0.0.1:${handle.port}/?agent_bridge_token=${TOKEN}`;
    const sockets: WebSocket[] = [];
    const connect = () =>
      new Promise<WebSocket>((resolve, reject) => {
        const ws = new WebSocket(url);
        sockets.push(ws);
        ws.on('open', () => resolve(ws));
        ws.on('error', reject);
      });

    const debug: string[] = [];
    const channel = new SandboxChannel<Outbound, Inbound>({
      connect,
      outboundSchema,
      reconnect: { initialDelayMs: 5, maxDelayMs: 20, maxElapsedMs: 2000 },
      onDebug: e => debug.push(e.event),
    });
    cleanups.push(() => channel.close());

    const deltas: string[] = [];
    let finishes = 0;
    channel.on('text-delta', e => deltas.push(e.delta));
    const finished = new Promise<void>(resolve => {
      channel.on('finish', () => {
        finishes++;
        resolve();
      });
    });
    let closedCode: number | undefined;
    channel.onClose(code => (closedCode = code));

    await channel.open();
    channel.send({ type: 'start' });

    // Wait until both pre-drop events have arrived.
    await waitUntil(() => deltas.length === 2);
    expect(deltas).toEqual(['one', 'two']);

    // Force an abrupt drop of the live socket and wait for the channel to
    // reconnect *before* the bridge emits anything more — so the post-drop
    // events can only have arrived over the replacement socket.
    sockets[0].terminate();
    await waitUntil(() => debug.includes('reconnected'));

    // Now let the bridge finish the turn over the reconnected socket.
    release();
    await finished;

    expect(deltas).toEqual(['one', 'two', 'three']); // ordered, no duplicates
    expect(finishes).toBe(1);
    expect(sockets.length).toBe(2); // exactly one reconnect
    expect(debug).toContain('reconnected');
    expect(closedCode).toBeUndefined(); // transient drop never surfaced as close
  });

  it.each([
    'before-close-event',
    'remote-fin',
    'after-detected-close',
    'after-reconnect',
  ] as const)('delivers a host tool result completed %s', async timing => {
    let release!: () => void;
    const toolFinished = new Promise<void>(resolve => (release = resolve));
    let starts = 0;
    let waiterResolved = false;
    const handle = await startBridge(async (_start, turn) => {
      starts++;
      turn.emit({ type: 'tool-call', toolCallId: 'host-1' });
      const result = await turn.requestToolResult('host-1');
      waiterResolved = true;
      turn.emit({ type: 'tool-result', output: result.output });
      turn.emit({ type: 'finish' });
    });

    let port = handle.port;
    const peers: Socket[] = [];
    if (timing === 'remote-fin') {
      const relaySockets: Socket[] = [];
      const relay = createServer(peer => {
        const upstream = createConnection({
          host: '127.0.0.1',
          port: handle.port,
        });
        peers.push(peer);
        relaySockets.push(peer, upstream);
        peer.on('error', () => upstream.destroy());
        upstream.on('error', () => peer.destroy());
        peer.pipe(upstream);
        upstream.pipe(peer);
      });
      cleanups.push(async () => {
        for (const socket of relaySockets) socket.destroy();
        await new Promise<void>((resolve, reject) => {
          relay.close(error => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        });
      });
      await new Promise<void>(resolve => relay.listen(0, '127.0.0.1', resolve));
      const address = relay.address();
      if (!address || typeof address === 'string') {
        throw new Error('Expected relay TCP address');
      }
      port = address.port;
    }

    const sockets: WebSocket[] = [];
    const debug: string[] = [];
    const channel = new SandboxChannel<
      | { type: 'bridge-hello' }
      | { type: 'tool-call'; toolCallId: string }
      | { type: 'tool-result'; output: unknown }
      | { type: 'finish' },
      Inbound | { type: 'tool-result'; toolCallId: string; output: number }
    >({
      connect: () =>
        new Promise<WebSocket>((resolve, reject) => {
          const socket = new WebSocket(
            `ws://127.0.0.1:${port}/?agent_bridge_token=${TOKEN}`,
          );
          sockets.push(socket);
          socket.once('open', () => resolve(socket));
          socket.once('error', reject);
        }),
      outboundSchema: z.discriminatedUnion('type', [
        z.object({ type: z.literal('bridge-hello') }),
        z.object({ type: z.literal('tool-call'), toolCallId: z.string() }),
        z.object({ type: z.literal('tool-result'), output: z.unknown() }),
        z.object({ type: z.literal('finish') }),
      ]),
      reconnect: { initialDelayMs: 5, maxDelayMs: 20, maxElapsedMs: 2000 },
      onDebug: event => debug.push(event.event),
    });
    cleanups.push(() => {
      channel.close();
      for (const socket of sockets) socket.terminate();
    });

    const received: unknown[] = [];
    const sendErrors: unknown[] = [];
    let executions = 0;
    let stateAtSend: number | undefined;
    let closedCode: number | undefined;
    let closeDetected = false;
    let closeDetectedAtSend = false;
    let callSeen = false;
    let finishes = 0;
    channel.onClose(code => (closedCode = code));
    channel.on('tool-result', event => received.push(event.output));
    channel.on('finish', () => finishes++);
    channel.on('tool-call', () => {
      callSeen = true;
      void toolFinished.then(() => {
        executions++;
        stateAtSend = sockets.at(-1)!.readyState;
        closeDetectedAtSend = closeDetected;
        try {
          channel.send({
            type: 'tool-result',
            toolCallId: 'host-1',
            output: 42,
          });
        } catch (error) {
          sendErrors.push(error);
        }
      });
    });
    await channel.open();
    channel.send({ type: 'start' });
    await waitUntil(() => callSeen);
    const closed = new Promise<void>(resolve =>
      sockets[0].once('close', () => {
        closeDetected = true;
        resolve();
      }),
    );
    if (timing === 'remote-fin') {
      const tcp = (sockets[0] as WebSocket & { _socket: Socket })._socket;
      tcp.once('end', release);
      peers[0].end();
    } else {
      sockets[0].terminate();
      if (timing === 'after-detected-close') await closed;
      if (timing === 'after-reconnect') {
        await waitUntil(() => debug.includes('reconnected'));
      }
      release();
    }
    await waitUntil(() => debug.includes('reconnected'));
    await expect.poll(() => received).toEqual([42]);
    await waitUntil(() => finishes === 1);

    if (timing === 'before-close-event' || timing === 'remote-fin') {
      expect(stateAtSend).toBe(WebSocket.CLOSING);
      expect(closeDetectedAtSend).toBe(false);
    } else if (timing === 'after-reconnect') {
      expect(stateAtSend).toBe(WebSocket.OPEN);
    }
    expect(sendErrors).toEqual([]);
    expect(executions).toBe(1);
    expect(starts).toBe(1);
    expect(waiterResolved).toBe(true);
    expect(sockets).toHaveLength(2);
    expect(closedCode).toBeUndefined();
    expect(received).toEqual([42]);
    expect(finishes).toBe(1);

    channel.close();
    await waitUntil(() => channel.isClosed());
    expect(() =>
      channel.send({ type: 'tool-result', toolCallId: 'host-1', output: 42 }),
    ).toThrow(/closed/);
  });

  it('suspends mid-turn, then a fresh-process channel attaches and continues exactly once', async () => {
    // Models a workflow slice boundary: slice 1 consumes part of a turn then
    // `suspend()`s at a precise cursor (the host process goes away); the bridge
    // keeps the turn running. Slice 2 is a brand-new `SandboxChannel` (new
    // process) that attaches with the persisted cursor and continues — the tail
    // must arrive with no gap and no duplicate of what slice 1 already saw.
    let release!: () => void;
    const gate = new Promise<void>(r => (release = r));

    const handle = await startBridge(async (_s, turn) => {
      turn.emit({ type: 'text-delta', id: 'm', delta: 'one' }); // seq 1
      turn.emit({ type: 'text-delta', id: 'm', delta: 'two' }); // seq 2
      await gate; // suspended here — no active socket
      turn.emit({ type: 'text-delta', id: 'm', delta: 'three' }); // seq 3
      turn.emit({ type: 'text-delta', id: 'm', delta: 'four' }); // seq 4
      turn.emit({ type: 'finish' }); // seq 5
    });

    const url = `ws://127.0.0.1:${handle.port}/?agent_bridge_token=${TOKEN}`;
    const connect = () =>
      new Promise<WebSocket>((resolve, reject) => {
        const ws = new WebSocket(url);
        ws.on('open', () => resolve(ws));
        ws.on('error', reject);
      });

    // ── Slice 1: open, start, receive the first two deltas, then suspend. ──
    const channelA = new SandboxChannel<Outbound, Inbound>({
      connect,
      outboundSchema,
    });
    const deltasA: string[] = [];
    channelA.on('text-delta', e => deltasA.push(e.delta));
    let suspendedReason: number | undefined;
    channelA.onClose((_code, reason) => {
      // exposed as the second onClose arg
      suspendedReason = reason === 'suspended' ? 1 : 0;
    });

    await channelA.open();
    channelA.send({ type: 'start' });
    await waitUntil(() => deltasA.length === 2);

    const cursor = await channelA.suspend();
    expect(deltasA).toEqual(['one', 'two']);
    expect(cursor).toBe(2); // froze exactly at the last delivered event
    expect(suspendedReason).toBe(1); // closed with reason 'suspended'

    // The turn keeps running in the bridge after the host went away.
    release();

    // ── Slice 2: a fresh channel attaches from the persisted cursor. ──
    const channelB = new SandboxChannel<Outbound, Inbound>({
      connect,
      outboundSchema,
      initialLastSeenEventId: cursor,
    });
    cleanups.push(() => channelB.close());
    const deltasB: string[] = [];
    channelB.on('text-delta', e => deltasB.push(e.delta));
    const finishedB = new Promise<void>(resolve => {
      channelB.on('finish', () => resolve());
    });

    await channelB.open({ resume: true });
    await finishedB;

    // No gap (got the whole tail) and no duplicate (none of slice 1's events).
    expect(deltasB).toEqual(['three', 'four']);
  });
});

async function waitUntil(pred: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = performance.now();
  while (!pred()) {
    if (performance.now() - start > timeoutMs)
      throw new Error('waitUntil timed out');
    await new Promise(r => setTimeout(r, 5));
  }
}
