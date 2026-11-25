import { DelayedPromise } from '@ai-sdk/provider-utils';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { World } from '@workflow/world';
import {
  createStorageEncryption,
  type HarnessAgentStorageEncryption,
} from './create-storage-encryption';
import { DefaultHarnessAgentSession } from '../harness-agent-session';
import { InMemoryWorld } from '../in-memory-world';
import {
  createStreamWriter,
  type HarnessAgentStreamPart,
  type HarnessAgentStreamPartRecord,
} from './create-stream-writer';
import { readResponseRecordStream } from './read-response-record-stream';

const encryption = {
  encrypt: async ({ data }: { data: Uint8Array }) => data,
  decrypt: async ({ data }: { data: Uint8Array }) => data,
};

const abortControllers = new Set<AbortController>();

afterEach(() => {
  for (const controller of abortControllers) controller.abort();
  abortControllers.clear();
});

const runId = 'record-session';
const session = new DefaultHarnessAgentSession({
  sessionId: 'session-1',
  sandboxId: 'sandbox-1',
  runId,
});

const finishReason = { unified: 'stop' as const, raw: 'stop' };

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

const finishPart: HarnessAgentStreamPart = {
  type: 'finish-turn',
  finishReason,
  totalUsage: usage,
};

/**
 * Writes records to the session's stream, one chunk per call.
 */
async function writeRecords(options: {
  encryption?: HarnessAgentStorageEncryption;
  world: InMemoryWorld;
  records: HarnessAgentStreamPartRecord[];
}): Promise<void> {
  const abortController = new AbortController();
  abortControllers.add(abortController);
  const writer = createStreamWriter({
    encryption: options.encryption ?? encryption,
    world: options.world,
    session,
    abortSignal: abortController.signal,
  });
  for (const { part, startId, key } of options.records) {
    if (startId != null) writer.emit({ part, startId, key });
    else if (key != null) writer.emit({ part, key });
    else writer.unsafeEmit(part);
  }
  await writer.flush();
}

/**
 * Reads a record stream to its end.
 */
async function readAll(
  stream: ReadableStream<HarnessAgentStreamPartRecord>,
): Promise<HarnessAgentStreamPartRecord[]> {
  const records: HarnessAgentStreamPartRecord[] = [];
  for await (const record of stream) records.push(record);
  return records;
}

describe('readResponseRecordStream', () => {
  test('decrypts fragmented and combined frames while resuming at a World chunk index', async () => {
    const world = new InMemoryWorld();
    const keyedWorld: World = world;
    keyedWorld.getEncryptionKeyForRun = async () => new Uint8Array(32).fill(7);
    const encryption = await createStorageEncryption({
      world,
      runId,
      deploymentId: 'test',
    });
    await writeRecords({
      world,
      encryption,
      records: [{ part: finishPart, key: 'finish-turn:previous' }],
    });
    await writeRecords({
      world,
      encryption,
      records: [{ part: { type: 'start-turn' }, key: 'turn-start:turn' }],
    });
    await writeRecords({
      world,
      encryption,
      records: [
        {
          part: { type: 'text-delta', id: 'text', delta: 'secret' },
          startId: 'attempt',
        },
        { part: finishPart, key: 'finish-turn:turn' },
      ],
    });
    const { data } = await world.streams.getChunks(
      runId,
      session.getStreamName(),
      { limit: 1000 },
    );
    const bytes = new TextEncoder().encode(
      data
        .slice(1)
        .map(chunk => new TextDecoder().decode(chunk.data))
        .join(''),
    );
    const get = vi.spyOn(world.streams, 'get').mockResolvedValue(
      new ReadableStream({
        start(controller) {
          for (let index = 0; index < bytes.length; index += 3)
            controller.enqueue(bytes.slice(index, index + 3));
          controller.close();
        },
      }),
    );
    expect(
      await readAll(
        readResponseRecordStream({
          world,
          session,
          encryption,
          startTurnId: 'turn',
          startIndex: 1,
          driveEnd: Promise.resolve('ran'),
        }),
      ),
    ).toEqual([
      { part: { type: 'start-turn' }, key: 'turn-start:turn' },
      {
        part: { type: 'text-delta', id: 'text', delta: 'secret' },
        startId: 'attempt',
      },
      { part: finishPart, key: 'finish-turn:turn' },
    ]);
    expect(get).toHaveBeenCalledWith(runId, session.getStreamName(), 1);
  });

  test('rejects a truncated frame at the end of a stored stream', async () => {
    const world = new InMemoryWorld();
    await world.streams.write(runId, session.getStreamName(), 'incomplete');
    await world.streams.close(runId, session.getStreamName());
    await expect(
      readAll(
        readResponseRecordStream({
          world,
          session,
          encryption,
          startTurnId: 'turn',
          startIndex: 0,
        }),
      ),
    ).rejects.toThrow('truncated storage frame');
  });

  test('drops records before the turn start and closes once the drive ended and its output was read', async () => {
    const world = new InMemoryWorld();
    await writeRecords({
      world,
      records: [
        { part: finishPart, key: 'finish-turn:previous' },
        { part: { type: 'retract', startIds: ['old'] } },
        { part: { type: 'start-turn' }, key: 'turn-start:turn' },
        { part: { type: 'text-delta', id: 't', delta: 'hi' }, startId: 'a' },
        { part: { type: 'yield' } },
      ],
    });

    const records = await readAll(
      readResponseRecordStream({
        encryption,
        world,
        session,
        startTurnId: 'turn',
        startIndex: 0,
        driveEnd: Promise.resolve('ran'),
      }),
    );

    expect(records).toEqual([
      { part: { type: 'start-turn' }, key: 'turn-start:turn' },
      { part: { type: 'text-delta', id: 't', delta: 'hi' }, startId: 'a' },
      { part: { type: 'yield' } },
    ]);
  });

  test('errors with the reason of a rejected drive', async () => {
    const world = new InMemoryWorld();
    const failure = new Error('drive failed');

    await expect(
      readAll(
        readResponseRecordStream({
          encryption,
          world,
          session,
          startTurnId: 'turn',
          startIndex: 0,
          driveEnd: Promise.reject(failure),
        }),
      ),
    ).rejects.toBe(failure);
  });

  test('follows the session across drives, dropping yields, until it settled', async () => {
    const world = new InMemoryWorld();
    await writeRecords({
      world,
      records: [
        { part: { type: 'start-turn' }, key: 'turn-start:turn' },
        { part: { type: 'text-delta', id: 't', delta: 'a' }, startId: 'a' },
        { part: { type: 'yield' } },
      ],
    });
    const reading = readAll(
      readResponseRecordStream({
        encryption,
        world,
        session,
        startTurnId: 'turn',
        startIndex: 0,
      }),
    );

    await writeRecords({
      world,
      records: [
        { part: { type: 'retract', startIds: ['a'] } },
        { part: finishPart, key: 'finish-turn:turn' },
        { part: { type: 'settle' } },
        { part: { type: 'start-turn' }, key: 'turn-start:next' },
      ],
    });

    expect(await reading).toEqual([
      { part: { type: 'start-turn' }, key: 'turn-start:turn' },
      { part: { type: 'text-delta', id: 't', delta: 'a' }, startId: 'a' },
      { part: { type: 'retract', startIds: ['a'] } },
      { part: finishPart, key: 'finish-turn:turn' },
      { part: { type: 'settle' } },
    ]);
  });

  test('drops settle parts that later history supersedes and closes at the one ending the history', async () => {
    const world = new InMemoryWorld();
    const request: HarnessAgentStreamPart = {
      type: 'tool-approval-request',
      approvalId: 'approval-1',
      toolCall: {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'weather',
        input: {},
      },
    };
    await writeRecords({
      world,
      records: [
        { part: { type: 'start-turn' }, key: 'turn-start:turn' },
        { part: request, key: 'tool-approval-request:call-1' },
        { part: { type: 'settle' } },
      ],
    });
    await writeRecords({
      world,
      records: [
        { part: { type: 'text-delta', id: 't', delta: 'a' }, startId: 'a' },
        { part: finishPart, key: 'finish-turn:turn' },
        { part: { type: 'settle' } },
      ],
    });

    expect(
      await readAll(
        readResponseRecordStream({
          encryption,
          world,
          session,
          startTurnId: 'turn',
          startIndex: 0,
        }),
      ),
    ).toEqual([
      { part: { type: 'start-turn' }, key: 'turn-start:turn' },
      { part: request, key: 'tool-approval-request:call-1' },
      { part: { type: 'text-delta', id: 't', delta: 'a' }, startId: 'a' },
      { part: finishPart, key: 'finish-turn:turn' },
      { part: { type: 'settle' } },
    ]);
  });

  test('reads every record from the start index without a start turn', async () => {
    const world = new InMemoryWorld();
    await writeRecords({
      world,
      records: [{ part: { type: 'settle' } }],
    });
    await writeRecords({
      world,
      records: [
        { part: { type: 'text-delta', id: 't', delta: 'a' }, startId: 'a' },
        { part: { type: 'settle' } },
      ],
    });

    expect(
      await readAll(
        readResponseRecordStream({
          encryption,
          world,
          session,
          startIndex: 1,
          driveEnd: Promise.resolve('ran'),
        }),
      ),
    ).toEqual([
      { part: { type: 'text-delta', id: 't', delta: 'a' }, startId: 'a' },
      { part: { type: 'settle' } },
    ]);
  });

  test('closes when the abort signal fires', async () => {
    const world = new InMemoryWorld();
    await writeRecords({
      world,
      records: [{ part: { type: 'start-turn' }, key: 'turn-start:turn' }],
    });
    const abortController = new AbortController();
    const firstRecord = new DelayedPromise<void>();
    const stream = readResponseRecordStream({
      encryption,
      world,
      session,
      startTurnId: 'turn',
      startIndex: 0,
      abortSignal: abortController.signal,
    });

    const reading = (async () => {
      const records: HarnessAgentStreamPartRecord[] = [];
      for await (const record of stream) {
        records.push(record);
        firstRecord.resolve();
      }
      return records;
    })();
    await firstRecord.promise;
    abortController.abort();

    expect(await reading).toEqual([
      { part: { type: 'start-turn' }, key: 'turn-start:turn' },
    ]);
  });

  test('starts at the start-turn record whose submissionIds include startSubmissionId', async () => {
    const world = new InMemoryWorld();
    await writeRecords({
      world,
      records: [
        {
          part: { type: 'start-turn', submissionIds: ['p1'] },
          key: 'turn-start:t1',
        },
        { part: { type: 'text-delta', id: 'a', delta: 'first' }, startId: 'a' },
        {
          part: { type: 'start-turn', submissionIds: ['p2', 'p3'] },
          key: 'turn-start:t2',
        },
        {
          part: { type: 'text-delta', id: 'b', delta: 'merged' },
          startId: 'b',
        },
        { part: { type: 'settle' } },
      ],
    });

    const stream = readResponseRecordStream({
      encryption,
      world,
      session,
      startSubmissionId: 'p3',
      startIndex: 0,
      driveEnd: Promise.resolve('ran'),
    });

    expect(await readAll(stream)).toEqual([
      {
        part: { type: 'start-turn', submissionIds: ['p2', 'p3'] },
        key: 'turn-start:t2',
      },
      { part: { type: 'text-delta', id: 'b', delta: 'merged' }, startId: 'b' },
      { part: { type: 'settle' } },
    ]);
  });

  test('follows until settle when driveEnd resolves with skipped', async () => {
    const world = new InMemoryWorld();
    const driveEnd = new DelayedPromise<'ran' | 'skipped'>();
    const stream = readResponseRecordStream({
      encryption,
      world,
      session,
      startSubmissionId: 'p2',
      startIndex: 0,
      driveEnd: driveEnd.promise,
    });
    const reading = readAll(stream);

    driveEnd.resolve('skipped');
    await writeRecords({
      world,
      records: [
        {
          part: { type: 'start-turn', submissionIds: ['p2'] },
          key: 'turn-start:t2',
        },
        { part: { type: 'text-delta', id: 'b', delta: 'later' }, startId: 'b' },
        { part: { type: 'yield' } },
      ],
    });
    await writeRecords({
      world,
      records: [{ part: { type: 'settle' } }],
    });

    expect(await reading).toEqual([
      {
        part: { type: 'start-turn', submissionIds: ['p2'] },
        key: 'turn-start:t2',
      },
      { part: { type: 'text-delta', id: 'b', delta: 'later' }, startId: 'b' },
      { part: { type: 'settle' } },
    ]);
  });
});
