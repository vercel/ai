import { describe, expect, it, vi } from 'vitest';
import { deferred, flushEvents, liveModel } from './__fixtures__/fake-webrtc';
import { RealtimeEventChannel } from './realtime-event-channel';

describe('RealtimeEventChannel', () => {
  it('creates isolated model parsers for every connection', async () => {
    const model = liveModel();
    model.createServerEventParser = vi.fn(() => {
      let count = 0;
      return (raw: unknown) => ({
        type: 'session-usage' as const,
        usage: { seconds: ++count },
        raw,
      });
    });
    model.parseServerEvent = vi.fn(() => {
      throw new Error('Shared parser must not be used');
    });
    const firstEvent = vi.fn();
    const secondEvent = vi.fn();
    const first = new RealtimeEventChannel({
      model,
      send: vi.fn(),
      onEvent: firstEvent,
      onError: vi.fn(),
    });
    const second = new RealtimeEventChannel({
      model,
      send: vi.fn(),
      onEvent: secondEvent,
      onError: vi.fn(),
    });
    first.receive('{}');
    first.receive('{}');
    second.receive('{}');
    await flushEvents();
    expect(model.createServerEventParser).toHaveBeenCalledTimes(2);
    expect(firstEvent.mock.calls.map(([event]) => event.usage.seconds)).toEqual(
      [1, 2],
    );
    expect(secondEvent.mock.calls[0][0].usage.seconds).toBe(1);
    expect(model.parseServerEvent).not.toHaveBeenCalled();
  });

  it('serializes outgoing asynchronous codecs without reordering commands', async () => {
    const first = deferred<unknown>();
    const model = liveModel();
    model.serializeClientEvent = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ second: true });
    const send = vi.fn();
    const codec = new RealtimeEventChannel({
      model,
      send,
      onEvent: vi.fn(),
      onError: vi.fn(),
    });
    codec.send({ type: 'input-audio-mute' });
    codec.send({ type: 'input-audio-unmute' });
    await flushEvents();
    expect(model.serializeClientEvent).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
    first.resolve({ first: true });
    await flushEvents();
    expect(send.mock.calls).toEqual([[{ first: true }], [{ second: true }]]);
  });

  it('discards outgoing work from disposed connections', async () => {
    const first = deferred<unknown>();
    const model = liveModel();
    model.serializeClientEvent = vi.fn().mockReturnValue(first.promise);
    const send = vi.fn();
    const codec = new RealtimeEventChannel({
      model,
      send,
      onEvent: vi.fn(),
      onError: vi.fn(),
    });
    codec.send({ type: 'input-audio-mute' });
    codec.send({ type: 'input-audio-unmute' });
    await flushEvents();
    codec.dispose();
    first.resolve({ late: true });
    await flushEvents();
    expect(send).not.toHaveBeenCalled();
    expect(model.serializeClientEvent).toHaveBeenCalledTimes(1);
  });

  it('bounds both queues while work is pending', async () => {
    const pending = deferred<unknown>();
    const model = liveModel();
    model.serializeClientEvent = () => pending.promise;
    const error = vi.fn();
    const codec = new RealtimeEventChannel({
      model,
      maxPending: 1,
      send: vi.fn(),
      onEvent: async () => {
        await pending.promise;
      },
      onError: error,
    });
    codec.send({ type: 'input-audio-mute' });
    expect(() => codec.send({ type: 'input-audio-unmute' })).toThrow(
      'outgoing queue is full',
    );
    codec.receive('{"type":"session-usage","usage":{"seconds":1},"raw":{}}');
    codec.receive('{"type":"session-usage","usage":{"seconds":2},"raw":{}}');
    expect(error).toHaveBeenCalledWith(
      new Error('Realtime incoming queue is full'),
    );
    codec.dispose();
    pending.resolve(null);
    await flushEvents();
  });

  it('continues after an event callback fails, even when the error callback also throws', async () => {
    const onEvent = vi
      .fn()
      .mockRejectedValueOnce(new Error('application'))
      .mockResolvedValueOnce(undefined);
    const codec = new RealtimeEventChannel({
      model: liveModel(),
      send: vi.fn(),
      onEvent,
      onError: () => {
        throw new Error('application error handler');
      },
    });
    codec.receive('{"type":"session-usage","usage":{"seconds":1},"raw":{}}');
    codec.receive('{"type":"session-usage","usage":{"seconds":2},"raw":{}}');
    await flushEvents();
    expect(onEvent).toHaveBeenCalledTimes(2);
  });
});
