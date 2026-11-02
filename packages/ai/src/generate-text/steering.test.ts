import { describe, expect, it } from 'vitest';
import { createSteering, startSteeringRun } from './steering';

describe('createSteering', () => {
  it('should deliver messages sent before the run starts in order', async () => {
    const steering = createSteering();

    const first = steering.steer('first', { id: 'steer-1' });
    const second = steering.steer(
      { role: 'user', content: [{ type: 'text', text: 'second' }] },
      { id: 'steer-2' },
    );

    const run = startSteeringRun(steering)!;

    expect(run.hasPendingMessages()).toBe(true);
    const taken = run.takeMessages();
    expect(taken).toMatchInlineSnapshot(`
      [
        {
          "content": "first",
          "role": "user",
        },
        {
          "content": [
            {
              "text": "second",
              "type": "text",
            },
          ],
          "role": "user",
        },
      ]
    `);
    expect(run.hasPendingMessages()).toBe(false);

    expect(
      run.resolveTakenMessages({ stepNumber: 0, sentMessages: taken }),
    ).toEqual(taken);
    expect(await Promise.all([first, second])).toMatchInlineSnapshot(`
      [
        {
          "id": "steer-1",
          "message": {
            "content": "first",
            "role": "user",
          },
          "stepNumber": 0,
          "type": "delivered",
        },
        {
          "id": "steer-2",
          "message": {
            "content": [
              {
                "text": "second",
                "type": "text",
              },
            ],
            "role": "user",
          },
          "stepNumber": 0,
          "type": "delivered",
        },
      ]
    `);
  });

  it('should not deliver messages that are not sent to the model', async () => {
    const steering = createSteering();
    const kept = steering.steer('kept', { id: 'steer-1' });
    const removed = steering.steer('removed', { id: 'steer-2' });

    const run = startSteeringRun(steering)!;
    const [keptMessage] = run.takeMessages();

    expect(
      run.resolveTakenMessages({ stepNumber: 1, sentMessages: [keptMessage] }),
    ).toEqual([keptMessage]);
    expect(await kept).toMatchObject({ type: 'delivered', stepNumber: 1 });
    expect(await removed).toMatchInlineSnapshot(`
      {
        "id": "steer-2",
        "message": {
          "content": "removed",
          "role": "user",
        },
        "reason": "removed-by-prepare-step",
        "type": "not-delivered",
      }
    `);
  });

  it('should deliver messages that are sent as new objects with the same content', async () => {
    const steering = createSteering();
    const outcome = steering.steer('hello');

    const run = startSteeringRun(steering)!;
    const [message] = run.takeMessages();

    run.resolveTakenMessages({
      stepNumber: 0,
      sentMessages: [
        {
          ...message,
          providerOptions: {
            anthropic: { cacheControl: { type: 'ephemeral' } },
          },
        },
      ],
    });

    expect(await outcome).toMatchObject({ type: 'delivered', stepNumber: 0 });
  });

  it('should not deliver pending messages when the run ends', async () => {
    const steering = createSteering();
    const run = startSteeringRun(steering)!;

    const outcome = steering.steer('too late', { id: 'steer-1' });
    run.end('stop-condition');

    expect(await outcome).toMatchInlineSnapshot(`
      {
        "id": "steer-1",
        "message": {
          "content": "too late",
          "role": "user",
        },
        "reason": "stop-condition",
        "type": "not-delivered",
      }
    `);
  });

  it('should not deliver taken messages when the run ends before they are sent', async () => {
    const steering = createSteering();
    const outcome = steering.steer('taken');

    const run = startSteeringRun(steering)!;
    run.takeMessages();
    run.end('error');

    expect(await outcome).toMatchObject({
      type: 'not-delivered',
      reason: 'error',
    });
  });

  it('should not deliver messages sent after the run ended', async () => {
    const steering = createSteering();
    startSteeringRun(steering)!.end('finished');

    expect(await steering.steer('after the run', { id: 'steer-1' }))
      .toMatchInlineSnapshot(`
      {
        "id": "steer-1",
        "message": {
          "content": "after the run",
          "role": "user",
        },
        "reason": "finished",
        "type": "not-delivered",
      }
    `);
  });

  it('should return the first outcome for a repeated id', async () => {
    const steering = createSteering();

    const first = steering.steer('first', { id: 'steer-1' });
    const repeated = steering.steer('retry', { id: 'steer-1' });

    expect(repeated).toBe(first);

    const run = startSteeringRun(steering)!;
    const taken = run.takeMessages();
    expect(taken).toHaveLength(1);

    run.resolveTakenMessages({ stepNumber: 1, sentMessages: taken });
    expect(await repeated).toMatchObject({
      type: 'delivered',
      stepNumber: 1,
      message: { content: 'first' },
    });
  });

  it('should generate ids when no id is provided', async () => {
    const steering = createSteering();

    const outcome = steering.steer('hello');
    const run = startSteeringRun(steering)!;
    run.resolveTakenMessages({
      stepNumber: 0,
      sentMessages: run.takeMessages(),
    });

    expect((await outcome).id).toMatch(/^steer-/);
  });

  it('should hold queued messages until they are promoted', async () => {
    const steering = createSteering();
    const run = startSteeringRun(steering)!;

    void steering.queue('first', { id: 'queued-1' });
    void steering.queue('second', { id: 'queued-2' });

    expect(run.hasPendingMessages()).toBe(false);
    expect(run.takeMessages()).toEqual([]);

    expect(run.promoteQueuedMessage()).toBe(true);
    expect(run.takeMessages()).toEqual([{ role: 'user', content: 'first' }]);
  });

  it('should return false when no message is queued', () => {
    const run = startSteeringRun(createSteering())!;

    expect(run.promoteQueuedMessage()).toBe(false);
  });

  it('should not deliver queued messages when the run ends', async () => {
    const steering = createSteering();
    const run = startSteeringRun(steering)!;

    const outcome = steering.queue('too late', { id: 'queued-1' });
    run.end('stop-condition');

    expect(await outcome).toMatchObject({
      type: 'not-delivered',
      id: 'queued-1',
      reason: 'stop-condition',
    });
  });

  it('should share ids between steered and queued messages', () => {
    const steering = createSteering();

    const steered = steering.steer('first', { id: 'message-1' });

    expect(steering.queue('retry', { id: 'message-1' })).toBe(steered);
  });

  it('should throw when the steering object is used by two runs at once', () => {
    const steering = createSteering();
    startSteeringRun(steering);

    expect(() => startSteeringRun(steering)).toThrowErrorMatchingInlineSnapshot(
      `[AI_InvalidArgumentError: Invalid argument for parameter experimental_steering: The steering object was already used by a generation. Create a new one with experimental_createSteering() for each call.]`,
    );
  });

  it('should throw when the steering object is reused after its run ended', () => {
    const steering = createSteering();
    startSteeringRun(steering)!.end('finished');

    expect(() => startSteeringRun(steering)).toThrow(
      'Create a new one with experimental_createSteering() for each call.',
    );
  });

  it('should throw for steering objects that were not created with createSteering', () => {
    expect(() =>
      startSteeringRun({
        steer: async () => undefined as never,
        queue: async () => undefined as never,
      }),
    ).toThrowErrorMatchingInlineSnapshot(
      `[AI_InvalidArgumentError: Invalid argument for parameter experimental_steering: The steering object must be created with experimental_createSteering().]`,
    );
  });

  it('should return undefined without a steering object', () => {
    expect(startSteeringRun(undefined)).toBeUndefined();
  });
});
