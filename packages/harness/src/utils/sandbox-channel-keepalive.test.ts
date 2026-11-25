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
}

const outboundSchema = z.object({ type: z.literal('finish') });
const channels: SandboxChannel<z.infer<typeof outboundSchema>>[] = [];

function makeChannel(
  options: {
    keepAliveMs?: number;
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
    reconnect: { maxElapsedMs: 200, initialDelayMs: 50, maxDelayMs: 50 },
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

  it('does not terminate a socket that is still receiving bytes', async () => {
    const { channel, sockets, debug } = makeChannel({ keepAliveMs: 100 });
    const transport = { bytesRead: 0 };
    await channel.open();
    Object.assign(sockets[0], { _socket: transport });
    // a large frame is still transferring: no pongs, but bytes keep arriving
    for (let interval = 0; interval < 5; interval++) {
      transport.bytesRead += 1024;
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(sockets[0].terminate).not.toHaveBeenCalled();
    expect(debug).toEqual([]);
    // the transfer stalls: the usual two-unanswered-pings deadline applies
    await vi.advanceTimersByTimeAsync(300);
    expect(sockets[0].terminate).toHaveBeenCalledTimes(1);
    expect(sockets).toHaveLength(2);
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
});
