import { describe, expect, it } from 'vitest';
import type { WebSocket } from 'ws';
import { BridgeChannel } from './codex-bridge-channel';

async function flush(): Promise<void> {
  // Two macrotask ticks: parseJSON resolves the validation, then dispatch runs.
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
}

function makeFakeSocket() {
  const handlers: Record<string, Array<(...args: unknown[]) => void>> = {};
  const sent: string[] = [];
  let closed = false;
  const fake = {
    on(event: string, handler: (...args: unknown[]) => void) {
      (handlers[event] ??= []).push(handler);
    },
    send(data: string) {
      sent.push(data);
    },
    close() {
      closed = true;
      for (const h of handlers.close ?? []) h(1000, Buffer.from(''));
    },
  };
  return {
    socket: fake as unknown as WebSocket,
    deliver(message: object) {
      const raw = JSON.stringify(message);
      for (const h of handlers.message ?? []) h(raw);
    },
    sent,
    isClosed: () => closed,
  };
}

describe('BridgeChannel', () => {
  it('dispatches outbound messages by type', async () => {
    const fake = makeFakeSocket();
    const channel = new BridgeChannel(fake.socket);
    const text: string[] = [];
    channel.on('text-delta', evt => text.push(evt.delta));
    fake.deliver({ type: 'text-delta', id: 'a', delta: 'hello' });
    fake.deliver({ type: 'text-delta', id: 'a', delta: ' world' });
    await flush();
    expect(text).toEqual(['hello', ' world']);
  });

  it('replays messages buffered before the listener subscribes', async () => {
    const fake = makeFakeSocket();
    const channel = new BridgeChannel(fake.socket);
    fake.deliver({
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'stop' },
      totalUsage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } },
    });
    await flush();
    const captured: unknown[] = [];
    channel.on('finish', evt => captured.push(evt));
    expect(captured).toHaveLength(1);
  });

  it('routes file-change events to their listener', async () => {
    const fake = makeFakeSocket();
    const channel = new BridgeChannel(fake.socket);
    const events: Array<{ event: string; path: string }> = [];
    channel.on('file-change', evt =>
      events.push({ event: evt.event, path: evt.path }),
    );
    fake.deliver({ type: 'file-change', event: 'create', path: 'notes.md' });
    fake.deliver({ type: 'file-change', event: 'delete', path: 'old.txt' });
    await flush();
    expect(events).toEqual([
      { event: 'create', path: 'notes.md' },
      { event: 'delete', path: 'old.txt' },
    ]);
  });

  it('serialises and sends inbound messages', () => {
    const fake = makeFakeSocket();
    const channel = new BridgeChannel(fake.socket);
    channel.send({ type: 'abort' });
    expect(fake.sent).toEqual([JSON.stringify({ type: 'abort' })]);
  });

  it('refuses to send when closed', () => {
    const fake = makeFakeSocket();
    const channel = new BridgeChannel(fake.socket);
    channel.close();
    expect(() => channel.send({ type: 'abort' })).toThrow(/closed/);
  });

  it('surfaces malformed messages as error events', async () => {
    const fake = makeFakeSocket();
    const channel = new BridgeChannel(fake.socket);
    const errors: unknown[] = [];
    channel.on('error', evt => errors.push(evt));
    fake.deliver({ type: 'mystery' });
    await flush();
    expect(errors).toHaveLength(1);
  });
});
