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
    expect(run.takeMessages(0)).toMatchInlineSnapshot(`
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
    expect(run.takeMessages(1)).toHaveLength(1);
    expect(await repeated).toMatchObject({
      type: 'delivered',
      stepNumber: 1,
      message: { content: 'first' },
    });
  });

  it('should generate ids when no id is provided', async () => {
    const steering = createSteering();

    const outcome = steering.steer('hello');
    startSteeringRun(steering)!.takeMessages(0);

    expect((await outcome).id).toMatch(/^steer-/);
  });

  it('should throw for messages that are not user messages', () => {
    const steering = createSteering();

    expect(() =>
      steering.steer({ role: 'assistant', content: 'hello' } as never),
    ).toThrowErrorMatchingInlineSnapshot(
      `[AI_InvalidArgumentError: Invalid argument for parameter message: Steering messages must be user messages.]`,
    );
  });

  it('should throw when the steering object is used by two runs at once', () => {
    const steering = createSteering();
    startSteeringRun(steering);

    expect(() => startSteeringRun(steering)).toThrowErrorMatchingInlineSnapshot(
      `[AI_InvalidArgumentError: Invalid argument for parameter experimental_steering: The steering object is already used by a running generation.]`,
    );
  });

  it('should allow a new run after the previous run ended', async () => {
    const steering = createSteering();
    startSteeringRun(steering)!.end('finished');

    const run = startSteeringRun(steering)!;
    const outcome = steering.steer('next run', { id: 'steer-1' });
    run.takeMessages(0);

    expect(await outcome).toMatchObject({ type: 'delivered', stepNumber: 0 });
  });

  it('should throw for steering objects that were not created with createSteering', () => {
    expect(() =>
      startSteeringRun({ steer: async () => undefined as never }),
    ).toThrowErrorMatchingInlineSnapshot(
      `[AI_InvalidArgumentError: Invalid argument for parameter experimental_steering: The steering object must be created with experimental_createSteering().]`,
    );
  });

  it('should return undefined without a steering object', () => {
    expect(startSteeringRun(undefined)).toBeUndefined();
  });
});
