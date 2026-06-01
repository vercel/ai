import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { z } from 'zod';
import { SandboxChannel } from './sandbox-channel';

const outboundSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text-delta'),
    id: z.string(),
    delta: z.string(),
  }),
  z.object({ type: z.literal('finish') }),
  z.object({ type: z.literal('error'), error: z.unknown() }),
]);
type Outbound = z.infer<typeof outboundSchema>;
type Inbound =
  | { type: 'start' }
  | { type: 'abort' }
  | { type: 'resume'; lastSeenEventId: number };

type FakeSocket = {
  socket: WebSocket;
  deliver(message: object, seq?: number): void;
  drop(code?: number): void;
  sent: string[];
};

function makeFakeSocket(): FakeSocket {
  const handlers: Record<string, Array<(...args: unknown[]) => void>> = {};
  const sent: string[] = [];
  const fake = {
    on(event: string, handler: (...args: unknown[]) => void) {
      (handlers[event] ??= []).push(handler);
    },
    send(data: string) {
      sent.push(data);
    },
    close(code = 1000) {
      for (const h of handlers.close ?? []) h(code, Buffer.from(''));
    },
  };
  return {
    socket: fake as unknown as WebSocket,
    deliver(message: object, seq?: number) {
      const payload = seq === undefined ? message : { ...message, seq };
      const raw = JSON.stringify(payload);
      for (const h of handlers.message ?? []) h(raw);
    },
    drop(code = 1006) {
      for (const h of handlers.close ?? []) h(code, Buffer.from(''));
    },
    sent,
  };
}

/** Connect thunk that hands out a fresh fake socket per call and records them. */
function makeConnector() {
  const sockets: FakeSocket[] = [];
  return {
    sockets,
    connect: async () => {
      const s = makeFakeSocket();
      sockets.push(s);
      return s.socket;
    },
    current: () => sockets[sockets.length - 1],
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) await new Promise(r => setTimeout(r, 0));
}

function makeChannel(
  connector: ReturnType<typeof makeConnector>,
  onDebug?: (e: unknown) => void,
) {
  return new SandboxChannel<Outbound, Inbound>({
    connect: connector.connect,
    outboundSchema,
    reconnect: { initialDelayMs: 1, maxDelayMs: 1, maxElapsedMs: 200 },
    ...(onDebug ? { onDebug: onDebug as never } : {}),
  });
}

describe('SandboxChannel', () => {
  it('dispatches outbound messages by type', async () => {
    const connector = makeConnector();
    const channel = makeChannel(connector);
    await channel.open();
    const text: string[] = [];
    channel.on('text-delta', evt => text.push(evt.delta));
    connector
      .current()
      .deliver({ type: 'text-delta', id: 'a', delta: 'hello' });
    connector
      .current()
      .deliver({ type: 'text-delta', id: 'a', delta: ' world' });
    await flush();
    expect(text).toEqual(['hello', ' world']);
  });

  it('replays messages buffered before the listener subscribes', async () => {
    const connector = makeConnector();
    const channel = makeChannel(connector);
    await channel.open();
    connector.current().deliver({ type: 'finish' });
    await flush();
    const captured: unknown[] = [];
    channel.on('finish', evt => captured.push(evt));
    expect(captured).toHaveLength(1);
  });

  it('serialises and sends inbound messages', async () => {
    const connector = makeConnector();
    const channel = makeChannel(connector);
    await channel.open();
    channel.send({ type: 'abort' });
    expect(connector.current().sent).toEqual([
      JSON.stringify({ type: 'abort' }),
    ]);
  });

  it('refuses to send once terminally closed', async () => {
    const connector = makeConnector();
    const channel = makeChannel(connector);
    await channel.open();
    channel.close();
    await flush();
    expect(() => channel.send({ type: 'abort' })).toThrow(/closed/);
  });

  it('surfaces malformed messages as error events', async () => {
    const connector = makeConnector();
    const channel = makeChannel(connector);
    await channel.open();
    const errors: unknown[] = [];
    channel.on('error', evt => errors.push(evt));
    connector.current().deliver({ type: 'mystery' });
    await flush();
    expect(errors).toHaveLength(1);
  });

  it('reconnects transparently on a transient drop and resumes from the cursor', async () => {
    const connector = makeConnector();
    const debug: Array<{ event: string }> = [];
    const channel = makeChannel(connector, e =>
      debug.push(e as { event: string }),
    );
    await channel.open();

    const closes: number[] = [];
    channel.onClose(code => closes.push(code));

    const text: string[] = [];
    channel.on('text-delta', evt => text.push(evt.delta));

    // Two events seen on the first socket (cursor advances to seq 2).
    connector
      .current()
      .deliver({ type: 'text-delta', id: 'a', delta: 'one' }, 1);
    connector
      .current()
      .deliver({ type: 'text-delta', id: 'a', delta: 'two' }, 2);
    await flush();

    // Transient drop → channel reconnects on a fresh socket.
    connector.current().drop();
    await flush();

    expect(connector.sockets).toHaveLength(2);
    // First frame on the new socket is a resume carrying the last seen cursor.
    expect(connector.current().sent).toEqual([
      JSON.stringify({ type: 'resume', lastSeenEventId: 2 }),
    ]);
    // Transient drop must NOT fire onClose.
    expect(closes).toEqual([]);
    expect(debug.map(d => d.event)).toContain('reconnected');

    // Replayed-then-live events continue to flow without duplication.
    connector
      .current()
      .deliver({ type: 'text-delta', id: 'a', delta: 'three' }, 3);
    await flush();
    expect(text).toEqual(['one', 'two', 'three']);
  });

  it('queues host → bridge sends while disconnected and flushes them on reconnect', async () => {
    const connector = makeConnector();
    const channel = makeChannel(connector);
    await channel.open();

    connector.current().drop();
    // send during the reconnect gap — must not throw, must queue
    channel.send({ type: 'abort' });
    await flush();

    expect(connector.sockets).toHaveLength(2);
    expect(connector.current().sent).toEqual([
      JSON.stringify({ type: 'resume', lastSeenEventId: 0 }),
      JSON.stringify({ type: 'abort' }),
    ]);
  });

  it('fires onClose on a host-initiated close (terminal)', async () => {
    const connector = makeConnector();
    const channel = makeChannel(connector);
    await channel.open();
    const closes: number[] = [];
    channel.onClose(code => closes.push(code));
    channel.close();
    await flush();
    expect(closes).toEqual([1000]);
    expect(channel.isClosed()).toBe(true);
  });

  it('treats a drop after beginClose as terminal, not a reconnect', async () => {
    const connector = makeConnector();
    const channel = makeChannel(connector);
    await channel.open();
    const closes: number[] = [];
    channel.onClose(code => closes.push(code));

    channel.beginClose();
    connector.current().drop(1000);
    await flush();

    expect(connector.sockets).toHaveLength(1); // no reconnect attempted
    expect(closes).toEqual([1000]);
  });

  it('gives up and fires onClose once the reconnect budget is exhausted', async () => {
    const sockets: FakeSocket[] = [];
    let calls = 0;
    const channel = new SandboxChannel<Outbound, Inbound>({
      connect: async () => {
        calls++;
        if (calls === 1) {
          const s = makeFakeSocket();
          sockets.push(s);
          return s.socket;
        }
        throw new Error('connect refused');
      },
      outboundSchema,
      reconnect: { initialDelayMs: 1, maxDelayMs: 1, maxElapsedMs: 30 },
    });
    await channel.open();
    const closes: number[] = [];
    channel.onClose(code => closes.push(code));
    sockets[0].drop();
    await vi.waitFor(() => expect(closes.length).toBe(1));
    expect(closes[0]).toBe(1006);
  });
});
