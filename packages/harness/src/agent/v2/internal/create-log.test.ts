import {
  DelayedPromise,
  jsonEncodeSerializableValue,
} from '@ai-sdk/provider-utils';
import { slotToEventId, type EventResult } from '@workflow/world';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { InMemoryWorld } from '../in-memory-world';
import { createLog } from './create-log';
import type { HarnessAgentLogEvent } from './types';

afterEach(() => vi.useRealTimers());

/**
 * Creates the existing run required by the event-backed log.
 */
async function setup(
  input: {
    /**
     * Existing run identity used by the tested log.
     */
    runId?: string;
  } = {},
) {
  const world = new InMemoryWorld();
  const runId = input.runId ?? 'session-id';
  await world.events.create(runId, {
    eventType: 'run_created',
    eventData: { deploymentId: 'test', workflowName: 'harness', input: [] },
  });
  return { world, runId, log: createLog({ world, runId }) };
}

/**
 * Allows queued promise continuations to run without advancing fake time.
 */
async function settle(): Promise<void> {
  for (let index = 0; index < 100; index++) await Promise.resolve();
}

describe('createLog', () => {
  test('replays host-owned event variants and filters by committed positions', async () => {
    const { world, runId, log } = await setup();
    const events: HarnessAgentLogEvent[] = [
      {
        type: 'submission',
        id: 'submission',
        data: { type: 'steer', message: { role: 'user', content: 'continue' } },
      },
      {
        type: 'effect-start',
        id: 'start',
        data: {
          key: 'tool',
          attempt: 1,
          name: 'tool.test',
          replay: 'never',
          input: undefined,
          deliveredSubmissionIds: ['submission'],
        },
      },
      {
        type: 'effect-end',
        id: 'end',
        data: {
          startId: 'start',
          output: {
            type: 'interrupted',
            retryable: false,
            partial: new Uint8Array([1]),
          },
        },
      },
    ];
    for (const event of events)
      await expect(log.append(event)).resolves.toBe(true);
    await expect(createLog({ world, runId }).read()).resolves.toEqual({
      events,
      position: 4,
    });
    await expect(
      log.read({ after: 2, types: ['effect-start'] }),
    ).resolves.toEqual({ events: [events[1]], position: 4 });
    await expect(log.read({ after: 4 })).resolves.toEqual({
      events: [],
      position: 4,
    });
  });

  test('counts sealed no-op records without exposing them as agent events', async () => {
    const { world, runId, log } = await setup();
    const event = {
      type: 'harness:journal',
      id: 'event',
      data: 'after sealed slot',
    } as const;
    await createLog({ world, runId }).append(event);
    const page = await world.events.list({ runId });
    vi.spyOn(world.events, 'list').mockResolvedValue({
      ...page,
      cursor: slotToEventId(3),
      data: [
        page.data[0],
        {
          ...page.data[0],
          eventId: slotToEventId(2),
          eventType: 'noop',
          eventData: { sealed: true },
        },
        { ...page.data[1], eventId: slotToEventId(3) },
      ],
    });
    await expect(log.read({ after: 2 })).resolves.toEqual({
      events: [event],
      position: 3,
    });
    await expect(log.read({ after: 3 })).resolves.toEqual({
      events: [],
      position: 3,
    });
  });

  test.each([
    new Uint8Array([0]),
    new TextEncoder().encode('null'),
    new TextEncoder().encode(
      JSON.stringify({
        version: 1,
        event: { type: 'not-an-agent-event', data: null },
      }),
    ),
    new TextEncoder().encode(
      JSON.stringify({
        version: 1,
        event: { type: 'submission', data: null },
      }),
    ),
    ...[undefined, null, 42].map(id =>
      new TextEncoder().encode(
        JSON.stringify({
          version: 1,
          event: { type: 'harness:journal', id, data: null },
        }),
      ),
    ),
  ])(
    'refuses malformed reserved records without poisoning the previously cached prefix',
    async bytes => {
      const { world, runId, log } = await setup();
      await log.read();
      await world.events.create(runId, {
        eventType: 'step_created',
        correlationId: 'malformed',
        eventData: { stepName: 'harness-agent-log', input: bytes },
      });
      const list = vi.spyOn(world.events, 'list');
      await expect(log.read()).rejects.toThrow();
      await expect(log.read()).rejects.toThrow();
      expect(list.mock.calls.map(call => call[0].pagination?.cursor)).toEqual([
        slotToEventId(1),
        slotToEventId(1),
      ]);
    },
  );

  test('reads all event types with a whole-log position and deduplicates IDs', async () => {
    const { log } = await setup();
    const firstEvent = {
      type: 'harness:journal',
      id: 'event-1',
      data: {
        message: 'first',
        createdAt: new Date('2026-11-05T00:00:00.000Z'),
        sequence: 1n,
      },
    } as const;
    const secondEvent = {
      type: 'harness:journal',
      id: 'event-2',
      data: { message: 'second' },
    } as const;

    await expect(log.append(firstEvent)).resolves.toBe(true);
    await expect(log.append(firstEvent)).resolves.toBe(false);
    await expect(log.append(secondEvent)).resolves.toBe(true);

    await expect(
      log.read({ after: 2, types: ['harness:journal'] }),
    ).resolves.toEqual({ events: [secondEvent], position: 3 });
    await expect(
      log.read({ after: 2, types: ['effect-start'] }),
    ).resolves.toEqual({ events: [], position: 3 });
  });

  test('filters live append notifications and observes writes from another log', async () => {
    const { world } = await setup();
    const observer = createLog({ world, runId: 'session-id' });
    const writer = createLog({ world, runId: 'session-id' });
    const listener = vi.fn();

    await observer.read();
    const unsubscribe = observer.onAppend({
      listener,
      config: {
        types: ['harness:allowed', 'harness:ignored'],
        ignoreTypes: ['harness:ignored'],
      },
    });

    await writer.append({ type: 'harness:ignored', id: 'ignored', data: {} });
    await writer.append({ type: 'harness:allowed', id: 'allowed-1', data: {} });
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1));

    unsubscribe();
    await writer.append({ type: 'harness:allowed', id: 'allowed-2', data: {} });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test('serializes same-instance appends and snapshots queued input', async () => {
    const { world, runId, log } = await setup();
    const pending = new DelayedPromise<void>();
    const list = world.events.list.bind(world.events);
    vi.spyOn(world.events, 'list').mockImplementationOnce(async params => {
      await pending.promise;
      return list(params);
    });
    const event = {
      type: 'harness:journal',
      id: 'same',
      data: { value: 1 },
    } as const;
    const mutable = {
      type: 'harness:journal' as const,
      id: 'event',
      data: { value: 2 },
    };
    const first = log.append(event);
    const duplicate = log.append(event);
    const second = log.append(mutable);
    mutable.data.value = 99;
    pending.resolve();
    await expect(Promise.all([first, duplicate, second])).resolves.toEqual([
      true,
      false,
      true,
    ]);
    expect((await log.read()).events).toEqual([
      event,
      { type: 'harness:journal', id: 'event', data: { value: 2 } },
    ]);
    expect((await world.events.list({ runId })).data).toHaveLength(3);
  });

  test.each([false, true])(
    'arbitrates cross-instance appends, conflicting=%s',
    async conflicting => {
      const { world, runId, log } = await setup();
      const other = createLog({ world, runId });
      const create = world.events.create.bind(world.events);
      const barrier = new DelayedPromise<void>();
      let arrivals = 0;
      vi.spyOn(world.events, 'create').mockImplementation(async (...args) => {
        if (++arrivals === 2) barrier.resolve();
        await barrier.promise;
        return create(...args);
      });
      const first = {
        type: 'harness:journal',
        id: 'same',
        data: 'first',
      } as const;
      const second = { ...first, data: conflicting ? 'second' : 'first' };
      const results = await Promise.allSettled([
        log.append(first),
        other.append(second),
      ]);
      expect(
        results.filter(
          result => result.status === 'fulfilled' && result.value === true,
        ),
      ).toHaveLength(conflicting ? 1 : 2);
      if (conflicting) {
        const loser = results.find(result => result.status === 'rejected');
        expect(loser).toMatchObject({
          reason: {
            message: 'HarnessAgentLog: event ID already has different content.',
          },
        });
      } else
        expect(
          results
            .map(result => result.status === 'fulfilled' && result.value)
            .sort(),
        ).toEqual([true, true]);
      expect((await world.events.list({ runId })).data).toHaveLength(3);
      const canonical = await log.read();
      expect(canonical.events).toHaveLength(1);
      expect(canonical.position).toBe(3);
      expect(await other.read()).toEqual(canonical);
      expect(await createLog({ world, runId }).read()).toEqual(canonical);
      await expect(
        createLog({ world, runId }).append(canonical.events[0]),
      ).resolves.toBe(false);
    },
  );

  test('keeps distinct concurrent IDs even with identical payloads', async () => {
    const { world, runId, log } = await setup();
    const other = createLog({ world, runId });
    const event = { type: 'harness:journal', id: 'event', data: null } as const;
    await expect(
      Promise.all([
        log.append(event),
        other.append({ ...event, id: 'other' }),
        log.append({ ...event, id: 'one' }),
        other.append({ ...event, id: 'two' }),
      ]),
    ).resolves.toEqual([true, true, true, true]);
    expect((await log.read()).events).toHaveLength(4);
  });

  test('folds repeated physical records for one event ID only once', async () => {
    const { world, runId, log } = await setup();
    const event = {
      type: 'harness:journal',
      id: 'event',
      data: { message: 'once' },
    } as const;
    const bytes = new TextEncoder().encode(
      JSON.stringify({
        version: 1,
        event: jsonEncodeSerializableValue({ value: event }),
      }),
    );
    await world.events.create(runId, {
      eventType: 'step_created',
      correlationId: 'physical-one',
      eventData: { stepName: 'harness-agent-log', input: bytes },
    });
    await world.events.create(runId, {
      eventType: 'step_created',
      correlationId: 'physical-two',
      eventData: { stepName: 'harness-agent-log', input: bytes },
    });
    await expect(log.read()).resolves.toEqual({ events: [event], position: 3 });
    await expect(log.read({ after: 2 })).resolves.toEqual({
      events: [],
      position: 3,
    });
  });

  test('reconciles before a resend and suppresses the original attempt when it commits late', async () => {
    vi.useFakeTimers();
    const { world, runId, log } = await setup();
    const create = world.events.create.bind(world.events);
    let original: (() => Promise<EventResult>) | undefined;
    const write = vi
      .spyOn(world.events, 'create')
      .mockImplementationOnce(async (...args) => {
        original = () => create(...args);
        throw new Error('unknown outcome');
      })
      .mockImplementation(create);
    const event = {
      type: 'harness:journal',
      id: 'event',
      data: 'only once',
    } as const;
    const append = log.append(event);
    await vi.advanceTimersByTimeAsync(50);
    await expect(append).resolves.toBe(true);
    expect(write).toHaveBeenCalledTimes(2);
    await original!();
    expect((await world.events.list({ runId })).data).toHaveLength(3);
    await expect(log.read()).resolves.toEqual({ events: [event], position: 3 });
    await expect(createLog({ world, runId }).read()).resolves.toEqual({
      events: [event],
      position: 3,
    });
  });

  test('returns false for an existing identical ID and rejects conflicting reuse without writing', async () => {
    const { world, log } = await setup();
    const event = {
      type: 'harness:journal',
      id: 'stable',
      data: 'private content',
    } as const;
    await log.append(event);
    const write = vi.spyOn(world.events, 'create');
    await expect(log.append(event)).resolves.toBe(false);
    await expect(
      log.append({ ...event, data: 'different private content' }),
    ).rejects.toThrow('event ID already has different content');
    expect(write).not.toHaveBeenCalled();
    await expect(log.append({ ...event, id: 'next' })).resolves.toBe(true);
  });

  test('recovers a lost acknowledgment without resending', async () => {
    const { world, log } = await setup();
    const create = world.events.create.bind(world.events);
    const write = vi
      .spyOn(world.events, 'create')
      .mockImplementation(async (...args) => {
        await create(...args);
        throw new Error('lost response');
      });
    const event = {
      type: 'harness:journal',
      id: 'stable',
      data: 1,
    } as const;
    await expect(log.append(event)).resolves.toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    expect((await log.read()).events).toEqual([event]);
  });

  test('confirms a concurrent matching event after an uncertain write without resending', async () => {
    const { world, runId, log } = await setup();
    const other = createLog({ world, runId });
    const event = {
      type: 'harness:journal',
      id: 'stable',
      data: 'committed by another caller',
    } as const;
    const write = vi
      .spyOn(world.events, 'create')
      .mockImplementationOnce(async () => {
        await expect(other.append(event)).resolves.toBe(true);
        throw new Error('unknown outcome');
      });
    await expect(log.append(event)).resolves.toBe(true);
    expect(write).toHaveBeenCalledTimes(2);
    await expect(log.read()).resolves.toEqual({
      events: [event],
      position: 2,
    });
    await expect(log.append(event)).resolves.toBe(false);
    expect(write).toHaveBeenCalledTimes(2);
  });

  test('resends the same event with fresh physical claims', async () => {
    vi.useFakeTimers();
    const { world, log } = await setup();
    const create = world.events.create.bind(world.events);
    const write = vi
      .spyOn(world.events, 'create')
      .mockRejectedValueOnce(new Error('before commit'))
      .mockImplementation(create);
    const event = { type: 'harness:journal', id: 'event', data: null } as const;
    const append = log.append(event);
    await vi.advanceTimersByTimeAsync(50);
    await expect(append).resolves.toBe(true);
    expect(write).toHaveBeenCalledTimes(2);
    const [first, second] = write.mock.calls.map(call => call[1]);
    expect(first.correlationId).not.toBe(second.correlationId);
    expect(first.eventData).toEqual(second.eventData);
    expect(first.eventData).toEqual({
      stepName: 'harness-agent-log',
      input: new TextEncoder().encode(
        JSON.stringify({
          version: 1,
          event: jsonEncodeSerializableValue({
            value: { type: event.type, data: event.data, id: event.id },
          }),
        }),
      ),
    });
    expect((await log.read()).events).toEqual([event]);
  });

  test('does not resend while reconciliation fails and latches exhausted recovery', async () => {
    vi.useFakeTimers();
    const { world, log } = await setup();
    const list = world.events.list.bind(world.events);
    let writing = false;
    const write = vi
      .spyOn(world.events, 'create')
      .mockImplementation(async () => {
        writing = true;
        throw new Error('unknown outcome');
      });
    vi.spyOn(world.events, 'list').mockImplementation(params =>
      writing ? Promise.reject(new Error('offline')) : list(params),
    );
    const first = log.append({
      type: 'harness:journal',
      id: 'event-1',
      data: 1,
    });
    const queued = log.append({
      type: 'harness:journal',
      id: 'event-2',
      data: 2,
    });
    const results = Promise.allSettled([first, queued]);
    await vi.advanceTimersByTimeAsync(1000);
    expect((await results).map(result => result.status)).toEqual([
      'rejected',
      'rejected',
    ]);
    expect(write).toHaveBeenCalledTimes(1);
    writing = false;
    await expect(log.read()).resolves.toEqual({ events: [], position: 1 });
    await expect(
      log.append({ type: 'harness:journal', id: 'event-3', data: 3 }),
    ).rejects.toThrow('recreate the log');
    expect(write).toHaveBeenCalledTimes(1);
  });

  test('bounds resends and permits reconstruction after an exhausted append', async () => {
    vi.useFakeTimers();
    const { world, runId, log } = await setup();
    const write = vi
      .spyOn(world.events, 'create')
      .mockRejectedValue(new Error('offline'));
    const append = log.append({
      type: 'harness:journal',
      id: 'stable',
      data: null,
    });
    const rejected = expect(append).rejects.toThrow('recreate the log');
    await vi.advanceTimersByTimeAsync(1000);
    await rejected;
    expect(write).toHaveBeenCalledTimes(4);
    write.mockRestore();
    await expect(
      createLog({ world, runId }).append({
        type: 'harness:journal',
        id: 'stable',
        data: null,
      }),
    ).resolves.toBe(true);
  });

  test('probes a committed slow write and handles its late rejection', async () => {
    vi.useFakeTimers();
    const { world, log } = await setup();
    const create = world.events.create.bind(world.events);
    const response = new DelayedPromise<EventResult>();
    const write = vi
      .spyOn(world.events, 'create')
      .mockImplementation(async (...args) => {
        await create(...args);
        return response.promise;
      });
    const event = { type: 'harness:journal', id: 'event', data: null } as const;
    const append = log.append(event);
    await vi.advanceTimersByTimeAsync(2000);
    await expect(append).resolves.toBe(true);
    response.reject(new Error('late response'));
    await settle();
    expect(write).toHaveBeenCalledTimes(1);
    expect((await log.read()).events).toEqual([event]);
    expect(vi.getTimerCount()).toBe(0);
  });

  test('does not resend a pending write that has not committed', async () => {
    vi.useFakeTimers();
    const { world, log } = await setup();
    const create = world.events.create.bind(world.events);
    const release = new DelayedPromise<void>();
    const write = vi
      .spyOn(world.events, 'create')
      .mockImplementation(async (...args) => {
        await release.promise;
        return create(...args);
      });
    const appended = vi.fn();
    const append = log
      .append({ type: 'harness:journal', id: 'event', data: null })
      .then(appended);
    await vi.advanceTimersByTimeAsync(6000);
    expect(write).toHaveBeenCalledTimes(1);
    expect(appended).not.toHaveBeenCalled();
    release.resolve();
    await append;
    expect(appended).toHaveBeenCalledWith(true);
  });

  test.each(['complete', 'missing', 'partial'] as const)(
    'folds interleaved commits with a %s write report',
    async report => {
      const { world, runId, log } = await setup();
      const create = world.events.create.bind(world.events);
      const list = vi.spyOn(world.events, 'list');
      vi.spyOn(world.events, 'create').mockImplementationOnce(
        async (...args) => {
          await create(runId, {
            eventType: 'step_created',
            correlationId: 'foreign',
            eventData: { stepName: 'other', input: [] },
          });
          const result = await create(...args);
          if (report === 'missing')
            return { event: result.event, step: result.step };
          if (report === 'partial')
            return {
              ...result,
              events: [result.event!],
              cursor: result.event!.eventId,
              hasMore: false,
            };
          return result;
        },
      );
      await expect(
        log.append({ type: 'harness:journal', id: 'event-1', data: 1 }),
      ).resolves.toBe(true);
      expect(list.mock.calls.length).toBe(report === 'complete' ? 1 : 2);
      await expect(log.read()).resolves.toEqual({
        events: [{ type: 'harness:journal', id: 'event-1', data: 1 }],
        position: 3,
      });
    },
  );

  test('retries a failed page without losing events and retains opaque tail cursors', async () => {
    const { world, runId, log } = await setup();
    const writer = createLog({ world, runId });
    await writer.append({ type: 'harness:journal', id: 'one', data: 1 });
    await writer.append({ type: 'harness:journal', id: 'two', data: 2 });
    const list = world.events.list.bind(world.events);
    let fail = true;
    const calls = vi
      .spyOn(world.events, 'list')
      .mockImplementation(async params => {
        if (params.pagination?.cursor === slotToEventId(2) && fail) {
          fail = false;
          throw new Error('page failed');
        }
        return list({
          ...params,
          pagination: { ...params.pagination, limit: 2 },
        });
      });
    await expect(log.read()).rejects.toThrow('page failed');
    await expect(log.read()).resolves.toEqual({
      events: [
        { type: 'harness:journal', id: 'one', data: 1 },
        { type: 'harness:journal', id: 'two', data: 2 },
      ],
      position: 3,
    });
    calls.mockClear();
    await log.read();
    expect(calls.mock.calls[0][0].pagination?.cursor).toBe(slotToEventId(3));
  });

  test('does not advance a cursor past malformed namespaced storage', async () => {
    const { world, runId, log } = await setup();
    await world.events.create(runId, {
      eventType: 'step_created',
      correlationId: 'bad',
      eventData: {
        stepName: 'harness-agent-log',
        input: new TextEncoder().encode('{"version":2}'),
      },
    });
    const list = vi.spyOn(world.events, 'list');
    await expect(log.read()).rejects.toThrow('unsupported storage envelope');
    await expect(log.read()).rejects.toThrow('unsupported storage envelope');
    expect(list.mock.calls.map(call => call[0].pagination?.cursor)).toEqual([
      undefined,
      undefined,
    ]);
    await expect(
      log.append({ type: 'harness:journal', id: 'event', data: null }),
    ).rejects.toThrow('unsupported storage envelope');
    expect((await world.events.list({ runId })).data).toHaveLength(2);
  });

  test('rejects a gapped prefix without advancing past its missing slot', async () => {
    const { world, runId, log } = await setup();
    await createLog({ world, runId }).append({
      type: 'harness:journal',
      id: 'event-1',
      data: 1,
    });
    const list = world.events.list.bind(world.events);
    vi.spyOn(world.events, 'list').mockImplementationOnce(async params => {
      const page = await list(params);
      return { ...page, data: page.data.slice(1) };
    });
    await expect(log.read()).rejects.toThrow('incomplete World event prefix');
    await expect(log.read()).resolves.toEqual({
      events: [{ type: 'harness:journal', id: 'event-1', data: 1 }],
      position: 2,
    });
  });

  test('round-trips rich values and protects cached records across checkpoint restoration', async () => {
    const { world, runId, log } = await setup();
    const event: HarnessAgentLogEvent = {
      type: 'harness:journal',
      id: 'event',
      data: {
        date: new Date(0),
        bigint: 1n,
        regexp: /test/gi,
        url: new URL('https://example.com'),
        params: new URLSearchParams('q=test'),
        bytes: new Uint8Array([1, 2]),
        buffer: new Uint16Array([3]).buffer,
        map: new Map([['key', undefined]]),
        set: new Set([NaN, Infinity, -0]),
        array: [undefined, -0],
      },
    };
    await log.append(event);
    const read = await log.read();
    expect(read.events).toEqual([event]);
    (read.events[0] as { data: unknown }).data = null;
    expect((await log.read()).events).toEqual([event]);
    const restored = new InMemoryWorld();
    await restored.seedJson({ runId, data: await world.exportJson({ runId }) });
    await expect(createLog({ world: restored, runId }).read()).resolves.toEqual(
      { events: [event], position: 2 },
    );
    const replay = createLog({ world: restored, runId });
    await expect(replay.append(event)).resolves.toBe(false);
    await expect(
      replay.append({ ...event, data: { date: new Date(1) } }),
    ).rejects.toThrow('event ID already has different content');
  });

  test('isolates callback exceptions and hint publishing failures from committed appends', async () => {
    const { world, log } = await setup();
    await log.read();
    vi.spyOn(world.streams, 'write').mockRejectedValue(
      new Error('hint unavailable'),
    );
    const unsubscribeThrowing = log.onAppend({
      listener: () => {
        throw new Error('callback');
      },
    });
    const listener = vi.fn();
    const unsubscribe = log.onAppend({ listener });
    try {
      await expect(
        log.append({ type: 'harness:journal', id: 'event-1', data: 1 }),
      ).resolves.toBe(true);
      expect(listener).toHaveBeenCalledTimes(1);
      expect((await log.read()).position).toBe(2);
    } finally {
      unsubscribeThrowing();
      unsubscribe();
    }
  });

  test('sends a follow-up hint when another commit arrives during hint publication', async () => {
    const { world, runId, log } = await setup();
    const write = world.streams.write.bind(world.streams);
    const acknowledgment = new DelayedPromise<void>();
    const hints = vi
      .spyOn(world.streams, 'write')
      .mockImplementationOnce(async (...args) => {
        await write(...args);
        await acknowledgment.promise;
      });
    const writer = createLog({ world, runId });
    const listener = vi.fn();
    await log.read();
    const unsubscribe = log.onAppend({ listener });
    try {
      await settle();
      await writer.append({ type: 'harness:journal', id: 'event-1', data: 1 });
      await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1));
      await writer.append({ type: 'harness:journal', id: 'event-2', data: 2 });
      await settle();
      expect(hints).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledTimes(1);
      acknowledgment.resolve();
      await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(2));
      expect(hints).toHaveBeenCalledTimes(2);
    } finally {
      acknowledgment.resolve();
      unsubscribe();
    }
  });

  test('handles listener reentrancy, asynchronous rejection and unsubscribe during notification', async () => {
    const { log } = await setup();
    await log.read();
    let read: ReturnType<typeof log.read> | undefined;
    let unsubscribeOther = () => {};
    const unsubscribeFirst = log.onAppend({
      listener: () => {
        read = log.read();
        unsubscribeOther();
      },
    });
    const other = vi.fn();
    unsubscribeOther = log.onAppend({ listener: other });
    const unsubscribeAsync = log.onAppend({
      listener: async () => {
        throw new Error('asynchronous listener');
      },
    });
    try {
      await expect(
        log.append({ type: 'harness:journal', id: 'event-1', data: 1 }),
      ).resolves.toBe(true);
      await expect(read).resolves.toEqual({
        events: [{ type: 'harness:journal', id: 'event-1', data: 1 }],
        position: 2,
      });
      expect(other).not.toHaveBeenCalled();
      await settle();
    } finally {
      unsubscribeFirst();
      unsubscribeOther();
      unsubscribeAsync();
    }
  });

  test('catches cancellation rejection and releases the reader lock', async () => {
    vi.useFakeTimers();
    const { world, log } = await setup();
    const cancel = vi.fn().mockRejectedValue(new Error('cancel failed'));
    const stream = new ReadableStream<Uint8Array>({ cancel });
    vi.spyOn(world.streams, 'get').mockResolvedValue(stream);
    const unsubscribe = log.onAppend({ listener: vi.fn() });
    await settle();
    expect(stream.locked).toBe(true);
    unsubscribe();
    await settle();
    expect(stream.locked).toBe(false);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  test('polls after lost hints and stream failure without poisoning read or append', async () => {
    vi.useFakeTimers();
    const { world, runId, log } = await setup();
    vi.spyOn(world.streams, 'get').mockRejectedValue(new Error('disconnected'));
    vi.spyOn(world.streams, 'write').mockRejectedValue(new Error('lost hint'));
    const listener = vi.fn();
    await log.read();
    const unsubscribe = log.onAppend({ listener });
    try {
      await settle();
      await createLog({ world, runId }).append({
        type: 'harness:journal',
        id: 'event-1',
        data: 1,
      });
      expect(listener).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(15_000);
      expect(listener).toHaveBeenCalledTimes(1);
      await expect(
        log.append({ type: 'harness:journal', id: 'event-2', data: 2 }),
      ).resolves.toBe(true);
    } finally {
      unsubscribe();
    }
    await settle();
    expect(vi.getTimerCount()).toBe(0);
  });

  test('cancels a stream acquired after unsubscribe and isolates watcher generations', async () => {
    vi.useFakeTimers();
    const { world, log } = await setup();
    const acquired = new DelayedPromise<ReadableStream<Uint8Array>>();
    const cancel = vi.fn();
    const get = vi
      .spyOn(world.streams, 'get')
      .mockReturnValueOnce(acquired.promise);
    const listener = vi.fn();
    const unsubscribe = log.onAppend({ listener });
    await settle();
    expect(get).toHaveBeenCalledTimes(1);
    unsubscribe();
    const nextUnsubscribe = log.onAppend({ listener });
    acquired.resolve(new ReadableStream({ cancel }));
    await settle();
    expect(cancel).toHaveBeenCalledTimes(1);
    await log.append({ type: 'harness:journal', id: 'event-1', data: 1 });
    expect(listener).toHaveBeenCalledTimes(1);
    nextUnsubscribe();
    await settle();
    expect(vi.getTimerCount()).toBe(0);
  });

  test('treats fragmented, coalesced, early and duplicate hint bytes as advisory', async () => {
    const { world, runId, log } = await setup();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const cancel = vi.fn();
    vi.spyOn(world.streams, 'get').mockResolvedValue(
      new ReadableStream({
        start(value) {
          controller = value;
        },
        cancel,
      }),
    );
    const listener = vi.fn();
    await log.read();
    const unsubscribe = log.onAppend({ listener });
    try {
      await settle();
      controller.enqueue(new Uint8Array([0xf0]));
      await settle();
      expect(listener).not.toHaveBeenCalled();
      await createLog({ world, runId }).append({
        type: 'harness:journal',
        id: 'event-1',
        data: 1,
      });
      controller.enqueue(new Uint8Array([0x9f, 0x92, 0xa9, 10, 10]));
      await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1));
      controller.enqueue(new Uint8Array([10]));
      await settle();
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
    }
    await settle();
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  test('refreshes after reconnect and cancels a failed reader', async () => {
    vi.useFakeTimers();
    const { world, runId, log } = await setup();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const get = vi.spyOn(world.streams, 'get').mockResolvedValueOnce(
      new ReadableStream({
        start(value) {
          controller = value;
        },
      }),
    );
    const listener = vi.fn();
    await log.read();
    const unsubscribe = log.onAppend({ listener });
    try {
      await settle();
      controller.error(new Error('disconnect'));
      await settle();
      await createLog({ world, runId }).append({
        type: 'harness:journal',
        id: 'event-1',
        data: 1,
      });
      await vi.advanceTimersByTimeAsync(1000);
      expect(get).toHaveBeenCalledTimes(2);
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
    }
    await settle();
    expect(vi.getTimerCount()).toBe(0);
  });

  test('refreshes events appended during watcher initialization without requiring a prior read', async () => {
    const { world, runId, log } = await setup();
    const info = world.streams.getInfo.bind(world.streams);
    const writer = createLog({ world, runId });
    vi.spyOn(world.streams, 'getInfo').mockImplementationOnce(
      async (...args) => {
        await writer.append({
          type: 'harness:journal',
          id: 'event-1',
          data: 1,
        });
        return info(...args);
      },
    );
    const listener = vi.fn();
    const unsubscribe = log.onAppend({ listener });
    try {
      await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1));
    } finally {
      unsubscribe();
    }
  });

  test('isolates runs even when stream names are globally scoped', async () => {
    const { world, runId, log } = await setup();
    const otherRun = 'other-session';
    await world.events.create(otherRun, {
      eventType: 'run_created',
      eventData: { deploymentId: 'test', workflowName: 'harness', input: [] },
    });
    const get = world.streams.get.bind(world.streams);
    const write = world.streams.write.bind(world.streams);
    const info = world.streams.getInfo.bind(world.streams);
    vi.spyOn(world.streams, 'get').mockImplementation((_runId, ...args) =>
      get('global', ...args),
    );
    const writes = vi
      .spyOn(world.streams, 'write')
      .mockImplementation((_runId, ...args) => write('global', ...args));
    vi.spyOn(world.streams, 'getInfo').mockImplementation((_runId, ...args) =>
      info('global', ...args),
    );
    await log.read();
    const listener = vi.fn();
    const unsubscribe = log.onAppend({ listener });
    try {
      await settle();
      await createLog({ world, runId: otherRun }).append({
        type: 'harness:journal',
        id: 'event',
        data: 'other',
      });
      await settle();
      expect(listener).not.toHaveBeenCalled();
      await createLog({ world, runId }).append({
        type: 'harness:journal',
        id: 'event',
        data: 'this',
      });
      await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1));
      expect(new Set(writes.mock.calls.map(call => call[1])).size).toBe(2);
      expect((await log.read()).events).toEqual([
        { type: 'harness:journal', id: 'event', data: 'this' },
      ]);
    } finally {
      unsubscribe();
    }
  });
});
