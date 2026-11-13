import { DelayedPromise } from '@ai-sdk/provider-utils';
import { afterEach, describe, expect, test } from 'vitest';
import { DefaultHarnessAgentSession } from '../harness-agent-session';
import { InMemoryWorld } from '../in-memory-world';
import {
  createStreamWriter,
  type HarnessAgentStreamPart,
  type HarnessAgentStreamPartRecord,
} from './create-stream-writer';
import { readTurnRecordStream } from './read-turn-record-stream';

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
  type: 'finish',
  finishReason,
  totalUsage: usage,
};

/**
 * Writes records to the session's stream, one chunk per call.
 */
async function writeRecords(options: {
  world: InMemoryWorld;
  records: HarnessAgentStreamPartRecord[];
}): Promise<void> {
  const abortController = new AbortController();
  abortControllers.add(abortController);
  const writer = createStreamWriter({
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

describe('readTurnRecordStream', () => {
  test('drops records before the turn start and closes once the drive ended and its output was read', async () => {
    const world = new InMemoryWorld();
    await writeRecords({
      world,
      records: [
        { part: finishPart, key: 'finish-turn:previous' },
        { part: { type: 'retract', startIds: ['old'] } },
        { part: { type: 'start' }, key: 'turn-start:turn' },
        { part: { type: 'text-delta', id: 't', delta: 'hi' }, startId: 'a' },
        { part: { type: 'yield' } },
      ],
    });

    const records = await readAll(
      readTurnRecordStream({
        world,
        session,
        turnId: 'turn',
        startIndex: 0,
        driveEnd: Promise.resolve(),
      }),
    );

    expect(records).toEqual([
      { part: { type: 'start' }, key: 'turn-start:turn' },
      { part: { type: 'text-delta', id: 't', delta: 'hi' }, startId: 'a' },
      { part: { type: 'yield' } },
    ]);
  });

  test('errors with the reason of a rejected drive', async () => {
    const world = new InMemoryWorld();
    const failure = new Error('drive failed');

    await expect(
      readAll(
        readTurnRecordStream({
          world,
          session,
          turnId: 'turn',
          startIndex: 0,
          driveEnd: Promise.reject(failure),
        }),
      ),
    ).rejects.toBe(failure);
  });

  test('follows the turn across drives, dropping yields, until its finish', async () => {
    const world = new InMemoryWorld();
    await writeRecords({
      world,
      records: [
        { part: { type: 'start' }, key: 'turn-start:turn' },
        { part: { type: 'text-delta', id: 't', delta: 'a' }, startId: 'a' },
        { part: { type: 'yield' } },
      ],
    });
    const reading = readAll(
      readTurnRecordStream({ world, session, turnId: 'turn', startIndex: 0 }),
    );

    await writeRecords({
      world,
      records: [
        { part: { type: 'retract', startIds: ['a'] } },
        { part: finishPart, key: 'finish-turn:turn' },
        { part: { type: 'start' }, key: 'turn-start:next' },
      ],
    });

    expect(await reading).toEqual([
      { part: { type: 'start' }, key: 'turn-start:turn' },
      { part: { type: 'text-delta', id: 't', delta: 'a' }, startId: 'a' },
      { part: { type: 'retract', startIds: ['a'] } },
      { part: finishPart, key: 'finish-turn:turn' },
    ]);
  });

  test('closes when the abort signal fires', async () => {
    const world = new InMemoryWorld();
    await writeRecords({
      world,
      records: [{ part: { type: 'start' }, key: 'turn-start:turn' }],
    });
    const abortController = new AbortController();
    const firstRecord = new DelayedPromise<void>();
    const stream = readTurnRecordStream({
      world,
      session,
      turnId: 'turn',
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
      { part: { type: 'start' }, key: 'turn-start:turn' },
    ]);
  });
});
