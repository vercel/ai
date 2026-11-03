import { DelayedPromise } from '@ai-sdk/provider-utils';
import { describe, expect, it, vi } from 'vitest';
import { InvalidArgumentError } from '../error/invalid-argument-error';
import {
  mapWithConcurrency,
  prepareToolCallConcurrency,
} from './tool-call-concurrency';

describe('prepareToolCallConcurrency', () => {
  it.each([0, -1, 1.5, Number.NaN])(
    'should reject invalid concurrency %s',
    value => {
      expect(() => prepareToolCallConcurrency(value)).toThrow(
        InvalidArgumentError,
      );
    },
  );

  it.each([undefined, 1, 2])('should accept concurrency %s', concurrency => {
    expect(prepareToolCallConcurrency(concurrency)).toBe(concurrency);
  });
});

describe('mapWithConcurrency', () => {
  it('should execute all items concurrently by default', async () => {
    const releases = [
      new DelayedPromise<void>(),
      new DelayedPromise<void>(),
      new DelayedPromise<void>(),
    ];
    const started: number[] = [];

    const resultPromise = mapWithConcurrency({
      items: [0, 1, 2],
      concurrency: undefined,
      execute: async item => {
        started.push(item);
        await releases[item].promise;
        return item;
      },
    });

    await vi.waitFor(() => expect(started).toEqual([0, 1, 2]));
    releases.forEach(release => release.resolve());

    await expect(resultPromise).resolves.toEqual([0, 1, 2]);
  });

  it('should execute items sequentially in input order with concurrency 1', async () => {
    const releases = [
      new DelayedPromise<void>(),
      new DelayedPromise<void>(),
      new DelayedPromise<void>(),
    ];
    const events: string[] = [];

    const resultPromise = mapWithConcurrency({
      items: [0, 1, 2],
      concurrency: 1,
      execute: async item => {
        events.push(`${item}:start`);
        await releases[item].promise;
        events.push(`${item}:end`);
        return item;
      },
    });

    await vi.waitFor(() => expect(events).toEqual(['0:start']));
    releases[0].resolve();
    await vi.waitFor(() =>
      expect(events).toEqual(['0:start', '0:end', '1:start']),
    );
    releases[1].resolve();
    await vi.waitFor(() =>
      expect(events).toEqual([
        '0:start',
        '0:end',
        '1:start',
        '1:end',
        '2:start',
      ]),
    );
    releases[2].resolve();

    await expect(resultPromise).resolves.toEqual([0, 1, 2]);
  });

  it('should limit concurrent executions and preserve result order', async () => {
    const releases = [
      new DelayedPromise<void>(),
      new DelayedPromise<void>(),
      new DelayedPromise<void>(),
    ];
    const started: number[] = [];

    const resultPromise = mapWithConcurrency({
      items: [0, 1, 2],
      concurrency: 2,
      execute: async item => {
        started.push(item);
        await releases[item].promise;
        return item;
      },
    });

    await vi.waitFor(() => expect(started).toEqual([0, 1]));
    releases[1].resolve();
    await vi.waitFor(() => expect(started).toEqual([0, 1, 2]));
    releases[2].resolve();
    releases[0].resolve();

    await expect(resultPromise).resolves.toEqual([0, 1, 2]);
  });

  it('should not start queued items after abort', async () => {
    const abortController = new AbortController();
    const release = new DelayedPromise<void>();
    const started: number[] = [];

    const resultPromise = mapWithConcurrency({
      items: [0, 1, 2],
      concurrency: 1,
      abortSignal: abortController.signal,
      execute: async item => {
        started.push(item);
        await release.promise;
        return item;
      },
    });

    await vi.waitFor(() => expect(started).toEqual([0]));
    abortController.abort();
    release.resolve();

    await expect(resultPromise).rejects.toBe(abortController.signal.reason);
    expect(started).toEqual([0]);
  });
});
