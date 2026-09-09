import {
  tool,
  type Experimental_SandboxSession,
  type ToolSet,
} from '@ai-sdk/provider-utils';
import {
  hasToolCall,
  isStepCount,
  type Telemetry,
  type TextStreamPart,
} from 'ai';
import { describe, expect, test, vi } from 'vitest';
import { z } from 'zod/v4';
import type {
  HarnessV1,
  HarnessV1PromptControl,
  HarnessV1PromptTurnOptions,
  HarnessV1Session,
  HarnessV1StreamPart,
} from '../../v1';
import { runPrompt } from './run-prompt';

const WORK_DIR = '/vercel/sandbox/claude-code-abc123';
const sandboxSession = {} as Experimental_SandboxSession;

function fakeSession(
  script: HarnessV1StreamPart[],
  onSubmitToolResult?: (input: {
    toolCallId: string;
    output: unknown;
    isError?: boolean;
    toolResult?: Parameters<
      HarnessV1PromptControl['submitToolResult']
    >[0]['toolResult'];
  }) => void,
): HarnessV1Session {
  const emitScript = (emit: (event: HarnessV1StreamPart) => void) => {
    const control: HarnessV1PromptControl = {
      submitToolResult: async input => {
        onSubmitToolResult?.(input);
      },
      done: Promise.resolve(),
    };
    queueMicrotask(() => {
      for (const event of script) emit(event);
    });
    return control;
  };
  return {
    sessionId: 'fake-session',
    isResume: false,
    doPromptTurn: async (opts: HarnessV1PromptTurnOptions) =>
      emitScript(opts.emit),
    doContinueTurn: async opts => emitScript(opts.emit),
    doCompact: async () => {},
    doDetach: async () => ({
      type: 'resume-session',
      harnessId: 'fake',
      specificationVersion: 'harness-v1',
      data: {},
    }),
    doStop: async () => ({
      type: 'resume-session',
      harnessId: 'fake',
      specificationVersion: 'harness-v1',
      data: {},
    }),
    doDestroy: async () => {},
    doSuspendTurn: async () => ({
      type: 'continue-turn',
      harnessId: 'fake',
      specificationVersion: 'harness-v1',
      data: {},
    }),
  };
}

const harness: HarnessV1 = {
  specificationVersion: 'harness-v1',
  harnessId: 'fake',
  builtinTools: {},
  doStart: async () => fakeSession([]),
};

const questionsHarness: HarnessV1 = {
  ...harness,
  builtinTools: {
    askUserQuestions: tool({
      inputSchema: z.object({
        questions: z.array(z.object({ id: z.string(), question: z.string() })),
      }),
    }),
  },
};

const finishEvents: HarnessV1StreamPart[] = [
  {
    type: 'finish-step',
    finishReason: { unified: 'stop', raw: 'end_turn' },
    usage: {
      inputTokens: {
        total: undefined,
        noCache: undefined,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: { total: undefined, text: undefined, reasoning: undefined },
    },
  },
  {
    type: 'finish',
    finishReason: { unified: 'stop', raw: 'end_turn' },
    totalUsage: {
      inputTokens: {
        total: undefined,
        noCache: undefined,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: { total: undefined, text: undefined, reasoning: undefined },
    },
  },
];

const resumableFinishStep: HarnessV1StreamPart = {
  ...(finishEvents[0]! as Extract<
    HarnessV1StreamPart,
    { type: 'finish-step' }
  >),
  finishReason: { unified: 'tool-calls', raw: 'tool_use' },
};

describe('runPrompt client-side built-in tools', () => {
  test('pauses for askUserQuestions and persists adapter metadata as provider options', async () => {
    const submitted: Parameters<
      HarnessV1PromptControl['submitToolResult']
    >[0][] = [];
    const providerMetadata = {
      fake: {
        nativeRequest: {
          questions: [{ prompt: 'Which framework?' }],
        },
      },
    };
    const pendingResults: unknown[] = [];
    const { result, done } = runPrompt({
      harness: questionsHarness,
      session: fakeSession(
        [
          {
            type: 'tool-call',
            toolCallId: 'question-call',
            toolName: 'askUserQuestions',
            input: JSON.stringify({
              allowPartialAnswers: true,
              questions: [{ id: 'question-1', question: 'Which framework?' }],
            }),
            providerExecuted: false,
            providerMetadata,
          },
        ],
        input => submitted.push(input),
      ),
      prompt: 'go',
      instructions: undefined,
      tools: questionsHarness.builtinTools,
      activeTools: {},
      toolSpecs: [],
      sandboxSession,
      sessionWorkDir: WORK_DIR,
      runtimeContext: {} as never,
      abortSignal: undefined,
      onPendingToolResult: pendingResult => {
        pendingResults.push(pendingResult);
      },
    });

    await result.consumeStream();
    await done;

    expect(submitted).toEqual([]);
    expect(pendingResults).toEqual([
      {
        toolCallId: 'question-call',
        toolName: 'askUserQuestions',
        input: JSON.stringify({
          allowPartialAnswers: true,
          questions: [{ id: 'question-1', question: 'Which framework?' }],
        }),
        providerOptions: providerMetadata,
      },
    ]);
  });
});

describe('runPrompt workDir stripping', () => {
  test('strips the workDir for consumers but executes host tools with the absolute path', async () => {
    const executedArgs: unknown[] = [];
    const readFile = tool({
      description: 'Read a file',
      inputSchema: z.object({ path: z.string() }),
      execute: async (args: { path: string }) => {
        executedArgs.push(args);
        return { ok: true };
      },
    });

    const { result, done } = runPrompt({
      harness,
      session: fakeSession([
        {
          type: 'tool-input-start',
          id: 'c1',
          toolName: 'readFile',
          providerExecuted: false,
        },
        {
          type: 'tool-input-delta',
          id: 'c1',
          delta: '{"path":"/vercel/sandbox/claude',
        },
        {
          type: 'tool-input-delta',
          id: 'c1',
          delta: '-code-abc123/src/foo.ts"}',
        },
        { type: 'tool-input-end', id: 'c1' },
        {
          type: 'tool-call',
          toolCallId: 'c1',
          toolName: 'readFile',
          input: JSON.stringify({ path: `${WORK_DIR}/src/foo.ts` }),
        },
        {
          type: 'tool-result',
          toolCallId: 'b1',
          toolName: 'bash',
          result: `${WORK_DIR}/src/foo.ts\n${WORK_DIR}/src/bar.ts\n`,
        },
        ...finishEvents,
      ]),
      prompt: 'go',
      instructions: undefined,
      tools: { readFile } as ToolSet,
      toolSpecs: [],
      sandboxSession,
      sessionWorkDir: WORK_DIR,
      runtimeContext: {} as never,
      abortSignal: undefined,
    });

    const parts: TextStreamPart<ToolSet>[] = [];
    for await (const part of result.fullStream) parts.push(part);
    await done;

    expect(parts.filter(part => part.type.startsWith('tool-input-'))).toEqual([
      {
        type: 'tool-input-start',
        id: 'c1',
        toolName: 'readFile',
        providerExecuted: false,
      },
      {
        type: 'tool-input-delta',
        id: 'c1',
        delta: '{"path":"',
      },
      {
        type: 'tool-input-delta',
        id: 'c1',
        delta: 'src/foo.ts"}',
      },
      { type: 'tool-input-end', id: 'c1' },
    ]);

    // Host tool executes with the original absolute path so it resolves
    // against the sandbox root.
    expect(executedArgs).toEqual([{ path: `${WORK_DIR}/src/foo.ts` }]);

    // The consumer-facing tool-call has a workspace-relative path.
    const toolCall = parts.find(p => p.type === 'tool-call') as Extract<
      TextStreamPart<ToolSet>,
      { type: 'tool-call' }
    >;
    expect(toolCall.input).toEqual({ path: 'src/foo.ts' });

    // The consumer-facing tool-result is stripped too.
    const toolResult = parts.find(p => p.type === 'tool-result') as Extract<
      TextStreamPart<ToolSet>,
      { type: 'tool-result' }
    >;
    expect(toolResult.output).toBe('src/foo.ts\nsrc/bar.ts\n');
  });
});

describe('runPrompt usage', () => {
  test('uses final total usage when it differs from received step usage', async () => {
    const { result, done } = runPrompt({
      harness,
      session: fakeSession([
        {
          type: 'finish-step',
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: {
            inputTokens: {
              total: 2,
              noCache: 2,
              cacheRead: 0,
              cacheWrite: 0,
            },
            outputTokens: {
              total: 5,
              text: 5,
              reasoning: 0,
            },
          },
        },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'stop' },
          totalUsage: {
            inputTokens: {
              total: 10,
              noCache: 4,
              cacheRead: 6,
              cacheWrite: 0,
            },
            outputTokens: {
              total: 40,
              text: 30,
              reasoning: 10,
            },
          },
        },
      ]),
      prompt: 'go',
      instructions: undefined,
      tools: {},
      toolSpecs: [],
      sandboxSession,
      sessionWorkDir: WORK_DIR,
      runtimeContext: {} as never,
      abortSignal: undefined,
    });

    await done;
    await result.consumeStream();

    await expect(result.usage).resolves.toEqual({
      inputTokens: 10,
      inputTokenDetails: {
        noCacheTokens: 4,
        cacheReadTokens: 6,
        cacheWriteTokens: 0,
      },
      outputTokens: 40,
      outputTokenDetails: {
        textTokens: 30,
        reasoningTokens: 10,
      },
      totalTokens: 50,
      raw: undefined,
    });
  });
});

describe('runPrompt telemetry lifecycle', () => {
  test('does not settle until async end callbacks complete in order', async () => {
    const events: string[] = [];
    let resolveLanguageModelEnd!: () => void;
    let resolveStepEnd!: () => void;
    let resolveEnd!: () => void;
    const languageModelEnd = new Promise<void>(resolve => {
      resolveLanguageModelEnd = resolve;
    });
    const stepEnd = new Promise<void>(resolve => {
      resolveStepEnd = resolve;
    });
    const end = new Promise<void>(resolve => {
      resolveEnd = resolve;
    });
    const integration = {
      async onLanguageModelCallEnd() {
        events.push('language-model-end:start');
        await languageModelEnd;
        events.push('language-model-end:done');
      },
      async onStepEnd() {
        events.push('step-end:start');
        await stepEnd;
        events.push('step-end:done');
      },
      async onEnd() {
        events.push('end:start');
        await end;
        events.push('end:done');
      },
    } satisfies Telemetry;

    const { result, done } = runPrompt({
      harness,
      session: fakeSession([
        { type: 'stream-start' },
        { type: 'text-delta', id: 'text-1', delta: 'done' },
        finishEvents[0]!,
        { type: 'text-delta', id: 'text-2', delta: 'ignored' },
      ]),
      prompt: 'go',
      instructions: undefined,
      tools: {} as ToolSet,
      toolSpecs: [],
      sandboxSession,
      sessionWorkDir: WORK_DIR,
      runtimeContext: {} as never,
      abortSignal: undefined,
      stopConditions: [({ steps }) => steps.length === 1],
      telemetry: { integrations: [integration] },
    });

    let settled = false;
    void done.finally(() => {
      settled = true;
    });
    const consumeStream = (async () => {
      for await (const _part of result.fullStream) {
        // Drain the stream while lifecycle callbacks are gated.
      }
    })();

    await vi.waitFor(() => {
      expect(events).toEqual(['language-model-end:start']);
    });
    expect(settled).toBe(false);

    resolveLanguageModelEnd();
    await vi.waitFor(() => {
      expect(events).toEqual([
        'language-model-end:start',
        'language-model-end:done',
        'step-end:start',
      ]);
    });
    expect(settled).toBe(false);

    resolveStepEnd();
    await vi.waitFor(() => {
      expect(events).toEqual([
        'language-model-end:start',
        'language-model-end:done',
        'step-end:start',
        'step-end:done',
        'end:start',
      ]);
    });
    expect(settled).toBe(false);

    resolveEnd();
    await Promise.all([done, consumeStream]);
    expect(settled).toBe(true);
    expect(events).toEqual([
      'language-model-end:start',
      'language-model-end:done',
      'step-end:start',
      'step-end:done',
      'end:start',
      'end:done',
    ]);
  });
});

describe('runPrompt step accounting', () => {
  test('records one step per finish-step without counting terminal finish', async () => {
    const { result, done } = runPrompt({
      harness,
      session: fakeSession([
        { type: 'text-delta', id: 't1', delta: 'first' },
        resumableFinishStep,
        { type: 'text-delta', id: 't2', delta: 'second' },
        ...finishEvents,
      ]),
      prompt: 'go',
      instructions: undefined,
      tools: {},
      toolSpecs: [],
      sandboxSession,
      sessionWorkDir: WORK_DIR,
      runtimeContext: {} as never,
      abortSignal: undefined,
    });

    await done;
    await result.consumeStream();

    const steps = await result.steps;
    expect(steps).toHaveLength(2);
    expect(steps.map(step => step.stepNumber)).toEqual([0, 1]);
    expect(steps.map(step => step.text)).toEqual(['first', 'second']);
    expect(await isStepCount(2)({ steps })).toBe(true);
  });

  test('keeps tool calls and results in one predicate-compatible step', async () => {
    const weather = tool({
      description: 'Get weather',
      inputSchema: z.object({ city: z.string() }),
      execute: async () => ({ temperature: 72 }),
    });
    const { result, done } = runPrompt({
      harness,
      session: fakeSession([
        {
          type: 'tool-call',
          toolCallId: 'c1',
          toolName: 'weather',
          input: JSON.stringify({ city: 'SF' }),
        },
        {
          type: 'tool-result',
          toolCallId: 'c1',
          toolName: 'weather',
          result: { temperature: 72 },
        },
        ...finishEvents,
      ]),
      prompt: 'go',
      instructions: undefined,
      tools: { weather } as ToolSet,
      toolSpecs: [],
      sandboxSession,
      sessionWorkDir: WORK_DIR,
      runtimeContext: {} as never,
      abortSignal: undefined,
    });

    await done;
    await result.consumeStream();

    const steps = await result.steps;
    expect(steps).toHaveLength(1);
    expect(steps[0]!.content.map(part => part.type)).toEqual([
      'tool-call',
      'tool-result',
    ]);
    expect(steps[0]!.toolCalls).toHaveLength(1);
    expect(steps[0]!.toolResults).toHaveLength(1);
    expect(await hasToolCall('weather')({ steps })).toBe(true);
  });

  test('surfaces a failed provider-executed tool result as a tool-error carrying the runtime message', async () => {
    const weather = tool({
      description: 'Get weather',
      inputSchema: z.object({ city: z.string() }),
    });
    const { result, done } = runPrompt({
      harness,
      session: fakeSession([
        {
          type: 'tool-call',
          toolCallId: 'c1',
          toolName: 'weather',
          input: JSON.stringify({ city: 'SF' }),
          providerExecuted: true,
        },
        {
          type: 'tool-result',
          toolCallId: 'c1',
          toolName: 'weather',
          result: 'weather service unreachable',
          isError: true,
        },
        ...finishEvents,
      ]),
      prompt: 'go',
      instructions: undefined,
      tools: { weather } as ToolSet,
      toolSpecs: [],
      sandboxSession,
      sessionWorkDir: WORK_DIR,
      runtimeContext: {} as never,
      abortSignal: undefined,
    });

    const parts: TextStreamPart<ToolSet>[] = [];
    for await (const part of result.fullStream) parts.push(part);
    await done;

    expect(parts).toContainEqual(
      expect.objectContaining({
        type: 'tool-error',
        toolCallId: 'c1',
        toolName: 'weather',
        error: 'weather service unreachable',
        providerExecuted: true,
      }),
    );
    expect(parts).not.toContainEqual(
      expect.objectContaining({ type: 'tool-result', toolCallId: 'c1' }),
    );

    const steps = await result.steps;
    expect(steps[0]!.content.map(part => part.type)).toEqual([
      'tool-call',
      'tool-error',
    ]);
  });

  /*
   * A host tool's failure is echoed back on the same wire event as a
   * provider-executed one; only the originating `tool-call` tells them apart.
   */
  const streamFailedHostTool = async (toolCall: {
    providerExecuted?: boolean;
  }): Promise<TextStreamPart<ToolSet>[]> => {
    const weather = tool({
      description: 'Get weather',
      inputSchema: z.object({ city: z.string() }),
      execute: async (): Promise<{ temperature: number }> => {
        throw new Error('weather unavailable');
      },
    });
    const { result, done } = runPrompt({
      harness,
      session: fakeSession([
        {
          type: 'tool-call',
          toolCallId: 'c1',
          toolName: 'weather',
          input: JSON.stringify({ city: 'SF' }),
          ...toolCall,
        },
        {
          type: 'tool-result',
          toolCallId: 'c1',
          toolName: 'weather',
          result: { error: 'Error: weather unavailable' },
          isError: true,
        },
        ...finishEvents,
      ]),
      prompt: 'go',
      instructions: undefined,
      tools: { weather } as ToolSet,
      toolSpecs: [],
      sandboxSession,
      sessionWorkDir: WORK_DIR,
      runtimeContext: {} as never,
      abortSignal: undefined,
    });

    const parts: TextStreamPart<ToolSet>[] = [];
    for await (const part of result.fullStream) parts.push(part);
    await done;
    return parts;
  };

  const expectHostToolFailure = (parts: TextStreamPart<ToolSet>[]): void => {
    // Marking this provider-executed would bypass the consumer's `onError`.
    expect(parts).not.toContainEqual(
      expect.objectContaining({ type: 'tool-error', toolCallId: 'c1' }),
    );
    expect(parts).toContainEqual(
      expect.objectContaining({
        type: 'tool-result',
        toolCallId: 'c1',
        output: { error: 'Error: weather unavailable' },
      }),
    );
  };

  test('does not mark a failed host tool result as provider-executed', async () => {
    expectHostToolFailure(
      await streamFailedHostTool({ providerExecuted: false }),
    );
  });

  test('treats a failed host tool result as host-executed when providerExecuted is omitted', async () => {
    expectHostToolFailure(await streamFailedHostTool({}));
  });

  test('falls back to provider-executed when the originating tool call is not in this slice', async () => {
    const { result, done } = runPrompt({
      harness,
      session: fakeSession([
        {
          type: 'tool-result',
          toolCallId: 'c1',
          toolName: 'bash',
          result: 'bash: command not found: pnpmm',
          isError: true,
        },
        ...finishEvents,
      ]),
      prompt: 'go',
      instructions: undefined,
      tools: {} as ToolSet,
      toolSpecs: [],
      sandboxSession,
      sessionWorkDir: WORK_DIR,
      runtimeContext: {} as never,
      abortSignal: undefined,
    });

    const parts: TextStreamPart<ToolSet>[] = [];
    for await (const part of result.fullStream) parts.push(part);
    await done;

    expect(parts).toContainEqual(
      expect.objectContaining({
        type: 'tool-error',
        toolCallId: 'c1',
        error: 'bash: command not found: pnpmm',
        providerExecuted: true,
      }),
    );
  });

  test('does not expose provider-executed tool calls as pending client results', async () => {
    const pending: unknown[] = [];
    const weather = tool({
      description: 'Get weather',
      inputSchema: z.object({ city: z.string() }),
    });
    const { result, done } = runPrompt({
      harness,
      session: fakeSession([
        {
          type: 'tool-call',
          toolCallId: 'c1',
          toolName: 'weather',
          input: JSON.stringify({ city: 'SF' }),
          providerExecuted: true,
        },
        ...finishEvents,
      ]),
      prompt: 'go',
      instructions: undefined,
      tools: { weather } as ToolSet,
      toolSpecs: [],
      sandboxSession,
      sessionWorkDir: WORK_DIR,
      runtimeContext: {} as never,
      abortSignal: undefined,
      onPendingToolResult: pendingResult => pending.push(pendingResult),
    });

    await done;
    await result.consumeStream();

    expect(pending).toEqual([]);
    await expect(result.steps).resolves.toHaveLength(1);
  });

  test('closes a deliberately suspended mid-step stream without failing the turn', async () => {
    const onTurnFailed = vi.fn();
    const { result, done } = runPrompt({
      harness,
      session: fakeSession([
        { type: 'text-start', id: 't1' },
        { type: 'text-delta', id: 't1', delta: 'partial' },
      ]),
      prompt: 'go',
      instructions: undefined,
      tools: {},
      toolSpecs: [],
      sandboxSession,
      sessionWorkDir: WORK_DIR,
      runtimeContext: {} as never,
      abortSignal: undefined,
      isTurnSuspending: () => true,
      onTurnFailed,
    });

    const parts: TextStreamPart<ToolSet>[] = [];
    for await (const part of result.fullStream) parts.push(part);
    await done;

    expect(parts.some(part => part.type === 'error')).toBe(false);
    expect(parts).toContainEqual(
      expect.objectContaining({ type: 'text-delta', text: 'partial' }),
    );
    expect(onTurnFailed).not.toHaveBeenCalled();
    await expect(result.steps).resolves.toEqual([]);
  });

  test('fails a mid-step stream that closes without an intentional suspension', async () => {
    const onTurnFailed = vi.fn();
    const { result, done } = runPrompt({
      harness,
      session: fakeSession([
        { type: 'text-start', id: 't1' },
        { type: 'text-delta', id: 't1', delta: 'partial' },
      ]),
      prompt: 'go',
      instructions: undefined,
      tools: {},
      toolSpecs: [],
      sandboxSession,
      sessionWorkDir: WORK_DIR,
      runtimeContext: {} as never,
      abortSignal: undefined,
      onTurnFailed,
    });

    const parts: TextStreamPart<ToolSet>[] = [];
    for await (const part of result.fullStream) parts.push(part);
    await done;

    expect(parts).toContainEqual({
      type: 'error',
      error: expect.objectContaining({
        message: expect.stringContaining('unclosed step content'),
      }),
    });
    expect(onTurnFailed).toHaveBeenCalledTimes(1);
    await expect(result.steps).rejects.toThrow(/unclosed step content/);
  });

  test('fails when terminal finish receives unclosed step content', async () => {
    const { result, done } = runPrompt({
      harness,
      session: fakeSession([
        { type: 'text-delta', id: 't1', delta: 'unclosed' },
        finishEvents[1]!,
      ]),
      prompt: 'go',
      instructions: undefined,
      tools: {},
      toolSpecs: [],
      sandboxSession,
      sessionWorkDir: WORK_DIR,
      runtimeContext: {} as never,
      abortSignal: undefined,
    });

    const parts: TextStreamPart<ToolSet>[] = [];
    for await (const part of result.fullStream) parts.push(part);
    await done;

    expect(parts).toContainEqual({
      type: 'error',
      error: expect.objectContaining({
        message: expect.stringContaining('unclosed step content'),
      }),
    });
    await expect(result.steps).rejects.toThrow(/unclosed step content/);
  });

  test('allows an empty terminal turn without recording a step', async () => {
    const { result, done } = runPrompt({
      harness,
      session: fakeSession([finishEvents[1]!]),
      prompt: 'go',
      instructions: undefined,
      tools: {},
      toolSpecs: [],
      sandboxSession,
      sessionWorkDir: WORK_DIR,
      runtimeContext: {} as never,
      abortSignal: undefined,
    });

    await done;
    await result.consumeStream();

    await expect(result.steps).resolves.toEqual([]);
    await expect(result.text).resolves.toBe('');
  });

  test('evaluates stop conditions only after real finish-step events', async () => {
    const stepCounts: number[] = [];
    let stopBoundaryCount = 0;
    const { result, done } = runPrompt({
      harness,
      session: fakeSession([
        { type: 'text-delta', id: 't1', delta: 'first' },
        resumableFinishStep,
        { type: 'text-delta', id: 't2', delta: 'second' },
        resumableFinishStep,
        { type: 'text-delta', id: 't3', delta: 'third' },
        ...finishEvents,
      ]),
      prompt: 'go',
      instructions: undefined,
      tools: {},
      toolSpecs: [],
      sandboxSession,
      sessionWorkDir: WORK_DIR,
      runtimeContext: {} as never,
      abortSignal: undefined,
      stopConditions: [
        async ({ steps }) => {
          stepCounts.push(steps.length);
          return steps.length === 2;
        },
      ],
      onStopConditionMet: async () => {
        stopBoundaryCount += 1;
      },
    });

    await done;
    await result.consumeStream();

    expect(stepCounts).toEqual([1, 2]);
    expect(stopBoundaryCount).toBe(1);
    expect((await result.steps).map(step => step.text)).toEqual([
      'first',
      'second',
    ]);
  });

  test('lets a terminal text-only step emit finish even when stopWhen matches its step count', async () => {
    let predicateCount = 0;
    let stopBoundaryCount = 0;
    const { result, done } = runPrompt({
      harness,
      session: fakeSession([
        { type: 'text-delta', id: 't1', delta: 'done' },
        ...finishEvents,
      ]),
      prompt: 'go',
      instructions: undefined,
      tools: {},
      toolSpecs: [],
      sandboxSession,
      sessionWorkDir: WORK_DIR,
      runtimeContext: {} as never,
      abortSignal: undefined,
      stopConditions: [
        ({ steps }) => {
          predicateCount += 1;
          return steps.length === 1;
        },
      ],
      onStopConditionMet: async () => {
        stopBoundaryCount += 1;
      },
    });
    const partTypes: string[] = [];

    for await (const part of result.fullStream) partTypes.push(part.type);
    await done;

    expect(predicateCount).toBe(0);
    expect(stopBoundaryCount).toBe(0);
    expect(partTypes.slice(-2)).toEqual(['finish-step', 'finish']);
    await expect(result.finishReason).resolves.toBe('stop');
    await expect(result.text).resolves.toBe('done');
  });

  test('stops before a next-step tool call when the completed step has no tool calls', async () => {
    const weather = tool({
      description: 'Get weather',
      inputSchema: z.object({ city: z.string() }),
    });
    let stopBoundaryCount = 0;
    const { result, done } = runPrompt({
      harness,
      session: fakeSession([
        { type: 'text-delta', id: 't1', delta: 'first' },
        finishEvents[0]!,
        {
          type: 'tool-call',
          toolCallId: 'c1',
          toolName: 'weather',
          input: JSON.stringify({ city: 'Lima' }),
          providerExecuted: true,
        },
      ]),
      prompt: 'go',
      instructions: undefined,
      tools: { weather },
      toolSpecs: [],
      sandboxSession,
      sessionWorkDir: WORK_DIR,
      runtimeContext: {} as never,
      abortSignal: undefined,
      stopConditions: [({ steps }) => steps.length === 1],
      onStopConditionMet: async () => {
        stopBoundaryCount += 1;
      },
    });
    const parts: TextStreamPart<ToolSet>[] = [];

    for await (const part of result.fullStream) parts.push(part);
    await done;

    expect(stopBoundaryCount).toBe(1);
    expect(parts.some(part => part.type === 'tool-call')).toBe(false);
    expect((await result.steps).map(step => step.text)).toEqual(['first']);
  });

  test('processes a lookahead event exactly once when stop conditions do not match', async () => {
    const stepCounts: number[] = [];
    const { result, done } = runPrompt({
      harness,
      session: fakeSession([
        { type: 'text-delta', id: 't1', delta: 'first' },
        finishEvents[0]!,
        { type: 'text-start', id: 't2' },
        { type: 'text-delta', id: 't2', delta: 'second' },
        { type: 'text-end', id: 't2' },
        ...finishEvents,
      ]),
      prompt: 'go',
      instructions: undefined,
      tools: {},
      toolSpecs: [],
      sandboxSession,
      sessionWorkDir: WORK_DIR,
      runtimeContext: {} as never,
      abortSignal: undefined,
      stopConditions: [
        ({ steps }) => {
          stepCounts.push(steps.length);
          return false;
        },
      ],
    });
    const parts: TextStreamPart<ToolSet>[] = [];

    for await (const part of result.fullStream) parts.push(part);
    await done;

    expect(stepCounts).toEqual([1]);
    expect(
      parts.filter(
        part => part.type === 'text-delta' && part.text === 'second',
      ),
    ).toHaveLength(1);
    expect((await result.steps).map(step => step.text)).toEqual([
      'first',
      'second',
    ]);
  });
});

type SubmittedResult = {
  toolCallId: string;
  output: unknown;
  isError?: boolean;
};

function toolResultParts(
  parts: TextStreamPart<ToolSet>[],
): Extract<TextStreamPart<ToolSet>, { type: 'tool-result' }>[] {
  return parts.filter(p => p.type === 'tool-result') as Extract<
    TextStreamPart<ToolSet>,
    { type: 'tool-result' }
  >[];
}

describe('runPrompt host tool generator results', () => {
  test('suppresses replayed tool input for settled host calls', async () => {
    const submitted: SubmittedResult[] = [];
    const { result, done } = runPrompt({
      harness,
      session: fakeSession(
        [
          {
            type: 'tool-input-start',
            id: 'c1',
            toolName: 'weather',
            providerExecuted: false,
          },
          {
            type: 'tool-input-delta',
            id: 'c1',
            delta: '{"city":"SF"}',
          },
          { type: 'tool-input-end', id: 'c1' },
          {
            type: 'tool-call',
            toolCallId: 'c1',
            toolName: 'weather',
            input: '{"city":"SF"}',
          },
          ...finishEvents,
        ],
        input => submitted.push(input),
      ),
      mode: 'continue',
      instructions: undefined,
      tools: {},
      toolSpecs: [],
      sandboxSession,
      sessionWorkDir: WORK_DIR,
      runtimeContext: {} as never,
      abortSignal: undefined,
      pendingToolResults: [
        {
          toolCallId: 'c1',
          toolName: 'weather',
          input: '{"city":"SF"}',
        },
      ],
      toolResultContinuations: [
        {
          type: 'tool-result',
          toolCallId: 'c1',
          toolName: 'weather',
          output: {
            type: 'json',
            value: { city: 'SF', temperature: 72 },
          },
        },
      ],
    });

    const parts: TextStreamPart<ToolSet>[] = [];
    for await (const part of result.fullStream) parts.push(part);
    await done;

    expect(submitted).toEqual([
      {
        toolCallId: 'c1',
        output: { city: 'SF', temperature: 72 },
        isError: undefined,
        toolResult: {
          type: 'tool-result',
          toolCallId: 'c1',
          toolName: 'weather',
          output: {
            type: 'json',
            value: { city: 'SF', temperature: 72 },
          },
        },
      },
    ]);
    expect(
      parts.some(
        part =>
          part.type === 'tool-input-start' ||
          part.type === 'tool-input-delta' ||
          part.type === 'tool-input-end' ||
          part.type === 'tool-call',
      ),
    ).toBe(false);
  });

  test('executes independent host tool calls concurrently', async () => {
    const submitted: SubmittedResult[] = [];
    let activeTools = 0;
    let maxActiveTools = 0;
    let firstObservedSecondStart = false;
    let resolveSecondStarted!: () => void;
    const secondStarted = new Promise<void>(resolve => {
      resolveSecondStarted = resolve;
    });
    const startTool = () => {
      activeTools += 1;
      maxActiveTools = Math.max(maxActiveTools, activeTools);
    };
    const finishTool = () => {
      activeTools -= 1;
    };
    const first = tool({
      description: 'First independent tool',
      inputSchema: z.object({}),
      execute: async () => {
        startTool();
        let timer: ReturnType<typeof setTimeout> | undefined;
        firstObservedSecondStart = await Promise.race([
          secondStarted.then(() => true),
          new Promise<boolean>(resolve => {
            timer = setTimeout(() => resolve(false), 100);
          }),
        ]);
        if (timer != null) clearTimeout(timer);
        finishTool();
        return { tool: 'first' };
      },
    });
    const second = tool({
      description: 'Second independent tool',
      inputSchema: z.object({}),
      execute: async () => {
        startTool();
        resolveSecondStarted();
        finishTool();
        return { tool: 'second' };
      },
    });

    const { result, done } = runPrompt({
      harness,
      session: fakeSession(
        [
          {
            type: 'tool-call',
            toolCallId: 'c1',
            toolName: 'first',
            input: '{}',
          },
          {
            type: 'tool-call',
            toolCallId: 'c2',
            toolName: 'second',
            input: '{}',
          },
          ...finishEvents,
        ],
        input => submitted.push(input),
      ),
      prompt: 'go',
      instructions: undefined,
      tools: { first, second } as ToolSet,
      toolSpecs: [],
      sandboxSession,
      sessionWorkDir: WORK_DIR,
      runtimeContext: {} as never,
      abortSignal: undefined,
    });

    for await (const _part of result.fullStream) {
      // Drain the stream so both executions and the step boundary settle.
    }
    await done;

    expect(firstObservedSecondStart).toBe(true);
    expect(maxActiveTools).toBe(2);
    expect(submitted.map(result => result.toolCallId).sort()).toEqual([
      'c1',
      'c2',
    ]);
  });

  test('waits for every concurrent host tool when result submission fails', async () => {
    const submittedToolCallIds: string[] = [];
    let resolveSlowTool!: () => void;
    const slowToolCanFinish = new Promise<void>(resolve => {
      resolveSlowTool = resolve;
    });
    let slowToolFinished = false;
    let resolveFailedSubmission!: () => void;
    const failedSubmission = new Promise<void>(resolve => {
      resolveFailedSubmission = resolve;
    });
    let failedSubmissionAttempts = 0;
    const fast = tool({
      description: 'Fast independent tool',
      inputSchema: z.object({}),
      execute: async () => ({ tool: 'fast' }),
    });
    const slow = tool({
      description: 'Slow independent tool',
      inputSchema: z.object({}),
      execute: async () => {
        await slowToolCanFinish;
        slowToolFinished = true;
        return { tool: 'slow' };
      },
    });

    const { result, done } = runPrompt({
      harness,
      session: fakeSession(
        [
          {
            type: 'tool-call',
            toolCallId: 'fast-call',
            toolName: 'fast',
            input: '{}',
          },
          {
            type: 'tool-call',
            toolCallId: 'slow-call',
            toolName: 'slow',
            input: '{}',
          },
          ...finishEvents,
        ],
        input => {
          submittedToolCallIds.push(input.toolCallId);
          if (input.toolCallId === 'fast-call') {
            failedSubmissionAttempts += 1;
            if (failedSubmissionAttempts === 2) {
              resolveFailedSubmission();
            }
            throw new Error('result submission failed');
          }
        },
      ),
      prompt: 'go',
      instructions: undefined,
      tools: { fast, slow } as ToolSet,
      toolSpecs: [],
      sandboxSession,
      sessionWorkDir: WORK_DIR,
      runtimeContext: {} as never,
      abortSignal: undefined,
    });

    let turnSettled = false;
    void done.then(() => {
      turnSettled = true;
    });
    const consumeStream = result.consumeStream();

    try {
      await failedSubmission;
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(slowToolFinished).toBe(false);
      expect(turnSettled).toBe(false);
    } finally {
      resolveSlowTool();
      await Promise.all([done, consumeStream]);
    }

    expect(slowToolFinished).toBe(true);
    expect(turnSettled).toBe(true);
    expect(submittedToolCallIds).toEqual([
      'fast-call',
      'fast-call',
      'slow-call',
    ]);
    await expect(result.finishReason).rejects.toThrow(
      'result submission failed',
    );
  });

  test('pauses custom tool execution when approval is required', async () => {
    const submitted: SubmittedResult[] = [];
    const pending: unknown[] = [];
    let stopConditionCalls = 0;
    let stopBoundaryCalls = 0;
    const weather = tool({
      description: 'Get weather',
      inputSchema: z.object({ city: z.string() }),
      execute: async () => ({ temperature: 72 }),
    });

    const { result, done } = runPrompt({
      harness,
      session: fakeSession(
        [
          {
            type: 'tool-call',
            toolCallId: 'c1',
            toolName: 'weather',
            input: JSON.stringify({ city: 'SF' }),
          },
        ],
        input => submitted.push(input),
      ),
      prompt: 'go',
      instructions: undefined,
      tools: { weather } as ToolSet,
      toolSpecs: [],
      sandboxSession,
      sessionWorkDir: WORK_DIR,
      runtimeContext: {} as never,
      abortSignal: undefined,
      toolApproval: { weather: 'user-approval' },
      stopConditions: [
        () => {
          stopConditionCalls += 1;
          return true;
        },
      ],
      onStopConditionMet: async () => {
        stopBoundaryCalls += 1;
      },
      onPendingToolApproval: approval => pending.push(approval),
    });

    const parts: TextStreamPart<ToolSet>[] = [];
    for await (const part of result.fullStream) parts.push(part);
    await done;

    expect(submitted).toEqual([]);
    expect(await result.finishReason).toBe('tool-calls');
    expect(pending).toEqual([
      {
        approvalId: expect.any(String),
        toolCallId: 'c1',
        toolName: 'weather',
        input: JSON.stringify({ city: 'SF' }),
        kind: 'custom',
        providerExecuted: false,
      },
    ]);
    expect(parts.map(part => part.type)).toContain('tool-approval-request');
    const approvalRequest = parts.find(
      part => part.type === 'tool-approval-request',
    ) as Extract<TextStreamPart<ToolSet>, { type: 'tool-approval-request' }>;
    expect(approvalRequest.toolCall.toolName).toBe('weather');
    expect(approvalRequest.toolCall.input).toEqual({ city: 'SF' });
    const steps = await result.steps;
    expect(steps).toHaveLength(1);
    expect(steps[0]!.finishReason).toBe('tool-calls');
    expect(steps[0]!.content.map(part => part.type)).toEqual([
      'tool-call',
      'tool-approval-request',
    ]);
    expect(stopConditionCalls).toBe(0);
    expect(stopBoundaryCalls).toBe(0);
  });

  test('surfaces every approval request from a counted tool-call step', async () => {
    const pending: unknown[] = [];
    const weather = tool({
      description: 'Get weather',
      inputSchema: z.object({ city: z.string() }),
      execute: async () => ({ temperature: 72 }),
    });

    const { result, done } = runPrompt({
      harness,
      session: fakeSession([
        {
          type: 'tool-call',
          toolCallId: 'c1',
          toolName: 'weather',
          input: JSON.stringify({ city: 'SF' }),
          stepToolCallCount: 2,
        },
        {
          type: 'tool-call',
          toolCallId: 'c2',
          toolName: 'weather',
          input: JSON.stringify({ city: 'NYC' }),
          stepToolCallCount: 2,
        },
      ]),
      prompt: 'go',
      instructions: undefined,
      tools: { weather } as ToolSet,
      toolSpecs: [],
      sandboxSession,
      sessionWorkDir: WORK_DIR,
      runtimeContext: {} as never,
      abortSignal: undefined,
      toolApproval: { weather: 'user-approval' },
      onPendingToolApproval: approval => pending.push(approval),
    });

    const parts: TextStreamPart<ToolSet>[] = [];
    for await (const part of result.fullStream) parts.push(part);
    await done;

    expect(pending).toEqual([
      expect.objectContaining({ toolCallId: 'c1' }),
      expect.objectContaining({ toolCallId: 'c2' }),
    ]);
    expect(
      parts
        .filter(part => part.type === 'tool-approval-request')
        .map(part => part.toolCall.toolCallId),
    ).toEqual(['c1', 'c2']);
    expect((await result.steps)[0]!.content.map(part => part.type)).toEqual([
      'tool-call',
      'tool-approval-request',
      'tool-call',
      'tool-approval-request',
    ]);
  });

  test('denies custom tools configured with denied approval status', async () => {
    const submitted: SubmittedResult[] = [];
    const weather = tool({
      description: 'Get weather',
      inputSchema: z.object({ city: z.string() }),
      execute: async () => ({ temperature: 72 }),
    });

    const { result, done } = runPrompt({
      harness,
      session: fakeSession(
        [
          {
            type: 'tool-call',
            toolCallId: 'c1',
            toolName: 'weather',
            input: JSON.stringify({ city: 'SF' }),
          },
          ...finishEvents,
        ],
        input => submitted.push(input),
      ),
      prompt: 'go',
      instructions: undefined,
      tools: { weather } as ToolSet,
      toolSpecs: [],
      sandboxSession,
      sessionWorkDir: WORK_DIR,
      runtimeContext: {} as never,
      abortSignal: undefined,
      toolApproval: {
        weather: { type: 'denied', reason: 'weather disabled' },
      },
    });

    const parts: TextStreamPart<ToolSet>[] = [];
    for await (const part of result.fullStream) parts.push(part);
    await done;

    expect(submitted).toEqual([
      {
        toolCallId: 'c1',
        output: {
          type: 'execution-denied',
          reason: 'weather disabled',
        },
      },
    ]);
    expect(parts).toContainEqual(
      expect.objectContaining({
        type: 'tool-approval-request',
        isAutomatic: true,
      }),
    );
    expect(parts).toContainEqual(
      expect.objectContaining({
        type: 'tool-approval-response',
        approved: false,
        reason: 'weather disabled',
        providerExecuted: false,
      }),
    );
    const steps = await result.steps;
    expect(steps).toHaveLength(1);
    expect(steps[0]!.content.map(part => part.type)).toEqual([
      'tool-call',
      'tool-approval-request',
      'tool-approval-response',
    ]);
  });

  test('emits one final result after approved pending custom tool execution', async () => {
    const submitted: SubmittedResult[] = [];
    const settled: string[] = [];
    const telemetryEvents: string[] = [];
    const integration = {
      onToolExecutionStart() {
        telemetryEvents.push('tool-start');
      },
      async executeTool({ execute }) {
        telemetryEvents.push('wrapper-start');
        const output = await execute();
        telemetryEvents.push('wrapper-end');
        return output;
      },
      onToolExecutionEnd() {
        telemetryEvents.push('tool-end');
      },
    } satisfies Telemetry;
    const weather = tool({
      description: 'Get weather',
      inputSchema: z.object({ city: z.string() }),
      execute: async (args: { city: string }) => ({
        city: args.city,
        temperature: 72,
      }),
    });

    const { result, done } = runPrompt({
      harness,
      session: fakeSession(
        [
          {
            type: 'tool-input-start',
            id: 'c1',
            toolName: 'weather',
            providerExecuted: false,
          },
          {
            type: 'tool-input-delta',
            id: 'c1',
            delta: '{"city":"SF"}',
          },
          { type: 'tool-input-end', id: 'c1' },
          {
            type: 'tool-call',
            toolCallId: 'c1',
            toolName: 'weather',
            input: '{"city":"SF"}',
          },
          {
            type: 'tool-approval-request',
            approvalId: 'approval-1',
            toolCallId: 'c1',
          },
          {
            type: 'tool-result',
            toolCallId: 'c1',
            toolName: 'weather',
            result: { city: 'SF', temperature: 72 },
          },
        ],
        input => submitted.push(input),
      ),
      mode: 'continue',
      instructions: undefined,
      tools: { weather } as ToolSet,
      toolSpecs: [],
      sandboxSession,
      sessionWorkDir: WORK_DIR,
      runtimeContext: {} as never,
      abortSignal: undefined,
      pendingToolApprovals: [
        {
          approvalId: 'approval-1',
          toolCallId: 'c1',
          toolName: 'weather',
          input: JSON.stringify({ city: 'SF' }),
          kind: 'custom',
          providerExecuted: false,
        },
      ],
      toolApprovalContinuations: [
        {
          type: 'tool-approval-response',
          approvalId: 'approval-1',
          approved: true,
        },
      ],
      onToolApprovalSettled: approvalId => settled.push(approvalId),
      telemetry: { integrations: [integration] },
    });

    const parts: TextStreamPart<ToolSet>[] = [];
    for await (const part of result.fullStream) parts.push(part);
    await done;

    expect(settled).toEqual(['approval-1']);
    expect(submitted).toEqual([
      { toolCallId: 'c1', output: { city: 'SF', temperature: 72 } },
    ]);
    expect(telemetryEvents).toEqual([
      'wrapper-start',
      'wrapper-end',
      'tool-start',
      'tool-end',
    ]);
    expect(parts).toContainEqual(
      expect.objectContaining({
        type: 'tool-approval-response',
        approvalId: 'approval-1',
        approved: true,
      }),
    );
    expect(toolResultParts(parts)).toEqual([
      expect.objectContaining({
        toolCallId: 'c1',
        toolName: 'weather',
        output: { city: 'SF', temperature: 72 },
      }),
    ]);
    expect(
      parts.some(
        part =>
          part.type === 'tool-input-start' ||
          part.type === 'tool-input-delta' ||
          part.type === 'tool-input-end' ||
          part.type === 'tool-call' ||
          part.type === 'tool-approval-request',
      ),
    ).toBe(false);
    expect(parts.map(part => part.type)).not.toContain('error');
    await expect(result.steps).resolves.toEqual([]);
  });

  test('emits the provider result after approved pending builtin tool execution', async () => {
    const submittedApprovals: Array<{
      approvalId: string;
      approved: boolean;
      reason?: string;
    }> = [];
    const session = fakeSession([
      {
        type: 'tool-input-start',
        id: 'c1',
        toolName: 'bash',
        providerExecuted: true,
      },
      {
        type: 'tool-input-delta',
        id: 'c1',
        delta: '{"command":"printf ok"}',
      },
      { type: 'tool-input-end', id: 'c1' },
      {
        type: 'tool-call',
        toolCallId: 'c1',
        toolName: 'bash',
        input: JSON.stringify({ command: 'printf ok' }),
        providerExecuted: true,
      },
      {
        type: 'tool-approval-request',
        approvalId: 'approval-1',
        toolCallId: 'c1',
      },
      {
        type: 'tool-result',
        toolCallId: 'c1',
        toolName: 'bash',
        result: 'ok',
      },
      ...finishEvents,
    ]);
    const doContinueTurn = session.doContinueTurn;
    session.doContinueTurn = async options => {
      const control = await doContinueTurn(options);
      return {
        ...control,
        submitToolApproval: async input => {
          submittedApprovals.push(input);
        },
      };
    };

    const { result, done } = runPrompt({
      harness,
      session,
      mode: 'continue',
      instructions: undefined,
      tools: {},
      toolSpecs: [],
      sandboxSession,
      sessionWorkDir: WORK_DIR,
      runtimeContext: {} as never,
      abortSignal: undefined,
      pendingToolApprovals: [
        {
          approvalId: 'approval-1',
          toolCallId: 'c1',
          toolName: 'bash',
          input: JSON.stringify({ command: 'printf ok' }),
          kind: 'builtin',
          providerExecuted: true,
        },
      ],
      toolApprovalContinuations: [
        {
          type: 'tool-approval-response',
          approvalId: 'approval-1',
          approved: true,
        },
      ],
    });

    const parts: TextStreamPart<ToolSet>[] = [];
    for await (const part of result.fullStream) parts.push(part);
    await done;

    expect(submittedApprovals).toEqual([
      { approvalId: 'approval-1', approved: true, reason: undefined },
    ]);
    expect(
      parts.filter(
        part =>
          part.type === 'tool-input-start' ||
          part.type === 'tool-input-delta' ||
          part.type === 'tool-input-end' ||
          part.type === 'tool-call' ||
          part.type === 'tool-approval-request',
      ),
    ).toEqual([]);
    expect(toolResultParts(parts)).toEqual([
      expect.objectContaining({
        toolCallId: 'c1',
        toolName: 'bash',
        output: 'ok',
      }),
    ]);
  });

  test('emits an error after approved pending custom tool execution fails', async () => {
    const submitted: SubmittedResult[] = [];
    const weather = tool({
      description: 'Get weather',
      inputSchema: z.object({ city: z.string() }),
      execute: async (): Promise<{ temperature: number }> => {
        throw new Error('weather unavailable');
      },
    });

    const { result, done } = runPrompt({
      harness,
      session: fakeSession([], input => submitted.push(input)),
      mode: 'continue',
      instructions: undefined,
      tools: { weather } as ToolSet,
      toolSpecs: [],
      sandboxSession,
      sessionWorkDir: WORK_DIR,
      runtimeContext: {} as never,
      abortSignal: undefined,
      pendingToolApprovals: [
        {
          approvalId: 'approval-1',
          toolCallId: 'c1',
          toolName: 'weather',
          input: JSON.stringify({ city: 'SF' }),
          kind: 'custom',
          providerExecuted: false,
        },
      ],
      toolApprovalContinuations: [
        {
          type: 'tool-approval-response',
          approvalId: 'approval-1',
          approved: true,
        },
      ],
    });

    const parts: TextStreamPart<ToolSet>[] = [];
    for await (const part of result.fullStream) parts.push(part);
    await done;

    expect(submitted).toEqual([
      {
        toolCallId: 'c1',
        output: { error: 'Error: weather unavailable' },
        isError: true,
      },
    ]);
    expect(parts).toContainEqual(
      expect.objectContaining({
        type: 'tool-error',
        toolCallId: 'c1',
        toolName: 'weather',
        error: expect.objectContaining({ message: 'weather unavailable' }),
      }),
    );
  });

  test('does not reuse a consumed approval for replayed custom tool calls', async () => {
    const submitted: SubmittedResult[] = [];
    const pending: unknown[] = [];
    const settled: string[] = [];
    const weather = tool({
      description: 'Get weather',
      inputSchema: z.object({ city: z.string() }),
      execute: async (args: { city: string }) => ({
        city: args.city,
        temperature: 72,
      }),
    });

    const { result, done } = runPrompt({
      harness,
      session: fakeSession(
        [
          {
            type: 'tool-call',
            toolCallId: 'c1',
            toolName: 'weather',
            input: JSON.stringify({ city: 'SF' }),
          },
          {
            type: 'tool-call',
            toolCallId: 'c2',
            toolName: 'weather',
            input: JSON.stringify({ city: 'Austin' }),
          },
        ],
        input => submitted.push(input),
      ),
      mode: 'continue',
      instructions: undefined,
      tools: { weather } as ToolSet,
      toolSpecs: [],
      sandboxSession,
      sessionWorkDir: WORK_DIR,
      runtimeContext: {} as never,
      abortSignal: undefined,
      toolApproval: { weather: 'user-approval' },
      pendingToolApprovals: [
        {
          approvalId: 'approval-1',
          toolCallId: 'c1',
          toolName: 'weather',
          input: JSON.stringify({ city: 'SF' }),
          kind: 'custom',
          providerExecuted: false,
        },
      ],
      toolApprovalContinuations: [
        {
          type: 'tool-approval-response',
          approvalId: 'approval-1',
          approved: true,
        },
      ],
      onPendingToolApproval: approval => pending.push(approval),
      onToolApprovalSettled: approvalId => settled.push(approvalId),
    });

    const parts: TextStreamPart<ToolSet>[] = [];
    for await (const part of result.fullStream) parts.push(part);
    await done;

    expect(settled).toEqual(['approval-1']);
    expect(submitted).toEqual([
      { toolCallId: 'c1', output: { city: 'SF', temperature: 72 } },
    ]);
    expect(pending).toEqual([
      {
        approvalId: expect.any(String),
        toolCallId: 'c2',
        toolName: 'weather',
        input: JSON.stringify({ city: 'Austin' }),
        kind: 'custom',
        providerExecuted: false,
      },
    ]);
    expect(
      parts.filter(part => part.type === 'tool-approval-request'),
    ).toContainEqual(
      expect.objectContaining({
        type: 'tool-approval-request',
        toolCall: expect.objectContaining({ toolCallId: 'c2' }),
      }),
    );
  });

  test('surfaces each generator yield as a preliminary result and submits the last yield', async () => {
    const submitted: SubmittedResult[] = [];
    const weather = tool({
      description: 'Get the weather',
      inputSchema: z.object({ city: z.string() }),
      async *execute() {
        yield { state: 'loading' as const };
        yield { state: 'ready' as const, temperature: 72 };
      },
    });

    const { result, done } = runPrompt({
      harness,
      session: fakeSession(
        [
          {
            type: 'tool-call',
            toolCallId: 'c1',
            toolName: 'weather',
            input: JSON.stringify({ city: 'SF' }),
          },
          ...finishEvents,
        ],
        input => submitted.push(input),
      ),
      prompt: 'go',
      instructions: undefined,
      tools: { weather } as ToolSet,
      toolSpecs: [],
      sandboxSession,
      sessionWorkDir: WORK_DIR,
      runtimeContext: {} as never,
      abortSignal: undefined,
    });

    const parts: TextStreamPart<ToolSet>[] = [];
    for await (const part of result.fullStream) parts.push(part);
    await done;

    // Every `yield` is surfaced as a preliminary result — including the last,
    // which `executeTool` re-emits as the final value. The non-preliminary
    // final result reaches consumers only when the adapter echoes the
    // submitted result back, which the fake session does not model.
    const results = toolResultParts(parts);
    expect(results).toHaveLength(2);
    expect(results.every(r => r.preliminary === true)).toBe(true);
    expect(results[0].output).toEqual({ state: 'loading' });
    expect(results[1].output).toEqual({ state: 'ready', temperature: 72 });

    // Only the final value is submitted back to the runtime.
    expect(submitted).toEqual([
      { toolCallId: 'c1', output: { state: 'ready', temperature: 72 } },
    ]);
  });

  test('submits a plain execute return value with no preliminary results', async () => {
    const submitted: SubmittedResult[] = [];
    const echo = tool({
      description: 'Echo the input',
      inputSchema: z.object({ text: z.string() }),
      execute: async (args: { text: string }) => ({ echoed: args.text }),
    });

    const { result, done } = runPrompt({
      harness,
      session: fakeSession(
        [
          {
            type: 'tool-call',
            toolCallId: 'c1',
            toolName: 'echo',
            input: JSON.stringify({ text: 'hi' }),
          },
          ...finishEvents,
        ],
        input => submitted.push(input),
      ),
      prompt: 'go',
      instructions: undefined,
      tools: { echo } as ToolSet,
      toolSpecs: [],
      sandboxSession,
      sessionWorkDir: WORK_DIR,
      runtimeContext: {} as never,
      abortSignal: undefined,
    });

    const parts: TextStreamPart<ToolSet>[] = [];
    for await (const part of result.fullStream) parts.push(part);
    await done;

    expect(toolResultParts(parts)).toHaveLength(0);
    expect(submitted).toEqual([{ toolCallId: 'c1', output: { echoed: 'hi' } }]);
  });

  test('executes host tools through telemetry context wrappers', async () => {
    const events: string[] = [];
    const callIds: string[] = [];
    const echo = tool({
      description: 'Echo the input',
      inputSchema: z.object({ text: z.string() }),
      execute: async (args: { text: string }) => {
        events.push('execute');
        return { echoed: args.text };
      },
    });
    const integration = {
      async onToolExecutionStart(event) {
        await Promise.resolve();
        callIds.push(event.callId);
        events.push('tool-start');
      },
      async executeTool({ callId, toolCallId, execute }) {
        callIds.push(callId);
        expect(toolCallId).toBe('c1');
        events.push('wrapper-start');
        const output = await execute();
        events.push('wrapper-end');
        return output;
      },
    } satisfies Telemetry;

    const { result, done } = runPrompt({
      harness,
      session: fakeSession([
        {
          type: 'tool-call',
          toolCallId: 'c1',
          toolName: 'echo',
          input: JSON.stringify({ text: 'hi' }),
        },
        ...finishEvents,
      ]),
      prompt: 'go',
      instructions: undefined,
      tools: { echo } as ToolSet,
      toolSpecs: [],
      sandboxSession,
      sessionWorkDir: WORK_DIR,
      runtimeContext: {} as never,
      abortSignal: undefined,
      telemetry: { integrations: [integration] },
    });

    for await (const _part of result.fullStream) {
      // Drain the stream so the turn and host tool execution complete.
    }
    await done;

    expect(events).toEqual([
      'wrapper-start',
      'execute',
      'wrapper-end',
      'tool-start',
    ]);
    expect(new Set(callIds).size).toBe(1);
  });

  test('reports telemetry wrapper failures as tool errors', async () => {
    const submitted: SubmittedResult[] = [];
    const execute = vi.fn();
    const echo = tool({
      description: 'Echo the input',
      inputSchema: z.object({ text: z.string() }),
      execute,
    });
    const integration = {
      async executeTool() {
        throw new Error('telemetry wrapper failed');
      },
    } satisfies Telemetry;

    const { result, done } = runPrompt({
      harness,
      session: fakeSession(
        [
          {
            type: 'tool-call',
            toolCallId: 'c1',
            toolName: 'echo',
            input: JSON.stringify({ text: 'hi' }),
          },
          ...finishEvents,
        ],
        input => submitted.push(input),
      ),
      prompt: 'go',
      instructions: undefined,
      tools: { echo } as ToolSet,
      toolSpecs: [],
      sandboxSession,
      sessionWorkDir: WORK_DIR,
      runtimeContext: {} as never,
      abortSignal: undefined,
      telemetry: { integrations: [integration] },
    });

    for await (const _part of result.fullStream) {
      // Drain the stream so host tool error handling completes.
    }
    await done;

    expect(execute).not.toHaveBeenCalled();
    expect(submitted).toEqual([
      {
        toolCallId: 'c1',
        output: { error: 'Error: telemetry wrapper failed' },
        isError: true,
      },
    ]);
  });

  test('strips the workDir from preliminary results before they reach consumers', async () => {
    const find = tool({
      description: 'Find a file',
      inputSchema: z.object({ name: z.string() }),
      async *execute() {
        yield { path: `${WORK_DIR}/src/foo.ts` };
      },
    });

    const { result, done } = runPrompt({
      harness,
      session: fakeSession([
        {
          type: 'tool-call',
          toolCallId: 'c1',
          toolName: 'find',
          input: JSON.stringify({ name: 'foo.ts' }),
        },
        ...finishEvents,
      ]),
      prompt: 'go',
      instructions: undefined,
      tools: { find } as ToolSet,
      toolSpecs: [],
      sandboxSession,
      sessionWorkDir: WORK_DIR,
      runtimeContext: {} as never,
      abortSignal: undefined,
    });

    const parts: TextStreamPart<ToolSet>[] = [];
    for await (const part of result.fullStream) parts.push(part);
    await done;

    const results = toolResultParts(parts);
    expect(results).toHaveLength(1);
    expect(results[0].preliminary).toBe(true);
    expect(results[0].output).toEqual({ path: 'src/foo.ts' });
  });
});

describe('runPrompt suspension lifecycle', () => {
  function suspendingRun(options: {
    script: HarnessV1StreamPart[];
    abortSignal?: AbortSignal;
  }) {
    const onTurnFinished = vi.fn();
    const onTurnFailed = vi.fn();
    return {
      ...runPrompt({
        harness,
        session: fakeSession(options.script),
        prompt: 'go',
        instructions: undefined,
        tools: {} as ToolSet,
        toolSpecs: [],
        sandboxSession,
        sessionWorkDir: WORK_DIR,
        runtimeContext: {} as never,
        abortSignal: options.abortSignal,
        onTurnFinished,
        onTurnFailed,
        isTurnSuspending: () => true,
      }),
      onTurnFinished,
      onTurnFailed,
    };
  }

  test('settles a result with a terminal finish without finishing the suspended turn', async () => {
    const { result, done, onTurnFinished, onTurnFailed } = suspendingRun({
      script: finishEvents,
    });

    await result.consumeStream();
    await done;

    await expect(result.finishReason).resolves.toBe('stop');
    expect(onTurnFinished).not.toHaveBeenCalled();
    expect(onTurnFailed).not.toHaveBeenCalled();
  });

  test('settles a cleanly closed result without failing the suspended turn', async () => {
    const { result, done, onTurnFinished, onTurnFailed } = suspendingRun({
      script: [],
    });

    await result.consumeStream();
    await done;

    expect(onTurnFinished).not.toHaveBeenCalled();
    expect(onTurnFailed).not.toHaveBeenCalled();
  });

  test('preserves error result semantics without failing the suspended turn', async () => {
    const { result, done, onTurnFinished, onTurnFailed } = suspendingRun({
      script: [{ type: 'error', error: 'boom' }],
    });

    await result.consumeStream();
    await done;

    await expect(result.finishReason).rejects.toBeDefined();
    expect(onTurnFinished).not.toHaveBeenCalled();
    expect(onTurnFailed).not.toHaveBeenCalled();
  });

  test('preserves abort result semantics without failing the suspended turn', async () => {
    const controller = new AbortController();
    controller.abort();
    const { result, done, onTurnFinished, onTurnFailed } = suspendingRun({
      script: [
        { type: 'error', error: 'AbortError: This operation was aborted' },
      ],
      abortSignal: controller.signal,
    });

    const parts: TextStreamPart<ToolSet>[] = [];
    for await (const part of result.fullStream) parts.push(part);
    await done;

    expect(parts.filter(part => part.type === 'error')).toHaveLength(0);
    expect(parts[parts.length - 1]!.type).toBe('abort');
    await expect(result.finishReason).rejects.toBeDefined();
    expect(onTurnFinished).not.toHaveBeenCalled();
    expect(onTurnFailed).not.toHaveBeenCalled();
  });
});

describe('runPrompt abort semantics', () => {
  const abortedRun = (
    script: HarnessV1StreamPart[],
    options?: { onTurnFailed?: () => void },
  ) => {
    const controller = new AbortController();
    controller.abort();
    return runPrompt({
      harness,
      session: fakeSession(script),
      prompt: 'go',
      instructions: undefined,
      tools: {} as ToolSet,
      toolSpecs: [],
      sandboxSession,
      sessionWorkDir: WORK_DIR,
      runtimeContext: {} as never,
      abortSignal: controller.signal,
      onTurnFailed: options?.onTurnFailed,
    });
  };

  test('settles with an abort part instead of an error part when the abort signal has fired', async () => {
    const { result, done } = abortedRun([
      { type: 'text-start', id: 't1' },
      { type: 'text-delta', id: 't1', delta: 'partial ' },
      { type: 'error', error: 'AbortError: This operation was aborted' },
    ]);

    const parts: TextStreamPart<ToolSet>[] = [];
    for await (const part of result.fullStream) parts.push(part);
    await done;

    expect(parts.filter(p => p.type === 'error')).toHaveLength(0);
    const last = parts[parts.length - 1]!;
    expect(last.type).toBe('abort');
    expect((last as { reason?: string }).reason).toContain('aborted');
    // Awaiting consumers still settle (rejected with the underlying error).
    await expect(result.finishReason).rejects.toBeDefined();
  });

  test('keeps a real error part when the abort signal has not fired', async () => {
    const { result, done } = runPrompt({
      harness,
      session: fakeSession([{ type: 'error', error: 'boom' }]),
      prompt: 'go',
      instructions: undefined,
      tools: {} as ToolSet,
      toolSpecs: [],
      sandboxSession,
      sessionWorkDir: WORK_DIR,
      runtimeContext: {} as never,
      abortSignal: undefined,
    });

    const parts: TextStreamPart<ToolSet>[] = [];
    for await (const part of result.fullStream) parts.push(part);
    await done;

    expect(parts.filter(p => p.type === 'abort')).toHaveLength(0);
    expect(parts[parts.length - 1]!.type).toBe('error');
    await expect(result.finishReason).rejects.toBeDefined();
  });

  test('notifies onTurnFailed when an aborted turn settles, so session turn tracking returns to idle', async () => {
    const onTurnFailed = vi.fn();
    const { result, done } = abortedRun(
      [{ type: 'error', error: 'AbortError: This operation was aborted' }],
      { onTurnFailed },
    );

    await result.consumeStream();
    await done;

    expect(onTurnFailed).toHaveBeenCalledTimes(1);
  });

  test('toUIMessageStream emits an abort chunk, skips onError, and reports isAborted to onEnd for an aborted turn', async () => {
    const { result, done } = abortedRun([
      { type: 'error', error: 'AbortError: This operation was aborted' },
    ]);

    const onErrorCalls: unknown[] = [];
    const onEndCalls: { isAborted: boolean }[] = [];
    const chunkTypes: string[] = [];
    for await (const chunk of result.toUIMessageStream({
      onError: error => {
        onErrorCalls.push(error);
        return 'error';
      },
      onEnd: ({ isAborted }) => {
        onEndCalls.push({ isAborted });
      },
    })) {
      chunkTypes.push((chunk as { type: string }).type);
    }
    await done;

    expect(onErrorCalls).toHaveLength(0);
    expect(chunkTypes).toContain('abort');
    expect(chunkTypes).not.toContain('error');
    expect(onEndCalls).toEqual([{ isAborted: true }]);
  });
});
