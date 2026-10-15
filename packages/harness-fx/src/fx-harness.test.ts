import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import type {
  HarnessV1PromptTurnOptions,
  HarnessV1StreamPart,
} from '@ai-sdk/harness';
import type { FxRuntimeOptions, FxToolResult } from './fx-runtime';
import { createFx } from './fx-harness';
import { resolveFxEnv } from './fx-auth';
import { fxToolRequiresApproval, toFxToolResult } from './fx-tools';

const runtime = vi.hoisted(() => ({
  options: [] as FxRuntimeOptions[],
  run: undefined as ((options: FxRuntimeOptions) => Promise<void>) | undefined,
}));
vi.mock('./fx-runtime', () => ({
  createFxRuntime: vi.fn(async (options: FxRuntimeOptions) => {
    runtime.options.push(options);
    return {
      checkpoint: async () => new Uint8Array([1, 2, 3]),
      close: async () => {},
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
        return { result, cancel() {}, async *[Symbol.asyncIterator]() {} };
      },
    };
  }),
}));

function createSandbox() {
  const files = new Map<string, string>();
  const run = vi.fn(async ({ command }: { command: string }) => {
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
  runtime.options.length = 0;
  runtime.run = undefined;
});

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

describe('Gateway authentication', () => {
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
