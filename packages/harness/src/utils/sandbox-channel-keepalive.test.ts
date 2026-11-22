import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { z } from 'zod/v4';
import {
  SandboxChannel,
  type SandboxChannelDebugEvent,
} from './sandbox-channel';

class HeartbeatSocket extends EventEmitter {
  readonly OPEN = 1;
  readyState = 1;
  /** The `ws` package exposes the Node socket here; `bytesRead` grows as data arrives. */
  _socket = { bytesRead: 0 };
  ping = vi.fn();
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = 3;
    this.emit('close', 1000, Buffer.from('closed'));
  });
  terminate = vi.fn(() => {
    this.readyState = 3;
    this.emit('close', 1006, Buffer.from(''));
  });
  drop = vi.fn(() => {
    this.readyState = 3;
    this.emit('close', 1006, Buffer.from(''));
  });
}

const outboundSchema = z.object({ type: z.literal('finish') });
const channels: SandboxChannel<z.infer<typeof outboundSchema>>[] = [];

function makeChannel(
  options: {
    keepAliveMs?: number;
    maxElapsedMs?: number;
    connect?: () => Promise<WebSocket>;
  } = {},
) {
  const sockets: HeartbeatSocket[] = [];
  const debug: SandboxChannelDebugEvent[] = [];
  const connect = vi.fn(async () => {
    if (options.connect) return options.connect();
    const socket = new HeartbeatSocket();
    sockets.push(socket);
    return socket as unknown as WebSocket;
  });
  const channel = new SandboxChannel({
    connect,
    outboundSchema,
    keepAliveMs: options.keepAliveMs,
    reconnect: {
      maxElapsedMs: options.maxElapsedMs ?? 200,
      initialDelayMs: 50,
      maxDelayMs: 50,
    },
    onDebug: event => debug.push(event),
  });
  channels.push(channel);
  return { channel, sockets, debug, connect };
}

describe('SandboxChannel keepalive', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    for (const channel of channels.splice(0)) channel.close();
    vi.useRealTimers();
  });

  it('pings every 20 seconds by default', async () => {
    const { channel, sockets } = makeChannel();
    await channel.open();
    await vi.advanceTimersByTimeAsync(19_999);
    expect(sockets[0].ping).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets[0].ping).toHaveBeenCalledTimes(1);
  });

  it('keeps a responsive socket connected at the configured interval', async () => {
    const { channel, sockets, debug } = makeChannel({ keepAliveMs: 100 });
    await channel.open();
    for (let interval = 0; interval < 5; interval++) {
      await vi.advanceTimersByTimeAsync(100);
      sockets[0].emit('pong');
    }
    expect(sockets[0].ping).toHaveBeenCalledTimes(5);
    expect(sockets[0].terminate).not.toHaveBeenCalled();
    expect(debug).toEqual([]);
  });

  it('terminates after two unanswered pings and starts a fresh heartbeat on reconnect', async () => {
    const { channel, sockets, debug } = makeChannel({ keepAliveMs: 100 });
    await channel.open();
    sockets[0].emit('message', JSON.stringify({ type: 'finish', seq: 7 }));
    await vi.advanceTimersByTimeAsync(200);
    expect(sockets[0].ping).toHaveBeenCalledTimes(2);
    expect(sockets[0].terminate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(sockets[0].terminate).toHaveBeenCalledTimes(1);
    expect(sockets[0].listenerCount('pong')).toBe(0);
    expect(sockets).toHaveLength(2);
    expect(sockets[1].send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'resume', lastSeenEventId: 7 }),
    );
    expect(debug.map(event => event.event)).toEqual([
      'reconnect-attempt',
      'reconnected',
    ]);
    sockets[0].emit('close', 1006, Buffer.from(''));
    await vi.advanceTimersByTimeAsync(100);
    expect(sockets[0].ping).toHaveBeenCalledTimes(2);
    expect(sockets[1].ping).toHaveBeenCalledTimes(1);
    expect(sockets[1].terminate).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
  });

  it('closes after the reconnect budget expires for a dead peer', async () => {
    const socket = new HeartbeatSocket();
    let attempts = 0;
    const { channel, debug } = makeChannel({
      keepAliveMs: 100,
      connect: async () => {
        if (attempts++ === 0) return socket as unknown as WebSocket;
        throw new Error('peer unavailable');
      },
    });
    const onClose = vi.fn();
    channel.onClose(onClose);
    await channel.open();
    await vi.advanceTimersByTimeAsync(500);
    expect(socket.terminate).toHaveBeenCalledTimes(1);
    expect(channel.isClosed()).toBe(true);
    expect(onClose).toHaveBeenCalledExactlyOnceWith(1006, 'reconnect failed');
    expect(debug.at(-1)?.event).toBe('reconnect-failed');
    expect(socket.listenerCount('pong')).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('disables keepalive when keepAliveMs is zero', async () => {
    const { channel, sockets } = makeChannel({ keepAliveMs: 0 });
    await channel.open();
    await vi.advanceTimersByTimeAsync(100_000);
    expect(sockets[0].ping).not.toHaveBeenCalled();
    expect(sockets[0].listenerCount('pong')).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('leaves sockets without ping support unchanged', async () => {
    const socket = new HeartbeatSocket();
    Object.defineProperty(socket, 'ping', { value: undefined });
    const { channel } = makeChannel({
      connect: async () => socket as unknown as WebSocket,
    });
    await channel.open();
    expect(socket.listenerCount('pong')).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['close', 'suspend', 'beginClose'] as const)(
    'cleans up keepalive on %s',
    async method => {
      const { channel, sockets, connect } = makeChannel({ keepAliveMs: 100 });
      await channel.open();
      await channel[method]();
      await vi.advanceTimersByTimeAsync(1_000);
      expect(sockets[0].listenerCount('pong')).toBe(0);
      expect(sockets[0].ping).not.toHaveBeenCalled();
      expect(sockets[0].terminate).not.toHaveBeenCalled();
      expect(connect).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each(['close', 'error'])(
    'cleans up a dropped socket on %s',
    async event => {
      const { channel, sockets } = makeChannel({ keepAliveMs: 100 });
      await channel.open();
      sockets[0].emit(event, 1006, Buffer.from(''));
      await vi.advanceTimersByTimeAsync(100);
      expect(sockets[0].ping).not.toHaveBeenCalled();
      expect(sockets[0].listenerCount('pong')).toBe(0);
      expect(sockets[1].ping).toHaveBeenCalledTimes(1);
    },
  );

  it('does not ping sockets that are no longer open', async () => {
    const { channel, sockets } = makeChannel({ keepAliveMs: 100 });
    await channel.open();
    sockets[0].readyState = 2;
    await vi.advanceTimersByTimeAsync(500);
    expect(sockets[0].ping).not.toHaveBeenCalled();
    expect(sockets[0].terminate).not.toHaveBeenCalled();
  });

  it('reconnects if sending a ping throws', async () => {
    const { channel, sockets } = makeChannel({ keepAliveMs: 100 });
    await channel.open();
    sockets[0].ping.mockImplementation(() => {
      throw new Error('socket error');
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(sockets[0].terminate).toHaveBeenCalledTimes(1);
    expect(sockets[0].listenerCount('pong')).toBe(0);
    expect(sockets).toHaveLength(2);
  });

  it('treats inbound byte progress as liveness while pongs are missing', async () => {
    // A large frame arrives over many TCP chunks; the peer's pong queues behind
    // it (head-of-line blocking), so only the byte counter proves progress.
    const { channel, sockets } = makeChannel({ keepAliveMs: 100 });
    await channel.open();
    const socket = sockets[0];
    for (const bytesRead of [1_024, 2_048, 4_096, 8_192]) {
      socket._socket.bytesRead = bytesRead;
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(socket.terminate).not.toHaveBeenCalled();
    expect(socket.ping).toHaveBeenCalledTimes(4);

    // Bytes stop arriving and pongs stay missing: the peer is treated as dead.
    await vi.advanceTimersByTimeAsync(300);
    expect(socket.terminate).toHaveBeenCalledTimes(1);
  });

  it('treats received frames as liveness while pongs are missing', async () => {
    const { channel, sockets } = makeChannel({ keepAliveMs: 100 });
    await channel.open();
    for (let index = 0; index < 5; index++) {
      sockets[0].emit('message', JSON.stringify({ type: 'finish' }));
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(sockets[0].terminate).not.toHaveBeenCalled();
  });

  it('still times out when the byte counter is exposed but never advances', async () => {
    const { channel, sockets } = makeChannel({ keepAliveMs: 100 });
    await channel.open();
    await vi.advanceTimersByTimeAsync(200);
    expect(sockets[0].ping).toHaveBeenCalledTimes(2);
    expect(sockets[0].terminate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(sockets[0].terminate).toHaveBeenCalledTimes(1);
  });

  it('falls back to pongs when the socket exposes no byte counter', async () => {
    const socket = new HeartbeatSocket();
    delete (socket as unknown as { _socket?: unknown })._socket;
    const { channel } = makeChannel({
      keepAliveMs: 100,
      connect: async () => socket as unknown as WebSocket,
    });
    await channel.open();
    await vi.advanceTimersByTimeAsync(200);
    expect(socket.ping).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(100);
    expect(socket.terminate).toHaveBeenCalledTimes(1);
  });

  it('fails instead of reconnecting when a frame exceeds the size limit', async () => {
    // A frame rejected by the receiver can never advance the cursor, so replay
    // would repeat the same oversized frame forever.
    const { channel, sockets, debug, connect } = makeChannel({
      keepAliveMs: 100,
    });
    const onClose = vi.fn();
    channel.onClose(onClose);
    await channel.open();
    sockets[0].emit(
      'error',
      Object.assign(new RangeError('Max payload size exceeded'), {
        code: 'WS_ERR_UNSUPPORTED_MESSAGE_LENGTH',
      }),
    );
    await vi.advanceTimersByTimeAsync(1);

    expect(connect).toHaveBeenCalledTimes(1);
    expect(sockets).toHaveLength(1);
    expect(channel.isClosed()).toBe(true);
    expect(onClose).toHaveBeenCalledExactlyOnceWith(1006, 'reconnect failed');
    expect(debug.at(-1)?.event).toBe('reconnect-failed');
  });

  it('stops reconnecting after repeated heartbeat timeouts without progress', async () => {
    // Each successful handshake resumes at the same cursor and then dies with
    // no pong, frame, byte, or outbound drain: after a few heartbeat-driven
    // reconnects the channel gives up instead of replaying forever.
    const { channel, sockets, debug } = makeChannel({ keepAliveMs: 100 });
    const onClose = vi.fn();
    channel.onClose(onClose);
    await channel.open();
    await vi.advanceTimersByTimeAsync(1_300);

    expect(sockets).toHaveLength(4);
    expect(channel.isClosed()).toBe(true);
    expect(onClose).toHaveBeenCalledExactlyOnceWith(1006, 'reconnect failed');
    const failed = debug.find(
      (
        event,
      ): event is Extract<
        SandboxChannelDebugEvent,
        { event: 'reconnect-failed' }
      > => event.event === 'reconnect-failed',
    );
    expect(String((failed?.cause as Error | undefined)?.message)).toContain(
      'without event progress',
    );
  });

  it.each(['pong', 'frame', 'cursor'] as const)(
    'keeps reconnecting when %s proves the peer alive',
    async mechanism => {
      const { channel, sockets, debug } = makeChannel({ keepAliveMs: 100 });
      const onClose = vi.fn();
      channel.onClose(onClose);
      await channel.open();

      // Five heartbeat-driven reconnects, each preceded by one liveness signal:
      // without the reset the channel would give up after three.
      for (let cycle = 1; cycle <= 5; cycle++) {
        const socket = sockets.at(-1)!;
        if (mechanism === 'pong') socket.emit('pong');
        if (mechanism === 'frame') {
          socket.emit('message', JSON.stringify({ type: 'finish' }));
        }
        if (mechanism === 'cursor') {
          socket.emit(
            'message',
            JSON.stringify({ type: 'finish', seq: cycle }),
          );
        }
        await vi.advanceTimersByTimeAsync(300);
      }

      expect(sockets).toHaveLength(6);
      expect(channel.isClosed()).toBe(false);
      expect(onClose).not.toHaveBeenCalled();
      expect(debug.filter(event => event.event === 'reconnect-failed')).toEqual(
        [],
      );
    },
  );

  it('gives up on repeated byte-only stalls without a completed event', async () => {
    // Bytes keep the connection alive past the timeout, then stop before the
    // frame completes. Byte progress is not event progress, so the stall count
    // still reaches the cap instead of replaying the same frame forever.
    const { channel, sockets, debug } = makeChannel({ keepAliveMs: 100 });
    const onClose = vi.fn();
    channel.onClose(onClose);
    await channel.open();

    for (let cycle = 0; cycle < 4; cycle++) {
      const socket = sockets.at(-1)!;
      for (let tick = 0; tick < 4; tick++) {
        socket._socket.bytesRead += 1_024;
        await vi.advanceTimersByTimeAsync(100);
      }
      await vi.advanceTimersByTimeAsync(300); // bytes stop: heartbeat timeout
    }

    expect(sockets).toHaveLength(4);
    expect(channel.isClosed()).toBe(true);
    expect(onClose).toHaveBeenCalledExactlyOnceWith(1006, 'reconnect failed');
    const failed = debug.find(
      (
        event,
      ): event is Extract<
        SandboxChannelDebugEvent,
        { event: 'reconnect-failed' }
      > => event.event === 'reconnect-failed',
    );
    expect(String((failed?.cause as Error | undefined)?.message)).toContain(
      'without event progress',
    );
  });

  it('keeps reconnecting external drops with keepalive disabled', async () => {
    // Without heartbeats nothing can distinguish an idle, healthy session from
    // a stalled one, so external drops must keep getting a fresh budget.
    const { channel, sockets, debug } = makeChannel({
      keepAliveMs: 0,
      maxElapsedMs: 200,
    });
    const onClose = vi.fn();
    channel.onClose(onClose);
    await channel.open();

    // Each drop is followed by more than maxElapsedMs of idle time.
    for (let drop = 0; drop < 3; drop++) {
      sockets.at(-1)!.drop();
      await vi.advanceTimersByTimeAsync(300);
    }

    expect(sockets).toHaveLength(4);
    expect(channel.isClosed()).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
    expect(debug.filter(event => event.event === 'reconnect-failed')).toEqual(
      [],
    );
  });

  it('keeps reconnecting external drops when the socket has no ping support', async () => {
    const sockets: HeartbeatSocket[] = [];
    const { channel, debug } = makeChannel({
      keepAliveMs: 100,
      maxElapsedMs: 200,
      connect: async () => {
        const socket = new HeartbeatSocket();
        Object.defineProperty(socket, 'ping', { value: undefined });
        sockets.push(socket);
        return socket as unknown as WebSocket;
      },
    });
    const onClose = vi.fn();
    channel.onClose(onClose);
    await channel.open();

    for (let drop = 0; drop < 3; drop++) {
      sockets.at(-1)!.drop();
      await vi.advanceTimersByTimeAsync(300);
    }

    expect(sockets).toHaveLength(4);
    expect(channel.isClosed()).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
    expect(debug.filter(event => event.event === 'reconnect-failed')).toEqual(
      [],
    );
  });
});
