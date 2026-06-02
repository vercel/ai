// End-to-end §9 proof: the real host-side `SandboxChannel` talking to the real
// in-sandbox `runBridge` over a loopback WebSocket. A mid-turn socket drop must
// be invisible to the consumer — the bridge keeps the turn running, the channel
// reconnects and resumes from its cursor, and every event arrives in order
// exactly once.
//
// Node-only (binds real sockets); excluded from the edge run via the
// `**/src/bridge/**` pattern in vitest.edge.config.js.

import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { z } from 'zod';
import { runBridge, type BridgeHandle, type BridgeTurn } from './index';
import { SandboxChannel } from '../channel/sandbox-channel';

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
});

async function waitUntil(pred: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = performance.now();
  while (!pred()) {
    if (performance.now() - start > timeoutMs)
      throw new Error('waitUntil timed out');
    await new Promise(r => setTimeout(r, 5));
  }
}
