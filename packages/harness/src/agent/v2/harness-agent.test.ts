import {
  convertBase64ToUint8Array,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
  DelayedPromise,
  tool,
  type Context,
  type Experimental_SandboxSession as SandboxSession,
  type ToolSet,
} from '@ai-sdk/provider-utils';
import type { World } from '@workflow/world';
import { HarnessAdapterContractError } from '../../errors/harness-adapter-contract-error';
import { HarnessCancellationError } from '../../errors/harness-cancellation-error';
import { HarnessCapabilityUnsupportedError } from '../../errors/harness-capability-unsupported-error';
import type { HarnessV2 } from '../../v2/harness-v2';
import type { HarnessV2BuiltinToolSet } from '../../v2/harness-v2-builtin-tool';
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
import {
  createLog,
  decodeLogEvent,
  type HarnessAgentLogEvent,
} from './internal/create-log';
import { createStorageEncryption } from './internal/create-storage-encryption';
import { HarnessStorageEncryptionError } from './internal/errors';

/**
 * Reads the agent log events of a session stored in the World, in log order,
 * keeping the first event of each ID.
 */
async function readLogEvents(options: {
  world: World;
  runId: string;
  types?: HarnessAgentLogEvent['type'][];
}): Promise<HarnessAgentLogEvent[]> {
  const { data } = await options.world.events.list({
    runId: options.runId,
    pagination: { sortOrder: 'asc', limit: 10_000 },
    resolveData: 'all',
  });
  const events: HarnessAgentLogEvent[] = [];
  const ids = new Set<string>();
  for (const worldEvent of data) {
    const event = await decodeLogEvent({ encryption, event: worldEvent });
    if (event == null || ids.has(event.id)) continue;
    ids.add(event.id);
    if (options.types == null || options.types.includes(event.type)) {
      events.push(event);
    }
  }
  return events;
}

const encryption = {
  encrypt: async ({ data }: { data: Uint8Array }) => data,
  decrypt: async ({ data }: { data: Uint8Array }) => data,
};

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
    builtinTools?: HarnessV2BuiltinToolSet;
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
      for (const event of context.log.getUndeliveredSubmissions()) {
        if (event.data.type !== 'prompt') continue;
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

/**
 * Name of `HarnessCapabilityUnsupportedError`, asserted by name because the
 * HarnessV2 entrypoints must not import from parent directories.
 */
const capabilityErrorName = 'AI_HarnessCapabilityUnsupportedError';

/**
 * Returns the error thrown by the given synchronous function.
 */
function captureError(fn: () => unknown): Error {
  try {
    fn();
  } catch (error) {
    return error as Error;
  }
  throw new Error('expected the call to throw');
}

describe('HarnessAgent', () => {
  test('copies static MCP settings into persisted submissions', async () => {
    const mcpServers = {
      remote: {
        url: 'https://mcp.example.com',
        headers: { authorization: 'secret' },
      },
    };
    let received: unknown;
    const agent = new HarnessAgent({
      harness: createFakeHarness({
        beforeModel: async ({ context }) => {
          received = context.log.getUndeliveredSubmissions()[0].data;
        },
      }),
      getSandboxSession,
      mcpServers,
    });
    mcpServers.remote.headers.authorization = 'changed';
    const session = await agent.createSession({ sandboxId: 'sandbox' });
    await agent.generate({ session, prompt: 'hello' });
    expect((received as { settings: unknown }).settings).toEqual({
      skills: [],
      tools: [],
      mcpServers: {
        remote: {
          url: 'https://mcp.example.com',
          headers: { authorization: 'secret' },
        },
      },
    });
  });

  test.each([
    { url: '' },
    { command: 'server', type: 'stdio' },
    { url: 'https://secret.example', type: 'sse' },
  ])('rejects unsupported MCP configuration without exposing it', config => {
    expect(
      () =>
        new HarnessAgent({
          harness,
          getSandboxSession,
          mcpServers: { remote: config as never },
        }),
    ).toThrow('must contain Streamable HTTP servers with a URL');
  });

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
    const agent = new HarnessAgent({
      id: 'stores-the-provided-world',
      harness,
      world,
      getSandboxSession,
    });

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

  test.each([
    ['a boolean', true],
    ['a function', async () => true],
  ])(
    'rejects a host tool whose approval requirement is %s',
    (_kind, needsApproval) => {
      const error = captureError(
        () =>
          new HarnessAgent({
            harness,
            getSandboxSession,
            tools: {
              deleteFile: tool({
                inputSchema: z.object({ path: z.string() }),
                needsApproval,
                execute: async () => 'deleted',
              }),
            },
          }),
      );

      expect(error.name).toBe(capabilityErrorName);
      expect(error.message).toContain(
        '`needsApproval` is not supported with HarnessV2',
      );
    },
  );

  test('names every host tool that requires approval', () => {
    expect(
      () =>
        new HarnessAgent({
          harness,
          getSandboxSession,
          tools: {
            deleteFile: tool({
              inputSchema: z.object({ path: z.string() }),
              needsApproval: true,
              execute: async () => 'deleted',
            }),
            sendEmail: tool({
              inputSchema: z.object({ to: z.string() }),
              needsApproval: true,
              execute: async () => 'sent',
            }),
          },
        }),
    ).toThrow("remove it from tools 'deleteFile', 'sendEmail'");
  });

  test('accepts built-in tools without approval requirements', () => {
    const agent = new HarnessAgent({
      harness: {
        ...harness,
        builtinTools: { bash: { inputSchema: z.object({}) } },
      },
      getSandboxSession,
    });

    expect(Object.keys(agent.tools)).toContain('bash');
  });

  test('rejects user tools with the names of built-in tools', () => {
    expect(
      () =>
        new HarnessAgent({
          /*
           * Typed as the generic `HarnessV2`, which does not declare its
           * built-in tool names, so only the runtime check rejects the tools.
           */
          harness: {
            ...harness,
            builtinTools: {
              writeFile: { inputSchema: z.object({}) },
              readFile: { inputSchema: z.object({}) },
            },
          } as HarnessV2,
          getSandboxSession,
          tools: {
            writeFile: tool({ inputSchema: z.object({}) }),
            readFile: tool({ inputSchema: z.object({}) }),
            weather: tool({ inputSchema: z.object({}) }),
          },
        }),
    ).toThrow(
      "HarnessAgent: tools 'writeFile', 'readFile' have the name of a built-in tool of harness 'mock-v2'; rename them.",
    );
  });

  test('accepts toolApproval statuses for its own tools', () => {
    expect(
      () =>
        new HarnessAgent({
          harness,
          getSandboxSession,
          tools: {
            deleteFile: tool({ inputSchema: z.object({}) }),
            readFile: tool({ inputSchema: z.object({}) }),
          },
          toolApproval: {
            deleteFile: 'user-approval',
            readFile: { type: 'approved', reason: 'Reads are safe.' },
          },
        }),
    ).not.toThrow();
  });

  test('rejects a toolApproval function', () => {
    const error = captureError(
      () =>
        new HarnessAgent({
          harness,
          getSandboxSession,
          toolApproval: (() => 'user-approval') as never,
        }),
    );

    expect(error.name).toBe(capabilityErrorName);
    expect(error.message).toContain(
      'a `toolApproval` function is not supported with HarnessV2',
    );
  });

  test('rejects toolApproval entries for unknown tools and invalid statuses', () => {
    expect(
      () =>
        new HarnessAgent({
          harness,
          getSandboxSession,
          toolApproval: { deleteFile: 'user-approval' },
        }),
    ).toThrow("`toolApproval` names 'deleteFile'");
    expect(
      () =>
        new HarnessAgent({
          harness,
          getSandboxSession,
          tools: { deleteFile: tool({ inputSchema: z.object({}) }) },
          toolApproval: { deleteFile: 'ask' as never },
        }),
    ).toThrow("invalid `toolApproval` status for tool 'deleteFile'");
  });

  test.each(['allow-reads', 'allow-edits'] as const)(
    'rejects the approval-implying permission mode %s',
    permissionMode => {
      const error = captureError(
        () =>
          new HarnessAgent({
            harness,
            getSandboxSession,
            permissionMode,
          }),
      );

      expect(error.name).toBe(capabilityErrorName);
      expect(error.message).toContain(
        `\`permissionMode: '${permissionMode}'\` is not supported with HarnessV2`,
      );
    },
  );

  test('accepts the allow-all permission mode', () => {
    const agent = new HarnessAgent({
      harness,
      getSandboxSession,
      permissionMode: 'allow-all',
    });

    expect(agent.harnessId).toBe('mock-v2');
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
    ).rejects.toThrow('the drive ended before the session settled');
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
      'custom',
      'start-step',
      'text-start',
      'text-delta',
      'text-end',
      'finish-step',
      'custom',
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
    await createLog({ encryption, world, runId: session.runId }).append({
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

  test('refuses a host tool that requires approval after construction', async () => {
    const execute = vi.fn(async () => 'sunny');
    const tools = {
      weather: tool({
        inputSchema: z.object({ city: z.string() }),
        execute,
      }),
    } as ToolSet;
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

    // The agent was built without approval requirements, so this tool set
    // changed afterwards and must be refused instead of run without consent.
    (tools.weather as { needsApproval?: boolean }).needsApproval = true;

    const result = await agent.stream({ prompt: 'weather?', session });
    const parts: Array<{ type: string }> = [];
    for await (const part of result.fullStream) parts.push(part);

    expect(execute).not.toHaveBeenCalled();
    expect(parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'tool-error',
          toolCallId: 'call-1',
          toolName: 'weather',
          error: expect.stringContaining("remove it from tool 'weather'"),
        }),
      ]),
    );
  });

  test('keeps a session replayable when a tool result has prototype-sensitive keys', async () => {
    /*
     * A host tool can return JSON from an untrusted source, e.g.
     * `await (await fetch(url)).json()`, which may contain these valid own
     * keys. The durable log and stream must still replay afterwards.
     */
    const toolResult = JSON.parse(
      '{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"value":"kept"}',
    );
    const tools = {
      fetchJson: tool({
        inputSchema: z.object({}),
        execute: async () => toolResult,
      }),
    };
    const createHarnessWithTool = () =>
      createFakeHarness({
        modelParts: [
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'fetchJson',
            input: '{}',
          },
        ],
        afterModel: async ({ context }) => {
          await context.executeHostTool({
            toolCallId: 'call-1',
            toolName: 'fetchJson',
            input: {},
          });
        },
      });
    const world = new InMemoryWorld();
    const { agent, session } = await setup({
      harness: createHarnessWithTool(),
      world,
      tools,
    });

    const result = await agent.generate({ prompt: 'fetch', session });
    const output = result.toolResults[0]?.output;
    expect(Object.hasOwn(output as object, '__proto__')).toBe(true);
    expect((output as { value: string }).value).toBe('kept');

    // The stream of the turn decodes, including its stored tool result.
    const stored = await agent.readStream({ session });
    expect(await readPartTypes(stored.fullStream)).toContain('tool-result');

    /*
     * A new agent recreates the log from the World, as a restarted process
     * does, and replays the recorded tool result for a later turn.
     */
    const restarted = new HarnessAgent({
      harness: createHarnessWithTool(),
      world,
      getSandboxSession,
      tools,
    });
    const restored = await restarted.createSession({ runId: session.runId });
    await expect(
      createLog({ encryption, world, runId: session.runId }).refresh(),
    ).resolves.toBeUndefined();
    const replay = await restarted.generate({
      prompt: 'again',
      session: restored,
    });
    expect(replay.text).toBe('echo: again');
  });

  /**
   * Creates a resumable HarnessV2 adapter that starts an undelivered prompt or
   * continues an unfinished turn, invoking `afterModel` before finishing it.
   */
  function createResumableFakeHarness(options: {
    afterModel: (options: { context: HarnessV2DriveContext }) => Promise<void>;
  }): HarnessV2 {
    return {
      specificationVersion: 'harness-v2',
      harnessId: 'resumable-fake-v2',
      builtinTools: {},
      async drive({ context }) {
        const current = context.log.getCurrentTurn();
        const prompt =
          current != null && current.finish == null
            ? current.submissions[0]
            : context.log
                .getUndeliveredSubmissions()
                .find(event => event.data.type === 'prompt');
        if (prompt == null || prompt.data.type !== 'prompt') return;
        const { content } = prompt.data.message;
        const output = await context.effect({
          key: `model:${prompt.id}`,
          name: 'model',
          replay: 'safe',
          input: null,
          deliveredSubmissionIds: [prompt.id],
          fn: async ({ emit }) => {
            const text = `echo: ${typeof content === 'string' ? content : ''}`;
            emit({ type: 'text-start', id: 'text' });
            emit({ type: 'text-delta', id: 'text', delta: text });
            emit({ type: 'text-end', id: 'text' });
            return text;
          },
        });
        if (output.type !== 'result') return;
        await options.afterModel({ context });
        await context.finishStep({ stepNumber: 0, finishReason, usage });
        await context.finishTurn({ finishReason, totalUsage: usage });
      },
    };
  }

  test('leaves a started turn unfinished on a transient error so a later drive continues it', async () => {
    let attempts = 0;
    const harness = createResumableFakeHarness({
      afterModel: async () => {
        attempts++;
        if (attempts === 1) throw new Error('transient adapter failure');
      },
    });
    const { agent, session, world } = await setup({ harness });

    const result = await agent.stream({ prompt: 'hello', session });
    expect(await readPartTypes(result.fullStream)).toEqual([
      'start',
      'custom',
      'start-step',
      'text-start',
      'text-delta',
      'text-end',
      'error',
    ]);

    expect(
      (
        await readLogEvents({
          world,
          runId: session.runId,
          types: ['finish-turn', 'drive-error'],
        })
      ).map(event => event.type),
    ).toEqual(['drive-error']);

    await agent.drive({ session });
    const replayed = await agent.readStream({ session });
    expect(await replayed.text).toBe('echo: hello');
    expect(await replayed.finishReason).toBe('stop');
  });

  test.each([
    {
      label: 'caller error (HarnessCapabilityUnsupportedError)',
      createError: () =>
        new HarnessCapabilityUnsupportedError({ message: 'unsupported input' }),
    },
    {
      label: 'adapter contract error (HarnessAdapterContractError)',
      createError: () =>
        new HarnessAdapterContractError({ message: 'bad step order' }),
    },
    {
      label: 'environment error (ERR_MODULE_NOT_FOUND)',
      createError: () =>
        Object.assign(new Error('missing module'), {
          code: 'ERR_MODULE_NOT_FOUND',
        }),
    },
  ])(
    'immediately finishes a started turn with an error on a permanent $label',
    async ({ createError }) => {
      const harness = createResumableFakeHarness({
        afterModel: async () => {
          throw createError();
        },
      });
      const { agent, session } = await setup({ harness });

      const result = await agent.stream({ prompt: 'hello', session });
      expect(await readPartTypes(result.fullStream)).toEqual([
        'start',
        'custom',
        'start-step',
        'text-start',
        'text-delta',
        'text-end',
        'error',
        'custom',
        'finish',
      ]);

      await expect(
        agent.generate({ prompt: 'again', session }),
      ).rejects.toThrow(createError().message);
    },
  );

  test('finishes a started turn with an error after 8 consecutive transient drive errors', async () => {
    const harness = createResumableFakeHarness({
      afterModel: async () => {
        throw new Error('keeps failing');
      },
    });
    const { agent, session, world } = await setup({ harness });

    await expect(agent.generate({ prompt: 'hello', session })).rejects.toThrow(
      'keeps failing',
    );
    for (let i = 0; i < 6; i++) {
      await expect(agent.drive({ session })).rejects.toThrow('keeps failing');
    }
    expect(
      await readLogEvents({
        world,
        runId: session.runId,
        types: ['finish-turn'],
      }),
    ).toEqual([]);

    await expect(agent.drive({ session })).resolves.toBeUndefined();
    const finishes = await readLogEvents({
      world,
      runId: session.runId,
      types: ['finish-turn'],
    });
    expect(finishes).toHaveLength(1);
    expect(
      finishes[0]?.type === 'finish-turn' && finishes[0].data.finishReason,
    ).toEqual({
      unified: 'error',
      raw: undefined,
    });
  });

  test('resets the consecutive drive error cap when the turn makes progress', async () => {
    let shouldFail = true;
    let runExtraEffect = false;
    const harness = createResumableFakeHarness({
      afterModel: async ({ context }) => {
        if (runExtraEffect) {
          await context.effect({
            key: 'progress-step',
            name: 'progress',
            replay: 'safe',
            input: null,
            fn: async () => 'ok',
          });
        }
        if (shouldFail) throw new Error('keeps failing');
      },
    });
    const { agent, session, world } = await setup({ harness });

    await expect(agent.generate({ prompt: 'hello', session })).rejects.toThrow(
      'keeps failing',
    );
    for (let i = 0; i < 6; i++) {
      await expect(agent.drive({ session })).rejects.toThrow('keeps failing');
    }

    runExtraEffect = true;
    await expect(agent.drive({ session })).rejects.toThrow('keeps failing');
    expect(
      await readLogEvents({
        world,
        runId: session.runId,
        types: ['finish-turn'],
      }),
    ).toEqual([]);

    shouldFail = false;
    await agent.drive({ session });
    const replayed = await agent.readStream({ session });
    expect(await replayed.finishReason).toBe('stop');
  });

  test('durable direct drive schedules a retry queue job on a transient error, while a queue drive rejects', async () => {
    const inner = new InMemoryWorld();
    const queueSpy = vi.fn(async () => ({ messageId: 'msg_retry' }));
    const world = new Proxy(inner, {
      // oxlint-disable-next-line ai-sdk/require-object-parameter -- Proxy handler signature.
      get(target, key, receiver) {
        if (key === Symbol.for('@ai-sdk/harness//in-memory-world')) {
          return undefined;
        }
        if (key === 'queue') return queueSpy;
        if (key === 'registerHandler') return vi.fn();
        if (key === 'registerRoute') return vi.fn();
        if (key === 'start') return vi.fn(async () => {});
        return Reflect.get(target, key, receiver);
      },
    }) as never as World;
    let failMode: 'transient' | 'permanent' = 'transient';
    const harness = createResumableFakeHarness({
      afterModel: async () => {
        if (failMode === 'permanent') {
          throw new HarnessCapabilityUnsupportedError({
            message: 'permanent failure',
          });
        }
        throw new Error('transient failure');
      },
    });
    const agent = new HarnessAgent({
      id: `retry-agent-${Math.random().toString(36).slice(2)}`,
      harness,
      world,
      getSandboxSession,
    });
    const session = await agent.createSession({
      sandboxId: 'sandbox-retry',
    });

    await expect(agent.generate({ prompt: 'hello', session })).rejects.toThrow(
      'transient failure',
    );
    expect(queueSpy).toHaveBeenCalledWith(
      expect.stringContaining('retry-agent-'),
      { runId: session.runId },
      { delaySeconds: 5 },
    );

    queueSpy.mockClear();
    await expect(agent.drive({ session, queueJobId: 'msg_1' })).rejects.toThrow(
      'transient failure',
    );
    expect(queueSpy).not.toHaveBeenCalled();

    failMode = 'permanent';
    await expect(
      agent.drive({ session, queueJobId: 'msg_1' }),
    ).resolves.toBeUndefined();
    expect(
      await readLogEvents({
        world,
        runId: session.runId,
        types: ['finish-turn'],
      }),
    ).toHaveLength(1);
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
      'custom',
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
      const events = await readLogEvents({
        world,
        runId: session.runId,
        types: ['finish-turn'],
      });
      expect(events).toHaveLength(1);
    });
  });

  test('records an approved built-in tool call that never ended as interrupted', async () => {
    const harness = createFakeHarness({
      builtinTools: {
        Bash: { inputSchema: z.object({ command: z.string() }) },
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
      const events = await readLogEvents({
        world,
        runId: session.runId,
        types: ['effect-end'],
      });
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
   * Creates a HarnessV2 adapter that runs the prompt of the unfinished current
   * turn, or else the first undelivered prompt, as a turn: one replay-safe
   * model effect, whose callback is `model`, delivers the prompt, then the
   * turn finishes with one step.
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
        const turn = context.log.getCurrentTurn();
        const promptId =
          turn != null && turn.finish == null
            ? turn.submissions[0]?.id
            : context.log
                .getUndeliveredSubmissions()
                .find(submission => submission.data.type === 'prompt')?.id;
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
      const events = await readLogEvents({
        world: recoveryWorld,
        runId: session.runId,
        types: ['drive-crash', 'effect-end', 'finish-turn'],
      });
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
        'custom',
        'start-step',
        'text-start',
        'text-delta:Cut off',
        'reset-step',
        'text-start',
        'text-delta:Recovered',
        'text-end',
        'finish-step',
        'custom',
        'finish',
      ]);
    } finally {
      release.resolve('late');
      kill.mockRestore();
    }
  });

  test('recovers a turn whose drive crashed without a record under a redelivery of its queue job', async () => {
    const { harness, started, release } = createBlockingHarness();
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    try {
      const world = new InMemoryWorld();
      const agent = new HarnessAgent({ harness, world, getSandboxSession });
      const session = await agent.createSession({ sandboxId: 'sandbox-id' });
      await createLog({ encryption, world, runId: session.runId }).append({
        type: 'submission',
        id: 'prompt',
        data: {
          type: 'prompt',
          message: { role: 'user', content: 'hello' },
          settings: { skills: [], tools: [] },
        },
      });
      void agent.drive({ session, queueJobId: 'message' });
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
      const readEvents = (types?: HarnessAgentLogEvent['type'][]) =>
        readLogEvents({ world: recoveryWorld, runId: session.runId, types });
      const before = await readEvents();

      await recoveryAgent.drive({
        session: restored,
        queueJobId: 'other-message',
      });
      expect(await readEvents()).toEqual(before);

      const reading = await recoveryAgent.readStream({ session: restored });
      await recoveryAgent.drive({
        session: restored,
        queueJobId: 'message',
      });

      expect(await reading.text).toBe('Recovered');
      const events = await readEvents([
        'drive-start',
        'drive-crash',
        'effect-end',
        'finish-turn',
      ]);
      expect(events.map(event => event.type)).toEqual([
        'drive-start',
        'drive-start',
        'effect-end',
        'effect-end',
        'finish-turn',
      ]);
      expect(events[0].data).toMatchObject({ queueJobId: 'message' });
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
      const before = await readLogEvents({
        world: otherWorld,
        runId: session.runId,
      });

      await otherAgent.drive({ session: restored });

      expect(
        await readLogEvents({ world: otherWorld, runId: session.runId }),
      ).toEqual(before);
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

    const events = await readLogEvents({
      world,
      runId: session.runId,
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
    const log = createLog({ encryption, world, runId: session.runId });
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
      (
        await readLogEvents({
          world,
          runId: session.runId,
          types: ['finish-turn'],
        })
      ).map(event => event.type === 'finish-turn' && event.data.turnId),
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

    expect(await readLogEvents({ world, runId: session.runId })).toEqual([]);
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
      await readLogEvents({
        world,
        runId: session.runId,
        types: ['crash-request'],
      }),
    ).toEqual([]);
  });

  test('rejects a crash once the current drive recorded a crash', async () => {
    const { harness, started, release } = createBlockingHarness();
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    try {
      const world = new InMemoryWorld();
      const agent = new HarnessAgent({ harness, world, getSandboxSession });
      const session = await agent.createSession({ sandboxId: 'sandbox-id' });
      await agent.stream({ prompt: 'hello', session });
      await started.promise;
      await agent.experimental_crash({ session, recordCrash: true });
      await vi.waitFor(() => expect(kill).toHaveBeenCalled());

      await expect(agent.experimental_crash({ session })).rejects.toThrow(
        'there is no current drive to crash',
      );
      const events = await readLogEvents({
        world,
        runId: session.runId,
        types: ['crash-request', 'drive-crash'],
      });
      expect(events.map(event => event.type)).toEqual([
        'crash-request',
        'drive-crash',
      ]);
    } finally {
      release.resolve('late');
      kill.mockRestore();
    }
  });

  test('accepts another crash request while the current drive recorded no crash', async () => {
    const { harness, started, release } = createBlockingHarness();
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    try {
      const world = new InMemoryWorld();
      const agent = new HarnessAgent({ harness, world, getSandboxSession });
      const session = await agent.createSession({ sandboxId: 'sandbox-id' });
      await agent.stream({ prompt: 'hello', session });
      await started.promise;
      await agent.experimental_crash({ session });
      await vi.waitFor(() => expect(kill).toHaveBeenCalled());

      await agent.experimental_crash({ session });

      const events = await readLogEvents({
        world,
        runId: session.runId,
        types: ['crash-request', 'drive-crash'],
      });
      expect(events.map(event => event.type)).toEqual([
        'crash-request',
        'crash-request',
      ]);
    } finally {
      release.resolve('late');
      kill.mockRestore();
    }
  });
});

describe('HarnessAgent durability', () => {
  /**
   * Creates a World that is not an `InMemoryWorld` (so that an agent given
   * it is durable), backed by one, with spies for the queue methods.
   */
  function createDurableWorld(options: { deadline?: Date } = {}) {
    const inner = new InMemoryWorld();
    const overrides: Record<string | symbol, unknown> = {
      queue: vi.fn(async () => ({ messageId: 'msg_backstop' })),
      registerHandler: vi.fn(),
      registerRoute: vi.fn(),
      start: vi.fn(async () => {}),
      getRuntimeDeadline: async () => options.deadline,
    };
    const world = new Proxy(inner, {
      // oxlint-disable-next-line ai-sdk/require-object-parameter -- Proxy handler signature.
      get(target, key, receiver) {
        if (key === Symbol.for('@ai-sdk/harness//in-memory-world')) {
          return undefined;
        }
        if (Object.hasOwn(overrides, key)) return overrides[key];
        return Reflect.get(target, key, receiver);
      },
    }) as never as World;
    return {
      world,
      queue: overrides.queue as ReturnType<typeof vi.fn>,
      registerHandler: overrides.registerHandler as ReturnType<typeof vi.fn>,
      registerRoute: overrides.registerRoute as ReturnType<typeof vi.fn>,
      start: overrides.start as ReturnType<typeof vi.fn>,
    };
  }

  test('is not durable without a world or with an in-memory world', () => {
    expect(new HarnessAgent({ harness, getSandboxSession }).isDurable()).toBe(
      false,
    );
    expect(
      new HarnessAgent({
        harness,
        world: new InMemoryWorld(),
        getSandboxSession,
      }).isDurable(),
    ).toBe(false);
  });

  test('is durable with a world other than an in-memory world', () => {
    const { world } = createDurableWorld();
    const agent = new HarnessAgent({
      id: 'durable-agent',
      harness,
      world,
      getSandboxSession,
    });

    expect(agent.isDurable()).toBe(true);
    expect(agent.id).toBe('durable-agent');
  });

  test('requires an id for a durable agent', () => {
    const { world } = createDurableWorld();

    expect(
      () => new HarnessAgent({ harness, world, getSandboxSession } as never),
    ).toThrow('`id` is required with a durable `world`');
  });

  test.each(['with space', 'with/slash', 'with.dot', ''])(
    'rejects the id %j',
    id => {
      expect(
        () => new HarnessAgent({ id, harness, getSandboxSession }),
      ).toThrow('`id` must only contain letters, digits, `_` and `-`');
    },
  );

  test('rejects two durable agents with the same id in one tick', () => {
    const { world } = createDurableWorld();
    new HarnessAgent({ id: 'same-tick', harness, world, getSandboxSession });

    expect(
      () =>
        new HarnessAgent({
          id: 'same-tick',
          harness,
          world,
          getSandboxSession,
        }),
    ).toThrow('two durable HarnessAgents have the `id` `same-tick`');
  });

  test('connects the queue and starts the world once, on first use', async () => {
    const { world, registerHandler, registerRoute, start } =
      createDurableWorld();
    const agent = new HarnessAgent({
      id: 'connects-on-first-use',
      harness,
      world,
      getSandboxSession,
    });
    expect(start).not.toHaveBeenCalled();

    await agent.createSession({ sandboxId: 'sandbox-id' });
    await agent.createSession({ sandboxId: 'sandbox-id' });

    expect(registerHandler).toHaveBeenCalledTimes(1);
    expect(registerHandler).toHaveBeenCalledWith(
      '__harnessagent_wkf_workflow_',
      expect.any(Function),
    );
    expect(registerRoute).not.toHaveBeenCalled();
    expect(start).toHaveBeenCalledTimes(1);
  });

  test('records the agent on the runs of a durable agent', async () => {
    const { world } = createDurableWorld();
    const agent = new HarnessAgent({
      id: 'records-the-agent',
      harness,
      world,
      getSandboxSession,
    });

    const session = await agent.createSession({ sandboxId: 'sandbox-id' });
    const run = await world.runs.get(session.runId);

    expect(run.workflowName).toBe(
      'workflow//@ai-sdk/harness//records-the-agent',
    );
    expect(run.executionContext).toEqual({ queueNamespace: 'harnessagent' });
    expect(
      JSON.parse(new TextDecoder().decode(run.input as Uint8Array)),
    ).toEqual({
      version: 1,
      harnessId: 'mock-v2',
      agentId: 'records-the-agent',
      sessionId: session.sessionId,
      sandboxId: 'sandbox-id',
    });
  });

  test('records no agent on the runs of an agent that is not durable', async () => {
    const world = new InMemoryWorld();
    const agent = new HarnessAgent({
      id: 'not-durable',
      harness,
      world,
      getSandboxSession,
    });

    const session = await agent.createSession({ sandboxId: 'sandbox-id' });
    const run = await world.runs.get(session.runId);

    expect(run.workflowName).toBe('workflow//@ai-sdk/harness//mock-v2');
    expect(run.executionContext).toBeUndefined();
    expect(
      JSON.parse(new TextDecoder().decode(run.input as Uint8Array)),
    ).not.toHaveProperty('agentId');
  });

  test('rejects a run of another agent', async () => {
    const { world } = createDurableWorld();
    const agent = new HarnessAgent({
      id: 'owner-agent',
      harness,
      world,
      getSandboxSession,
    });
    const other = new HarnessAgent({
      id: 'other-agent',
      harness,
      world,
      getSandboxSession,
    });
    const session = await agent.createSession({ sandboxId: 'sandbox-id' });

    await expect(other.createSession({ runId: session.runId })).rejects.toThrow(
      'holds a session of the agent `owner-agent`',
    );
  });

  test('sends a backstop before the drive of a turn', async () => {
    const deadline = new Date(Date.now() + 60 * 60 * 1000);
    const { world, queue } = createDurableWorld({ deadline });
    const agent = new HarnessAgent({
      id: 'backstop-turn',
      harness: fakeHarness,
      world,
      getSandboxSession,
    });
    const session = await agent.createSession({ sandboxId: 'sandbox-id' });

    const result = await agent.stream({ prompt: 'hello', session });
    expect(await result.text).toBe('echo: hello');

    expect(queue).toHaveBeenCalledTimes(1);
    const [queueName, payload, queueOptions] = queue.mock.calls[0];
    expect(queueName).toBe(
      '__harnessagent_wkf_workflow_workflow//@ai-sdk/harness//backstop-turn',
    );
    expect(payload).toEqual({ runId: session.runId });
    expect(queueOptions.delaySeconds).toBeGreaterThan(60 * 60);
    expect(queueOptions.delaySeconds).toBeLessThanOrEqual(60 * 60 + 5);
  });

  test('sends a backstop before a drive', async () => {
    const deadline = new Date(Date.now() + 60 * 60 * 1000);
    const { world, queue } = createDurableWorld({ deadline });
    const agent = new HarnessAgent({
      id: 'backstop-drive',
      harness: fakeHarness,
      world,
      getSandboxSession,
    });
    const session = await agent.createSession({ sandboxId: 'sandbox-id' });

    await agent.drive({ session, queueJobId: 'job' });

    expect(queue).toHaveBeenCalledTimes(1);
    expect(queue.mock.calls[0][1]).toEqual({ runId: session.runId });
  });

  test('sends no backstop without a runtime deadline', async () => {
    const { world, queue } = createDurableWorld();
    const agent = new HarnessAgent({
      id: 'no-deadline',
      harness: fakeHarness,
      world,
      getSandboxSession,
    });
    const session = await agent.createSession({ sandboxId: 'sandbox-id' });

    const result = await agent.stream({ prompt: 'hello', session });
    await result.consumeStream();

    expect(queue).not.toHaveBeenCalled();
  });
});

describe('HarnessAgent cancel', () => {
  const cancelled = { unified: 'cancelled' as const, raw: undefined };

  /**
   * Creates a session whose log holds a prompt and the start of its turn,
   * i.e. a running turn without a drive.
   */
  async function setupRunningTurn() {
    const world = new InMemoryWorld();
    const agent = new HarnessAgent({ harness, world, getSandboxSession });
    const session = await agent.createSession({ sandboxId: 'sandbox-id' });
    const log = createLog({ encryption, world, runId: session.runId });
    await log.append({
      type: 'submission',
      id: 'p1',
      data: {
        type: 'prompt',
        message: { role: 'user', content: 'hello' },
        settings: { skills: [], tools: [] },
      },
    });
    await log.append({
      type: 'turn-start',
      id: 'turn-start:p1',
      data: { turnId: 'p1' },
    });
    return { world, agent, session, log };
  }

  test('rejects without writing when the session has no running turn', async () => {
    const world = new InMemoryWorld();
    const agent = new HarnessAgent({ harness, world, getSandboxSession });
    const session = await agent.createSession({ sandboxId: 'sandbox-id' });

    await expect(agent.cancel({ session })).rejects.toThrow(
      'HarnessAgent.cancel: the session has no running turn.',
    );

    const running = await setupRunningTurn();
    await running.log.append({
      type: 'finish-turn',
      id: 'finish-turn:p1',
      data: { turnId: 'p1', finishReason, totalUsage: usage },
    });
    await expect(
      running.agent.cancel({ session: running.session }),
    ).rejects.toThrow('HarnessAgent.cancel: the session has no running turn.');
    expect(
      (
        await readLogEvents({
          world: running.world,
          runId: running.session.runId,
          types: ['submission'],
        })
      ).map(event => event.id),
    ).toEqual(['p1']);
  });

  test('appends one cancel submission while a cancel is waiting', async () => {
    const { world, agent, session } = await setupRunningTurn();

    await agent.cancel({ session });
    await agent.cancel({ session });

    const submissions = await readLogEvents({
      world,
      runId: session.runId,
      types: ['submission'],
    });
    expect(submissions.map(event => event.data)).toEqual([
      expect.objectContaining({ type: 'prompt' }),
      { type: 'cancel' },
    ]);
  });

  test('ends the turn with the finish reason the adapter reports for the cancel', async () => {
    const started = new DelayedPromise<void>();
    const cancelHarness: HarnessV2 = {
      specificationVersion: 'harness-v2',
      harnessId: 'fake-v2',
      builtinTools: {},
      async drive({ context }) {
        const prompt = context.log
          .getUndeliveredSubmissions()
          .find(submission => submission.data.type === 'prompt');
        if (prompt == null) return;
        const hasCancel = () =>
          context.log
            .getUndeliveredSubmissions()
            .some(submission => submission.data.type === 'cancel');
        await context.effect({
          key: 'model:0',
          name: 'model',
          replay: 'safe',
          input: null,
          deliveredSubmissionIds: [prompt.id],
          fn: async ({ emit }) => {
            emit({ type: 'text-start', id: 'text' });
            emit({ type: 'text-delta', id: 'text', delta: 'Partial' });
            const cancelSeen = new DelayedPromise<void>();
            const stopListening = context.log.onAppend(() => {
              if (hasCancel()) cancelSeen.resolve();
            });
            started.resolve();
            try {
              await cancelSeen.promise;
            } finally {
              stopListening();
            }
            throw new HarnessCancellationError();
          },
        });
        await context.finishStep({
          stepNumber: 0,
          finishReason: cancelled,
          usage,
        });
        await context.finishTurn({
          finishReason: cancelled,
          totalUsage: usage,
        });
      },
    };
    const world = new InMemoryWorld();
    const agent = new HarnessAgent({
      harness: cancelHarness,
      world,
      getSandboxSession,
    });
    const session = await agent.createSession({ sandboxId: 'sandbox-id' });

    const result = await agent.stream({ prompt: 'hello', session });
    await started.promise;
    await agent.cancel({ session });

    expect(await result.text).toBe('Partial');
    expect(await result.finishReason).toBe('other');
    expect(await result.rawFinishReason).toBe('cancelled');
    const log = createLog({ encryption, world, runId: session.runId });
    await log.refresh();
    expect(log.getUndeliveredSubmissions()).toEqual([]);
    expect(log.getEffect({ key: 'model:0' })?.end?.data.output).toEqual({
      type: 'interrupted',
      retryable: true,
    });
  });
});

describe('HarnessAgent storage encryption', () => {
  const secret = 'encrypted-storage-sentinel';
  const rawKey = new Uint8Array(32).fill(7);
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

  function setup(options: { pauseAfterTool?: boolean } = {}) {
    const inner = new InMemoryWorld({ deploymentId: 'original' });
    const world: World = inner;
    const resolveKey = vi.fn(async () => rawKey);
    world.getEncryptionKeyForRun = resolveKey;
    const execute = vi.fn(async () => ({ value: secret }));
    const harness: HarnessV2 = {
      specificationVersion: 'harness-v2',
      harnessId: 'encryption-test',
      builtinTools: {},
      async drive({ context }) {
        const finished = new Set(
          context.log
            .getTurns()
            .filter(turn => turn.finish != null)
            .flatMap(turn => turn.submissions.map(submission => submission.id)),
        );
        for (const prompt of context.log.getSubmissions()) {
          if (prompt.data.type !== 'prompt' || finished.has(prompt.id))
            continue;
          await context.effect({
            key: `model:${prompt.id}`,
            name: 'model',
            replay: 'safe',
            input: secret,
            deliveredSubmissionIds: [prompt.id],
            fn: async ({ emit }) => {
              emit({ type: 'text-start', id: prompt.id });
              emit({ type: 'text-delta', id: prompt.id, delta: secret });
              emit({ type: 'text-end', id: prompt.id });
              return secret;
            },
          });
          await context.executeHostTool({
            toolCallId: prompt.id,
            toolName: 'readSecret',
            input: {},
          });
          await context.log.append({
            type: 'harness:journal',
            id: `checkpoint:${prompt.id}`,
            data: { checkpoint: secret },
          });
          if (options.pauseAfterTool) return;
          await context.finishStep({ stepNumber: 0, finishReason, usage });
          await context.finishTurn({ finishReason, totalUsage: usage });
        }
      },
    };
    const settings = {
      harness,
      world,
      tools: { readSecret: tool({ inputSchema: z.object({}), execute }) },
      getSandboxSession: async () => ({}) as SandboxSession,
    };
    return { inner, world, resolveKey, execute, settings };
  }

  test('encrypts cancel submissions without resolving the session key again', async () => {
    const { world, settings, resolveKey } = setup({ pauseAfterTool: true });
    const agent = new HarnessAgent({ ...settings, id: 'cancel-encrypted' });
    const session = await agent.createSession({ sandboxId: 'sandbox' });
    await (await agent.stream({ session, prompt: secret })).consumeStream();
    await agent.cancel({ session });
    expect(resolveKey).toHaveBeenCalledTimes(1);
    const encryption = await createStorageEncryption({
      world,
      runId: session.runId,
      deploymentId: 'original',
    });
    const log = createLog({ world, runId: session.runId, encryption });
    await log.refresh();
    expect(
      log.getUndeliveredSubmissions().map(submission => submission.data.type),
    ).toContain('cancel');
  });

  test('encrypts run input, log envelopes, and output while restoring and reading normally', async () => {
    const { inner, world, resolveKey, settings } = setup();
    const mcpServers = {
      remote: {
        url: 'https://mcp.example.com',
        headers: { authorization: secret },
      },
    };
    const agent = new HarnessAgent({
      ...settings,
      id: 'encrypted',
      mcpServers,
    });
    const session = await agent.createSession({
      sandboxId: secret,
      sessionId: secret,
    });
    expect((await agent.generate({ session, prompt: secret })).text).toBe(
      secret,
    );
    expect(resolveKey).toHaveBeenCalledExactlyOnceWith(session.runId, {
      deploymentId: 'original',
    });
    const run = await world.runs.get(session.runId);
    expect(new TextDecoder().decode(run.input as Uint8Array)).not.toContain(
      secret,
    );
    const events = await world.events.list({
      runId: session.runId,
      pagination: { limit: 1000 },
    });
    const payloads = events.data.flatMap(event =>
      event.eventType === 'step_created' ? [event.eventData.input] : [],
    );
    expect(payloads.length).toBeGreaterThan(5);
    for (const payload of payloads)
      expect(new TextDecoder().decode(payload as Uint8Array)).not.toContain(
        secret,
      );
    const chunks = await world.streams.getChunks(
      session.runId,
      session.getStreamName(),
      { limit: 1000 },
    );
    for (const chunk of chunks.data) {
      expect(
        new TextDecoder().decode(
          convertBase64ToUint8Array(
            new TextDecoder().decode(chunk.data).trim(),
          ),
        ),
      ).not.toContain(secret);
    }
    const data = await inner.export({ runId: session.runId });
    expect(JSON.stringify(data)).not.toContain(secret);
    const next = new InMemoryWorld({ deploymentId: 'later' });
    await next.seed({ runId: session.runId, data });
    const nextWorld: World = next;
    const nextKey = vi.fn(async () => rawKey);
    nextWorld.getEncryptionKeyForRun = nextKey;
    const restoredAgent = new HarnessAgent({
      ...settings,
      world: nextWorld,
      id: 'encrypted',
      mcpServers,
    });
    const restored = await restoredAgent.createSession({
      runId: session.runId,
    });
    expect(restored.sessionId).toBe(secret);
    const result = await restoredAgent.readStream({ session: restored });
    expect(await result.text).toBe(secret);
    expect(
      (await restoredAgent.generate({ session: restored, prompt: 'next' }))
        .text,
    ).toBe(secret);
    expect(nextKey).toHaveBeenCalledExactlyOnceWith(session.runId, {
      deploymentId: 'original',
    });
    expect(
      DefaultHarnessAgentSession[WORKFLOW_SERIALIZE](
        restored as DefaultHarnessAgentSession,
      ),
    ).toEqual({ runId: session.runId, sessionId: secret, sandboxId: secret });
  });

  test('resolves encryption for deserialized handles using original deployment metadata', async () => {
    const { world, resolveKey, settings } = setup();
    const agent = new HarnessAgent({ ...settings, id: 'serialized-encrypted' });
    const session = await agent.createSession({ sandboxId: 'sandbox' });
    const restored = DefaultHarnessAgentSession[WORKFLOW_DESERIALIZE]({
      runId: session.runId,
      sandboxId: session.sandboxId,
      sessionId: session.sessionId,
    });
    vi.spyOn(world, 'getDeploymentId').mockResolvedValue('later');
    resolveKey.mockClear();
    const get = vi.spyOn(world.runs, 'get');
    expect(
      (await agent.generate({ session: restored, prompt: secret })).text,
    ).toBe(secret);
    expect(get).toHaveBeenCalledWith(session.runId, { resolveData: 'none' });
    expect(resolveKey).toHaveBeenCalledExactlyOnceWith(session.runId, {
      deploymentId: 'original',
    });
  });

  test('shares pending key lookups and retries failed resolution for deserialized handles', async () => {
    const { settings, resolveKey } = setup();
    const agent = new HarnessAgent({ ...settings, id: 'retry-key' });
    const session = await agent.createSession({ sandboxId: 'sandbox' });
    const restored = DefaultHarnessAgentSession[WORKFLOW_DESERIALIZE]({
      runId: session.runId,
      sessionId: session.sessionId,
      sandboxId: session.sandboxId,
    });
    resolveKey.mockClear();
    resolveKey.mockRejectedValueOnce(new Error('key temporarily unavailable'));
    const failed = await Promise.allSettled([
      agent.readStream({ session: restored }),
      agent.cancel({ session: restored }),
    ]);
    expect(failed.map(result => result.status)).toEqual([
      'rejected',
      'rejected',
    ]);
    expect(resolveKey).toHaveBeenCalledTimes(1);
    expect(
      (await agent.generate({ session: restored, prompt: secret })).text,
    ).toBe(secret);
    expect(resolveKey).toHaveBeenCalledTimes(2);
  });

  test('recovers encrypted output without rerunning a completed host tool', async () => {
    const options = { pauseAfterTool: true };
    const { settings, execute } = setup(options);
    const agent = new HarnessAgent({ ...settings, id: 'recovery-encrypted' });
    const session = await agent.createSession({ sandboxId: 'sandbox' });
    const result = await agent.stream({ session, prompt: secret });
    await result.consumeStream();
    expect(execute).toHaveBeenCalledTimes(1);
    options.pauseAfterTool = false;
    const restoredAgent = new HarnessAgent({
      ...settings,
      id: 'recovery-encrypted',
    });
    const restored = await restoredAgent.createSession({
      runId: session.runId,
    });
    await restoredAgent.drive({ session: restored });
    expect(
      await (
        await restoredAgent.readStream({ session: restored })
      ).text,
    ).toBe(secret);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  test('restores encrypted sessions through the background queue callback', async () => {
    const { world, settings } = setup({ pauseAfterTool: true });
    Object.defineProperty(
      world,
      Symbol.for('@ai-sdk/harness//in-memory-world'),
      { value: undefined },
    );
    let callback: Parameters<World['createQueueHandler']>[1] | undefined;
    world.createQueueHandler = (...args) => {
      callback = args[1];
      return async () => new Response(null);
    };
    world.start = async () => {};
    world.registerHandler = () => {};
    const agent = new HarnessAgent({ ...settings, id: 'queue-encrypted' });
    const session = await agent.createSession({ sandboxId: 'sandbox' });
    await (await agent.stream({ session, prompt: secret })).consumeStream();
    const queueName =
      '__harnessagent_wkf_workflow_workflow//@ai-sdk/harness//queue-encrypted';
    const queued = await world.queue(queueName, { runId: session.runId });
    const harness = { ...settings.harness, drive: async () => {} };
    const background = new HarnessAgent({
      ...settings,
      harness,
      id: 'queue-encrypted',
    });
    const drive = vi.spyOn(background, 'drive');
    await callback!(
      { runId: session.runId },
      { queueName, messageId: queued.messageId!, attempt: 1 },
    );
    expect(drive).toHaveBeenCalledTimes(1);
    expect(drive.mock.calls[0][0].session.runId).toBe(session.runId);
  });

  test('fails before creating a run when key resolution fails and permits a later retry', async () => {
    const { world, resolveKey, settings } = setup();
    resolveKey.mockRejectedValueOnce(new Error('key service offline'));
    const create = vi.spyOn(world.events, 'create');
    const agent = new HarnessAgent({ ...settings, id: 'key-failure' });
    await expect(
      agent.createSession({ sandboxId: 'sandbox' }),
    ).rejects.toBeInstanceOf(HarnessStorageEncryptionError);
    expect(create).not.toHaveBeenCalled();
    await expect(
      agent.createSession({ sandboxId: 'sandbox' }),
    ).resolves.toBeDefined();
  });

  test('rejects wrong or missing keys on restoration', async () => {
    const { world, settings } = setup();
    const agent = new HarnessAgent({ ...settings, id: 'wrong-key' });
    const session = await agent.createSession({ sandboxId: 'sandbox' });
    world.getEncryptionKeyForRun = async () => new Uint8Array(32).fill(8);
    await expect(
      agent.createSession({ runId: session.runId }),
    ).rejects.toBeInstanceOf(HarnessStorageEncryptionError);
    world.getEncryptionKeyForRun = async () => undefined;
    await expect(
      agent.createSession({ runId: session.runId }),
    ).rejects.toThrow();
  });

  test('propagates stream encryption failure without committing a successful effect', async () => {
    const { world, settings } = setup();
    const agent = new HarnessAgent({ ...settings, id: 'stream-failure' });
    const session = await agent.createSession({ sandboxId: 'sandbox' });
    const encrypt = globalThis.crypto.subtle.encrypt.bind(
      globalThis.crypto.subtle,
    );
    const spy = vi
      .spyOn(globalThis.crypto.subtle, 'encrypt')
      .mockImplementation(async (...args) => {
        const bytes = args[2] as Uint8Array;
        if (new TextDecoder().decode(bytes).includes('"part":'))
          throw new Error('crypto unavailable');
        return encrypt(...args);
      });
    try {
      await expect(
        agent.generate({ session, prompt: secret }),
      ).rejects.toThrow();
    } finally {
      spy.mockRestore();
    }
    const encryption = await createStorageEncryption({
      world,
      runId: session.runId,
      deploymentId: 'original',
    });
    const log = createLog({ world, runId: session.runId, encryption });
    await log.refresh();
    expect(log.getCurrentTurn()?.finish).toBeUndefined();
    expect(log.getEffects().every(effect => effect.end == null)).toBe(true);
  });
});

describe('HarnessAgent tool approvals', () => {
  const toolCallsReason = { unified: 'tool-calls' as const, raw: 'tool_use' };

  /**
   * Creates a HarnessV2 adapter whose turns call the `weather` and `time`
   * host tools in their first step and answer with text in their second
   * step. A step whose tool calls wait for approval ends the drive without
   * finishing the turn; a later drive resumes the turn by replaying its first
   * model effect, and finishes a turn whose cancel waits as cancelled.
   */
  function createApprovalHarness(): HarnessV2 {
    return {
      specificationVersion: 'harness-v2',
      harnessId: 'approval-v2',
      builtinTools: {},
      async drive({ context }) {
        const prompt = context.log
          .getUndeliveredSubmissions()
          .find(submission => submission.data.type === 'prompt');
        const turn = context.log.getCurrentTurn();
        const promptId =
          prompt?.id ??
          (turn != null && turn.finish == null
            ? turn.submissions[0]?.id
            : undefined);
        if (promptId == null) return;
        if (
          prompt == null &&
          context.log
            .getUndeliveredSubmissions()
            .some(submission => submission.data.type === 'cancel')
        ) {
          await context.finishTurn({
            finishReason: { unified: 'cancelled', raw: undefined },
            totalUsage: usage,
          });
          return;
        }

        const calls = [
          { toolCallId: 'call-weather', toolName: 'weather', input: {} },
          { toolCallId: 'call-time', toolName: 'time', input: {} },
        ];
        await context.effect({
          key: `model:${promptId}:0`,
          name: 'model',
          replay: 'safe',
          input: null,
          deliveredSubmissionIds: prompt == null ? [] : [promptId],
          fn: async ({ emit }) => {
            for (const call of calls) {
              emit({ type: 'tool-call', ...call, input: '{}' });
            }
            return null;
          },
        });
        let suspended = false;
        for (const call of calls) {
          const output = await context.executeHostTool(call);
          if (output.type === 'suspended') suspended = true;
        }
        await context.finishStep({
          stepNumber: 0,
          finishReason: toolCallsReason,
          usage,
        });
        if (suspended) return;

        await context.effect({
          key: `model:${promptId}:1`,
          name: 'model',
          replay: 'safe',
          input: null,
          fn: async ({ emit }) => {
            emit({ type: 'text-start', id: 'text' });
            emit({ type: 'text-delta', id: 'text', delta: 'done' });
            emit({ type: 'text-end', id: 'text' });
            return null;
          },
        });
        await context.finishStep({ stepNumber: 1, finishReason, usage });
        await context.finishTurn({ finishReason, totalUsage: usage });
      },
    };
  }

  async function setup() {
    const weather = vi.fn(async () => 'sunny');
    const time = vi.fn(async () => 'noon');
    const world = new InMemoryWorld();
    const agent = new HarnessAgent({
      harness: createApprovalHarness(),
      world,
      getSandboxSession,
      tools: {
        weather: tool({ inputSchema: z.object({}), execute: weather }),
        time: tool({ inputSchema: z.object({}), execute: time }),
      },
      toolApproval: { weather: 'user-approval', time: 'user-approval' },
    });
    const session = await agent.createSession({ sandboxId: 'sandbox-id' });
    return { world, agent, session, weather, time };
  }

  /**
   * Content part of a result, with the fields of an approval request.
   */
  type ApprovalContentPart = {
    type: string;
    approvalId?: string;
    toolCall?: { toolName: string };
  };

  /**
   * Returns the approval IDs of a result's approval requests, by tool name.
   */
  async function getApprovalIds(result: {
    content:
      | ReadonlyArray<ApprovalContentPart>
      | PromiseLike<ReadonlyArray<ApprovalContentPart>>;
  }): Promise<Record<string, string>> {
    const ids = Object.create(null) as Record<string, string>;
    for (const part of await result.content) {
      if (
        part.type !== 'tool-approval-request' ||
        part.approvalId == null ||
        part.toolCall == null
      ) {
        continue;
      }
      ids[part.toolCall.toolName] = part.approvalId;
    }
    return ids;
  }

  test('requests every approval of a step and continues the turn with stream()', async () => {
    const { agent, session, weather, time } = await setup();

    const first = await agent.stream({ prompt: 'go', session });
    const parts: Array<{ type: string }> = [];
    for await (const part of first.fullStream) parts.push(part);
    expect(parts.map(part => part.type)).toEqual([
      'start',
      'custom',
      'start-step',
      'tool-call',
      'tool-call',
      'tool-approval-request',
      'tool-approval-request',
      'finish-step',
      'finish',
    ]);
    expect(await first.finishReason).toBe('tool-calls');
    const ids = await getApprovalIds(first);
    expect(Object.keys(ids)).toEqual(['weather', 'time']);

    await expect(agent.stream({ prompt: 'again', session })).rejects.toThrow(
      'waits for tool approval responses',
    );
    await expect(
      agent.stream({
        session,
        messages: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-approval-response',
                approvalId: ids.weather,
                approved: true,
              },
            ],
          },
        ],
      }),
    ).rejects.toThrow('every pending tool approval must be answered');

    const second = await agent.stream({
      session,
      messages: [
        { role: 'user', content: 'go' },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-approval-response',
              approvalId: ids.weather,
              approved: true,
            },
            {
              type: 'tool-approval-response',
              approvalId: ids.time,
              approved: false,
              reason: 'Not now',
            },
          ],
        },
      ],
    });
    const continued: Array<{ type: string }> = [];
    for await (const part of second.fullStream) continued.push(part);
    expect(continued.map(part => part.type)).toEqual([
      'start',
      'start-step',
      'tool-result',
      'tool-output-denied',
      'text-start',
      'text-delta',
      'text-end',
      'finish-step',
      'custom',
      'finish',
    ]);
    expect(await second.text).toBe('done');
    expect(await second.finishReason).toBe('stop');
    expect(weather).toHaveBeenCalledTimes(1);
    expect(time).not.toHaveBeenCalled();

    const stored = await agent.readStream({ session });
    expect((await stored.steps).length).toBe(2);
    expect(await stored.text).toBe('done');
  });

  test('records responses with respondToToolApprovals() and continues the turn with drive()', async () => {
    const { world, agent, session, weather } = await setup();
    const first = await agent.generate({ prompt: 'go', session });
    const ids = await getApprovalIds(first);

    await agent.respondToToolApprovals({
      session,
      responses: [{ approvalId: ids.weather, approved: true }],
    });
    await agent.drive({ session });
    expect(weather).not.toHaveBeenCalled();
    expect(
      await readLogEvents({
        world,
        runId: session.runId,
        types: ['drive-start'],
      }),
    ).toHaveLength(1);

    await agent.respondToToolApprovals({
      session,
      responses: [
        { approvalId: ids.weather, approved: false },
        { approvalId: ids.time, approved: true },
      ],
    });
    await agent.drive({ session });
    expect(weather).toHaveBeenCalledTimes(1);

    const stored = await agent.readStream({ session });
    expect(await stored.text).toBe('done');
    await expect(
      agent.respondToToolApprovals({
        session,
        responses: [{ approvalId: 'unknown', approved: true }],
      }),
    ).rejects.toThrow("the tool approval 'unknown' does not exist");
  });

  test('finishes a turn that waits for approval when it is cancelled', async () => {
    const { agent, session, weather } = await setup();
    const first = await agent.generate({ prompt: 'go', session });
    const ids = await getApprovalIds(first);

    await agent.cancel({ session });
    await agent.drive({ session });

    const stored = await agent.readStream({ session });
    expect(await stored.rawFinishReason).toBe('cancelled');
    await expect(
      agent.respondToToolApprovals({
        session,
        responses: [{ approvalId: ids.weather, approved: true }],
      }),
    ).rejects.toThrow('belongs to a turn that is not running anymore');
    expect(weather).not.toHaveBeenCalled();
  });
});
