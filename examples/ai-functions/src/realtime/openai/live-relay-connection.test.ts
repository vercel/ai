import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { relayLiveConnection } from './live-relay-connection';

class Socket extends EventEmitter {
  readyState: number = WebSocket.OPEN;
  bufferedAmount = 0;
  send = vi.fn(
    (_data: Buffer, _options: unknown, callback: (error?: Error) => void) =>
      callback(),
  );
  close = vi.fn((_code: number, _reason: string) => {
    this.readyState = WebSocket.CLOSING;
  });
  terminate = vi.fn(() => {
    this.readyState = WebSocket.CLOSED;
  });
}

function pair() {
  const client = new Socket();
  const upstream = new Socket();
  upstream.readyState = WebSocket.CONNECTING;
  relayLiveConnection(
    client as unknown as WebSocket,
    upstream as unknown as WebSocket,
  );
  return { client, upstream };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('forwards queued text in order and leaves terminal frames unchanged', () => {
  const { client, upstream } = pair();
  const first = Buffer.from('{"type":"session.start"}');
  const second = Buffer.from('{"type":"context.append"}');
  client.emit('message', first, false);
  client.emit('message', second, false);
  expect(upstream.send).not.toHaveBeenCalled();
  upstream.readyState = WebSocket.OPEN;
  upstream.emit('open');
  expect(upstream.send.mock.calls.map(([data]) => data)).toEqual([
    first,
    second,
  ]);
  const terminal = Buffer.from(
    '{"type":"session.closed","usage":{"seconds":5}}',
  );
  upstream.emit('message', terminal, false);
  expect(client.send).toHaveBeenCalledWith(
    terminal,
    { binary: false },
    expect.any(Function),
  );
  expect(client.close).not.toHaveBeenCalled();
  upstream.readyState = WebSocket.CLOSED;
  upstream.emit('close', 1000, Buffer.from('private upstream reason'));
  expect(client.close).toHaveBeenCalledWith(1000, 'Upstream closed');
  expect(vi.getTimerCount()).toBe(0);
});

it.each([1006, 1008, 1011, 1013])(
  'sanitizes upstream close code %i without reporting success',
  code => {
    const { client, upstream } = pair();
    upstream.readyState = WebSocket.CLOSED;
    upstream.emit(
      'close',
      code,
      Buffer.from('credential or private provider detail'),
    );
    expect(client.close).toHaveBeenCalledWith(
      code === 1013 ? 1013 : 1011,
      code === 1013 ? 'Relay overloaded' : 'Relay connection failed',
    );
    expect(client.send).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  },
);

it('classifies a relay deadline as failure, clears queued frames, and closes once', () => {
  const { client, upstream } = pair();
  client.emit('message', Buffer.from('queued'), false);
  vi.advanceTimersByTime(10 * 60 * 1000);
  expect(client.close).toHaveBeenCalledWith(1011, 'Relay session timed out');
  expect(upstream.terminate).toHaveBeenCalledOnce();
  upstream.emit('open');
  upstream.emit('error', new Error('secret handshake error'));
  upstream.emit('close', 1006);
  expect(client.close).toHaveBeenCalledOnce();
  expect(upstream.send).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it.each(['queued', 'upstream', 'client'])(
  'reports %s congestion with 1013',
  target => {
    const { client, upstream } = pair();
    if (target === 'queued')
      client.emit('message', Buffer.alloc(1024 * 1024 + 1), false);
    else {
      upstream.readyState = WebSocket.OPEN;
      const destination = target === 'upstream' ? upstream : client;
      const source = target === 'upstream' ? client : upstream;
      destination.bufferedAmount = 1024 * 1024;
      source.emit('message', Buffer.from('overflow'), false);
    }
    expect(client.close).toHaveBeenCalledWith(1013, 'Relay overloaded');
    expect(upstream.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  },
);

it.each(['throw', 'callback', 'error'])(
  'reports send/transport %s failure with 1011',
  failure => {
    const { client, upstream } = pair();
    upstream.readyState = WebSocket.OPEN;
    const error = new Error('secret provider details');
    if (failure === 'error') upstream.emit('error', error);
    else {
      upstream.send.mockImplementation((_data, _options, callback) => {
        if (failure === 'throw') throw error;
        callback(error);
      });
      client.emit('message', Buffer.from('data'), false);
    }
    expect(client.close).toHaveBeenCalledWith(1011, 'Relay connection failed');
    expect(upstream.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  },
);

it('uses a normal upstream handshake for client shutdown', () => {
  const { client, upstream } = pair();
  upstream.readyState = WebSocket.OPEN;
  client.readyState = WebSocket.CLOSED;
  client.emit('close', 1000, Buffer.from('private client reason'));
  expect(upstream.close).toHaveBeenCalledWith(1000, 'Client closed');
  expect(upstream.terminate).not.toHaveBeenCalled();
  expect(client.close).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it('releases a pending upstream handshake when the client leaves', () => {
  const { client, upstream } = pair();
  client.readyState = WebSocket.CLOSED;
  client.emit('close', 1000);
  expect(upstream.terminate).toHaveBeenCalledOnce();
  upstream.emit('error', new Error('handshake interrupted'));
  expect(client.close).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
