import { MessageId, type World } from '@workflow/world';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { registerDurableHarnessAgent } from '../durable-agent-registry';
import {
  connectDurableHarnessAgentQueue,
  createDurableHarnessAgentQueueHandler,
  sendDurableHarnessAgentBackstop,
} from './durable-agent-queue';

type QueueCallback = Parameters<World['createQueueHandler']>[1];

/**
 * Creates a World whose queue handler hands the callback it was created
 * with to the test, which delivers queue jobs by calling it.
 */
function createWorld() {
  let callback: QueueCallback | undefined;
  const world = {
    // oxlint-disable-next-line ai-sdk/require-object-parameter -- `World` queue-handler signature.
    createQueueHandler: vi.fn((_prefix: string, handler: QueueCallback) => {
      callback = handler;
      return async () => new Response(null, { status: 200 });
    }),
    registerHandler: vi.fn(),
    registerRoute: vi.fn(),
    start: vi.fn(async () => {}),
  } as never as World;
  return {
    world,
    deliver: (options: { payload: unknown; queueName: string }) => {
      if (callback == null) throw new Error('No queue handler was created.');
      return callback(options.payload, {
        attempt: 1,
        queueName: options.queueName,
        messageId: MessageId.parse('msg_1'),
      });
    },
  };
}

/*
 * Runs before any test of this file registers a durable agent, since the
 * registry is process-wide.
 */
describe('createDurableHarnessAgentQueueHandler', () => {
  test('responds with 503 while no durable agent is registered', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const response = await createDurableHarnessAgentQueueHandler()(
        new Request('http://localhost/.well-known/harness-agent/v1/flow', {
          method: 'POST',
        }),
      );

      expect(response.status).toBe(503);
    } finally {
      warn.mockRestore();
    }
  });
});

describe('sendDurableHarnessAgentBackstop', () => {
  test('sends the queue job on the agent queue name, delayed past the runtime deadline', async () => {
    const queue = vi.fn(async () => ({ messageId: 'msg_1' }));
    const world = {
      queue,
      getRuntimeDeadline: async () => new Date(Date.now() + 30_000),
    } as never as World;

    expect(
      await sendDurableHarnessAgentBackstop({
        world,
        queueJob: { runId: 'wrun_1', agentId: 'support' },
      }),
    ).toBe(true);
    expect(queue).toHaveBeenCalledWith(
      '__harnessagent_wkf_workflow_workflow//@ai-sdk/harness//support',
      { runId: 'wrun_1' },
      { delaySeconds: 35 },
    );
  });

  test('sends nothing without a runtime deadline', async () => {
    const queue = vi.fn();
    const world = { queue } as never as World;

    expect(
      await sendDurableHarnessAgentBackstop({
        world,
        queueJob: { runId: 'wrun_1', agentId: 'support' },
      }),
    ).toBe(false);
    expect(queue).not.toHaveBeenCalled();
  });
});

describe('connectDurableHarnessAgentQueue', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const prefix = '__harnessagent_wkf_workflow_';

  test('registers only the handler by default, then starts the World', () => {
    const { world } = createWorld();

    connectDurableHarnessAgentQueue({ world });

    expect(world.registerHandler).toHaveBeenCalledWith(
      prefix,
      expect.any(Function),
    );
    expect(world.registerRoute).not.toHaveBeenCalled();
    expect(world.start).toHaveBeenCalledTimes(1);
  });

  test('registers only the route with `route` delivery', () => {
    vi.stubEnv('AI_SDK_DURABLE_HARNESS_AGENT_QUEUE_DELIVERY', 'route');
    const { world } = createWorld();

    connectDurableHarnessAgentQueue({ world });

    expect(world.registerHandler).not.toHaveBeenCalled();
    expect(world.registerRoute).toHaveBeenCalledWith(
      prefix,
      '/.well-known/harness-agent/v1/flow',
    );
  });

  test('registers the handler and the route at its configured path with `both` delivery', () => {
    vi.stubEnv('AI_SDK_DURABLE_HARNESS_AGENT_QUEUE_DELIVERY', 'both');
    vi.stubEnv(
      'AI_SDK_DURABLE_HARNESS_AGENT_QUEUE_HANDLER_ROUTE',
      '/api/harness-queue',
    );
    const { world } = createWorld();

    connectDurableHarnessAgentQueue({ world });

    expect(world.registerHandler).toHaveBeenCalledWith(
      prefix,
      expect.any(Function),
    );
    expect(world.registerRoute).toHaveBeenCalledWith(
      prefix,
      '/api/harness-queue',
    );
  });

  test('connects a World only once', () => {
    const { world } = createWorld();

    connectDurableHarnessAgentQueue({ world });
    connectDurableHarnessAgentQueue({ world });

    expect(world.registerHandler).toHaveBeenCalledTimes(1);
    expect(world.start).toHaveBeenCalledTimes(1);
  });

  test('rejects an unknown delivery without connecting the World', () => {
    vi.stubEnv('AI_SDK_DURABLE_HARNESS_AGENT_QUEUE_DELIVERY', 'http');
    const { world } = createWorld();

    expect(() => connectDurableHarnessAgentQueue({ world })).toThrow(
      'AI_SDK_DURABLE_HARNESS_AGENT_QUEUE_DELIVERY must be `handler`, `route` or `both`, received `http`.',
    );
    expect(world.registerHandler).not.toHaveBeenCalled();
    expect(world.start).not.toHaveBeenCalled();
  });
});

describe('queue jobs', () => {
  const queueName =
    '__harnessagent_wkf_workflow_workflow//@ai-sdk/harness//queue-job-agent';

  function setup() {
    const { world, deliver } = createWorld();
    const session = { runId: 'wrun_1' };
    const createSession = vi.fn(async () => session);
    const drive = vi.fn(async () => {});
    registerDurableHarnessAgent({
      id: 'queue-job-agent',
      world,
      createSession: createSession as never,
      drive,
    });
    connectDurableHarnessAgentQueue({ world });
    return { world, deliver, session, createSession, drive };
  }

  test('drives the session of the agent named by the queue name under the queue job id', async () => {
    const { deliver, session, createSession, drive } = setup();

    expect(
      await deliver({ payload: { runId: 'wrun_1' }, queueName }),
    ).toBeUndefined();
    expect(createSession).toHaveBeenCalledWith({ runId: 'wrun_1' });
    expect(drive).toHaveBeenCalledWith({ session, queueJobId: 'msg_1' });
  });

  test('ignores the fields that recovery adds to the payload', async () => {
    const { deliver, createSession } = setup();

    await deliver({
      payload: { runId: 'wrun_1', runSpecVersion: 9, recovery: true },
      queueName,
    });

    expect(createSession).toHaveBeenCalledWith({ runId: 'wrun_1' });
  });

  test('asks for redelivery when no agent is registered under the agent id', async () => {
    const { deliver, createSession } = setup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(
        await deliver({
          payload: { runId: 'wrun_1' },
          queueName:
            '__harnessagent_wkf_workflow_workflow//@ai-sdk/harness//unknown-agent',
        }),
      ).toEqual({ timeoutSeconds: 5 });
    } finally {
      warn.mockRestore();
    }
    expect(createSession).not.toHaveBeenCalled();
  });

  test.each([
    { case: 'a payload without a run id', payload: {}, queueName },
    { case: 'a payload that is not an object', payload: 'wrun_1', queueName },
    {
      case: 'a queue name without an agent id',
      payload: { runId: 'wrun_1' },
      queueName: '__harnessagent_wkf_workflow_workflow//@ai-sdk/harness//',
    },
    {
      case: 'a queue name of another workflow',
      payload: { runId: 'wrun_1' },
      queueName: '__harnessagent_wkf_workflow_workflow//other//agent',
    },
  ])('ignores $case', async ({ payload, queueName }) => {
    const { deliver, createSession } = setup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(await deliver({ payload, queueName })).toBeUndefined();
    } finally {
      warn.mockRestore();
    }
    expect(createSession).not.toHaveBeenCalled();
  });
});
