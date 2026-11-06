import {
  ValidQueueName,
  slotToEventId,
  workflowRunIdSchema,
  type World,
} from '@workflow/world';
import { describe, expect, test } from 'vitest';
import { InMemoryWorld } from './in-memory-world';

describe('InMemoryWorld', () => {
  test('delivers chunks to already-waiting readers and cancels only the selected reader', async () => {
    const world = new InMemoryWorld();
    const runId = 'session-id';
    const first = (await world.streams.get(runId, 'hints')).getReader();
    const second = (await world.streams.get(runId, 'hints')).getReader();
    const firstRead = first.read();
    const secondRead = second.read();
    await Promise.resolve();
    await world.streams.write(runId, 'hints', 'first');
    await expect(firstRead).resolves.toEqual({
      value: new TextEncoder().encode('first'),
      done: false,
    });
    await expect(secondRead).resolves.toEqual({
      value: new TextEncoder().encode('first'),
      done: false,
    });
    const canceledRead = first.read();
    const nextRead = second.read();
    await first.cancel();
    await expect(canceledRead).resolves.toEqual({
      value: undefined,
      done: true,
    });
    await world.streams.write(runId, 'hints', 'second');
    await expect(nextRead).resolves.toEqual({
      value: new TextEncoder().encode('second'),
      done: false,
    });
    await second.cancel();
    first.releaseLock();
    second.releaseLock();
  });

  test('retains event tail cursors and reports commits after a stale event count', async () => {
    const world = new InMemoryWorld();
    const runId = 'session-id';
    await world.events.create(runId, {
      eventType: 'run_created',
      eventData: { deploymentId: 'test', workflowName: 'harness', input: [] },
    });
    const initial = await world.events.list({
      runId,
      pagination: { sortOrder: 'asc' },
    });
    expect(initial.cursor).toBe(slotToEventId(1));
    const first = await world.events.create(
      runId,
      {
        eventType: 'step_created',
        correlationId: 'first',
        eventData: { stepName: 'test', input: [] },
      },
      { eventCount: 1 },
    );
    expect(first.events).toBeUndefined();
    const second = await world.events.create(
      runId,
      {
        eventType: 'step_created',
        correlationId: 'second',
        eventData: { stepName: 'test', input: [] },
      },
      { eventCount: 1 },
    );
    expect(second.events?.map(event => event.eventId)).toEqual([
      slotToEventId(2),
      slotToEventId(3),
    ]);
    expect(second.cursor).toBe(slotToEventId(3));
    const next = await world.events.list({
      runId,
      pagination: { sortOrder: 'asc', cursor: initial.cursor!, limit: 1 },
    });
    expect(next.data.map(event => event.eventId)).toEqual([slotToEventId(2)]);
    expect(next.hasMore).toBe(true);
    const tail = await world.events.list({
      runId,
      pagination: { sortOrder: 'asc', cursor: next.cursor! },
    });
    expect(tail.data.map(event => event.eventId)).toEqual([slotToEventId(3)]);
    expect(tail.cursor).toBe(slotToEventId(3));
    expect(
      (
        await world.events.list({
          runId,
          pagination: { sortOrder: 'asc', cursor: tail.cursor! },
        })
      ).data,
    ).toEqual([]);
    const restored = new InMemoryWorld();
    await restored.seed({ runId, data: await world.export({ runId }) });
    await restored.events.create(runId, {
      eventType: 'step_started',
      correlationId: 'second',
    });
    const resumed = await restored.events.list({
      runId,
      pagination: { sortOrder: 'asc', cursor: tail.cursor! },
    });
    expect(resumed.data.map(event => event.eventId)).toEqual([
      slotToEventId(4),
    ]);
    const descending = await restored.events.list({
      runId,
      pagination: { sortOrder: 'desc', limit: 2 },
    });
    expect(descending.data.map(event => event.eventId)).toEqual([
      slotToEventId(4),
      slotToEventId(3),
    ]);
    const correlation = await restored.events.listByCorrelationId({
      runId,
      correlationId: 'second',
      pagination: { sortOrder: 'desc', limit: 1 },
    });
    expect(correlation.data.map(event => event.eventId)).toEqual([
      slotToEventId(4),
    ]);
    const preceding = await restored.events.listByCorrelationId({
      runId,
      correlationId: 'second',
      pagination: { sortOrder: 'desc', cursor: correlation.cursor! },
    });
    expect(preceding.data.map(event => event.eventId)).toEqual([
      slotToEventId(3),
    ]);
  });

  test('arbitrates concurrent step creation without overwriting or consuming a slot', async () => {
    const world = new InMemoryWorld();
    const runId = 'session-id';
    await world.events.create(runId, {
      eventType: 'run_created',
      eventData: { deploymentId: 'test', workflowName: 'harness', input: [] },
    });
    const results = await Promise.allSettled(
      [1, 2].map(value =>
        world.events.create(
          runId,
          {
            eventType: 'step_created',
            correlationId: 'same',
            eventData: { stepName: 'test', input: value },
          },
          { eventCount: 1 },
        ),
      ),
    );
    expect(results.map(result => result.status)).toEqual([
      'fulfilled',
      'rejected',
    ]);
    expect(results[1]).toMatchObject({
      reason: { name: 'EntityConflictError' },
    });
    expect((await world.steps.get(runId, 'same')).input).toBe(1);
    const next = await world.events.create(
      runId,
      { eventType: 'step_started', correlationId: 'same' },
      { eventCount: 2 },
    );
    expect(next.event?.eventId).toBe(slotToEventId(3));
    const restored = new InMemoryWorld();
    await restored.seed({ runId, data: await world.export({ runId }) });
    await expect(
      restored.events.create(runId, {
        eventType: 'step_created',
        correlationId: 'same',
        eventData: { stepName: 'test', input: 3 },
      }),
    ).rejects.toMatchObject({ name: 'EntityConflictError' });
    expect((await restored.steps.get(runId, 'same')).input).toBe(1);
  });

  test('implements the Workflow World storage, queue, and stream surfaces', async () => {
    const world: World = new InMemoryWorld();
    const runId = 'session-id';
    const queueName = ValidQueueName.parse('__wkf_workflow_session-id');

    const runResult = await world.events.create(runId, {
      eventType: 'run_created',
      eventData: {
        deploymentId: 'deployment-id',
        workflowName: 'harness',
        input: { prompt: 'hello' },
      },
    });
    await world.events.create(runId, {
      eventType: 'step_created',
      correlationId: 'step-id',
      eventData: { stepName: 'tool', input: { value: 1 } },
    });
    await world.events.create(runId, {
      eventType: 'step_started',
      correlationId: 'step-id',
    });
    await world.events.create(runId, {
      eventType: 'step_completed',
      correlationId: 'step-id',
      eventData: { result: { value: 2 } },
    });
    await world.events.create(runId, {
      eventType: 'hook_created',
      correlationId: 'hook-id',
      eventData: { token: 'hook-token' },
    });
    await world.queue(
      queueName,
      { runId },
      { idempotencyKey: 'queue-message-id' },
    );
    await world.streams.write(runId, 'output', 'hello');
    await world.streams.close(runId, 'output');

    await expect(world.runs.get(runId)).resolves.toMatchObject({
      status: 'pending',
      workflowName: 'harness',
    });
    await expect(world.steps.get(runId, 'step-id')).resolves.toMatchObject({
      status: 'completed',
      output: { value: 2 },
    });
    await expect(world.hooks.getByToken('hook-token')).resolves.toMatchObject({
      hookId: 'hook-id',
      runId,
    });
    await expect(world.events.list({ runId })).resolves.toMatchObject({
      data: [
        { eventType: 'run_created' },
        { eventType: 'step_created' },
        { eventType: 'step_started' },
        { eventType: 'step_completed' },
        { eventType: 'hook_created' },
      ],
      hasMore: false,
    });
    expect(runResult.run?.status).toBe('pending');

    const chunks = await world.streams.getChunks(runId, 'output');
    expect(chunks.done).toBe(true);
    expect(new TextDecoder().decode(chunks.data[0].data)).toBe('hello');
  });

  test('exports the non-replayable data and rebuilds records from events', async () => {
    const world = new InMemoryWorld();
    const runId = 'session-id';
    const queueName = ValidQueueName.parse('__wkf_workflow_session-id');

    await world.events.create(runId, {
      eventType: 'run_created',
      eventData: {
        deploymentId: 'deployment-id',
        workflowName: 'harness',
        input: { prompt: 'hello' },
        dynamicWorkflowCode: new Uint8Array([4, 5]),
      },
    });
    await world.events.create(runId, {
      eventType: 'step_created',
      correlationId: 'step-id',
      eventData: { stepName: 'tool', input: { value: 1 } },
    });
    await world.events.create(runId, {
      eventType: 'attr_set',
      eventData: {
        changes: [{ key: 'persisted', value: 'yes' }],
        writer: { type: 'workflow' },
      },
    });
    await world.events.create(runId, {
      eventType: 'hook_created',
      correlationId: 'hook-id',
      eventData: { token: 'hook-token' },
    });
    await world.queue(queueName, { runId }, { idempotencyKey: 'message' });
    await world.queue(
      ValidQueueName.parse('__wkf_workflow_other-session'),
      { runId: 'other-session' },
      { idempotencyKey: 'other-message' },
    );
    await world.streams.write(runId, 'output', new Uint8Array([1, 2, 3]));
    await world.experimental_snapshots?.save(runId, new Uint8Array([4, 5]), {
      eventsCursor: null,
      createdAt: new Date(0),
    });

    const data = await world.export({ runId });
    expect(Object.keys(getExportedRunData({ data })).sort()).toEqual([
      'events',
      'queuedMessages',
      'runId',
      'streams',
      'version',
    ]);
    const restoredWorld = new InMemoryWorld();
    await restoredWorld.seed({ runId, data });

    await expect(restoredWorld.runs.get(runId)).resolves.toMatchObject({
      runId,
      workflowName: 'harness',
      attributes: { persisted: 'yes' },
    });
    await expect(
      restoredWorld.steps.get(runId, 'step-id'),
    ).resolves.toMatchObject({
      stepName: 'tool',
    });
    await expect(
      restoredWorld.hooks.getByToken('hook-token'),
    ).resolves.toMatchObject({
      hookId: 'hook-id',
    });
    await expect(restoredWorld.events.list({ runId })).resolves.toMatchObject({
      data: [
        { eventType: 'run_created' },
        { eventType: 'step_created' },
        { eventType: 'attr_set' },
        { eventType: 'hook_created' },
      ],
    });
    await expect(
      restoredWorld.streams.getInfo(runId, 'output'),
    ).resolves.toEqual({
      tailIndex: 0,
      done: false,
    });
    await expect(
      restoredWorld.experimental_snapshots?.load(runId),
    ).resolves.toBeNull();

    const restoredData = await restoredWorld.export({ runId });
    const restoredDataForAssertions = getExportedRunData({
      data: restoredData,
    });
    expect(restoredDataForAssertions.queuedMessages).toHaveLength(1);
    expect(restoredDataForAssertions.streams.output.chunks).toEqual([
      new Uint8Array([1, 2, 3]),
    ]);

    const queuedMessage = await restoredWorld.queue(
      queueName,
      { runId },
      { idempotencyKey: 'another-message' },
    );
    expect(queuedMessage.messageId).not.toBe(
      restoredDataForAssertions.queuedMessages[0].messageId,
    );
  });

  test('exports and seeds JSON-serializable run data', async () => {
    const source = new InMemoryWorld();
    const runId = 'session-id';
    await source.events.create(runId, {
      eventType: 'run_created',
      eventData: {
        deploymentId: 'deployment-id',
        workflowName: 'harness',
        input: { prompt: 'hello' },
        dynamicWorkflowCode: new Uint8Array([4, 5]),
      },
    });
    await source.streams.write(runId, 'output', new Uint8Array([1, 2, 3]));
    await source.streams.close(runId, 'output');

    const json = await source.exportJson({ runId });
    const restored = new InMemoryWorld();
    await restored.seedJson({ runId, data: json });

    await expect(restored.runs.get(runId)).resolves.toMatchObject({
      runId,
      workflowName: 'harness',
      dynamicWorkflowCode: new Uint8Array([4, 5]),
    });
    const chunks = await restored.streams.getChunks(runId, 'output');
    expect(chunks.data[0].data).toEqual(new Uint8Array([1, 2, 3]));
    expect(chunks.done).toBe(true);
  });

  test('rejects re-seeding data under a different run id', async () => {
    const source = new InMemoryWorld();
    const data = await source.export({ runId: 'original-session' });

    await expect(
      source.seed({ runId: 'different-session', data }),
    ).rejects.toThrow('cannot seed run');
  });

  test('keeps existing run hooks intact when re-seeding hook conflicts', async () => {
    const world = new InMemoryWorld();
    for (const runId of ['first-session', 'second-session']) {
      await world.events.create(runId, {
        eventType: 'run_created',
        eventData: {
          deploymentId: 'deployment-id',
          workflowName: runId,
          input: {},
        },
      });
    }
    await world.events.create('first-session', {
      eventType: 'hook_created',
      correlationId: 'first-hook',
      eventData: { token: 'shared-token' },
    });
    await world.events.create('second-session', {
      eventType: 'hook_created',
      correlationId: 'second-hook',
      eventData: { token: 'second-token' },
    });

    const data = await world.export({ runId: 'second-session' });
    const dataForAssertions = getExportedRunData({ data });
    const conflictingData = {
      ...dataForAssertions,
      events: dataForAssertions.events.map(event =>
        event.eventType === 'hook_created'
          ? {
              ...event,
              eventData: { ...event.eventData, token: 'shared-token' },
            }
          : event,
      ),
    };

    await expect(
      world.seed({
        runId: 'second-session',
        data: conflictingData as Parameters<InMemoryWorld['seed']>[0]['data'],
      }),
    ).rejects.toThrow('hook token `shared-token` is already in use');
    await expect(world.hooks.getByToken('second-token')).resolves.toMatchObject(
      { hookId: 'second-hook' },
    );
    await expect(world.hooks.getByToken('shared-token')).resolves.toMatchObject(
      { hookId: 'first-hook' },
    );
  });

  test('resumes stream readers when replacing a run during seeding', async () => {
    const world = new InMemoryWorld();
    const runId = 'session-id';
    const stream = await world.streams.get(runId, 'output');
    const pendingRead = stream.getReader().read();

    await world.seed({ runId, data: await world.export({ runId }) });

    await expect(pendingRead).resolves.toMatchObject({ done: true });
  });

  test('uses writer-local chunk sequences when appending to existing streams', async () => {
    const world = new InMemoryWorld();
    const runId = 'session-id';
    await world.streams.write(runId, 'output', 'first');

    const writer = world.streams.createWriteSession?.(runId, 'output', {
      writerId: 'wrtr_test',
    });
    expect(writer).toBeDefined();
    await writer?.write(0, ['second']);

    const chunks = await world.streams.getChunks(runId, 'output');
    expect(
      chunks.data.map(chunk => new TextDecoder().decode(chunk.data)),
    ).toEqual(['first', 'second']);
  });

  test('creates Workflow-compatible run ids', () => {
    const world = new InMemoryWorld();
    expect(() =>
      workflowRunIdSchema.parse(`wrun_${world.createRunId()}`),
    ).not.toThrow();
  });
});

function getExportedRunData(input: { data: unknown }) {
  return input.data as {
    events: {
      eventType: string;
      correlationId?: string;
      eventData?: Record<string, unknown>;
    }[];
    queuedMessages: { messageId: string }[];
    streams: Record<string, { chunks: Uint8Array[]; done: boolean }>;
  };
}
