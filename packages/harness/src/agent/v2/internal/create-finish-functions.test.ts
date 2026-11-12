import { afterEach, describe, expect, test, vi } from 'vitest';
import { HarnessInvalidDriveStateError } from '../../../errors/harness-invalid-drive-state-error';
import { DefaultHarnessAgentSession } from '../harness-agent-session';
import { InMemoryWorld } from '../in-memory-world';
import { createFinishFunctions } from './create-finish-functions';
import { createLog } from './create-log';
import {
  createStreamWriter,
  decodeStreamRecords,
} from './create-stream-writer';
import type {
  HarnessAgentLog,
  HarnessAgentLogEvent,
  HarnessAgentStreamWriter,
} from './types';

const abortControllers = new Set<AbortController>();

afterEach(() => {
  for (const controller of abortControllers) controller.abort();
  abortControllers.clear();
});

const runId = 'finish-session';
const session = new DefaultHarnessAgentSession({
  sessionId: 'session-1',
  sandboxId: 'sandbox-1',
  runId,
});

const usage = {
  inputTokens: {
    total: 10,
    noCache: 10,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
};

const finishReason = { unified: 'stop' as const, raw: 'stop' };

async function setup() {
  const world = new InMemoryWorld();
  await world.events.create(runId, {
    eventType: 'run_created',
    eventData: { deploymentId: 'test', workflowName: 'harness', input: [] },
  });
  const log = createLog({ world, runId });
  const abortController = new AbortController();
  abortControllers.add(abortController);
  const writer = createStreamWriter({
    world,
    session,
    abortSignal: abortController.signal,
  });
  const { finishStep, finishTurn } = createFinishFunctions({
    log,
    writer,
    abortSignal: abortController.signal,
  });
  return { world, log, writer, abortController, finishStep, finishTurn };
}

/**
 * Appends a submission without delivering it.
 */
async function submit(options: {
  log: HarnessAgentLog;
  submissionId: string;
  type?: 'prompt' | 'steer';
}): Promise<void> {
  const { log, submissionId } = options;
  const message = { role: 'user' as const, content: submissionId };
  await log.append({
    type: 'submission',
    id: submissionId,
    data:
      options.type === 'steer'
        ? { type: 'steer', message }
        : { type: 'prompt', message, settings: { skills: [], tools: [] } },
  });
}

/**
 * Appends an effect start delivering the given submissions.
 */
async function deliver(options: {
  log: HarnessAgentLog;
  startId: string;
  submissionIds: string[];
}): Promise<void> {
  await options.log.append({
    type: 'effect-start',
    id: options.startId,
    data: {
      key: options.startId,
      attempt: 1,
      name: 'model',
      replay: 'safe',
      input: null,
      deliveredSubmissionIds: options.submissionIds,
    },
  });
}

/**
 * Appends a `turn-start` event for the given submission.
 */
async function startTurn(options: {
  log: HarnessAgentLog;
  submissionId: string;
}): Promise<void> {
  await options.log.append({
    type: 'turn-start',
    id: `turn-start:${options.submissionId}`,
    data: { turnId: options.submissionId },
  });
}

/**
 * Appends a prompt submission, a `turn-start` event and an effect start
 * delivering it.
 */
async function deliverPrompt(options: {
  log: HarnessAgentLog;
  submissionId: string;
}): Promise<void> {
  await submit(options);
  await startTurn(options);
  await deliver({
    log: options.log,
    startId: `start:${options.submissionId}`,
    submissionIds: [options.submissionId],
  });
}

async function readStream(options: {
  world: InMemoryWorld;
  writer: HarnessAgentStreamWriter;
}) {
  await options.writer.flush();
  const { data } = await options.world.streams.getChunks(
    runId,
    session.getStreamName(),
    { limit: 1000 },
  );
  return decodeStreamRecords({
    text: data.map(chunk => new TextDecoder().decode(chunk.data)).join(''),
  });
}

async function readStreamKeys(options: {
  world: InMemoryWorld;
  writer: HarnessAgentStreamWriter;
}) {
  return (await readStream(options)).map(record => record.key);
}

async function readEventIds(options: {
  log: HarnessAgentLog;
  type: 'finish-step' | 'finish-turn';
}) {
  const { events } = await options.log.read({ types: [options.type] });
  return events.map(event => event.id);
}

describe('createFinishFunctions', () => {
  describe('finishStep', () => {
    test('records the step and emits finish-step under the step key', async () => {
      const { world, log, writer, finishStep } = await setup();
      await deliverPrompt({ log, submissionId: 'p1' });

      await finishStep({
        stepNumber: 0,
        finishReason,
        usage,
        harnessMetadata: { test: { value: 1 } },
      });

      const { events } = await log.read({ types: ['finish-step'] });
      expect(events).toEqual<HarnessAgentLogEvent[]>([
        {
          type: 'finish-step',
          id: 'finish-step:p1:0',
          data: {
            turnId: 'p1',
            stepNumber: 0,
            finishReason,
            usage,
            harnessMetadata: { test: { value: 1 } },
          },
        },
      ]);
      expect(await readStream({ world, writer })).toEqual([
        {
          part: {
            type: 'finish-step',
            finishReason,
            usage,
            harnessMetadata: { test: { value: 1 } },
          },
          key: 'finish-step:p1:0',
        },
      ]);
    });

    test('skips a replayed step even if its options differ', async () => {
      const { world, log, writer, finishStep } = await setup();
      await deliverPrompt({ log, submissionId: 'p1' });
      await finishStep({ stepNumber: 0, finishReason, usage });
      await finishStep({ stepNumber: 1, finishReason, usage });

      await finishStep({
        stepNumber: 0,
        finishReason: { unified: 'length', raw: 'length' },
        usage,
      });

      expect(await readEventIds({ log, type: 'finish-step' })).toEqual([
        'finish-step:p1:0',
        'finish-step:p1:1',
      ]);
      expect(await readStreamKeys({ world, writer })).toEqual([
        'finish-step:p1:0',
        'finish-step:p1:1',
      ]);
    });

    test('skips a step recorded before the functions were created', async () => {
      const { world, log, writer } = await setup();
      await deliverPrompt({ log, submissionId: 'p1' });
      await log.append({
        type: 'finish-step',
        id: 'finish-step:p1:0',
        data: { turnId: 'p1', stepNumber: 0, finishReason, usage },
      });
      const abortController = new AbortController();
      abortControllers.add(abortController);
      const { finishStep } = createFinishFunctions({
        log,
        writer,
        abortSignal: abortController.signal,
      });

      await finishStep({ stepNumber: 0, finishReason, usage });
      await finishStep({ stepNumber: 1, finishReason, usage });

      expect(await readStreamKeys({ world, writer })).toEqual([
        'finish-step:p1:1',
      ]);
    });

    test('counts steps per turn', async () => {
      const { log, finishStep } = await setup();
      await deliverPrompt({ log, submissionId: 'p1' });
      await finishStep({ stepNumber: 0, finishReason, usage });
      await deliverPrompt({ log, submissionId: 'p2' });

      await finishStep({ stepNumber: 0, finishReason, usage });

      expect(await readEventIds({ log, type: 'finish-step' })).toEqual([
        'finish-step:p1:0',
        'finish-step:p2:0',
      ]);
    });

    test('skips a replayed step of a finished turn', async () => {
      const { log, finishStep, finishTurn } = await setup();
      await deliverPrompt({ log, submissionId: 'p1' });
      await finishStep({ stepNumber: 0, finishReason, usage });
      await finishTurn({ finishReason, totalUsage: usage });

      await expect(
        finishStep({ stepNumber: 0, finishReason, usage }),
      ).resolves.toBeUndefined();
      expect(await readEventIds({ log, type: 'finish-step' })).toHaveLength(1);
    });

    test('rejects a new step for a finished turn', async () => {
      const { log, finishStep, finishTurn } = await setup();
      await deliverPrompt({ log, submissionId: 'p1' });
      await finishTurn({ finishReason, totalUsage: usage });

      await expect(
        finishStep({ stepNumber: 0, finishReason, usage }),
      ).rejects.toSatisfy(HarnessInvalidDriveStateError.isInstance);
      expect(await readEventIds({ log, type: 'finish-step' })).toEqual([]);
    });

    test('rejects a skipped step number', async () => {
      const { log, finishStep } = await setup();
      await deliverPrompt({ log, submissionId: 'p1' });

      await expect(
        finishStep({ stepNumber: 1, finishReason, usage }),
      ).rejects.toSatisfy(HarnessInvalidDriveStateError.isInstance);
      expect(await readEventIds({ log, type: 'finish-step' })).toEqual([]);
    });

    test.each([-1, 0.5, Number.NaN])(
      'rejects the invalid step number %s',
      async stepNumber => {
        const { log, finishStep } = await setup();
        await deliverPrompt({ log, submissionId: 'p1' });

        await expect(
          finishStep({ stepNumber, finishReason, usage }),
        ).rejects.toSatisfy(HarnessInvalidDriveStateError.isInstance);
      },
    );

    test('rejects a step before any prompt was delivered', async () => {
      const { log, finishStep } = await setup();
      await submit({ log, submissionId: 'p1' });

      await expect(
        finishStep({ stepNumber: 0, finishReason, usage }),
      ).rejects.toSatisfy(HarnessInvalidDriveStateError.isInstance);
    });

    test('emits nothing when the append was not new', async () => {
      const { world, log, writer, finishStep } = await setup();
      await deliverPrompt({ log, submissionId: 'p1' });
      vi.spyOn(log, 'append').mockResolvedValueOnce(false);

      await finishStep({ stepNumber: 0, finishReason, usage });

      expect(await readStream({ world, writer })).toEqual([]);
    });
  });

  describe('finishTurn', () => {
    test('records the turn and emits finish under the turn key', async () => {
      const { world, log, writer, finishTurn } = await setup();
      await deliverPrompt({ log, submissionId: 'p1' });

      await finishTurn({
        finishReason,
        totalUsage: usage,
        harnessMetadata: { test: { value: 1 } },
      });

      const { events } = await log.read({ types: ['finish-turn'] });
      expect(events).toEqual<HarnessAgentLogEvent[]>([
        {
          type: 'finish-turn',
          id: 'finish-turn:p1',
          data: {
            turnId: 'p1',
            finishReason,
            totalUsage: usage,
            harnessMetadata: { test: { value: 1 } },
          },
        },
      ]);
      expect(await readStream({ world, writer })).toEqual([
        {
          part: {
            type: 'finish',
            finishReason,
            totalUsage: usage,
            harnessMetadata: { test: { value: 1 } },
          },
          key: 'finish-turn:p1',
        },
      ]);
    });

    test('skips a replayed finish even if its options differ', async () => {
      const { world, log, writer, finishTurn } = await setup();
      await deliverPrompt({ log, submissionId: 'p1' });
      await finishTurn({ finishReason, totalUsage: usage });

      await finishTurn({
        finishReason: { unified: 'error', raw: 'error' },
        totalUsage: usage,
      });

      expect(await readEventIds({ log, type: 'finish-turn' })).toHaveLength(1);
      expect(await readStream({ world, writer })).toHaveLength(1);
    });

    test('finishes the next turn once it started', async () => {
      const { log, finishTurn } = await setup();
      await deliverPrompt({ log, submissionId: 'p1' });
      await finishTurn({ finishReason, totalUsage: usage });
      await submit({ log, submissionId: 'p2' });

      await finishTurn({ finishReason, totalUsage: usage });
      await startTurn({ log, submissionId: 'p2' });
      await finishTurn({ finishReason, totalUsage: usage });

      expect(await readEventIds({ log, type: 'finish-turn' })).toEqual([
        'finish-turn:p1',
        'finish-turn:p2',
      ]);
    });

    test('rejects a finish before any turn started', async () => {
      const { log, finishTurn } = await setup();
      await submit({ log, submissionId: 'p1' });
      await deliver({ log, startId: 's1', submissionIds: ['p1'] });

      await expect(
        finishTurn({ finishReason, totalUsage: usage }),
      ).rejects.toSatisfy(HarnessInvalidDriveStateError.isInstance);
      expect(await readEventIds({ log, type: 'finish-turn' })).toEqual([]);
    });

    test('emits nothing when the append was not new', async () => {
      const { world, log, writer, finishTurn } = await setup();
      await deliverPrompt({ log, submissionId: 'p1' });
      vi.spyOn(log, 'append').mockResolvedValueOnce(false);

      await finishTurn({ finishReason, totalUsage: usage });

      expect(await readStream({ world, writer })).toEqual([]);
    });
  });

  describe('turn tracking', () => {
    test('ignores submissions and deliveries without a turn start', async () => {
      const { log, finishTurn } = await setup();
      await deliverPrompt({ log, submissionId: 'p1' });
      await submit({ log, submissionId: 'steer', type: 'steer' });
      await deliver({ log, startId: 's2', submissionIds: ['steer'] });
      await submit({ log, submissionId: 'p2' });
      await deliver({ log, startId: 's3', submissionIds: ['p2'] });

      await finishTurn({ finishReason, totalUsage: usage });

      expect(await readEventIds({ log, type: 'finish-turn' })).toEqual([
        'finish-turn:p1',
      ]);
    });

    test('follows the latest turn start', async () => {
      const { log, finishTurn } = await setup();
      await submit({ log, submissionId: 'p1' });
      await submit({ log, submissionId: 'p2' });
      await startTurn({ log, submissionId: 'p2' });
      await startTurn({ log, submissionId: 'p1' });

      await finishTurn({ finishReason, totalUsage: usage });

      expect(await readEventIds({ log, type: 'finish-turn' })).toEqual([
        'finish-turn:p1',
      ]);
    });

    test('reads the log once and applies later events from onAppend', async () => {
      const { log, finishStep, finishTurn } = await setup();
      const read = vi.spyOn(log, 'read');
      await deliverPrompt({ log, submissionId: 'p1' });

      await finishStep({ stepNumber: 0, finishReason, usage });
      await deliverPrompt({ log, submissionId: 'p2' });
      await finishStep({ stepNumber: 0, finishReason, usage });
      await finishStep({ stepNumber: 1, finishReason, usage });
      await finishTurn({ finishReason, totalUsage: usage });

      expect(read).toHaveBeenCalledTimes(1);
    });

    test('records and emits nothing after abort', async () => {
      const { world, log, writer, abortController, finishStep, finishTurn } =
        await setup();
      await deliverPrompt({ log, submissionId: 'p1' });
      await writer.flush();
      abortController.abort();

      await finishStep({ stepNumber: 0, finishReason, usage });
      await finishTurn({ finishReason, totalUsage: usage });

      expect(await readEventIds({ log, type: 'finish-step' })).toEqual([]);
      expect(await readEventIds({ log, type: 'finish-turn' })).toEqual([]);
      expect(await readStream({ world, writer })).toEqual([]);
    });
  });
});
