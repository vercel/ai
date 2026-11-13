import type { SerializableValue } from '@ai-sdk/provider';
import { DelayedPromise } from '@ai-sdk/provider-utils';
import { describe, expect, test, vi } from 'vitest';
import { DefaultHarnessAgentSession } from '../harness-agent-session';
import { InMemoryWorld } from '../in-memory-world';
import {
  createStreamWriter,
  decodeStreamRecords,
  type HarnessAgentStreamPart,
} from './create-stream-writer';

const runId = 'stream-session';
const session = new DefaultHarnessAgentSession({
  sessionId: 'session-1',
  sandboxId: 'sandbox-1',
  runId,
});
const streamName = session.getStreamName();

function part(delta: string): HarnessAgentStreamPart {
  return { type: 'text-delta', id: 'text', delta };
}

function setup() {
  const world = new InMemoryWorld();
  const abortController = new AbortController();
  const writer = createStreamWriter({
    world,
    session,
    abortSignal: abortController.signal,
  });
  return { world, abortController, writer };
}

async function readChunks(world: InMemoryWorld): Promise<string[]> {
  const { data } = await world.streams.getChunks(runId, streamName, {
    limit: 1000,
  });
  return data.map(chunk => new TextDecoder().decode(chunk.data));
}

async function readRecords(world: InMemoryWorld) {
  return decodeStreamRecords({ text: (await readChunks(world)).join('') });
}

/**
 * Replaces World writes with ones that wait for an explicit release, counting
 * how many are pending at once.
 */
function holdWrites(world: InMemoryWorld) {
  const write = world.streams.write.bind(world.streams);
  const releases: DelayedPromise<void>[] = [];
  let pending = 0;
  let maxPending = 0;
  const spy = vi
    .spyOn(world.streams, 'write')
    .mockImplementation(async (...args) => {
      const release = new DelayedPromise<void>();
      releases.push(release);
      pending++;
      maxPending = Math.max(maxPending, pending);
      try {
        await release.promise;
        return await write(...args);
      } finally {
        pending--;
      }
    });
  return {
    spy,
    release: (index: number) => releases[index].resolve(),
    maxPending: () => maxPending,
  };
}

describe('createStreamWriter', () => {
  test('writes records in emit order with their tags', async () => {
    const { world, writer } = setup();
    writer.emit({ part: part('a'), startId: 'start-1' });
    writer.unsafeEmit(part('b'));
    writer.emit({ part: part('c'), key: 'step:1' });
    writer.emit({ part: part('d'), startId: 'start-2', key: 'step:2' });
    await writer.flush();
    expect(await readRecords(world)).toEqual([
      { part: part('a'), startId: 'start-1' },
      { part: part('b') },
      { part: part('c'), key: 'step:1' },
      { part: part('d'), startId: 'start-2', key: 'step:2' },
    ]);
  });

  test('batches a synchronous burst into one chunk ending with a blank line', async () => {
    const { world, writer } = setup();
    writer.unsafeEmit(part('a'));
    writer.unsafeEmit(part('b'));
    writer.unsafeEmit(part('c'));
    await writer.flush();
    const chunks = await readChunks(world);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].endsWith('}\n\n')).toBe(true);
    expect(await readRecords(world)).toHaveLength(3);
  });

  test('keeps exactly one write in flight and batches records behind it', async () => {
    const { world, writer } = setup();
    const writes = holdWrites(world);
    writer.unsafeEmit(part('a'));
    await vi.waitFor(() => expect(writes.spy).toHaveBeenCalledTimes(1));
    writer.unsafeEmit(part('b'));
    writer.unsafeEmit(part('c'));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(writes.spy).toHaveBeenCalledTimes(1);
    writes.release(0);
    await vi.waitFor(() => expect(writes.spy).toHaveBeenCalledTimes(2));
    writes.release(1);
    await writer.flush();
    expect(writes.maxPending()).toBe(1);
    expect(await readChunks(world)).toHaveLength(2);
    expect(await readRecords(world)).toEqual([
      { part: part('a') },
      { part: part('b') },
      { part: part('c') },
    ]);
  });

  test('ignores a failed write and keeps writing later records', async () => {
    const { world, writer } = setup();
    const write = world.streams.write.bind(world.streams);
    vi.spyOn(world.streams, 'write')
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockImplementation(write);
    writer.unsafeEmit(part('lost'));
    await writer.flush();
    writer.unsafeEmit(part('kept'));
    await writer.flush();
    expect(await readRecords(world)).toEqual([{ part: part('kept') }]);
  });

  test('discards unsent records and drops new ones after abort', async () => {
    const { world, writer, abortController } = setup();
    const writes = holdWrites(world);
    writer.unsafeEmit(part('in flight'));
    await vi.waitFor(() => expect(writes.spy).toHaveBeenCalledTimes(1));
    writer.unsafeEmit(part('buffered'));
    abortController.abort();
    writer.unsafeEmit(part('after abort'));
    writes.release(0);
    await writer.flush();
    expect(writes.spy).toHaveBeenCalledTimes(1);
    expect(await readRecords(world)).toEqual([{ part: part('in flight') }]);
  });

  test('flush waits for the write in flight', async () => {
    const { world, writer } = setup();
    const writes = holdWrites(world);
    writer.unsafeEmit(part('a'));
    let flushed = false;
    const flushing = writer.flush().then(() => {
      flushed = true;
    });
    await vi.waitFor(() => expect(writes.spy).toHaveBeenCalledTimes(1));
    expect(flushed).toBe(false);
    writes.release(0);
    await flushing;
    expect(flushed).toBe(true);
  });

  test('close flushes, closes the stream, and drops later records', async () => {
    const { world, writer } = setup();
    writer.unsafeEmit(part('a'));
    const closing = writer.close();
    writer.unsafeEmit(part('after close'));
    await closing;
    await writer.close();
    expect((await world.streams.getInfo(runId, streamName)).done).toBe(true);
    expect(await readRecords(world)).toEqual([{ part: part('a') }]);
  });

  test('writes retract parts', async () => {
    const { world, writer } = setup();
    writer.retract({ startIds: ['start-1', 'start-2'] });
    await writer.flush();
    expect(await readRecords(world)).toEqual([
      { part: { type: 'retract', startIds: ['start-1', 'start-2'] } },
    ]);
  });

  test('throws synchronously for a non-serializable part', async () => {
    const { world, writer } = setup();
    const writeSpy = vi.spyOn(world.streams, 'write');
    expect(() =>
      writer.unsafeEmit({
        type: 'raw',
        // oxlint-disable-next-line ai-sdk/no-as-unknown-as -- intentionally invalid value for a runtime validation test.
        rawValue: (() => {}) as unknown as SerializableValue,
      }),
    ).toThrow(TypeError);
    await writer.flush();
    expect(writeSpy).not.toHaveBeenCalled();
  });
});

describe('decodeStreamRecords', () => {
  test('decodes records across chunk boundaries', async () => {
    expect(
      await decodeStreamRecords({
        text:
          '{"version":1,"part":{"type":"retract","startIds":["a"]}}\n\n' +
          '{"version":1,"part":{"type":"reset-step"},"startId":"s"}\n\n',
      }),
    ).toEqual([
      { part: { type: 'retract', startIds: ['a'] } },
      { part: { type: 'reset-step' }, startId: 's' },
    ]);
  });

  test.each([
    ['malformed JSON', 'not json\n'],
    ['an unknown version', '{"version":2,"part":{"type":"reset-step"}}\n'],
    ['a missing part', '{"version":1,"startId":"s"}\n'],
    ['an invalid tag', '{"version":1,"part":{"type":"reset-step"},"key":1}\n'],
    ['a part without a type', '{"version":1,"part":{}}\n'],
  ])('rejects %s', async (_, text) => {
    await expect(decodeStreamRecords({ text })).rejects.toThrow();
  });
});
