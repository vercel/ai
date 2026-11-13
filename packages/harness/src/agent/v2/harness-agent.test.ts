import {
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
  DelayedPromise,
  tool,
  type Context,
  type Experimental_SandboxSession as SandboxSession,
  type ToolSet,
} from '@ai-sdk/provider-utils';
import type { World } from '@workflow/world';
import type { HarnessV2 } from '../../v2/harness-v2';
import type { HarnessV2DriveContext } from '../../v2/harness-v2-drive-context';
import type { HarnessV2StreamPart } from '../../v2/harness-v2-stream-part';
import type { HarnessAgentSettings } from '../harness-agent-settings';
import { describe, expect, test, vi } from 'vitest';
import { z } from 'zod/v4';
import {
  DefaultHarnessAgentSession,
  type HarnessAgentSession,
} from './harness-agent-session';
import { HarnessAgent } from './harness-agent';
import { InMemoryWorld } from './in-memory-world';
import { createLog } from './internal/create-log';

const harness: HarnessV2 = {
  specificationVersion: 'harness-v2',
  harnessId: 'mock-v2',
  builtinTools: {},
  drive: async () => {},
};

const finishReason = { unified: 'stop' as const, raw: 'stop' };

const usage = {
  inputTokens: {
    total: 10,
    noCache: 10,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
};

/**
 * Creates a HarnessV2 adapter that runs every undelivered prompt as a turn:
 * one replay-safe model effect delivers the prompt and emits an echo of it as
 * text (plus `modelParts`), then the turn finishes with one step. The hooks
 * run before the model effect and between the model effect and the finish;
 * `afterModel` returning `'stop'` ends the drive without finishing the turn.
 */
function createFakeHarness(
  options: {
    builtinTools?: ToolSet;
    modelParts?: HarnessV2StreamPart[];
    beforeModel?: (options: {
      context: HarnessV2DriveContext;
    }) => Promise<void>;
    afterModel?: (options: {
      context: HarnessV2DriveContext;
    }) => Promise<void | 'stop'>;
  } = {},
): HarnessV2 {
  return {
    specificationVersion: 'harness-v2',
    harnessId: 'fake-v2',
    builtinTools: options.builtinTools ?? {},
    async drive({ context }) {
      const { events } = await context.log.read();
      const delivered = new Set(
        events.flatMap(event =>
          event.type === 'effect-start'
            ? event.data.deliveredSubmissionIds
            : [],
        ),
      );
      for (const event of events) {
        if (
          event.type !== 'submission' ||
          event.data.type !== 'prompt' ||
          delivered.has(event.id)
        ) {
          continue;
        }
        const { content } = event.data.message;
        await options.beforeModel?.({ context });
        const output = await context.effect({
          key: `model:${event.id}`,
          name: 'model',
          replay: 'safe',
          input: null,
          deliveredSubmissionIds: [event.id],
          fn: async ({ emit }) => {
            const text = `echo: ${typeof content === 'string' ? content : ''}`;
            emit({ type: 'text-start', id: 'text' });
            emit({ type: 'text-delta', id: 'text', delta: text });
            emit({ type: 'text-end', id: 'text' });
            for (const part of options.modelParts ?? []) emit(part);
            return text;
          },
        });
        if (output.type !== 'result') return;
        if ((await options.afterModel?.({ context })) === 'stop') return;
        await context.finishStep({ stepNumber: 0, finishReason, usage });
        await context.finishTurn({ finishReason, totalUsage: usage });
      }
    },
  };
}

const fakeHarness = createFakeHarness();

class WorkflowSerializableCallOption {
  constructor(readonly value: string) {}

  static [WORKFLOW_SERIALIZE](instance: WorkflowSerializableCallOption) {
    return { value: instance.value };
  }

  static [WORKFLOW_DESERIALIZE](data: { value: string }) {
    return new WorkflowSerializableCallOption(data.value);
  }
}

const getSandboxSession: NonNullable<
  HarnessAgentSettings<typeof harness>['getSandboxSession']
> = async ({ sandboxId: _sandboxId }) => ({}) as SandboxSession;

describe('HarnessAgent', () => {
  test('rejects a harness adapter with a different specification version', () => {
    expect(
      () =>
        new HarnessAgent({
          harness: { specificationVersion: 'harness-v1' },
        } as never),
    ).toThrow(
      'expected `harness.specificationVersion` to be `harness-v2`, received `harness-v1`',
    );
  });

  test('requires a sandbox session resolver', () => {
    expect(() => new HarnessAgent({ harness })).toThrow(
      '`getSandboxSession` is required with HarnessV2',
    );
  });

  test('rejects non-serializable call properties before doing any work', async () => {
    const agent = new HarnessAgent({ harness, getSandboxSession });

    await expect(
      agent.generate({
        prompt: 'hello',
        session: {
          sessionId: 'session-id',
          sandboxId: 'sandbox-id',
        } as HarnessAgentSession,
        onStart: () => {},
      }),
    ).rejects.toThrow('call option `onStart` must be serializable');

    await expect(
      agent.stream({
        prompt: 'hello',
        session: {
          sessionId: 'session-id',
          sandboxId: 'sandbox-id',
        } as HarnessAgentSession,
        experimental_sandbox: { readFile: async () => '' } as never,
      }),
    ).rejects.toThrow(
      'call option `experimental_sandbox` must be serializable',
    );

    const callOptions = Object.assign(Object.create({ onStart: () => {} }), {
      prompt: 'hello',
      session: {
        sessionId: 'session-id',
        sandboxId: 'sandbox-id',
      } as HarnessAgentSession,
    });
    await expect(agent.generate(callOptions as never)).rejects.toThrow(
      'call options must be serializable',
    );
  });

  test('stores the provided world', () => {
    const world = {} as World;
    const agent = new HarnessAgent({ harness, world, getSandboxSession });

    expect(agent['world']).toBe(world);
  });

  test('uses an in-memory world when no world is provided', () => {
    const agent = new HarnessAgent({ harness, getSandboxSession });

    expect(agent['world']).toBeInstanceOf(InMemoryWorld);
  });

  test('stores an explicitly provided in-memory world', () => {
    const world = new InMemoryWorld();
    const agent = new HarnessAgent({ harness, world, getSandboxSession });

    expect(agent['world']).toBe(world);
  });

  test.each([
    ['.', '.'],
    ['project', 'project'],
    ['project/app/', 'project/app/'],
    ['project//./app', 'project/app'],
    ['a/../b', 'b'],
  ])(
    'stores the sandbox work directory %j normalized as %j',
    (workDir, expected) => {
      const agent = new HarnessAgent({
        harness,
        getSandboxSession,
        sandboxConfig: { workDir },
      });

      expect(agent['sandboxConfig']).toEqual({ workDir: expected });
    },
  );

  test('leaves the work directory unset without one configured', () => {
    const agent = new HarnessAgent({
      harness,
      getSandboxSession,
      sandboxConfig: {},
    });

    expect(agent['sandboxConfig']).toEqual({});
  });

  test.each(['bootstrapHash', 'onBootstrap', 'onSession'])(
    'rejects the unsupported sandbox setting %s',
    key => {
      expect(
        () =>
          new HarnessAgent({
            harness,
            getSandboxSession,
            sandboxConfig: { workDir: 'project', [key]: undefined },
          }),
      ).toThrow(`setting \`sandboxConfig.${key}\` is not supported`);
    },
  );

  test.each([
    ['', 'must not be empty'],
    ['a\0b', 'must not contain NUL'],
    ['a\\b', 'must use POSIX path separators'],
    ['/abs', 'must be relative'],
    ['./', 'must stay inside the sandbox default working directory'],
    ['a/..', 'must stay inside the sandbox default working directory'],
    ['..', 'must stay inside the sandbox default working directory'],
    ['../outside', 'must stay inside the sandbox default working directory'],
  ])('rejects the sandbox work directory %j', (workDir, message) => {
    expect(
      () =>
        new HarnessAgent({
          harness,
          getSandboxSession,
          sandboxConfig: { workDir },
        }),
    ).toThrow(`\`sandboxConfig.workDir\` ${message}`);
  });

  test('still rejects the deprecated onSandboxSession setting', () => {
    expect(
      () =>
        new HarnessAgent({
          harness,
          getSandboxSession,
          onSandboxSession: async () => {},
        }),
    ).toThrow('setting `onSandboxSession` is not supported');
  });

  test('creates and starts a World run for a new session', async () => {
    const world = new InMemoryWorld();
    const agent = new HarnessAgent({ harness, world, getSandboxSession });

    const session = await agent.createSession({
      sessionId: 'session-id',
      sandboxId: 'sandbox-id',
    });

    expect(session.runId).toMatch(/^wrun_/);
    expect(await world.runs.get(session.runId)).toMatchObject({
      runId: session.runId,
      status: 'running',
      workflowName: 'workflow//@ai-sdk/harness//mock-v2',
    });
  });

  test("mints the run ID with the World's createRunId when available", async () => {
    const world = new InMemoryWorld();
    vi.spyOn(world, 'createRunId').mockReturnValue(
      '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    );
    const agent = new HarnessAgent({ harness, world, getSandboxSession });

    const session = await agent.createSession({ sandboxId: 'sandbox-id' });

    expect(session.runId).toBe('wrun_01ARZ3NDEKTSV4RRFFQ69G5FAV');
    expect(await world.runs.get(session.runId)).toMatchObject({
      runId: 'wrun_01ARZ3NDEKTSV4RRFFQ69G5FAV',
    });
  });

  test('mints a run ID locally when the World has no createRunId', async () => {
    const world = new InMemoryWorld();
    Object.defineProperty(world, 'createRunId', { value: undefined });
    const create = vi.spyOn(world.events, 'create');
    const agent = new HarnessAgent({ harness, world, getSandboxSession });

    const session = await agent.createSession({ sandboxId: 'sandbox-id' });

    expect(session.runId).toMatch(/^wrun_[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(create.mock.calls[0]?.[0]).toBe(session.runId);
  });

  test('restores an existing session from its run ID without writing to the World', async () => {
    const world = new InMemoryWorld();
    const agent = new HarnessAgent({ harness, world, getSandboxSession });
    const created = await agent.createSession({
      sessionId: 'session-id',
      sandboxId: 'sandbox-id',
    });
    const create = vi.spyOn(world.events, 'create');

    const restored = await agent.createSession({ runId: created.runId });

    expect(restored).toMatchObject({
      sessionId: 'session-id',
      sandboxId: 'sandbox-id',
      runId: created.runId,
    });
    expect(restored.getStreamName()).toBe(created.getStreamName());
    expect(create).not.toHaveBeenCalled();
  });

  test('rejects restoring a run that does not hold a session of its harness', async () => {
    const world = new InMemoryWorld();
    const otherAgent = new HarnessAgent({
      harness: fakeHarness,
      world,
      getSandboxSession,
    });
    const agent = new HarnessAgent({ harness, world, getSandboxSession });
    const otherSession = await otherAgent.createSession({
      sandboxId: 'sandbox-id',
    });

    await expect(
      agent.createSession({ runId: otherSession.runId }),
    ).rejects.toThrow('does not hold a session of harness `mock-v2`');
  });

  test('rejects restoring a session with a mismatching session or sandbox ID', async () => {
    const world = new InMemoryWorld();
    const agent = new HarnessAgent({ harness, world, getSandboxSession });
    const created = await agent.createSession({
      sessionId: 'session-id',
      sandboxId: 'sandbox-id',
    });

    await expect(
      agent.createSession({ runId: created.runId, sessionId: 'other' }),
    ).rejects.toThrow('`sessionId` does not match the session of the given');
    await expect(
      agent.createSession({ runId: created.runId, sandboxId: 'other' }),
    ).rejects.toThrow('`sandboxId` does not match the session of the given');
    await expect(
      agent.createSession({
        runId: created.runId,
        sandboxSession: { id: 'other' } as SandboxSession & { id: string },
      }),
    ).rejects.toThrow('`sandboxId` does not match the session of the given');
  });

  test('creates a session that retains its sandbox session', async () => {
    const sandboxSession = {} as SandboxSession;
    const agent = new HarnessAgent({ harness, getSandboxSession });

    const session = await agent.createSession({
      sessionId: 'session-id',
      sandboxId: 'sandbox-id',
      sandboxSession,
    });

    expect(session.sessionId).toBe('session-id');
    expect(session.sandboxId).toBe('sandbox-id');
    await expect(session.getSandboxSession()).resolves.toBe(sandboxSession);
  });

  test('uses a provided sandbox session before resolving it by id', async () => {
    const sandboxSession = { id: 'sandbox-id' } as SandboxSession & {
      id: string;
    };
    const resolvedSandboxSession = {} as SandboxSession;
    const resolveSandboxSession = vi.fn(async () => resolvedSandboxSession);
    const agent = new HarnessAgent({
      harness,
      world: new InMemoryWorld(),
      getSandboxSession: resolveSandboxSession,
    });

    const session = await agent.createSession({
      sessionId: 'session-id',
      sandboxId: 'sandbox-id',
      sandboxSession,
    });

    expect(session.sessionId).toBe('session-id');
    expect(session.sandboxId).toBe('sandbox-id');
    await expect(session.getSandboxSession()).resolves.toBe(sandboxSession);
    expect(resolveSandboxSession).not.toHaveBeenCalled();
  });

  test('rebinds the session resolver to the current agent on every call', async () => {
    const resolvedSandboxSession = {} as SandboxSession;
    const firstResolver = vi.fn(async () => {
      throw new Error('first agent resolver');
    });
    const currentResolver = vi.fn(async () => resolvedSandboxSession);
    const world = new InMemoryWorld();
    const firstAgent = new HarnessAgent({
      harness,
      world,
      getSandboxSession: firstResolver,
    });
    const currentAgent = new HarnessAgent({
      harness,
      world,
      getSandboxSession: currentResolver,
    });
    const session = await firstAgent.createSession({
      sessionId: 'session-id',
      sandboxId: 'sandbox-id',
    });

    await expect(
      firstAgent.generate({ prompt: 'hello', session }),
    ).rejects.toThrow('the drive ended before the turn finished');
    await expect(session.getSandboxSession()).rejects.toThrow(
      'first agent resolver',
    );
    await expect(
      currentAgent.stream({ prompt: 'hello', session }),
    ).rejects.toThrow('a turn of this session is still running');
    await expect(session.getSandboxSession()).resolves.toBe(
      resolvedSandboxSession,
    );
    expect(firstResolver).toHaveBeenCalledWith({
      sandboxId: 'sandbox-id',
      abortSignal: expect.any(AbortSignal),
    });
    expect(currentResolver).toHaveBeenCalledWith({
      sandboxId: 'sandbox-id',
      abortSignal: expect.any(AbortSignal),
    });
  });

  test('requires a stable sandbox id when creating a session without a sandbox id', async () => {
    const agent = new HarnessAgent({ harness, getSandboxSession });

    await expect(
      agent.createSession({ sandboxSession: {} as SandboxSession }),
    ).rejects.toThrow(
      'a stable `sandboxId` is required when `sandboxSession` is omitted or has no `id`',
    );
    await expect(agent.createSession({})).rejects.toThrow(
      'a stable `sandboxId` is required when `sandboxSession` is omitted or has no `id`',
    );
  });

  test('rejects a sandbox id that conflicts with the sandbox session id', async () => {
    const agent = new HarnessAgent({ harness, getSandboxSession });

    await expect(
      agent.createSession({
        sandboxId: 'provided-id',
        sandboxSession: { id: 'session-id' } as SandboxSession & {
          id: string;
        },
      }),
    ).rejects.toThrow(
      '`sandboxId` must match the sandbox session `id` when one is available',
    );
  });

  test('accepts extended serializable values in call options', async () => {
    const agent = new HarnessAgent<
      typeof fakeHarness,
      ToolSet,
      Context,
      never,
      { timestamp: Date }
    >({ harness: fakeHarness, getSandboxSession });
    const session = await agent.createSession({ sandboxId: 'sandbox-id' });

    await expect(
      agent
        .generate({
          prompt: 'hello',
          session,
          options: { timestamp: new Date() },
        })
        .then(result => result.text),
    ).resolves.toBe('echo: hello');
  });

  test('accepts class instances with a Workflow serialization hook', async () => {
    const agent = new HarnessAgent<
      typeof fakeHarness,
      ToolSet,
      Context,
      never,
      { custom: WorkflowSerializableCallOption }
    >({ harness: fakeHarness, getSandboxSession });
    const session = await agent.createSession({ sandboxId: 'sandbox-id' });

    await expect(
      agent
        .generate({
          prompt: 'hello',
          session,
          options: { custom: new WorkflowSerializableCallOption('value') },
        })
        .then(result => result.text),
    ).resolves.toBe('echo: hello');
  });
});

describe('HarnessAgent turns', () => {
  async function setup(
    options: {
      harness?: HarnessV2;
      world?: InMemoryWorld;
      tools?: ToolSet;
    } = {},
  ) {
    const world = options.world ?? new InMemoryWorld();
    const agent = new HarnessAgent({
      harness: options.harness ?? fakeHarness,
      world,
      getSandboxSession,
      tools: options.tools ?? {},
    });
    const session = await agent.createSession({ sandboxId: 'sandbox-id' });
    return { world, agent, session };
  }

  async function readPartTypes(
    stream: AsyncIterable<{ type: string }>,
  ): Promise<string[]> {
    const types: string[] = [];
    for await (const part of stream) types.push(part.type);
    return types;
  }

  test('streams a turn from start to finish', async () => {
    const { agent, session } = await setup();

    const result = await agent.stream({ prompt: 'hello', session });

    expect(await readPartTypes(result.fullStream)).toEqual([
      'start',
      'start-step',
      'text-start',
      'text-delta',
      'text-end',
      'finish-step',
      'finish',
    ]);
    expect(await result.text).toBe('echo: hello');
    expect(await result.finishReason).toBe('stop');
  });

  test('generates a turn and resolves with its steps', async () => {
    const { agent, session } = await setup();

    const result = await agent.generate({
      messages: [
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'ignored' },
        { role: 'user', content: 'second' },
      ],
      session,
    });

    expect(result.text).toBe('echo: second');
    expect(result.steps).toHaveLength(1);
    expect(result.finishReason).toBe('stop');
    expect(result.totalUsage.inputTokens).toBe(10);
  });

  test('rejects a call while a call for the session is in progress', async () => {
    const { agent, session } = await setup();

    const [first, second] = await Promise.allSettled([
      agent.stream({ prompt: 'one', session }),
      agent.stream({ prompt: 'two', session }),
    ]);

    expect(first.status).toBe('fulfilled');
    expect(second).toMatchObject({
      status: 'rejected',
      reason: expect.objectContaining({
        message: expect.stringContaining(
          'a turn of this session is still running',
        ),
      }),
    });
    if (first.status === 'fulfilled') {
      expect(await first.value.text).toBe('echo: one');
    }
  });

  test('rejects a call while the log shows an unfinished turn', async () => {
    const world = new InMemoryWorld();
    const first = await setup({ world });
    const session = first.session;
    await createLog({ world, runId: session.runId }).append({
      type: 'submission',
      id: 'waiting',
      data: {
        type: 'prompt',
        message: { role: 'user', content: 'waiting' },
        settings: { skills: [], tools: [] },
      },
    });

    await expect(
      first.agent.generate({ prompt: 'hello', session }),
    ).rejects.toThrow('a turn of this session is still running');
  });

  test('runs a session in later calls', async () => {
    const { agent, session } = await setup();

    await agent.generate({ prompt: 'one', session });
    const result = await agent.generate({ prompt: 'two', session });

    expect(result.text).toBe('echo: two');
  });

  test('executes user tools through executeHostTool', async () => {
    const tools = {
      weather: tool({
        inputSchema: z.object({ city: z.string() }),
        execute: async ({ city }: { city: string }) => ({
          city,
          temperature: 20,
        }),
      }),
    };
    const harness = createFakeHarness({
      modelParts: [
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'weather',
          input: '{"city":"Berlin"}',
        },
      ],
      afterModel: async ({ context }) => {
        await context.executeHostTool({
          toolCallId: 'call-1',
          toolName: 'weather',
          input: { city: 'Berlin' },
        });
      },
    });
    const { agent, session } = await setup({ harness, tools });

    const result = await agent.generate({ prompt: 'weather?', session });

    expect(result.toolCalls).toMatchObject([
      { toolCallId: 'call-1', toolName: 'weather', input: { city: 'Berlin' } },
    ]);
    expect(result.toolResults).toMatchObject([
      {
        toolCallId: 'call-1',
        toolName: 'weather',
        output: { city: 'Berlin', temperature: 20 },
      },
    ]);
  });

  test('finishes a started turn with an error when the adapter throws', async () => {
    const harness = createFakeHarness({
      afterModel: async () => {
        throw new Error('adapter failed');
      },
    });
    const { agent, session } = await setup({ harness });

    const result = await agent.stream({ prompt: 'hello', session });
    expect(await readPartTypes(result.fullStream)).toEqual([
      'start',
      'start-step',
      'text-start',
      'text-delta',
      'text-end',
      'error',
      'finish',
    ]);

    await expect(agent.generate({ prompt: 'again', session })).rejects.toThrow(
      'adapter failed',
    );
  });

  test('reports the exact adapter error when the adapter throws before the turn started', async () => {
    const error = new Error('adapter failed early');
    const harness = createFakeHarness({
      beforeModel: async () => {
        throw error;
      },
    });

    const generating = await setup({ harness });
    await expect(
      generating.agent.generate({
        prompt: 'hello',
        session: generating.session,
      }),
    ).rejects.toBe(error);

    const streaming = await setup({ harness });
    const result = await streaming.agent.stream({
      prompt: 'hello',
      session: streaming.session,
    });
    const errors: unknown[] = [];
    for await (const part of result.fullStream) {
      if (part.type === 'error') errors.push(part.error);
    }
    expect(errors).toEqual([error]);
    expect(errors[0]).toBe(error);
  });

  test('ends the result without a finish part when the drive yields', async () => {
    const world = new InMemoryWorld();
    (
      world as { getRuntimeDeadline: () => Promise<Date | undefined> }
    ).getRuntimeDeadline = async () => new Date(Date.now() + 15_200);
    const harness = createFakeHarness({
      afterModel: async ({ context }) => {
        await new Promise(resolve =>
          context.yieldAbortSignal.addEventListener('abort', resolve, {
            once: true,
          }),
        );
        const output = await context.effect({
          key: 'after-yield',
          name: 'tool',
          replay: 'safe',
          input: null,
          fn: async () => 'unexpected',
        });
        expect(output).toEqual({ type: 'interrupted', retryable: true });
        return 'stop';
      },
    });
    const { agent, session } = await setup({ harness, world });

    const result = await agent.stream({ prompt: 'hello', session });

    expect(await readPartTypes(result.fullStream)).toEqual([
      'start',
      'start-step',
      'text-start',
      'text-delta',
      'text-end',
    ]);
  });

  test('ends only the call when its abort signal fires', async () => {
    const release = new DelayedPromise<void>();
    const harness = createFakeHarness({
      afterModel: () => release.promise,
    });
    const { world, agent, session } = await setup({ harness });
    const abortController = new AbortController();

    const result = await agent.stream({
      prompt: 'hello',
      session,
      abortSignal: abortController.signal,
    });
    const types: string[] = [];
    for await (const part of result.fullStream) {
      types.push(part.type);
      if (part.type === 'text-end') abortController.abort();
    }

    expect(types.at(-1)).toBe('abort');
    expect(types).not.toContain('finish');
    release.resolve();
    await vi.waitFor(async () => {
      const { events } = await createLog({
        world,
        runId: session.runId,
      }).read({ types: ['finish-turn'] });
      expect(events).toHaveLength(1);
    });
  });

  test('records an approved built-in tool call that never ended as interrupted', async () => {
    const harness = createFakeHarness({
      builtinTools: {
        Bash: tool({ inputSchema: z.object({ command: z.string() }) }),
      },
      afterModel: async ({ context }) => {
        const gate = await context.gateBuiltinTool({
          toolCallId: 'call-1',
          toolName: 'Bash',
          input: { command: 'ls' },
        });
        expect(gate.type).toBe('approved');
      },
    });
    const { world, agent, session } = await setup({ harness });

    await agent.generate({ prompt: 'hello', session });

    await vi.waitFor(async () => {
      const { events } = await createLog({
        world,
        runId: session.runId,
      }).read({ types: ['effect-end'] });
      expect(
        events.flatMap(event =>
          event.type === 'effect-end' ? [event.data.output] : [],
        ),
      ).toContainEqual(expect.objectContaining({ type: 'interrupted' }));
    });
  });

  test('rejects unsupported call options', async () => {
    const { agent, session } = await setup();

    await expect(
      agent.generate({ prompt: 'hello', session, temperature: 1 } as never),
    ).rejects.toThrow('call option `temperature` is not supported');
  });
});

describe('HarnessAgent crash recovery', () => {
  /**
   * Creates a HarnessV2 adapter that runs the latest prompt without a later
   * `finish-turn` as a turn: one replay-safe model effect, whose callback is
   * `model`, delivers the prompt, then the turn finishes with one step.
   */
  function createRecoverableHarness(options: {
    model: (options: {
      emit: (part: HarnessV2StreamPart) => void;
    }) => Promise<string>;
  }): HarnessV2 {
    return {
      specificationVersion: 'harness-v2',
      harnessId: 'fake-v2',
      builtinTools: {},
      async drive({ context }) {
        const { events } = await context.log.read();
        let promptId: string | undefined;
        for (const event of events) {
          if (event.type === 'finish-turn') promptId = undefined;
          if (event.type === 'submission' && event.data.type === 'prompt') {
            promptId = event.id;
          }
        }
        if (promptId == null) return;
        const output = await context.effect({
          key: `model:${promptId}`,
          name: 'model',
          replay: 'safe',
          input: null,
          deliveredSubmissionIds: [promptId],
          fn: ({ emit }) => options.model({ emit }),
        });
        if (output.type !== 'result') return;
        await context.finishStep({ stepNumber: 0, finishReason, usage });
        await context.finishTurn({ finishReason, totalUsage: usage });
      },
    };
  }

  /**
   * Creates a harness whose first model call emits partial text and then
   * blocks until `release` resolves, and whose later calls emit `Recovered`.
   */
  function createBlockingHarness() {
    const started = new DelayedPromise<void>();
    const release = new DelayedPromise<string>();
    let calls = 0;
    const harness = createRecoverableHarness({
      model: async ({ emit }) => {
        calls++;
        if (calls === 1) {
          emit({ type: 'text-start', id: 'cut' });
          emit({ type: 'text-delta', id: 'cut', delta: 'Cut off' });
          started.resolve();
          return release.promise;
        }
        emit({ type: 'text-start', id: 'retry' });
        emit({ type: 'text-delta', id: 'retry', delta: 'Recovered' });
        emit({ type: 'text-end', id: 'retry' });
        return 'Recovered';
      },
    });
    return { harness, started, release };
  }

  /**
   * Copies the session's run into a new world, as seen by another process.
   */
  async function copyWorld(options: { world: InMemoryWorld; runId: string }) {
    const copy = new InMemoryWorld();
    await copy.seed({
      runId: options.runId,
      data: await options.world.export({ runId: options.runId }),
    });
    return copy;
  }

  test('recovers a turn whose drive recorded its crash in a later drive', async () => {
    const { harness, started, release } = createBlockingHarness();
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    try {
      const world = new InMemoryWorld();
      const agent = new HarnessAgent({ harness, world, getSandboxSession });
      const session = await agent.createSession({ sandboxId: 'sandbox-id' });
      await agent.stream({ prompt: 'hello', session });
      await started.promise;

      await agent.experimental_crash({ session, recordCrash: true });
      await vi.waitFor(() =>
        expect(kill).toHaveBeenCalledWith(process.pid, 'SIGKILL'),
      );

      const recoveryWorld = await copyWorld({ world, runId: session.runId });
      const recoveryAgent = new HarnessAgent({
        harness,
        world: recoveryWorld,
        getSandboxSession,
      });
      const restored = await recoveryAgent.createSession({
        runId: session.runId,
      });
      const reading = await recoveryAgent.readStream({ session: restored });
      await recoveryAgent.drive({ session: restored });

      expect(await reading.text).toBe('Recovered');
      const { events } = await createLog({
        world: recoveryWorld,
        runId: session.runId,
      }).read({ types: ['drive-crash', 'effect-end', 'finish-turn'] });
      expect(events.map(event => event.type)).toEqual([
        'drive-crash',
        'effect-end',
        'effect-end',
        'finish-turn',
      ]);
      expect(events[1].data).toMatchObject({
        output: { type: 'interrupted', retryable: true },
      });

      const finished = await recoveryAgent.readStream({ session: restored });
      const chunks: string[] = [];
      for await (const chunk of finished.toUIMessageStream()) {
        chunks.push(
          chunk.type === 'text-delta'
            ? `text-delta:${chunk.delta}`
            : chunk.type,
        );
      }
      expect(chunks).toEqual([
        'start',
        'start-step',
        'text-start',
        'text-delta:Cut off',
        'reset-step',
        'text-start',
        'text-delta:Recovered',
        'text-end',
        'finish-step',
        'finish',
      ]);
    } finally {
      release.resolve('late');
      kill.mockRestore();
    }
  });

  test('recovers a turn whose drive crashed without a record under a redelivery of its queue message', async () => {
    const { harness, started, release } = createBlockingHarness();
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    try {
      const world = new InMemoryWorld();
      const agent = new HarnessAgent({ harness, world, getSandboxSession });
      const session = await agent.createSession({ sandboxId: 'sandbox-id' });
      await createLog({ world, runId: session.runId }).append({
        type: 'submission',
        id: 'prompt',
        data: {
          type: 'prompt',
          message: { role: 'user', content: 'hello' },
          settings: { skills: [], tools: [] },
        },
      });
      void agent.drive({ session, queueMessageId: 'message' });
      await started.promise;

      await agent.experimental_crash({ session });
      await vi.waitFor(() =>
        expect(kill).toHaveBeenCalledWith(process.pid, 'SIGKILL'),
      );

      const recoveryWorld = await copyWorld({ world, runId: session.runId });
      const recoveryAgent = new HarnessAgent({
        harness,
        world: recoveryWorld,
        getSandboxSession,
      });
      const restored = await recoveryAgent.createSession({
        runId: session.runId,
      });
      const log = createLog({ world: recoveryWorld, runId: session.runId });
      const before = (await log.read()).events;

      await recoveryAgent.drive({
        session: restored,
        queueMessageId: 'other-message',
      });
      expect((await log.read()).events).toEqual(before);

      const reading = await recoveryAgent.readStream({ session: restored });
      await recoveryAgent.drive({
        session: restored,
        queueMessageId: 'message',
      });

      expect(await reading.text).toBe('Recovered');
      const { events } = await log.read({
        types: ['drive-start', 'drive-crash', 'effect-end', 'finish-turn'],
      });
      expect(events.map(event => event.type)).toEqual([
        'drive-start',
        'drive-start',
        'effect-end',
        'effect-end',
        'finish-turn',
      ]);
      expect(events[0].data).toMatchObject({ queueMessageId: 'message' });
      expect(events[2].data).toMatchObject({
        output: { type: 'interrupted', retryable: true },
      });
    } finally {
      release.resolve('late');
      kill.mockRestore();
    }
  });

  test('leaves the session unchanged while the drive of unfinished attempts is not provably gone', async () => {
    const { harness, started, release } = createBlockingHarness();
    try {
      const world = new InMemoryWorld();
      const agent = new HarnessAgent({ harness, world, getSandboxSession });
      const session = await agent.createSession({ sandboxId: 'sandbox-id' });
      await agent.stream({ prompt: 'hello', session });
      await started.promise;

      const otherWorld = await copyWorld({ world, runId: session.runId });
      const otherAgent = new HarnessAgent({
        harness,
        world: otherWorld,
        getSandboxSession,
      });
      const restored = await otherAgent.createSession({ runId: session.runId });
      const log = createLog({ world: otherWorld, runId: session.runId });
      const before = (await log.read()).events;

      await otherAgent.drive({ session: restored });

      expect((await log.read()).events).toEqual(before);
    } finally {
      release.resolve('late');
    }
  });

  test('does nothing when a drive of the session runs in this process', async () => {
    const { harness, started, release } = createBlockingHarness();
    const world = new InMemoryWorld();
    const agent = new HarnessAgent({ harness, world, getSandboxSession });
    const session = await agent.createSession({ sandboxId: 'sandbox-id' });
    await agent.stream({ prompt: 'hello', session });
    await started.promise;

    await agent.drive({ session });

    const { events } = await createLog({ world, runId: session.runId }).read({
      types: ['drive-start'],
    });
    expect(events).toHaveLength(1);
    release.resolve('done');
  });

  test('starts the turn of a prompt that has not started one', async () => {
    const harness = createRecoverableHarness({ model: async () => 'done' });
    const world = new InMemoryWorld();
    const agent = new HarnessAgent({ harness, world, getSandboxSession });
    const session = await agent.createSession({ sandboxId: 'sandbox-id' });
    const log = createLog({ world, runId: session.runId });
    await log.append({
      type: 'submission',
      id: 'prompt',
      data: {
        type: 'prompt',
        message: { role: 'user', content: 'hello' },
        settings: { skills: [], tools: [] },
      },
    });

    await agent.drive({ session });

    expect(
      (await log.read({ types: ['finish-turn'] })).events.map(
        event => event.type === 'finish-turn' && event.data.turnId,
      ),
    ).toEqual(['prompt']);
  });

  test('drives nothing without a turn or a prompt to run', async () => {
    const world = new InMemoryWorld();
    const agent = new HarnessAgent({
      harness: fakeHarness,
      world,
      getSandboxSession,
    });
    const session = await agent.createSession({ sandboxId: 'sandbox-id' });

    await agent.drive({ session });

    expect(
      (await createLog({ world, runId: session.runId }).read()).events,
    ).toEqual([]);
  });

  test('reads a finished latest turn from the stream', async () => {
    const world = new InMemoryWorld();
    const agent = new HarnessAgent({
      harness: fakeHarness,
      world,
      getSandboxSession,
    });
    const session = await agent.createSession({ sandboxId: 'sandbox-id' });
    await agent.generate({ prompt: 'first', session });
    await agent.generate({ prompt: 'second', session });

    const result = await agent.readStream({ session });

    expect(await result.text).toBe('echo: second');
  });

  test('rejects reading a session without a turn', async () => {
    const world = new InMemoryWorld();
    const agent = new HarnessAgent({
      harness: fakeHarness,
      world,
      getSandboxSession,
    });
    const session = await agent.createSession({ sandboxId: 'sandbox-id' });

    await expect(agent.readStream({ session })).rejects.toThrow(
      'the session has no turn',
    );
  });

  test('rejects a crash without a current drive', async () => {
    const world = new InMemoryWorld();
    const agent = new HarnessAgent({
      harness: fakeHarness,
      world,
      getSandboxSession,
    });
    const session = await agent.createSession({ sandboxId: 'sandbox-id' });

    await expect(agent.experimental_crash({ session })).rejects.toThrow(
      'there is no current drive to crash',
    );
    await agent.generate({ prompt: 'hello', session });
    await expect(agent.experimental_crash({ session })).rejects.toThrow(
      'there is no current drive to crash',
    );
    expect(
      (
        await createLog({ world, runId: session.runId }).read({
          types: ['crash-request'],
        })
      ).events,
    ).toEqual([]);
  });

  test.each([{ recordCrash: false }, { recordCrash: true }])(
    'rejects a crash once a crash of the current drive was requested (recordCrash: $recordCrash)',
    async ({ recordCrash }) => {
      const { harness, started, release } = createBlockingHarness();
      const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
      try {
        const world = new InMemoryWorld();
        const agent = new HarnessAgent({ harness, world, getSandboxSession });
        const session = await agent.createSession({ sandboxId: 'sandbox-id' });
        await agent.stream({ prompt: 'hello', session });
        await started.promise;
        await agent.experimental_crash({ session, recordCrash });
        await vi.waitFor(() => expect(kill).toHaveBeenCalled());

        await expect(agent.experimental_crash({ session })).rejects.toThrow(
          'there is no current drive to crash',
        );
        const { events } = await createLog({
          world,
          runId: session.runId,
        }).read({ types: ['crash-request', 'drive-crash'] });
        expect(events.map(event => event.type)).toEqual(
          recordCrash ? ['crash-request', 'drive-crash'] : ['crash-request'],
        );
      } finally {
        release.resolve('late');
        kill.mockRestore();
      }
    },
  );
});
