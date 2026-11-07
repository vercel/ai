import type { SerializableValue } from '@ai-sdk/provider';
import { DelayedPromise } from '@ai-sdk/provider-utils';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { HarnessInvalidDriveStateError } from '../../../errors/harness-invalid-drive-state-error';
import type { HarnessV2EffectOutput } from '../../../v2/harness-v2-effect';
import { InMemoryWorld } from '../in-memory-world';
import { createEffectFunction } from './create-effect-function';
import { createLog } from './create-log';
import type {
  HarnessAgentEffectFunction,
  HarnessAgentLog,
  HarnessAgentLogEvent,
} from './types';

const abortControllers = new Set<AbortController>();

afterEach(() => {
  for (const controller of abortControllers) controller.abort();
  abortControllers.clear();
});

function createAbortController(): AbortController {
  const controller = new AbortController();
  abortControllers.add(controller);
  return controller;
}

const options: Parameters<HarnessAgentEffectFunction>[1] = {
  name: 'tool.test',
  replay: 'safe',
  input: { query: 'test' },
};

async function setup() {
  const world = new InMemoryWorld();
  const runId = 'effect-session';
  await world.events.create(runId, {
    eventType: 'run_created',
    eventData: { deploymentId: 'test', workflowName: 'harness', input: [] },
  });
  const log = createLog({ world, runId });
  const abortController = createAbortController();
  const effect = createEffectFunction({
    log,
    abortSignal: abortController.signal,
  });
  return { world, runId, log, abortController, effect };
}

function startEvent(
  input: {
    id?: string;
    attempt?: number;
    replay?: 'safe' | 'never';
    deliveredSubmissionIds?: string[];
  } = {},
): Extract<HarnessAgentLogEvent, { type: 'effect-start' }> {
  return {
    type: 'effect-start',
    id: input.id ?? 'start',
    data: {
      key: 'key',
      attempt: input.attempt ?? 1,
      ...options,
      replay: input.replay ?? 'safe',
      deliveredSubmissionIds: input.deliveredSubmissionIds ?? [],
    },
  };
}

describe('createEffectFunction', () => {
  test('reads history once across execution, progress, and replay', async () => {
    const { effect, log, world, runId } = await setup();
    const writer = createLog({ world, runId });
    await writer.append(startEvent());
    await writer.append({
      type: 'effect-end',
      id: 'existing-end',
      data: { startId: 'start', output: { type: 'result', value: 'existing' } },
    });
    const read = vi.spyOn(log, 'read');
    const replacement = vi.fn(async () => 'unexpected');
    expect(await effect('key', options, replacement)).toEqual({
      type: 'result',
      value: 'existing',
    });
    for (let index = 0; index < 8; index++) {
      expect(
        await effect(`key-${index}`, options, async function* () {
          yield { index };
          yield { index, done: true };
        }),
      ).toEqual({ type: 'result', value: { index, done: true } });
    }
    for (let index = 0; index < 8; index++) {
      await effect(`key-${index}`, options, replacement);
    }
    expect(read).toHaveBeenCalledExactlyOnceWith({
      types: ['effect-start', 'effect-progress', 'effect-end'],
    });
    expect((await createLog({ world, runId }).read()).events).toHaveLength(34);
    expect(replacement).not.toHaveBeenCalled();
  });

  test('ignores unrelated events without rereading history', async () => {
    const { effect, log, world, runId } = await setup();
    const read = vi.spyOn(log, 'read');
    const fn = vi.fn(async () => 'value');
    await effect('key', options, fn);
    await createLog({ world, runId }).append({
      type: 'harness:journal',
      id: 'unrelated',
      data: null,
    });
    await world.events.create(runId, {
      eventType: 'step_created',
      correlationId: 'infrastructure',
      eventData: { stepName: 'other', input: [] },
    });
    await effect('other', options, fn);
    await effect('key', options, fn);
    expect(read).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test('shares initialization without serializing callbacks for different keys', async () => {
    const { effect, log } = await setup();
    const read = log.read.bind(log);
    const reading = new DelayedPromise<void>();
    const releaseRead = new DelayedPromise<void>();
    const firstEntered = new DelayedPromise<void>();
    const secondEntered = new DelayedPromise<void>();
    const releaseCallbacks = new DelayedPromise<string>();
    const reads = vi.spyOn(log, 'read').mockImplementationOnce(async opts => {
      const result = await read(opts);
      reading.resolve();
      await releaseRead.promise;
      return result;
    });
    const first = effect('first', options, () => {
      firstEntered.resolve();
      return releaseCallbacks.promise;
    });
    await reading.promise;
    const second = effect('second', options, () => {
      secondEntered.resolve();
      return releaseCallbacks.promise;
    });
    const initialReads = reads.mock.calls.length;
    releaseRead.resolve();
    try {
      await Promise.all([firstEntered.promise, secondEntered.promise]);
    } finally {
      releaseCallbacks.resolve('result');
    }
    await expect(Promise.all([first, second])).resolves.toEqual([
      { type: 'result', value: 'result' },
      { type: 'result', value: 'result' },
    ]);
    expect(initialReads).toBe(1);
    expect(reads).toHaveBeenCalledTimes(1);
  });

  test('preserves winning attempts and outputs across incremental external writes', async () => {
    const { effect, log, world, runId, abortController } = await setup();
    const writer = createLog({ world, runId });
    const read = vi.spyOn(log, 'read');
    const observed = new Set<string>();
    const unsubscribe = log.onAppend({
      listener: event => observed.add(event.id),
    });
    abortController.signal.addEventListener('abort', unsubscribe, {
      once: true,
    });
    const fn = vi.fn(async () => 'unexpected');
    await writer.append(startEvent());
    await expect(effect('key', options, fn)).rejects.toBeInstanceOf(
      HarnessInvalidDriveStateError,
    );
    await writer.append(startEvent({ id: 'losing-start' }));
    await writer.append(startEvent({ id: 'invalid-retry', attempt: 3 }));
    await writer.append({
      type: 'effect-end',
      id: 'losing-end',
      data: {
        startId: 'losing-start',
        output: { type: 'result', value: 'loser' },
      },
    });
    await vi.waitFor(() => expect(observed.has('losing-end')).toBe(true));
    await expect(effect('key', options, fn)).rejects.toBeInstanceOf(
      HarnessInvalidDriveStateError,
    );
    await writer.append({
      type: 'effect-end',
      id: 'interrupted',
      data: {
        startId: 'start',
        output: { type: 'interrupted', retryable: true },
      },
    });
    await writer.append(startEvent({ id: 'retry', attempt: 2 }));
    await vi.waitFor(() => expect(observed.has('retry')).toBe(true));
    await expect(effect('key', options, fn)).rejects.toBeInstanceOf(
      HarnessInvalidDriveStateError,
    );
    await writer.append({
      type: 'effect-progress',
      id: 'late-progress',
      data: { startId: 'start', partial: 'late' },
    });
    await writer.append({
      type: 'effect-end',
      id: 'late-end',
      data: { startId: 'start', output: { type: 'result', value: 'late' } },
    });
    await writer.append({
      type: 'effect-end',
      id: 'retry-end',
      data: { startId: 'retry', output: { type: 'result', value: 'winner' } },
    });
    await vi.waitFor(() => expect(observed.has('retry-end')).toBe(true));
    expect(await effect('key', options, fn)).toEqual({
      type: 'result',
      value: 'winner',
    });
    await writer.append({
      type: 'effect-end',
      id: 'losing-retry-end',
      data: { startId: 'retry', output: { type: 'result', value: 'loser' } },
    });
    await vi.waitFor(() => expect(observed.has('losing-retry-end')).toBe(true));
    expect(await effect('key', options, fn)).toEqual({
      type: 'result',
      value: 'winner',
    });
    expect(fn).not.toHaveBeenCalled();
    expect(read).toHaveBeenCalledTimes(1);
  });

  test('does not replace newer committed progress when a local append returns', async () => {
    const { effect, log, abortController } = await setup();
    const append = log.append.bind(log);
    vi.spyOn(log, 'append').mockImplementation(async event => {
      const result = await append(event);
      if (event.type === 'effect-progress') {
        await append({
          type: 'effect-progress',
          id: 'external-progress',
          data: { startId: event.data.startId, partial: 'external' },
        });
        await effect('other', options, async () => 'other');
      }
      return result;
    });
    expect(
      await effect('key', options, async function* () {
        yield 'local';
        abortController.abort();
      }),
    ).toEqual({ type: 'interrupted', retryable: true, partial: 'external' });
  });

  test('uses committed notifications without confirmation reads', async () => {
    const { effect, log } = await setup();
    const read = vi.spyOn(log, 'read');
    const append = log.append.bind(log);
    vi.spyOn(log, 'append').mockImplementation(async event => {
      const result = await append(event);
      if (event.type === 'effect-end') {
        read.mockRejectedValue(new Error('unexpected confirmation read'));
      }
      return result;
    });
    const fn = vi.fn(async () => 'committed');
    expect(await effect('key', options, fn)).toEqual({
      type: 'result',
      value: 'committed',
    });
    expect(await effect('key', options, fn)).toEqual({
      type: 'result',
      value: 'committed',
    });
    expect(read).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test.each(['result', 'interrupted'] as const)(
    'isolates returned %s values from retained state on the same factory',
    async type => {
      const { effect, log, abortController } = await setup();
      const value = {
        nested: { count: 1 },
        date: new Date(0),
        bytes: new Uint8Array([1]),
        map: new Map([['key', new Set(['original'])]]),
      };
      const expected: HarnessV2EffectOutput<typeof value> =
        type === 'result'
          ? { type: 'result', value }
          : { type: 'interrupted', retryable: false, partial: value };
      const fn = vi.fn(async function* () {
        yield value;
        if (type === 'interrupted') abortController.abort();
      });
      for (let index = 0; index < 3; index++) {
        const output = await effect('key', { ...options, replay: 'never' }, fn);
        expect(output).toEqual(expected);
        const returned =
          output.type === 'result'
            ? output.value
            : output.type === 'interrupted'
              ? output.partial
              : undefined;
        expect(returned).toBeDefined();
        returned!.nested.count = 2;
        returned!.date.setTime(100);
        returned!.bytes[0] = 2;
        returned!.map.get('key')!.add('changed');
      }
      expect(fn).toHaveBeenCalledTimes(1);
      const ends = await log.read({ types: ['effect-end'] });
      expect(ends.events[0].data).toEqual({
        startId: expect.any(String),
        output: expected,
      });
    },
  );

  test('commits the start before execution and replays the committed result by key', async () => {
    const { effect, log, world, runId, abortController } = await setup();
    const fn = vi.fn(async context => {
      expect(context.abortSignal).toBe(abortController.signal);
      expect((await log.read()).events).toEqual([
        {
          type: 'effect-start',
          id: context.startId,
          data: {
            ...options,
            key: 'key',
            attempt: 1,
            deliveredSubmissionIds: [],
          },
        },
      ]);
      return { answer: 42 };
    });
    const output = await effect('key', options, fn);
    expect(output).toEqual({ type: 'result', value: { answer: 42 } });
    if (output.type === 'result') output.value.answer = 0;

    const replay = createEffectFunction({
      log: createLog({ world, runId }),
      abortSignal: AbortSignal.abort(),
    });
    const replacement = vi.fn(async () => 'changed');
    expect(
      await replay('key', { ...options, input: 'changed' }, replacement),
    ).toEqual({ type: 'result', value: { answer: 42 } });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(replacement).not.toHaveBeenCalled();
    expect((await log.read()).events.map(event => event.type)).toEqual([
      'effect-start',
      'effect-end',
    ]);
  });

  test.each([
    { error: new Error('failed'), message: 'Error: failed' },
    { error: 'failed', message: 'failed' },
    { error: undefined, message: 'unknown error' },
    { error: Symbol('failed'), message: 'Symbol(failed)' },
  ])(
    'records and replays callback errors: $message',
    async ({ error, message }) => {
      const { effect, log, world, runId } = await setup();
      const output = await effect('key', options, () => {
        throw error;
      });
      expect(output).toEqual({ type: 'error', error: message });
      const replacement = vi.fn(async () => 'unexpected');
      expect(
        await createEffectFunction({
          log: createLog({ world, runId }),
          abortSignal: createAbortController().signal,
        })('key', options, replacement),
      ).toEqual(output);
      expect(replacement).not.toHaveBeenCalled();
      expect((await log.read()).events).toHaveLength(2);
    },
  );

  test('records rejected promises and iterator failures as callback errors', async () => {
    const { effect, log } = await setup();
    expect(
      await effect('promise', options, async () => {
        throw new Error('promise failed');
      }),
    ).toEqual({ type: 'error', error: 'Error: promise failed' });
    expect(
      await effect('iterator', options, async function* () {
        yield 'partial';
        throw new Error('iterator failed');
      }),
    ).toEqual({ type: 'error', error: 'Error: iterator failed' });
    expect(
      (await log.read({ types: ['effect-progress'] })).events.map(
        event => event.data,
      ),
    ).toEqual([{ startId: expect.any(String), partial: 'partial' }]);
  });

  test('keeps undefined results, ignores generator returns, and allows zero yields', async () => {
    const { effect, log } = await setup();
    expect(await effect('promise', options, async () => undefined)).toEqual({
      type: 'result',
      value: undefined,
    });
    expect(
      await effect('empty', options, async function* () {
        yield* [];
        return 'ignored';
      }),
    ).toEqual({ type: 'result', value: undefined });
    expect(
      await effect('yield', options, async function* () {
        yield undefined;
        return 'ignored';
      }),
    ).toEqual({ type: 'result', value: undefined });
    expect(
      (await log.read({ types: ['effect-progress'] })).events,
    ).toHaveLength(1);
  });

  test('persists yielded snapshots and uses the last snapshot as the result', async () => {
    const { effect, log } = await setup();
    const value = { count: 1 };
    expect(
      await effect('key', options, async function* () {
        yield value;
        value.count = 2;
        yield value;
        value.count = 3;
        return { count: 4 };
      }),
    ).toEqual({ type: 'result', value: { count: 2 } });
    expect(
      (await log.read({ types: ['effect-progress'] })).events.map(
        event => event.data,
      ),
    ).toEqual([
      { startId: expect.any(String), partial: { count: 1 } },
      { startId: expect.any(String), partial: { count: 2 } },
    ]);
  });

  test.each([false, true])(
    'waits for committed progress before advancing the iterator, cancellation: %s',
    async cancel => {
      const { effect, log, abortController } = await setup();
      const writing = new DelayedPromise<void>();
      const release = new DelayedPromise<void>();
      const resumed = vi.fn();
      const append = log.append.bind(log);
      vi.spyOn(log, 'append').mockImplementation(async event => {
        if (event.type === 'effect-progress') {
          writing.resolve();
          await release.promise;
        }
        return append(event);
      });
      const running = effect('key', options, async function* () {
        yield 'partial';
        resumed();
      });
      await writing.promise;
      expect(resumed).not.toHaveBeenCalled();
      expect((await log.read({ types: ['effect-progress'] })).events).toEqual(
        [],
      );
      if (cancel) abortController.abort();
      release.resolve();
      expect(await running).toEqual(
        cancel
          ? { type: 'interrupted', retryable: true, partial: 'partial' }
          : { type: 'result', value: 'partial' },
      );
      expect(resumed).toHaveBeenCalledTimes(cancel ? 0 : 1);
    },
  );

  test('round-trips extended serializable values in inputs, progress, and outputs', async () => {
    const { effect, log, world, runId } = await setup();
    const value = {
      undefined,
      bigint: 42n,
      date: new Date('2026-01-01T00:00:00.000Z'),
      bytes: new Uint8Array([1, 2]),
      map: new Map([['set', new Set(['item'])]]),
    };
    expect(
      await effect('key', { ...options, input: value }, async function* () {
        yield value;
      }),
    ).toEqual({ type: 'result', value });
    const records = (await createLog({ world, runId }).read()).events;
    expect(records[0]).toEqual({
      ...startEvent(),
      id: expect.any(String),
      data: { ...startEvent().data, input: value },
    });
    expect(records[1]).toEqual({
      type: 'effect-progress',
      id: expect.any(String),
      data: { startId: records[0].id, partial: value },
    });
    const replay = await effect('key', options, async () => null);
    expect(replay).toEqual({ type: 'result', value });
    expect((await log.read()).events).toEqual(records);
  });

  test.each(['safe', 'never'] as const)(
    'does not consume an attempt when already aborted: %s',
    async replay => {
      const { effect, log, abortController } = await setup();
      abortController.abort();
      const fn = vi.fn(async () => 'value');
      expect(await effect('key', { ...options, replay }, fn)).toEqual({
        type: 'interrupted',
        retryable: replay === 'safe',
      });
      expect(fn).not.toHaveBeenCalled();
      expect((await log.read()).events).toEqual([]);
      expect(
        await createEffectFunction({
          log,
          abortSignal: createAbortController().signal,
        })('key', { ...options, replay }, fn),
      ).toEqual({ type: 'result', value: 'value' });
    },
  );

  test('records interruption without invoking work if cancelled during the start append', async () => {
    const { log, effect, abortController } = await setup();
    const append = log.append.bind(log);
    vi.spyOn(log, 'append').mockImplementation(async event => {
      const result = await append(event);
      if (event.type === 'effect-start') abortController.abort();
      return result;
    });
    const fn = vi.fn(async () => 'unexpected');
    expect(await effect('key', options, fn)).toEqual({
      type: 'interrupted',
      retryable: true,
    });
    expect(fn).not.toHaveBeenCalled();
    expect((await log.read()).events.map(event => event.type)).toEqual([
      'effect-start',
      'effect-end',
    ]);
  });

  test('waits for callback work to settle after cancellation', async () => {
    const { effect, log, abortController } = await setup();
    const entered = new DelayedPromise<void>();
    const pending = new DelayedPromise<string>();
    const running = effect('key', options, () => {
      entered.resolve();
      return pending.promise;
    });
    let settled = false;
    void running.then(() => {
      settled = true;
    });
    await entered.promise;
    abortController.abort();
    expect((await log.read({ types: ['effect-end'] })).events).toEqual([]);
    expect(settled).toBe(false);
    pending.resolve('too late');
    expect(await running).toEqual({ type: 'interrupted', retryable: true });
  });

  test.each(['safe', 'never'] as const)(
    'interrupts with the last committed partial and cleans up iteration: %s',
    async replay => {
      const { effect, log, abortController } = await setup();
      const cleanup = vi.fn();
      const output = await effect(
        'key',
        { ...options, replay },
        async function* () {
          try {
            yield 'committed';
            abortController.abort();
            yield 'too late';
          } finally {
            cleanup();
          }
        },
      );
      expect(output).toEqual({
        type: 'interrupted',
        retryable: replay === 'safe',
        partial: 'committed',
      });
      expect(cleanup).toHaveBeenCalledTimes(1);
      expect(
        (await log.read({ types: ['effect-progress'] })).events,
      ).toHaveLength(1);
      const retry = vi.fn(async () => 'retry');
      expect(
        await createEffectFunction({
          log,
          abortSignal: createAbortController().signal,
        })('key', { ...options, replay }, retry),
      ).toEqual(
        replay === 'safe' ? { type: 'result', value: 'retry' } : output,
      );
      expect(retry).toHaveBeenCalledTimes(replay === 'safe' ? 1 : 0);
    },
  );

  test.each([true, false])(
    'distinguishes yielded undefined from absent progress: %s',
    async hasProgress => {
      const { effect, abortController } = await setup();
      expect(
        await effect('key', options, async function* () {
          if (hasProgress) yield undefined;
          abortController.abort();
        }),
      ).toStrictEqual({
        type: 'interrupted',
        retryable: true,
        ...(hasProgress ? { partial: undefined } : {}),
      });
    },
  );

  test('does not classify an AbortError as interruption without an aborted signal', async () => {
    const { effect } = await setup();
    expect(
      await effect('key', options, async () => {
        throw new DOMException('failed', 'AbortError');
      }),
    ).toEqual({ type: 'error', error: 'AbortError: failed' });
  });

  test.each(['safe', 'never'] as const)(
    'records interruption before propagating a drive-rebuild error: %s',
    async replay => {
      const { effect, log } = await setup();
      const error = new HarnessInvalidDriveStateError({ message: 'rebuild' });
      await expect(
        effect('key', { ...options, replay }, async function* () {
          yield 'partial';
          throw error;
        }),
      ).rejects.toBe(error);
      expect((await log.read({ types: ['effect-end'] })).events).toEqual([
        {
          type: 'effect-end',
          id: expect.any(String),
          data: {
            startId: expect.any(String),
            output: {
              type: 'interrupted',
              retryable: replay === 'safe',
              partial: 'partial',
            },
          },
        },
      ]);
      const retry = vi.fn(async () => 'retry');
      const replayed = await createEffectFunction({
        log,
        abortSignal: createAbortController().signal,
      })('key', { ...options, replay }, retry);
      expect(replayed).toEqual(
        replay === 'safe'
          ? { type: 'result', value: 'retry' }
          : { type: 'interrupted', retryable: false, partial: 'partial' },
      );
      expect(retry).toHaveBeenCalledTimes(replay === 'safe' ? 1 : 0);
    },
  );

  test.each(['safe', 'never'] as const)(
    'requires engine recovery for an unfinished attempt: %s',
    async replay => {
      const { effect, log } = await setup();
      const start = startEvent({ replay });
      await log.append(start);
      const fn = vi.fn(async () => 'unexpected');
      await expect(
        effect('key', { ...options, replay }, fn),
      ).rejects.toBeInstanceOf(HarnessInvalidDriveStateError);
      expect(fn).not.toHaveBeenCalled();
      expect((await log.read()).events).toEqual([start]);
    },
  );

  test('increments retry attempts and retains previously delivered submission IDs', async () => {
    const { effect, log } = await setup();
    await log.append(startEvent({ deliveredSubmissionIds: ['submission'] }));
    await log.append({
      type: 'effect-end',
      id: 'interruption',
      data: {
        startId: 'start',
        output: { type: 'interrupted', retryable: true },
      },
    });
    expect(await effect('key', options, async () => 'retried')).toEqual({
      type: 'result',
      value: 'retried',
    });
    const starts = (await log.read({ types: ['effect-start'] })).events;
    expect(starts[1]).toEqual({
      type: 'effect-start',
      id: expect.any(String),
      data: {
        ...options,
        key: 'key',
        attempt: 2,
        deliveredSubmissionIds: ['submission'],
      },
    });
  });

  test('refuses overlapping calls for a key while allowing other keys to progress', async () => {
    const { effect } = await setup();
    const entered = new DelayedPromise<void>();
    const pending = new DelayedPromise<string>();
    const first = effect('key', options, () => {
      entered.resolve();
      return pending.promise;
    });
    await entered.promise;
    const duplicate = vi.fn(async () => 'unexpected');
    await expect(effect('key', options, duplicate)).rejects.toBeInstanceOf(
      HarnessInvalidDriveStateError,
    );
    expect(await effect('other', options, async () => 'other')).toEqual({
      type: 'result',
      value: 'other',
    });
    pending.resolve('first');
    expect(await first).toEqual({ type: 'result', value: 'first' });
    expect(duplicate).not.toHaveBeenCalled();
  });

  test('only executes the first committed start across competing factories', async () => {
    const { world, runId, log } = await setup();
    const secondLog = createLog({ world, runId });
    const startsReady = new DelayedPromise<void>();
    const entered = new DelayedPromise<void>();
    const contended = new DelayedPromise<void>();
    const pending = new DelayedPromise<string>();
    let arrivals = 0;
    for (const current of [log, secondLog]) {
      const append = current.append.bind(current);
      vi.spyOn(current, 'append').mockImplementation(async event => {
        if (event.type === 'effect-start') {
          if (++arrivals === 2) startsReady.resolve();
          await startsReady.promise;
        }
        return append(event);
      });
    }
    const fn = vi.fn(() => {
      entered.resolve();
      return pending.promise;
    });
    const calls = [log, secondLog].map(current =>
      createEffectFunction({
        log: current,
        abortSignal: createAbortController().signal,
      })('key', options, fn).catch(error => {
        contended.resolve();
        throw error;
      }),
    );
    const results = Promise.allSettled(calls);
    await entered.promise;
    await contended.promise;
    pending.resolve('winner');
    const settled = await results;
    expect(fn).toHaveBeenCalledTimes(1);
    expect(settled.filter(result => result.status === 'fulfilled')).toEqual([
      { status: 'fulfilled', value: { type: 'result', value: 'winner' } },
    ]);
    expect(settled.filter(result => result.status === 'rejected')).toEqual([
      { status: 'rejected', reason: expect.any(HarnessInvalidDriveStateError) },
    ]);
    expect((await log.read({ types: ['effect-start'] })).events).toHaveLength(
      2,
    );
  });

  test.each<HarnessV2EffectOutput>([
    { type: 'result', value: 'other result' },
    { type: 'interrupted', retryable: true, partial: 'other partial' },
    { type: 'interrupted', retryable: false },
  ])(
    'keeps an end that commits ahead of the local end: $type',
    async output => {
      const { effect, log } = await setup();
      const append = log.append.bind(log);
      vi.spyOn(log, 'append').mockImplementation(async event => {
        if (event.type === 'effect-end') {
          await append({
            ...event,
            id: 'competing-end',
            data: { ...event.data, output },
          });
        }
        return append(event);
      });
      expect(await effect('key', options, async () => 'local')).toEqual(output);
      expect((await log.read({ types: ['effect-end'] })).events).toHaveLength(
        2,
      );
    },
  );

  test('ignores losing starts, invalid retry numbers, and late events from earlier attempts', async () => {
    const { effect, log } = await setup();
    const events: HarnessAgentLogEvent[] = [
      startEvent(),
      startEvent({ id: 'losing-start' }),
      {
        type: 'effect-end',
        id: 'losing-end',
        data: {
          startId: 'losing-start',
          output: { type: 'result', value: 'loser' },
        },
      },
      {
        type: 'effect-end',
        id: 'interruption',
        data: {
          startId: 'start',
          output: { type: 'interrupted', retryable: true },
        },
      },
      startEvent({ id: 'invalid-retry', attempt: 3 }),
      startEvent({ id: 'retry', attempt: 2 }),
      {
        type: 'effect-progress',
        id: 'late-progress',
        data: { startId: 'start', partial: 'late' },
      },
      {
        type: 'effect-end',
        id: 'late-end',
        data: { startId: 'start', output: { type: 'result', value: 'late' } },
      },
      {
        type: 'effect-end',
        id: 'retry-end',
        data: { startId: 'retry', output: { type: 'result', value: 'winner' } },
      },
    ];
    for (const event of events) await log.append(event);
    const fn = vi.fn(async () => 'unexpected');
    expect(await effect('key', options, fn)).toEqual({
      type: 'result',
      value: 'winner',
    });
    expect(fn).not.toHaveBeenCalled();
    expect((await log.read()).events).toEqual(events);
  });

  test('replays an outcome recorded while the start append was being acknowledged', async () => {
    const { log, effect } = await setup();
    const append = log.append.bind(log);
    vi.spyOn(log, 'append').mockImplementation(async event => {
      const result = await append(event);
      if (event.type === 'effect-start') {
        await append({
          type: 'effect-end',
          id: 'early-end',
          data: {
            startId: event.id,
            output: { type: 'result', value: 'recorded' },
          },
        });
      }
      return result;
    });
    const fn = vi.fn(async () => 'unexpected');
    expect(await effect('key', options, fn)).toEqual({
      type: 'result',
      value: 'recorded',
    });
    expect(fn).not.toHaveBeenCalled();
    expect((await log.read()).events).toHaveLength(2);
  });

  test('keeps a committed result ahead of a late recovery interruption', async () => {
    const { log, effect } = await setup();
    expect(
      await effect('key', { ...options, replay: 'never' }, async () => 'first'),
    ).toEqual({
      type: 'result',
      value: 'first',
    });
    const start = (await log.read({ types: ['effect-start'] })).events[0];
    await log.append({
      type: 'effect-end',
      id: 'late-interruption',
      data: {
        startId: start.id,
        output: { type: 'interrupted', retryable: false },
      },
    });
    const fn = vi.fn(async () => 'unexpected');
    expect(await effect('key', options, fn)).toEqual({
      type: 'result',
      value: 'first',
    });
    expect(fn).not.toHaveBeenCalled();
  });

  test.each(['effect-start', 'effect-progress', 'effect-end'] as const)(
    'propagates append failure without recording it as callback failure: %s',
    async failedType => {
      const { effect, log } = await setup();
      const failure = new Error('storage failed');
      const append = log.append.bind(log);
      vi.spyOn(log, 'append').mockImplementation(event =>
        event.type === failedType ? Promise.reject(failure) : append(event),
      );
      const entered = vi.fn();
      const resumed = vi.fn();
      const cleanup = vi.fn();
      await expect(
        effect('key', options, async function* () {
          entered();
          try {
            yield 'partial';
            resumed();
          } finally {
            cleanup();
          }
        }),
      ).rejects.toBe(failure);
      expect(entered).toHaveBeenCalledTimes(
        failedType === 'effect-start' ? 0 : 1,
      );
      expect(resumed).toHaveBeenCalledTimes(
        failedType === 'effect-end' ? 1 : 0,
      );
      expect(cleanup).toHaveBeenCalledTimes(
        failedType === 'effect-start' ? 0 : 1,
      );
      expect((await log.read({ types: ['effect-end'] })).events).toEqual([]);
      if (failedType !== 'effect-start') {
        const fn = vi.fn(async () => 'unexpected');
        await expect(effect('key', options, fn)).rejects.toBeInstanceOf(
          HarnessInvalidDriveStateError,
        );
        expect(fn).not.toHaveBeenCalled();
      }
    },
  );

  test('propagates read failures before invoking the callback', async () => {
    const { effect, log } = await setup();
    const failure = new Error('read failed');
    vi.spyOn(log, 'read').mockRejectedValueOnce(failure);
    const fn = vi.fn(async () => 'unexpected');
    await expect(effect('key', options, fn)).rejects.toBe(failure);
    expect(fn).not.toHaveBeenCalled();
    expect((await log.read()).events).toEqual([]);
  });

  test('replays a committed result after append reports failure without rerunning work', async () => {
    const { log, effect, world, runId } = await setup();
    const failure = new Error('acknowledgement failed');
    const append = log.append.bind(log);
    const read = vi.spyOn(log, 'read');
    vi.spyOn(log, 'append').mockImplementation(async event => {
      const result = await append(event);
      if (event.type === 'effect-end') throw failure;
      return result;
    });
    const fn = vi.fn(async () => 'committed');
    await expect(effect('key', options, fn)).rejects.toBe(failure);
    expect(await effect('key', options, fn)).toEqual({
      type: 'result',
      value: 'committed',
    });
    expect(read).toHaveBeenCalledTimes(1);
    expect(
      await createEffectFunction({
        log: createLog({ world, runId }),
        abortSignal: createAbortController().signal,
      })('key', options, fn),
    ).toEqual({ type: 'result', value: 'committed' });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('records a callback error even if the thrown value cannot be stringified', async () => {
    const { effect } = await setup();
    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(
      await effect('key', options, async () => {
        throw circular;
      }),
    ).toEqual({
      type: 'error',
      error: 'Unknown effect error',
    });
  });

  test.each(['input', 'progress', 'result'] as const)(
    'rejects nonserializable %s without manufacturing an error output',
    async location => {
      const { effect, log } = await setup();
      const invalid = (() => {}) as unknown as SerializableValue;
      const fn = vi.fn(async () => invalid);
      const running =
        location === 'progress'
          ? effect('key', options, async function* () {
              yield invalid;
            })
          : effect(
              'key',
              { ...options, input: location === 'input' ? invalid : null },
              fn,
            );
      await expect(running).rejects.toBeInstanceOf(TypeError);
      expect(fn).toHaveBeenCalledTimes(location === 'result' ? 1 : 0);
      expect((await log.read({ types: ['effect-end'] })).events).toEqual([]);
    },
  );

  test('propagates interruption-write failure instead of the callback rebuild error', async () => {
    const { effect, log } = await setup();
    const failure = new Error('write failed');
    const append = log.append.bind(log);
    vi.spyOn(log, 'append').mockImplementation(event =>
      event.type === 'effect-end' ? Promise.reject(failure) : append(event),
    );
    await expect(
      effect('key', options, async () => {
        throw new HarnessInvalidDriveStateError({ message: 'rebuild' });
      }),
    ).rejects.toBe(failure);
  });

  test('does not replace an interruption with an iterator cleanup failure', async () => {
    const { effect, abortController } = await setup();
    expect(
      await effect('key', options, async function* () {
        try {
          yield 'partial';
          abortController.abort();
          yield 'late';
        } finally {
          throw new Error('cleanup failed');
        }
      }),
    ).toEqual({ type: 'interrupted', retryable: true, partial: 'partial' });
  });

  test('does not overwrite a committed result when cancellation arrives afterward', async () => {
    const { log, effect, abortController } = await setup();
    const append = log.append.bind(log);
    vi.spyOn(log, 'append').mockImplementation(async event => {
      const result = await append(event);
      if (event.type === 'effect-end') abortController.abort();
      return result;
    });
    expect(await effect('key', options, async () => 'committed')).toEqual({
      type: 'result',
      value: 'committed',
    });
  });

  test('observes cancellation when callback work completes before submitting the end', async () => {
    const { effect, abortController } = await setup();
    expect(
      await effect('key', options, async () => {
        abortController.abort();
        return 'uncommitted';
      }),
    ).toEqual({ type: 'interrupted', retryable: true });
  });

  test('reconciles overlapping history and events arriving after its snapshot', async () => {
    const { effect, log } = await setup();
    await log.append(startEvent());
    await log.append({
      type: 'effect-progress',
      id: 'progress',
      data: { startId: 'start', partial: 'before snapshot' },
    });
    const snapshotReady = new DelayedPromise<void>();
    const release = new DelayedPromise<void>();
    const read = log.read.bind(log);
    const reads = vi.spyOn(log, 'read').mockImplementationOnce(async opts => {
      const result = await read(opts);
      snapshotReady.resolve();
      await release.promise;
      return result;
    });
    const fn = vi.fn(async () => 'unexpected');
    const running = effect('key', options, fn);
    await snapshotReady.promise;
    await log.append({
      type: 'effect-progress',
      id: 'new-progress',
      data: { startId: 'start', partial: 'after snapshot' },
    });
    await log.append({
      type: 'effect-end',
      id: 'end',
      data: {
        startId: 'start',
        output: { type: 'interrupted', retryable: true },
      },
    });
    await log.append(startEvent({ id: 'retry', attempt: 2 }));
    await log.append({
      type: 'effect-end',
      id: 'retry-end',
      data: { startId: 'retry', output: { type: 'result', value: 'recorded' } },
    });
    release.resolve();
    await expect(running).resolves.toEqual({
      type: 'result',
      value: 'recorded',
    });
    expect(await effect('key', options, fn)).toEqual({
      type: 'result',
      value: 'recorded',
    });
    expect(reads).toHaveBeenCalledTimes(1);
    expect(fn).not.toHaveBeenCalled();
  });

  test('retries failed initialization without losing buffered notifications', async () => {
    const { effect, log } = await setup();
    const failure = new Error('initial read failed');
    const read = log.read.bind(log);
    const reads = vi.spyOn(log, 'read').mockImplementationOnce(async opts => {
      await read(opts);
      await log.append(startEvent());
      await log.append({
        type: 'effect-end',
        id: 'end',
        data: {
          startId: 'start',
          output: { type: 'result', value: 'recorded' },
        },
      });
      throw failure;
    });
    const fn = vi.fn(async () => 'unexpected');
    await expect(effect('key', options, fn)).rejects.toBe(failure);
    expect(await effect('key', options, fn)).toEqual({
      type: 'result',
      value: 'recorded',
    });
    expect(await effect('key', options, fn)).toEqual({
      type: 'result',
      value: 'recorded',
    });
    expect(reads).toHaveBeenCalledTimes(2);
    expect(fn).not.toHaveBeenCalled();
  });

  test.each(['idle', 'already-aborted'] as const)(
    'unsubscribes exactly once when %s',
    async state => {
      const { log } = await setup();
      await log.append(startEvent());
      await log.append({
        type: 'effect-end',
        id: 'end',
        data: {
          startId: 'start',
          output: { type: 'result', value: 'recorded' },
        },
      });
      const onAppend = log.onAppend.bind(log);
      const registrations = vi
        .spyOn(log, 'onAppend')
        .mockImplementation(opts => vi.fn(onAppend(opts)));
      const abortController = createAbortController();
      if (state === 'already-aborted') abortController.abort();
      const replay = createEffectFunction({
        log,
        abortSignal: abortController.signal,
      });
      const unsubscribe = registrations.mock.results[0].value;
      if (state === 'idle') {
        expect(unsubscribe).not.toHaveBeenCalled();
        abortController.abort();
      }
      expect(unsubscribe).toHaveBeenCalledTimes(1);
      const fn = vi.fn(async () => 'unexpected');
      expect(await replay('key', options, fn)).toEqual({
        type: 'result',
        value: 'recorded',
      });
      expect(await replay('missing', options, fn)).toEqual({
        type: 'interrupted',
        retryable: true,
      });
      abortController.abort();
      expect(unsubscribe).toHaveBeenCalledTimes(1);
      expect(fn).not.toHaveBeenCalled();
    },
  );

  test('retains its subscription through initialization and all in-flight interruption writes', async () => {
    const { log } = await setup();
    const onAppend = log.onAppend.bind(log);
    const registrations = vi
      .spyOn(log, 'onAppend')
      .mockImplementation(opts => vi.fn(onAppend(opts)));
    const abortController = createAbortController();
    const effect = createEffectFunction({
      log,
      abortSignal: abortController.signal,
    });
    const unsubscribe = registrations.mock.results[0].value;
    const firstEntered = new DelayedPromise<void>();
    const secondEntered = new DelayedPromise<void>();
    const releaseFirst = new DelayedPromise<void>();
    const releaseSecond = new DelayedPromise<void>();
    const first = effect('first', options, async function* () {
      yield 'first partial';
      firstEntered.resolve();
      await releaseFirst.promise;
    });
    const second = effect('second', options, async function* () {
      yield 'second partial';
      secondEntered.resolve();
      await releaseSecond.promise;
    });
    await Promise.all([firstEntered.promise, secondEntered.promise]);
    abortController.abort();
    expect(unsubscribe).not.toHaveBeenCalled();
    releaseFirst.resolve();
    expect(await first).toEqual({
      type: 'interrupted',
      retryable: true,
      partial: 'first partial',
    });
    expect(unsubscribe).not.toHaveBeenCalled();
    releaseSecond.resolve();
    expect(await second).toEqual({
      type: 'interrupted',
      retryable: true,
      partial: 'second partial',
    });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect((await log.read({ types: ['effect-end'] })).events).toHaveLength(2);
  });

  test('does not unsubscribe while an aborted invocation is initializing', async () => {
    const { log } = await setup();
    const onAppend = log.onAppend.bind(log);
    const registrations = vi
      .spyOn(log, 'onAppend')
      .mockImplementation(opts => vi.fn(onAppend(opts)));
    const abortController = createAbortController();
    const effect = createEffectFunction({
      log,
      abortSignal: abortController.signal,
    });
    const unsubscribe = registrations.mock.results[0].value;
    const ready = new DelayedPromise<void>();
    const release = new DelayedPromise<void>();
    const read = log.read.bind(log);
    vi.spyOn(log, 'read').mockImplementationOnce(async opts => {
      const result = await read(opts);
      ready.resolve();
      await release.promise;
      return result;
    });
    const fn = vi.fn(async () => 'unexpected');
    const running = effect('key', options, fn);
    await ready.promise;
    abortController.abort();
    expect(unsubscribe).not.toHaveBeenCalled();
    await log.append(startEvent());
    await log.append({
      type: 'effect-end',
      id: 'end',
      data: { startId: 'start', output: { type: 'result', value: 'recorded' } },
    });
    release.resolve();
    expect(await running).toEqual({ type: 'result', value: 'recorded' });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(fn).not.toHaveBeenCalled();
  });

  test.each(['history', 'buffer'] as const)(
    'does not retry a fold failure from initial %s',
    async source => {
      const failure =
        source === 'history' ? new Error('fold failed') : undefined;
      const event = {
        type: 'effect-start',
        id: 'invalid',
        get data(): never {
          throw failure;
        },
      } as const;
      const log: HarnessAgentLog = {
        read: vi.fn(async () => ({
          events: source === 'history' ? [event] : [],
          position: 1,
        })),
        append: vi.fn(async () => true),
        onAppend({ listener }) {
          if (source === 'buffer') listener(event);
          return () => {};
        },
      };
      const effect = createEffectFunction({
        log,
        abortSignal: createAbortController().signal,
      });
      const fn = vi.fn(async () => 'unexpected');
      await expect(effect('key', options, fn)).rejects.toBe(failure);
      await expect(effect('key', options, fn)).rejects.toBe(failure);
      expect(log.read).toHaveBeenCalledTimes(1);
      expect(log.append).not.toHaveBeenCalled();
      expect(fn).not.toHaveBeenCalled();
    },
  );

  test.each(['effect-start', 'effect-progress', 'callback'] as const)(
    'propagates isolated fold failures during %s without recording callback errors',
    async failureAt => {
      const failure = new Error('fold failed');
      let notify: (event: HarnessAgentLogEvent) => void = () => {};
      const fail = () =>
        notify({
          type: 'effect-start',
          id: 'invalid',
          get data(): never {
            throw failure;
          },
        });
      const log: HarnessAgentLog = {
        read: vi.fn(async () => ({ events: [], position: 0 })),
        append: vi.fn(async event => {
          notify(event);
          if (event.type === failureAt) fail();
          return true;
        }),
        onAppend({ listener }) {
          notify = listener;
          return () => {};
        },
      };
      const effect = createEffectFunction({
        log,
        abortSignal: createAbortController().signal,
      });
      const entered = vi.fn();
      const resumed = vi.fn();
      const cleanup = vi.fn();
      await expect(
        effect('key', options, async function* () {
          entered();
          try {
            if (failureAt === 'callback') fail();
            yield 'partial';
            resumed();
          } finally {
            cleanup();
          }
        }),
      ).rejects.toBe(failure);
      expect(entered).toHaveBeenCalledTimes(
        failureAt === 'effect-start' ? 0 : 1,
      );
      expect(resumed).not.toHaveBeenCalled();
      expect(cleanup).toHaveBeenCalledTimes(
        failureAt === 'effect-start' ? 0 : 1,
      );
      expect(
        vi.mocked(log.append).mock.calls.map(([event]) => event.type),
      ).toEqual(
        failureAt === 'effect-progress'
          ? ['effect-start', 'effect-progress']
          : ['effect-start'],
      );
      await expect(
        effect('other', options, async () => 'unexpected'),
      ).rejects.toBe(failure);
      expect(log.read).toHaveBeenCalledTimes(1);
    },
  );

  test.each([1, 2])(
    'reconciles a lost write acknowledgement at write %s without rerunning the callback',
    async failedWrite => {
      const { effect, world } = await setup();
      const create = world.events.create.bind(world.events);
      let writes = 0;
      vi.spyOn(world.events, 'create').mockImplementation(async (...args) => {
        const result = await create(...args);
        if (++writes === failedWrite) throw new Error('lost acknowledgement');
        return result;
      });
      const fn = vi.fn(async () => 'value');
      expect(await effect('key', options, fn)).toEqual({
        type: 'result',
        value: 'value',
      });
      expect(fn).toHaveBeenCalledTimes(1);
    },
  );
});
