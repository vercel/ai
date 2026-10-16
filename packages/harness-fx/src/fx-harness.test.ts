import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  secureJsonParse,
  type Experimental_SandboxSession as SandboxSession,
} from '@ai-sdk/provider-utils';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import type {
  HarnessV1PromptTurnOptions,
  HarnessV1StreamPart,
  HarnessV1BuiltinToolFiltering,
} from '@ai-sdk/harness';
import {
  createFxRuntime,
  type FxRuntimeOptions,
  type FxToolResult,
} from './fx-runtime';
import type { FxStoredState } from './fx-resume-state';
import { createFx } from './fx-harness';
import { resolveFxEnv } from './fx-auth';
import {
  fxToolRequiresApproval,
  toFxToolResult,
  type FxToolSubmission,
} from './fx-tools';

const runtime = vi.hoisted(() => ({
  options: [] as FxRuntimeOptions[],
  run: undefined as ((options: FxRuntimeOptions) => Promise<void>) | undefined,
  close: undefined as (() => Promise<void>) | undefined,
}));
vi.mock('./fx-runtime', () => ({
  createFxRuntime: vi.fn(async (options: FxRuntimeOptions) => {
    runtime.options.push(options);
    return {
      checkpoint: async () => new Uint8Array([1, 2, 3]),
      close: async () => runtime.close?.(),
      prompt: (_prompt: unknown, input: { signal: AbortSignal }) => {
        const result = Promise.race([
          Promise.resolve()
            .then(() => runtime.run?.(options))
            .then(() => ({ stopReason: 'end_turn' })),
          new Promise<never>((_resolve, reject) =>
            input.signal.addEventListener(
              'abort',
              () => reject(input.signal.reason),
              { once: true },
            ),
          ),
        ]);
        void result.catch(() => {});
        return {
          result,
          cancel() {},
          [Symbol.asyncIterator]() {
            return {
              async next() {
                await result;
                return { done: true as const, value: undefined };
              },
            };
          },
        };
      },
    };
  }),
}));

function createSandbox() {
  const files = new Map<string, string>();
  const run = vi.fn(async ({ command }: { command: string }) => {
    if (command === 'pwd')
      return { exitCode: 0, stdout: '/workspace', stderr: '' };
    if (command.includes('"$HOME"'))
      return {
        exitCode: 0,
        stdout: Buffer.from('/home/sandbox').toString('base64'),
        stderr: '',
      };
    if (command.startsWith('mv --')) {
      const paths = [...command.matchAll(/'([^']+)'/g)].map(match => match[1]);
      files.set(paths[1], files.get(paths[0])!);
    }
    return { exitCode: 0, stdout: '', stderr: '' };
  });
  const sandbox = {
    description: 'remote test sandbox',
    run,
    readTextFile: vi.fn(
      async ({ path }: { path: string }) => files.get(path) ?? null,
    ),
    writeTextFile: vi.fn(
      async ({ path, content }: { path: string; content: string }) => {
        files.set(path, content);
      },
    ),
    stop: vi.fn(),
    destroy: vi.fn(),
  };
  return {
    sandbox: sandbox as unknown as SandboxSession,
    files,
    run,
    stop: sandbox.stop,
    destroy: sandbox.destroy,
  };
}

const turnOptions = {
  skills: [],
  tools: [],
} satisfies Partial<HarnessV1PromptTurnOptions>;
function invoke(options: {
  runtimeOptions: FxRuntimeOptions;
  name: string;
  id: string;
  input: unknown;
}) {
  options.runtimeOptions.onEvent?.({
    type: 'acp.receive',
    message: {
      method: 'session/update',
      params: {
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: options.id,
          name: options.name,
        },
      },
    },
  });
  return options.runtimeOptions.tools
    .find(tool => tool.name === options.name)!
    .execute(options.input, { signal: new AbortController().signal });
}

beforeEach(() => {
  vi.stubEnv('AI_GATEWAY_API_KEY', 'test-key');
  vi.stubEnv('VERCEL_OIDC_TOKEN', undefined);
  runtime.options.length = 0;
  runtime.run = undefined;
  runtime.close = undefined;
});

afterEach(() => vi.unstubAllEnvs());

describe('fx harness', () => {
  it('constructs without a bridge or bootstrap', () => {
    const harness = createFx();
    expect({
      id: harness.harnessId,
      spec: harness.specificationVersion,
      bootstrap: harness.getBootstrap,
      approvals: harness.supportsBuiltinToolApprovals,
      filtering: harness.supportsBuiltinToolFiltering,
      tools: Object.keys(harness.builtinTools),
    }).toMatchInlineSnapshot(`
      {
        "approvals": true,
        "bootstrap": undefined,
        "filtering": true,
        "id": "fx",
        "spec": "harness-v1",
        "tools": [
          "read",
          "write",
          "edit",
          "bash",
          "grep",
          "glob",
          "ls",
          "askUserQuestions",
        ],
      }
    `);
    expect(runtime.options).toHaveLength(0);
  });

  it('leaves the model default to libfx and reapplies per-turn settings', async () => {
    const { sandbox, stop, destroy } = createSandbox();
    const session = await createFx().doStart({
      sandboxSession: sandbox,
      sessionId: 'settings',
      sessionWorkDir: '/workspace',
    });
    await (
      await session.doPromptTurn({ ...turnOptions, prompt: 'first', emit() {} })
    ).done;
    await (
      await session.doPromptTurn({
        ...turnOptions,
        model: 'anthropic/claude-haiku-4-5',
        instructions: 'new instructions',
        skills: [
          {
            name: 'guide',
            description: 'guide',
            content: 'skill body',
            files: [{ path: 'reference.md', content: 'resource body' }],
          },
        ],
        prompt: 'second',
        emit() {},
      })
    ).done;
    expect(runtime.options[0].model).toBeUndefined();
    expect(runtime.options[1].model).toBe('anthropic/claude-haiku-4-5');
    expect(runtime.options[1].instructions).toContain('new instructions');
    expect(runtime.options[1].instructions).toContain('resource body');
    expect(Array.from(runtime.options[1].checkpoint!)).toEqual([1, 2, 3]);
    await expect(session.doCompact()).rejects.toThrow(
      'manual context compaction',
    );
    await session.doStop();
    expect(stop).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
  });

  it('maps service tiers to mutually exclusive libfx flags', async () => {
    for (const serviceTier of [
      undefined,
      'default',
      'fast',
      'ultrafast',
    ] as const) {
      const { sandbox } = createSandbox();
      const session = await createFx({ serviceTier }).doStart({
        sandboxSession: sandbox,
        sessionId: 'service-tier',
        sessionWorkDir: '/workspace',
      });
      try {
        await (
          await session.doPromptTurn({
            ...turnOptions,
            prompt: 'go',
            emit() {},
          })
        ).done;
      } finally {
        await session.doDestroy();
      }
    }

    expect(runtime.options.map(({ fast, ultrafast }) => ({ fast, ultrafast })))
      .toMatchInlineSnapshot(`
      [
        {
          "fast": undefined,
          "ultrafast": undefined,
        },
        {
          "fast": undefined,
          "ultrafast": undefined,
        },
        {
          "fast": true,
          "ultrafast": false,
        },
        {
          "fast": false,
          "ultrafast": true,
        },
      ]
    `);
  });

  it('filters tools before configuring the runtime and preserves recursive schemas', async () => {
    const { sandbox } = createSandbox();
    const schema = {
      type: 'object' as const,
      properties: {
        rows: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              label: { type: 'string' as const, enum: ['a', 'b'] },
            },
          },
        },
      },
    };
    const session = await createFx().doStart({
      sandboxSession: sandbox,
      sessionId: 'filter',
      sessionWorkDir: '/workspace',
      builtinToolFiltering: { mode: 'allow', toolNames: ['read'] },
    });
    await (
      await session.doPromptTurn({
        ...turnOptions,
        tools: [{ name: 'custom', inputSchema: schema }],
        prompt: 'go',
        emit() {},
      })
    ).done;
    expect(runtime.options[0].tools.map(tool => tool.name)).toEqual([
      'read',
      'custom',
    ]);
    expect(runtime.options[0].tools[1].inputSchema).toEqual(schema);
    await session.doDestroy();
  });

  it.each([
    {
      filtering: undefined,
      names: [
        'read',
        'write',
        'edit',
        'bash',
        'grep',
        'glob',
        'ls',
        'askUserQuestions',
      ],
    },
    { filtering: { mode: 'allow', toolNames: [] }, names: [] },
    {
      filtering: { mode: 'deny', toolNames: [] },
      names: [
        'read',
        'write',
        'edit',
        'bash',
        'grep',
        'glob',
        'ls',
        'askUserQuestions',
      ],
    },
    {
      filtering: { mode: 'deny', toolNames: ['bash', 'write', 'edit'] },
      names: ['read', 'grep', 'glob', 'ls', 'askUserQuestions'],
    },
  ] satisfies Array<{
    filtering: HarnessV1BuiltinToolFiltering | undefined;
    names: string[];
  }>)(
    'registers included built-ins for $filtering',
    async ({ filtering, names }) => {
      const { sandbox } = createSandbox();
      const session = await createFx().doStart({
        sandboxSession: sandbox,
        sessionId: 'filtering',
        sessionWorkDir: '/workspace',
        builtinToolFiltering: filtering,
      });
      try {
        await (
          await session.doPromptTurn({
            ...turnOptions,
            prompt: 'go',
            emit() {},
          })
        ).done;
        expect(runtime.options[0].tools.map(tool => tool.name)).toEqual(names);
      } finally {
        await session.doDestroy();
      }
    },
  );

  it('preserves custom tools that override filtered built-in names', async () => {
    const { sandbox } = createSandbox();
    const session = await createFx().doStart({
      sandboxSession: sandbox,
      sessionId: 'override',
      sessionWorkDir: '/workspace',
      builtinToolFiltering: { mode: 'allow', toolNames: [] },
    });
    try {
      await (
        await session.doPromptTurn({
          ...turnOptions,
          tools: [{ name: 'read', description: 'custom read' }],
          prompt: 'go',
          emit() {},
        })
      ).done;
      expect(
        runtime.options[0].tools.map(({ name, description }) => ({
          name,
          description,
        })),
      ).toMatchInlineSnapshot(`
          [
            {
              "description": "custom read",
              "name": "read",
            },
          ]
        `);
    } finally {
      await session.doDestroy();
    }
  });

  it('cold-continues pending custom calls with original IDs and full model-facing results', async () => {
    const { sandbox } = createSandbox();
    let captured: FxToolResult | undefined;
    runtime.run = async options => {
      captured = (await invoke({
        runtimeOptions: options,
        name: 'custom',
        id: 'original-id',
        input: { value: 'x'.repeat(70000) },
      })) as FxToolResult;
    };
    const harness = createFx();
    const start = {
      sandboxSession: sandbox,
      sessionId: 'resume',
      sessionWorkDir: '/workspace',
    };
    const opts = { ...turnOptions, tools: [{ name: 'custom' }] };
    const events: HarnessV1StreamPart[] = [];
    const session = await harness.doStart(start);
    let waiting!: () => void;
    const pending = new Promise<void>(resolve => {
      waiting = resolve;
    });
    const control = await session.doPromptTurn({
      ...opts,
      prompt: 'go',
      emit: event => {
        events.push(event);
        if (event.type === 'finish-step') waiting();
      },
    });
    await pending;
    const state = await session.doSuspendTurn();
    await control.done;
    expect(events.filter(event => event.type === 'tool-call')).toHaveLength(1);
    const resumed = await harness.doStart({ ...start, continueFrom: state });
    const after: HarnessV1StreamPart[] = [];
    const continued = await resumed.doContinueTurn({
      ...opts,
      emit: event => after.push(event),
    });
    await continued.submitToolResult({
      toolCallId: 'original-id',
      output: { visible: true },
      toolResult: {
        type: 'tool-result',
        toolCallId: 'original-id',
        toolName: 'custom',
        output: { type: 'text', value: 'full-output'.repeat(20000) },
      },
    });
    await continued.done;
    expect(captured?.text.length).toBe(220000);
    expect(after.filter(event => event.type === 'tool-call')).toHaveLength(0);
    expect(after.find(event => event.type === 'tool-result')).toEqual({
      type: 'tool-result',
      toolCallId: 'original-id',
      toolName: 'custom',
      result: { visible: true },
      isError: false,
    });
    await resumed.doDestroy();
  });

  it.each([
    { name: 'write', input: { file_path: 'notes.md', content: 'hello' } },
    {
      name: 'edit',
      input: {
        file_path: 'notes.md',
        old_string: 'hello',
        new_string: 'Hello',
      },
    },
    { name: 'bash', input: { command: 'touch important' } },
  ])(
    'reports $name through tool events without workspace scans',
    async ({ name, input }) => {
      const { sandbox, run, files } = createSandbox();
      files.set('/workspace/notes.md', 'hello');
      const originalRun = run.getMockImplementation()!;
      run.mockImplementation(async input => {
        if (input.command.includes('realpath')) {
          return {
            exitCode: 0,
            stdout: Buffer.from(
              input.command.includes('notes.md')
                ? '/workspace/notes.md\0'
                : '/workspace\0',
            ).toString('base64'),
            stderr: '',
          };
        }
        return originalRun(input);
      });
      runtime.run = async options => {
        await invoke({
          runtimeOptions: options,
          name,
          id: 'mutation-id',
          input,
        });
      };
      const session = await createFx().doStart({
        sandboxSession: sandbox,
        sessionId: 'mutation',
        sessionWorkDir: '/workspace',
      });
      const events: HarnessV1StreamPart[] = [];
      try {
        await (
          await session.doPromptTurn({
            ...turnOptions,
            prompt: 'go',
            emit: event => events.push(event),
          })
        ).done;
        expect(events.some(event => event.type === 'file-change')).toBe(false);
        expect(events.find(event => event.type === 'tool-call')).toEqual({
          type: 'tool-call',
          toolCallId: 'mutation-id',
          toolName: name,
          input: JSON.stringify(input),
          nativeName: name,
          providerExecuted: true,
        });
        expect(events.find(event => event.type === 'tool-result')).toEqual({
          type: 'tool-result',
          toolCallId: 'mutation-id',
          toolName: name,
          result:
            name === 'bash'
              ? { exitCode: 0, stdout: '', stderr: '' }
              : name === 'write'
                ? 'Wrote notes.md'
                : 'Edited notes.md',
          isError: undefined,
        });
        expect(
          run.mock.calls
            .map(([call]) => call.command)
            .filter(
              command =>
                !command.includes('"$HOME"') &&
                !command.startsWith('mkdir -p --') &&
                !command.startsWith('mv --') &&
                !command.includes('realpath'),
            ),
        ).toEqual(name === 'bash' ? ['touch important'] : []);
      } finally {
        await session.doDestroy();
      }
    },
  );

  it('gates shell execution before touching the sandbox', async () => {
    const { sandbox, run } = createSandbox();
    runtime.run = async options => {
      await invoke({
        runtimeOptions: options,
        name: 'bash',
        id: 'shell-id',
        input: { command: 'touch important' },
      }).catch(() => {});
    };
    const session = await createFx().doStart({
      sandboxSession: sandbox,
      sessionId: 'approval',
      sessionWorkDir: '/workspace',
      permissionMode: 'allow-reads',
    });
    let approval!: () => void;
    const pending = new Promise<void>(resolve => {
      approval = resolve;
    });
    const control = await session.doPromptTurn({
      ...turnOptions,
      prompt: 'go',
      emit: event => {
        if (event.type === 'tool-approval-request') approval();
      },
    });
    await pending;
    expect(
      run.mock.calls.some(([call]) => call.command.includes('touch important')),
    ).toBe(false);
    await control.submitToolApproval!({
      approvalId: 'fx:shell-id',
      approved: false,
      reason: 'no',
    });
    await control.done;
    expect(
      run.mock.calls.some(([call]) => call.command.includes('touch important')),
    ).toBe(false);
    await session.doDestroy();
  });

  it('reattaches a live pending tool without restarting the runtime', async () => {
    const { sandbox } = createSandbox();
    runtime.run = async options => {
      await invoke({
        runtimeOptions: options,
        name: 'custom',
        id: 'live-id',
        input: {},
      });
    };
    const session = await createFx().doStart({
      sandboxSession: sandbox,
      sessionId: 'live',
      sessionWorkDir: '/workspace',
    });
    const opts = { ...turnOptions, tools: [{ name: 'custom' }] };
    let waiting!: () => void;
    const pending = new Promise<void>(resolve => {
      waiting = resolve;
    });
    const before: HarnessV1StreamPart[] = [];
    const control = await session.doPromptTurn({
      ...opts,
      prompt: 'go',
      emit: event => {
        before.push(event);
        if (event.type === 'finish-step') waiting();
      },
    });
    await pending;
    const after: HarnessV1StreamPart[] = [];
    const continued = await session.doContinueTurn({
      ...opts,
      emit: event => after.push(event),
    });
    expect(continued).toBe(control);
    await continued.submitToolResult({ toolCallId: 'live-id', output: 'ok' });
    await continued.done;
    expect(runtime.options).toHaveLength(1);
    expect(before.filter(event => event.type === 'tool-result')).toEqual([]);
    expect(after.find(event => event.type === 'tool-result')).toEqual({
      type: 'tool-result',
      toolCallId: 'live-id',
      toolName: 'custom',
      result: 'ok',
      isError: undefined,
    });
    await session.doDestroy();
  });

  it('does not reexecute an interrupted shell call during cold continuation', async () => {
    const { sandbox, run } = createSandbox();
    const originalRun = run.getMockImplementation()!;
    let executing!: () => void;
    const pending = new Promise<void>(resolve => {
      executing = resolve;
    });
    run.mockImplementation(async input => {
      if (input.command !== 'long-running-effect') return originalRun(input);
      executing();
      const signal = (input as { command: string; abortSignal: AbortSignal })
        .abortSignal;
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), {
          once: true,
        });
      });
    });
    const errors: string[] = [];
    runtime.run = async options => {
      await invoke({
        runtimeOptions: options,
        name: 'bash',
        id: 'interrupted-id',
        input: { command: 'long-running-effect' },
      }).catch(error => errors.push(error.message));
    };
    const harness = createFx();
    const start = {
      sandboxSession: sandbox,
      sessionId: 'interrupted',
      sessionWorkDir: '/workspace',
    };
    const session = await harness.doStart(start);
    const control = await session.doPromptTurn({
      ...turnOptions,
      prompt: 'go',
      emit() {},
    });
    await pending;
    const continueFrom = await session.doSuspendTurn();
    await control.done;
    const resumed = await harness.doStart({ ...start, continueFrom });
    const events: HarnessV1StreamPart[] = [];
    await (
      await resumed.doContinueTurn({
        ...turnOptions,
        emit: event => events.push(event),
      })
    ).done;
    expect(
      run.mock.calls.filter(
        ([input]) => input.command === 'long-running-effect',
      ),
    ).toHaveLength(1);
    expect(errors.at(-1)).toContain('its outcome is unknown');
    expect(events.find(event => event.type === 'tool-result')).toEqual({
      type: 'tool-result',
      toolCallId: 'interrupted-id',
      toolName: 'bash',
      result:
        'This tool execution was interrupted and its outcome is unknown. It was not executed again. Inspect the sandbox before retrying.',
      isError: true,
    });
    await resumed.doDestroy();
    await session.doDestroy();
  });
});

describe('fx turn failures', () => {
  it.each(['initialization', 'prompt', 'abort', 'pre-aborted'] as const)(
    'preserves the committed checkpoint and accepts a new prompt after %s failure',
    async phase => {
      const { sandbox, files } = createSandbox();
      const session = await createFx().doStart({
        sandboxSession: sandbox,
        sessionId: 'failed-turn',
        sessionWorkDir: '/workspace',
      });
      try {
        await (
          await session.doPromptTurn({
            ...turnOptions,
            prompt: 'baseline',
            emit() {},
          })
        ).done;
        const statePath = [...files.keys()].find(path =>
          path.endsWith('/state.json'),
        )!;
        const baseline = secureJsonParse(
          files.get(statePath)!,
        ) as FxStoredState;
        const failure = new Error(`${phase} failed`);
        const controller = new AbortController();
        const events: HarnessV1StreamPart[] = [];
        if (phase === 'initialization') {
          vi.mocked(createFxRuntime).mockRejectedValueOnce(failure);
        } else if (phase === 'pre-aborted') {
          controller.abort(failure);
        } else {
          runtime.run = async () => {
            if (phase === 'abort') controller.abort(failure);
            else throw failure;
          };
        }
        const failed = await session.doPromptTurn({
          ...turnOptions,
          prompt: 'fail',
          abortSignal: controller.signal,
          emit: event => events.push(event),
        });
        await expect(failed.done).rejects.toBe(failure);
        expect(events.filter(event => event.type === 'error')).toEqual([
          { type: 'error', error: failure },
        ]);
        expect(events.some(event => event.type === 'finish')).toBe(false);
        const stored = secureJsonParse(files.get(statePath)!) as FxStoredState;
        expect(stored.turn).toBeUndefined();
        expect(stored.checkpoint).toBe(baseline.checkpoint);
        await expect(
          session.doContinueTurn({ ...turnOptions, emit() {} }),
        ).rejects.toThrow('There is no suspended fx turn to continue.');
        runtime.run = undefined;
        await (
          await session.doPromptTurn({
            ...turnOptions,
            prompt: 'retry',
            emit() {},
          })
        ).done;
        expect(Array.from(runtime.options.at(-1)!.checkpoint!)).toEqual([
          1, 2, 3,
        ]);
      } finally {
        await session.doDestroy();
      }
    },
  );

  it.each(['error', 'abort'] as const)(
    'allows an immediate HarnessAgent retry while %s cleanup is pending',
    async outcome => {
      const { sandbox } = createSandbox();
      const harness = createFx();
      const start = vi.spyOn(harness, 'doStart');
      const agent = new HarnessAgent({ harness, activeTools: [] });
      const session = await agent.createSession({ sandboxSession: sandbox });
      const failure = new Error('First turn failed');
      const controller = new AbortController();
      let release!: () => void;
      const cleanup = new Promise<void>(resolve => {
        release = resolve;
      });
      let closing!: () => void;
      const closeStarted = new Promise<void>(resolve => {
        closing = resolve;
      });
      runtime.close = async () => {
        closing();
        await cleanup;
      };
      runtime.run = async () => {
        if (outcome === 'abort') controller.abort(failure);
        else throw failure;
      };
      try {
        const first = await agent.stream({
          session,
          prompt: 'fail',
          abortSignal: controller.signal,
        });
        const parts = [];
        for await (const part of first.stream) parts.push(part);
        await expect(first.text).rejects.toBe(failure);
        expect(
          parts
            .filter(part => part.type === 'error' || part.type === 'abort')
            .map(part => part.type),
        ).toEqual([outcome]);
        expect(session.hasUnfinishedTurn()).toBe(false);
        await closeStarted;
        runtime.run = undefined;
        runtime.close = undefined;
        const underlying = await start.mock.results[0].value;
        const prompt = vi.spyOn(underlying, 'doPromptTurn');
        const retry = agent.stream({ session, prompt: 'retry' });
        await vi.waitFor(() => expect(prompt).toHaveBeenCalledTimes(1));
        expect(runtime.options).toHaveLength(1);
        release();
        const second = await retry;
        const retryParts = [];
        for await (const part of second.stream) retryParts.push(part);
        expect(
          retryParts.some(
            part => part.type === 'error' || part.type === 'abort',
          ),
        ).toBe(false);
        expect(retryParts.some(part => part.type === 'finish')).toBe(true);
        await expect(second.text).resolves.toBe('');
        expect(runtime.options).toHaveLength(2);
      } finally {
        release();
        await session.destroy();
      }
    },
  );

  it.each([false, true])(
    'clears the active turn when runtime close fails (prompt failed: %s)',
    async promptFailed => {
      const { sandbox } = createSandbox();
      const session = await createFx().doStart({
        sandboxSession: sandbox,
        sessionId: 'cleanup-failed',
        sessionWorkDir: '/workspace',
      });
      const failure = new Error('Prompt failed');
      const cleanupFailure = new Error('Runtime close failed');
      runtime.run = async () => {
        if (promptFailed) throw failure;
      };
      runtime.close = async () => {
        throw cleanupFailure;
      };
      const events: HarnessV1StreamPart[] = [];
      const control = await session.doPromptTurn({
        ...turnOptions,
        prompt: 'go',
        emit: event => events.push(event),
      });
      await expect(control.done).rejects.toBe(cleanupFailure);
      if (promptFailed) {
        expect(events.filter(event => event.type === 'error')).toEqual([
          { type: 'error', error: failure },
        ]);
      }
      runtime.close = undefined;
      const stopped = await session.doStop();
      expect(stopped.continueFrom).toBeUndefined();
      await session.doDestroy();
    },
  );

  it('accepts a fresh prompt after a cold-continued turn fails', async () => {
    const { sandbox, files } = createSandbox();
    const harness = createFx();
    const start = {
      sandboxSession: sandbox,
      sessionId: 'failed-continuation',
      sessionWorkDir: '/workspace',
    };
    const session = await harness.doStart(start);
    const options = { ...turnOptions, tools: [{ name: 'custom' }] };
    let waiting!: () => void;
    const pending = new Promise<void>(resolve => {
      waiting = resolve;
    });
    runtime.run = async runtimeOptions => {
      await invoke({
        runtimeOptions,
        name: 'custom',
        id: 'pending-id',
        input: {},
      });
    };
    const first = await session.doPromptTurn({
      ...options,
      prompt: 'wait',
      emit: event => {
        if (event.type === 'finish-step') waiting();
      },
    });
    await pending;
    await session.doSuspendTurn();
    await first.done;
    const resumeFrom = await session.doStop();
    const failure = new Error('Continuation failed');
    runtime.run = async () => {
      throw failure;
    };
    const resumed = await harness.doStart({ ...start, resumeFrom });
    try {
      const continued = await resumed.doContinueTurn({ ...options, emit() {} });
      await expect(continued.done).rejects.toBe(failure);
      const stored = secureJsonParse(
        [...files.entries()].find(([path]) => path.endsWith('/state.json'))![1],
      ) as FxStoredState;
      expect(stored.turn).toBeUndefined();
      runtime.run = undefined;
      await (
        await resumed.doPromptTurn({
          ...turnOptions,
          prompt: 'fresh',
          emit() {},
        })
      ).done;
    } finally {
      await resumed.doDestroy();
      await session.doDestroy();
    }
  });
});

describe('Gateway authentication', () => {
  it.each([undefined, ''])(
    'fails before sandbox access when credentials are missing: %s',
    async apiKey => {
      vi.stubEnv('AI_GATEWAY_API_KEY', apiKey);
      vi.stubEnv('VERCEL_OIDC_TOKEN', undefined);
      const { sandbox, files, run } = createSandbox();
      const harness = createFx();
      await expect(
        harness.doStart({
          sandboxSession: sandbox,
          sessionId: 'missing-auth',
          sessionWorkDir: '/workspace',
        }),
      ).rejects.toThrow(
        'fx requires AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN in the host environment or an explicit authentication environment.',
      );
      expect(run).not.toHaveBeenCalled();
      expect(sandbox.readTextFile).not.toHaveBeenCalled();
      expect(sandbox.writeTextFile).not.toHaveBeenCalled();
      expect(files.size).toBe(0);
      expect(runtime.options).toHaveLength(0);
    },
  );

  it.each<{ auth: Record<string, string>; expected: string }>([
    { auth: { AI_GATEWAY_API_KEY: 'explicit-key' }, expected: 'explicit-key' },
    { auth: { VERCEL_OIDC_TOKEN: 'explicit-oidc' }, expected: 'explicit-oidc' },
    {
      auth: { AI_GATEWAY_API_KEY: 'preferred-key', VERCEL_OIDC_TOKEN: 'oidc' },
      expected: 'preferred-key',
    },
  ])(
    'passes the resolved credential to the runtime: $expected',
    async ({ auth, expected }) => {
      const { sandbox } = createSandbox();
      const session = await createFx({ auth }).doStart({
        sandboxSession: sandbox,
        sessionId: 'auth',
        sessionWorkDir: '/workspace',
      });
      try {
        await (
          await session.doPromptTurn({
            ...turnOptions,
            prompt: 'go',
            emit() {},
          })
        ).done;
        expect(runtime.options[0].apiKey).toBe(expected);
      } finally {
        await session.doDestroy();
      }
    },
  );

  it('does not read host credentials for an explicit empty authentication environment', async () => {
    const { sandbox, run } = createSandbox();
    await expect(
      createFx({ auth: {} }).doStart({
        sandboxSession: sandbox,
        sessionId: 'isolated-auth',
        sessionWorkDir: '/workspace',
      }),
    ).rejects.toThrow('fx requires AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN');
    expect(run).not.toHaveBeenCalled();
  });

  it('constructs without credentials', () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', undefined);
    vi.stubEnv('VERCEL_OIDC_TOKEN', undefined);
    expect(createFx().harnessId).toBe('fx');
  });

  it.each(['auto', 'direct', 'ai-gateway'] as const)(
    '%s resolves Gateway credentials',
    auth => {
      expect(
        resolveFxEnv({ auth, env: { VERCEL_OIDC_TOKEN: 'oidc' } })
          .AI_GATEWAY_API_KEY,
      ).toBe('oidc');
    },
  );
  it('treats an explicit auth environment as isolated', () => {
    expect(
      resolveFxEnv({ auth: {}, env: { AI_GATEWAY_API_KEY: 'host-key' } })
        .AI_GATEWAY_API_KEY,
    ).toBeUndefined();
  });
});

describe('tool conversion and permissions', () => {
  it('preserves typed text, JSON, denial, and error semantics', () => {
    const outputs: Array<
      NonNullable<FxToolSubmission['toolResult']>['output']
    > = [
      { type: 'text', value: 'text' },
      { type: 'json', value: { count: 2 } },
      { type: 'error-text', value: 'error text' },
      { type: 'error-json', value: { error: true } },
      { type: 'execution-denied' },
      { type: 'execution-denied', reason: 'Not permitted' },
      {
        type: 'content',
        value: [
          { type: 'text', text: 'first' },
          { type: 'text', text: '' },
          { type: 'text', text: 'second' },
        ],
      },
    ];
    expect(
      outputs.map(output =>
        toFxToolResult({
          toolCallId: 'a',
          output: 'visible',
          toolResult: {
            type: 'tool-result',
            toolCallId: 'a',
            toolName: 'tool',
            output,
          },
        }),
      ),
    ).toMatchInlineSnapshot(`
      [
        {
          "images": [],
          "isError": false,
          "text": "text",
          "type": "libfx.tool-result",
        },
        {
          "images": [],
          "isError": false,
          "text": "{"count":2}",
          "type": "libfx.tool-result",
        },
        {
          "images": [],
          "isError": true,
          "text": "error text",
          "type": "libfx.tool-result",
        },
        {
          "images": [],
          "isError": true,
          "text": "{"error":true}",
          "type": "libfx.tool-result",
        },
        {
          "images": [],
          "isError": true,
          "text": "Tool execution was denied.",
          "type": "libfx.tool-result",
        },
        {
          "images": [],
          "isError": true,
          "text": "Not permitted",
          "type": "libfx.tool-result",
        },
        {
          "images": [],
          "isError": undefined,
          "text": "first
      second",
          "type": "libfx.tool-result",
        },
      ]
    `);
    for (const output of outputs) {
      expect(
        toFxToolResult({
          toolCallId: 'a',
          output: 'visible',
          isError: true,
          toolResult: {
            type: 'tool-result',
            toolCallId: 'a',
            toolName: 'tool',
            output,
          },
        }).isError,
      ).toBe(true);
    }
  });

  it('preserves untyped output fallbacks', () => {
    expect(
      ['raw', { answer: 42 }, undefined].map(output =>
        toFxToolResult({
          toolCallId: 'a',
          output,
        }),
      ),
    ).toMatchInlineSnapshot(`
      [
        {
          "images": [],
          "isError": undefined,
          "text": "raw",
          "type": "libfx.tool-result",
        },
        {
          "images": [],
          "isError": undefined,
          "text": "{"answer":42}",
          "type": "libfx.tool-result",
        },
        {
          "images": [],
          "isError": undefined,
          "text": "null",
          "type": "libfx.tool-result",
        },
      ]
    `);
  });

  it.each(['AQID', new Uint8Array([1, 2, 3]).buffer])(
    'retains base64 and ArrayBuffer images',
    data => {
      expect(
        toFxToolResult({
          toolCallId: 'a',
          output: 'visible',
          toolResult: {
            type: 'tool-result',
            toolCallId: 'a',
            toolName: 'tool',
            output: {
              type: 'content',
              value: [
                {
                  type: 'file',
                  mediaType: 'image/png',
                  data: { type: 'data', data },
                },
              ],
            },
          },
        }),
      ).toMatchInlineSnapshot(`
        {
          "images": [
            {
              "data": "AQID",
              "mimeType": "image/png",
              "type": "image",
            },
          ],
          "isError": undefined,
          "text": "",
          "type": "libfx.tool-result",
        }
      `);
    },
  );

  it.each([
    {
      type: 'file',
      mediaType: 'application/pdf',
      data: { type: 'data', data: 'AQID' },
    },
    {
      type: 'file',
      mediaType: 'image/png',
      data: { type: 'url', url: new URL('https://example.com/image.png') },
    },
  ] as const)(
    'rejects unsupported tool model content: $mediaType / $data.type',
    part => {
      expect(() =>
        toFxToolResult({
          toolCallId: 'a',
          output: 'visible',
          toolResult: {
            type: 'tool-result',
            toolCallId: 'a',
            toolName: 'tool',
            output: { type: 'content', value: [part] },
          },
        }),
      ).toThrow(
        'Harnesses support only text and inline images in tool model output.',
      );
    },
  );

  it('retains images and error status', () => {
    expect(
      toFxToolResult({
        toolCallId: 'a',
        output: 'visible',
        toolResult: {
          type: 'tool-result',
          toolCallId: 'a',
          toolName: 'tool',
          output: {
            type: 'content',
            value: [
              { type: 'text', text: 'caption' },
              {
                type: 'file',
                mediaType: 'image/png',
                data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
              },
            ],
          },
        },
      }),
    ).toEqual({
      type: 'libfx.tool-result',
      text: 'caption',
      images: [{ type: 'image', mimeType: 'image/png', data: 'AQID' }],
      isError: undefined,
    });
  });
  it.each([
    ['allow-all', 'bash', false],
    ['allow-edits', 'bash', true],
    ['allow-edits', 'edit', false],
    ['allow-reads', 'edit', true],
    ['allow-reads', 'readonly', false],
  ] as const)(
    '%s / %s requires approval: %s',
    (permissionMode, kind, expected) => {
      expect(fxToolRequiresApproval({ permissionMode, kind })).toBe(expected);
    },
  );
});
