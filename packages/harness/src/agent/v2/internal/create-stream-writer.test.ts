import type { SerializableValue } from '@ai-sdk/provider';
import {
  DelayedPromise,
  convertBase64ToUint8Array,
  convertUint8ArrayToBase64,
} from '@ai-sdk/provider-utils';
import { describe, expect, test, vi } from 'vitest';
import { DefaultHarnessAgentSession } from '../harness-agent-session';
import { InMemoryWorld } from '../in-memory-world';
import type { World } from '@workflow/world';
import {
  createStorageEncryption,
  type HarnessAgentStorageEncryption,
} from './create-storage-encryption';
import {
  createStreamWriter,
  decodeStreamRecords,
  type HarnessAgentStreamPart,
} from './create-stream-writer';

const encryption = {
  encrypt: async ({ data }: { data: Uint8Array }) => data,
  decrypt: async ({ data }: { data: Uint8Array }) => data,
};

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

function setup(options: { encryption?: HarnessAgentStorageEncryption } = {}) {
  const world = new InMemoryWorld();
  const abortController = new AbortController();
  const writer = createStreamWriter({
    encryption: options.encryption ?? encryption,
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
  return decodeStreamRecords({
    encryption,
    text: (await readChunks(world)).join(''),
  });
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
  test('encrypts complete batches and preserves tags and snapshots', async () => {
    const keyedWorld: World = new InMemoryWorld();
    keyedWorld.getEncryptionKeyForRun = async () => new Uint8Array(32).fill(7);
    const encryption = await createStorageEncryption({
      world: keyedWorld,
      runId,
      deploymentId: 'test',
    });
    const { world, writer } = setup({ encryption });
    const result = { secret: 'private tool result' };
    writer.unsafeEmit({
      type: 'tool-result',
      toolCallId: 'call',
      toolName: 'test',
      result,
    });
    writer.emit({
      part: part('private model output'),
      key: 'step',
      startId: 'attempt',
    });
    result.secret = 'mutated';
    await writer.flush();
    const chunks = await readChunks(world);
    expect(chunks).toHaveLength(1);
    const ciphertext = convertBase64ToUint8Array(chunks[0].trim());
    expect(new TextDecoder().decode(ciphertext)).not.toContain('private');
    expect(
      await decodeStreamRecords({ encryption, text: chunks.join('') }),
    ).toEqual([
      {
        part: {
          type: 'tool-result',
          toolCallId: 'call',
          toolName: 'test',
          result: { secret: 'private tool result' },
        },
      },
      { part: part('private model output'), key: 'step', startId: 'attempt' },
    ]);
  });

  test('latches asynchronous encryption failures and never sends plaintext', async () => {
    const failure = new Error('encryption unavailable');
    const { world, writer } = setup({
      encryption: {
        ...encryption,
        encrypt: async () => {
          throw failure;
        },
      },
    });
    const write = vi.spyOn(world.streams, 'write');
    writer.unsafeEmit(part('secret'));
    await expect(writer.flush()).rejects.toBe(failure);
    expect(() => writer.unsafeEmit(part('later'))).toThrow(failure);
    await expect(writer.flush()).rejects.toBe(failure);
    await expect(writer.close()).rejects.toBe(failure);
    expect(write).not.toHaveBeenCalled();
  });

  test('does not send a batch when aborted during encryption', async () => {
    const release = new DelayedPromise<void>();
    const encrypt = vi.fn(async ({ data }: { data: Uint8Array }) => {
      await release.promise;
      return data;
    });
    const { world, writer, abortController } = setup({
      encryption: { ...encryption, encrypt },
    });
    const write = vi.spyOn(world.streams, 'write');
    writer.unsafeEmit(part('secret'));
    await vi.waitFor(() => expect(encrypt).toHaveBeenCalledTimes(1));
    abortController.abort();
    release.resolve();
    await writer.flush();
    expect(write).not.toHaveBeenCalled();
  });

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

  test('decodes a part whose value has prototype-sensitive own keys', async () => {
    const { world, writer } = setup();
    /*
     * JSON returned by a host tool can contain these valid own keys, e.g. from
     * an external API. Writing them verbatim made the secure parser reject the
     * committed record on every later read.
     */
    const result = JSON.parse(
      '{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"value":"kept"}',
    );
    writer.unsafeEmit({
      type: 'tool-result',
      toolCallId: 'call-1',
      toolName: 'fetchJson',
      result,
    });
    await writer.flush();

    const records = await readRecords(world);
    expect(records).toHaveLength(1);
    const part = records[0].part as Extract<
      HarnessAgentStreamPart,
      { type: 'tool-result' }
    >;
    expect(Object.hasOwn(part.result as object, '__proto__')).toBe(true);
    expect(Object.hasOwn(part.result as object, 'constructor')).toBe(true);
    expect(
      Object.hasOwn(
        (part.result as { constructor: object }).constructor,
        'prototype',
      ),
    ).toBe(true);
    expect((part.result as { value: string }).value).toBe('kept');
  });

  test('stores a string that mentions a sensitive key without escaping it', async () => {
    const { world, writer } = setup();
    const delta = 'see "__proto__": and "constructor": in the payload';
    writer.unsafeEmit({ type: 'text-delta', id: 'text', delta });
    await writer.flush();

    const chunks = await readChunks(world);
    // The part stays an object: only an actual key triggers the escaped form.
    expect(
      new TextDecoder().decode(convertBase64ToUint8Array(chunks[0].trim())),
    ).toContain('"part":{"type":"text-delta"');
    expect(await readRecords(world)).toEqual([
      { part: { type: 'text-delta', id: 'text', delta } },
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
    expect(chunks[0].endsWith('\n\n')).toBe(true);
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
        encryption,
        text:
          convertUint8ArrayToBase64(
            new TextEncoder().encode(
              '{"version":1,"part":{"type":"retract","startIds":["a"]}}\n',
            ),
          ) +
          '\n\n' +
          convertUint8ArrayToBase64(
            new TextEncoder().encode(
              '{"version":1,"part":{"type":"reset-step"},"startId":"s"}\n',
            ),
          ) +
          '\n\n',
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
    [
      'an escaped part that is not JSON',
      '{"version":1,"part":"not a JSON record"}\n',
    ],
  ])('rejects %s', async (_, text) => {
    await expect(
      decodeStreamRecords({
        encryption,
        text: convertUint8ArrayToBase64(new TextEncoder().encode(text)),
      }),
    ).rejects.toThrow();
  });
});
