import { afterEach, describe, expect, test } from 'vitest';
import { DefaultHarnessAgentSession } from '../harness-agent-session';
import { InMemoryWorld } from '../in-memory-world';
import { createLog, type HarnessAgentLogEvent } from './create-log';
import {
  createStreamWriter,
  decodeStreamRecords,
  type HarnessAgentStreamPartRecord,
} from './create-stream-writer';
import { startDrive } from './start-drive';

const abortControllers = new Set<AbortController>();

afterEach(() => {
  for (const controller of abortControllers) controller.abort();
  abortControllers.clear();
});

const runId = 'drive-session';
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

const prompt: HarnessAgentLogEvent = {
  type: 'submission',
  id: 'turn',
  data: {
    type: 'prompt',
    message: { role: 'user', content: 'hi' },
    settings: { skills: [], tools: [] },
  },
};

const turnStart: HarnessAgentLogEvent = {
  type: 'turn-start',
  id: 'turn-start:turn',
  data: { turnId: 'turn' },
};

/**
 * Returns an `effect-start` event.
 */
function effectStart(options: {
  id: string;
  key: string;
  replay: 'safe' | 'never';
}): HarnessAgentLogEvent {
  return {
    type: 'effect-start',
    id: options.id,
    data: {
      key: options.key,
      attempt: 1,
      name: options.key.startsWith('tool:') ? 'tool.bash' : 'model',
      replay: options.replay,
      input: null,
      deliveredSubmissionIds: [],
    },
  };
}

/**
 * Returns a `drive-start` event.
 */
function driveStart(options: {
  driveId: string;
  deadline?: number;
}): HarnessAgentLogEvent {
  return {
    type: 'drive-start',
    id: `drive-start:${options.driveId}`,
    data:
      options.deadline == null
        ? { driveId: options.driveId }
        : { driveId: options.driveId, deadline: options.deadline },
  };
}

/**
 * Returns a `drive-crash` event.
 */
function driveCrash(options: { driveId: string }): HarnessAgentLogEvent {
  return {
    type: 'drive-crash',
    id: `drive-crash:${options.driveId}`,
    data: { driveId: options.driveId, requestId: 'request' },
  };
}

async function setup(options: { events: HarnessAgentLogEvent[] }) {
  const world = new InMemoryWorld();
  await world.events.create(runId, {
    eventType: 'run_created',
    eventData: { deploymentId: 'test', workflowName: 'harness', input: [] },
  });
  const log = createLog({ world, runId });
  for (const event of options.events) await log.append(event);
  const abortController = new AbortController();
  abortControllers.add(abortController);
  const writer = createStreamWriter({
    world,
    session,
    abortSignal: abortController.signal,
  });
  return { world, log, writer };
}

/**
 * Reads every record written to the session's stream so far.
 */
async function readRecords(options: {
  world: InMemoryWorld;
}): Promise<HarnessAgentStreamPartRecord[]> {
  const { data } = await options.world.streams.getChunks(
    runId,
    session.getStreamName(),
    { limit: 1000 },
  );
  return decodeStreamRecords({
    text: data.map(chunk => new TextDecoder().decode(chunk.data)).join(''),
  });
}

describe('startDrive', () => {
  test('returns false without writing when there is nothing to drive', async () => {
    const { world, log, writer } = await setup({
      events: [
        prompt,
        turnStart,
        {
          type: 'finish-turn',
          id: 'finish-turn:turn',
          data: { turnId: 'turn', finishReason, totalUsage: usage },
        },
      ],
    });

    expect(
      await startDrive({ log, writer, world, session, driveId: 'drive' }),
    ).toBe(false);
    await writer.flush();
    expect((await log.read()).events).toHaveLength(3);
    expect(await readRecords({ world })).toEqual([]);
  });

  test('starts a drive for a prompt without a turn, recording its deadline', async () => {
    const { world, log, writer } = await setup({ events: [prompt] });

    expect(
      await startDrive({
        log,
        writer,
        world,
        session,
        driveId: 'drive',
        deadline: new Date(1_000),
      }),
    ).toBe(true);
    expect((await log.read({ types: ['drive-start'] })).events).toEqual([
      driveStart({ driveId: 'drive', deadline: 1_000 }),
    ]);
  });

  test('leaves the session unchanged while the drive of abandoned attempts may still run', async () => {
    const events = [
      prompt,
      driveStart({ driveId: 'old', deadline: Date.now() + 60_000 }),
      turnStart,
      effectStart({ id: 'model', key: 'model:0', replay: 'safe' }),
    ];
    const { world, log, writer } = await setup({ events });

    expect(
      await startDrive({ log, writer, world, session, driveId: 'drive' }),
    ).toBe(false);
    expect((await log.read()).events).toEqual(events);
  });

  test('leaves the session unchanged without any drive-start to prove abandoned attempts', async () => {
    const { world, log, writer } = await setup({
      events: [
        prompt,
        turnStart,
        effectStart({ id: 'model', key: 'model:0', replay: 'safe' }),
      ],
    });

    expect(
      await startDrive({ log, writer, world, session, driveId: 'drive' }),
    ).toBe(false);
  });

  test.each([
    {
      proof: 'a past deadline',
      events: [driveStart({ driveId: 'old', deadline: 1 })],
    },
    {
      proof: 'a drive-crash',
      events: [driveStart({ driveId: 'old' }), driveCrash({ driveId: 'old' })],
    },
  ])('recovers abandoned attempts given $proof', async ({ events }) => {
    const { world, log, writer } = await setup({
      events: [
        prompt,
        ...events.slice(0, 1),
        turnStart,
        effectStart({ id: 'model', key: 'model:0', replay: 'safe' }),
        {
          type: 'effect-progress',
          id: 'progress',
          data: { startId: 'model', partial: 'partial' },
        },
        effectStart({ id: 'unstarted', key: 'tool:a', replay: 'never' }),
        effectStart({ id: 'executed', key: 'tool:b', replay: 'never' }),
        {
          type: 'tool-execution-start',
          id: 'tool-execution-start:executed',
          data: { startId: 'executed' },
        },
        ...events.slice(1),
      ],
    });

    expect(
      await startDrive({ log, writer, world, session, driveId: 'drive' }),
    ).toBe(true);
    await writer.flush();

    const { events: logEvents } = await log.read({
      types: ['drive-start', 'effect-end'],
    });
    expect(logEvents.slice(1)).toEqual([
      driveStart({ driveId: 'drive' }),
      {
        type: 'effect-end',
        id: expect.any(String),
        data: {
          startId: 'model',
          output: { type: 'interrupted', retryable: true, partial: 'partial' },
        },
      },
      {
        type: 'effect-end',
        id: expect.any(String),
        data: {
          startId: 'unstarted',
          output: { type: 'interrupted', retryable: true },
        },
      },
      {
        type: 'effect-end',
        id: expect.any(String),
        data: {
          startId: 'executed',
          output: { type: 'interrupted', retryable: false },
        },
      },
    ]);
    expect(await readRecords({ world })).toEqual([
      { part: { type: 'start' }, key: 'turn-start:turn' },
      { part: { type: 'withdraw', startIds: ['model', 'unstarted'] } },
    ]);
  });

  test('writes only the missing boundary parts of the unfinished turn', async () => {
    const finishStep: HarnessAgentLogEvent = {
      type: 'finish-step',
      id: 'finish-step:turn:0',
      data: { turnId: 'turn', stepNumber: 0, finishReason, usage },
    };
    const { world, log, writer } = await setup({
      events: [prompt, turnStart, finishStep],
    });
    writer.emit({ part: { type: 'start' }, key: 'turn-start:turn' });
    await writer.flush();

    expect(
      await startDrive({ log, writer, world, session, driveId: 'drive' }),
    ).toBe(true);
    await writer.flush();

    expect(await readRecords({ world })).toEqual([
      { part: { type: 'start' }, key: 'turn-start:turn' },
      {
        part: { type: 'finish-step', finishReason, usage },
        key: 'finish-step:turn:0',
      },
    ]);
  });

  test('does not withdraw attempts of an earlier turn', async () => {
    const { world, log, writer } = await setup({
      events: [
        effectStart({ id: 'earlier', key: 'model:earlier', replay: 'safe' }),
        {
          type: 'effect-end',
          id: 'earlier-end',
          data: {
            startId: 'earlier',
            output: { type: 'interrupted', retryable: true },
          },
        },
        prompt,
        turnStart,
      ],
    });

    expect(
      await startDrive({ log, writer, world, session, driveId: 'drive' }),
    ).toBe(true);
    await writer.flush();

    expect(await readRecords({ world })).toEqual([
      { part: { type: 'start' }, key: 'turn-start:turn' },
    ]);
  });
});
