import type {
  HarnessV1,
  HarnessV1Bootstrap,
  HarnessV1ContinueTurnOptions,
  HarnessV1ContinueTurnState,
  HarnessV1NetworkSandboxSession,
  HarnessV1PromptControl,
  HarnessV1PromptTurnOptions,
  HarnessV1ResumeSessionState,
  HarnessV1SandboxProvider,
  HarnessV1Session,
  HarnessV1StreamPart,
  HarnessV1ToolSpec,
} from '../v1';
import {
  tool,
  type Experimental_SandboxSession as SandboxSession,
} from '@ai-sdk/provider-utils';
import { isStepCount, NoSuchToolError, Output } from 'ai';
import { describe, expect, expectTypeOf, test, vi } from 'vitest';
import { z } from 'zod/v4';
import { HarnessAgent } from './harness-agent';
import { HarnessAgentSession } from './harness-agent-session';
import { createLazyNetworkSandboxSession } from './create-lazy-network-sandbox-session';
import { HarnessCapabilityUnsupportedError } from '../errors/harness-capability-unsupported-error';
import { hashHarnessBootstrap } from './internal/bootstrap-recipe';

/**
 * Build a mock harness whose session emits a canned event script. Each
 * event is emitted synchronously; the `done` promise resolves once the
 * script has been delivered.
 *
 * The mock also records every prompt the harness receives + every tool
 * result the host submits back so tests can assert on them.
 */
function mockHarness(options: {
  script: (
    submitToolResult: (input: {
      toolCallId: string;
      output: unknown;
    }) => Promise<void>,
  ) => HarnessV1StreamPart[];
  builtinTools?: HarnessV1['builtinTools'];
  supportsBuiltinToolApprovals?: boolean;
  supportsBuiltinToolFiltering?: boolean;
  onDoStart?: (options: Parameters<HarnessV1['doStart']>[0]) => void;
  onPromptTurn?: (options: HarnessV1PromptTurnOptions) => void;
  promptDone?: (options: HarnessV1PromptTurnOptions) => Promise<void>;
  supportsSteering?: boolean;
  onSuspendTurn?: () => void | Promise<void>;
  onSubmitToolResult?: HarnessV1PromptControl['submitToolResult'];
  doReadHistory?: HarnessV1Session['doReadHistory'];
  continueScript?: (
    submitToolResult: (input: {
      toolCallId: string;
      output: unknown;
    }) => Promise<void>,
  ) => HarnessV1StreamPart[];
}): {
  harness: HarnessV1;
  prompts: HarnessV1PromptTurnOptions['prompt'][];
  toolResults: { toolCallId: string; output: unknown }[];
  toolApprovals: {
    approvalId: string;
    approved: boolean;
    reason?: string;
  }[];
  userMessages: string[];
  doStart: ReturnType<typeof vi.fn>;
  doDetach: ReturnType<typeof vi.fn>;
  doContinueTurn: ReturnType<typeof vi.fn>;
  doSuspendTurn: ReturnType<typeof vi.fn>;
  doStop: ReturnType<typeof vi.fn>;
  doDestroy: ReturnType<typeof vi.fn>;
  doCompact: ReturnType<typeof vi.fn>;
} {
  const prompts: HarnessV1PromptTurnOptions['prompt'][] = [];
  const toolResults: { toolCallId: string; output: unknown }[] = [];
  const toolApprovals: {
    approvalId: string;
    approved: boolean;
    reason?: string;
  }[] = [];
  const userMessages: string[] = [];
  const resumeState = {
    type: 'resume-session' as const,
    harnessId: 'mock',
    specificationVersion: 'harness-v1' as const,
    data: {},
  };
  const continueState = {
    type: 'continue-turn' as const,
    harnessId: 'mock',
    specificationVersion: 'harness-v1' as const,
    data: {},
  };
  const doStop = vi.fn(async () => resumeState);
  const doDestroy = vi.fn(async () => {});
  const doCompact = vi.fn(async (_customInstructions?: string) => {});
  const doDetach = vi.fn(async () => resumeState);
  const doSuspendTurn = vi.fn(async () => {
    await options.onSuspendTurn?.();
    return continueState;
  });
  const doContinueTurn = vi.fn(async (opts: HarnessV1ContinueTurnOptions) => {
    const control: HarnessV1PromptControl = {
      submitToolResult: async input => {
        await options.onSubmitToolResult?.(input);
        toolResults.push(input);
      },
      submitToolApproval: async input => {
        toolApprovals.push(input);
      },
      ...(options.supportsSteering
        ? {
            submitUserMessage: async (text: string) => {
              userMessages.push(text);
            },
          }
        : {}),
      done: Promise.resolve(),
    };
    const events =
      options.continueScript?.(async input => {
        await control.submitToolResult(input);
      }) ?? [];
    queueMicrotask(() => {
      for (const event of events) opts.emit(event);
    });
    return control;
  });
  let session: HarnessV1Session;
  const doStart = vi.fn(async (opts: Parameters<HarnessV1['doStart']>[0]) => {
    options.onDoStart?.(opts);
    return session;
  });

  session = {
    sessionId: 'mock-session-1',
    isResume: false,
    doPromptTurn: async (opts: HarnessV1PromptTurnOptions) => {
      prompts.push(opts.prompt);
      options.onPromptTurn?.(opts);
      const control: HarnessV1PromptControl = {
        submitToolResult: async input => {
          await options.onSubmitToolResult?.(input);
          toolResults.push(input);
        },
        submitToolApproval: async input => {
          toolApprovals.push(input);
        },
        ...(options.supportsSteering
          ? {
              submitUserMessage: async (text: string) => {
                userMessages.push(text);
              },
            }
          : {}),
        done: options.promptDone?.(opts) ?? Promise.resolve(),
      };
      const events = options.script(async input => {
        await control.submitToolResult(input);
      });
      // Emit on a microtask so the consumer can await doPromptTurn first.
      queueMicrotask(() => {
        for (const event of events) opts.emit(event);
      });
      return control;
    },
    doCompact,
    doDetach,
    doStop,
    doDestroy,
    doContinueTurn,
    doSuspendTurn,
    ...(options.doReadHistory != null
      ? { doReadHistory: options.doReadHistory }
      : {}),
  };

  return {
    harness: {
      specificationVersion: 'harness-v1',
      harnessId: 'mock',
      builtinTools: options.builtinTools ?? {},
      ...(options.supportsBuiltinToolApprovals !== undefined
        ? { supportsBuiltinToolApprovals: options.supportsBuiltinToolApprovals }
        : {}),
      ...(options.supportsBuiltinToolFiltering !== undefined
        ? {
            supportsBuiltinToolFiltering: options.supportsBuiltinToolFiltering,
          }
        : {}),
      doStart,
    },
    prompts,
    toolResults,
    toolApprovals,
    userMessages,
    doStart,
    doDetach,
    doContinueTurn,
    doSuspendTurn,
    doStop,
    doDestroy,
    doCompact,
  };
}

function makeSandboxSession(
  options: Partial<HarnessV1NetworkSandboxSession> = {},
): HarnessV1NetworkSandboxSession {
  const run = vi.fn(async (args: { command: string }) => ({
    exitCode: 0,
    stdout:
      args.command === 'printf "%s" "$HOME"'
        ? '/home/agent'
        : args.command === 'pwd'
          ? '/work\n'
          : '',
    stderr: '',
  }));
  const files = new Map<string, string>();
  const readTextFile = vi.fn(
    async ({ path }: { path: string }) => files.get(path) ?? null,
  );
  const writeTextFile = vi.fn(
    async ({ path, content }: { path: string; content: string }) => {
      files.set(path, content);
    },
  );
  const sandboxSession = {
    id: 'sandbox',
    defaultWorkingDirectory: '/work',
    ports: [],
    getPortEndpoint: async () => ({ url: 'ws://example.test/' }),
    getPortUrl: async () => 'ws://example.test/',
    run,
    readTextFile,
    writeTextFile,
    stop: vi.fn(async () => {}),
    destroy: vi.fn(async () => {}),
    restricted: () => ({ run, readTextFile, writeTextFile }) as never,
    ...options,
  } as unknown as HarnessV1NetworkSandboxSession;
  return sandboxSession;
}

function zeroUsage() {
  return {
    inputTokens: {
      total: undefined,
      noCache: undefined,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: undefined,
      text: undefined,
      reasoning: undefined,
    },
  };
}

function finishEvents(): HarnessV1StreamPart[] {
  return [
    {
      type: 'finish-step',
      finishReason: { unified: 'tool-calls', raw: 'tool_use' },
      usage: zeroUsage(),
    },
    {
      type: 'finish',
      finishReason: { unified: 'tool-calls', raw: 'tool_use' },
      totalUsage: zeroUsage(),
    },
  ];
}

function makeLifecycleSession(options: {
  underlyingSession?: Partial<HarnessV1Session>;
  sandboxSessionOverrides?: Partial<HarnessV1NetworkSandboxSession>;
  ownsSandboxLifecycle?: boolean;
  turnState?:
    | 'idle'
    | 'running'
    | 'awaiting-approval'
    | 'awaiting-tool-result'
    | 'suspended';
}): {
  session: HarnessAgentSession;
  resumeState: HarnessV1ResumeSessionState;
  continueState: HarnessV1ContinueTurnState;
  doDetach: ReturnType<typeof vi.fn>;
  doStop: ReturnType<typeof vi.fn>;
  doDestroy: ReturnType<typeof vi.fn>;
  sandboxStop: ReturnType<typeof vi.fn>;
  sandboxDestroy: ReturnType<typeof vi.fn>;
} {
  const resumeState: HarnessV1ResumeSessionState = {
    type: 'resume-session',
    harnessId: 'mock',
    specificationVersion: 'harness-v1',
    data: {},
  };
  const continueState: HarnessV1ContinueTurnState = {
    type: 'continue-turn',
    harnessId: 'mock',
    specificationVersion: 'harness-v1',
    data: {},
  };
  const doDetach = vi.fn(async () => resumeState);
  const doStop = vi.fn(async () => resumeState);
  const doDestroy = vi.fn(async () => {});
  const sandboxStop = vi.fn(async () => {});
  const sandboxDestroy = vi.fn(async () => {});
  const harness: HarnessV1 = {
    specificationVersion: 'harness-v1',
    harnessId: 'mock',
    builtinTools: {},
    doStart: async () => {
      throw new Error('not used');
    },
  };
  const underlyingSession = {
    sessionId: 'lifecycle-session',
    isResume: false,
    doPromptTurn: async () => ({
      submitToolResult: async () => {},
      done: Promise.resolve(),
    }),
    doContinueTurn: async () => ({
      submitToolResult: async () => {},
      done: Promise.resolve(),
    }),
    doCompact: async () => {},
    doDetach,
    doStop,
    doDestroy,
    doSuspendTurn: async () => continueState,
    ...options.underlyingSession,
  } as HarnessV1Session;
  const sandboxSession = {
    id: 'sandbox',
    defaultWorkingDirectory: '/work',
    ports: [],
    getPortEndpoint: async () => ({ url: 'ws://example.test/' }),
    getPortUrl: async () => 'ws://example.test/',
    stop: sandboxStop,
    destroy: sandboxDestroy,
    restricted: () => ({}) as never,
    ...options.sandboxSessionOverrides,
  } as unknown as HarnessV1NetworkSandboxSession;
  return {
    session: new HarnessAgentSession({
      sessionId: 'lifecycle-session',
      harness,
      underlyingSession,
      sandboxSession,
      ownsSandboxLifecycle: options.ownsSandboxLifecycle,
      sessionWorkDir: '/work/mock-lifecycle-session',
      toolApproval: undefined,
      turnState: options.turnState,
    }),
    resumeState,
    continueState,
    doDetach,
    doStop,
    doDestroy,
    sandboxStop,
    sandboxDestroy,
  };
}

describe('HarnessAgent', () => {
  test('uses prepared runtime context for each prompt turn and filters telemetry', async () => {
    type RuntimeContext = { requestId: string; secret: string };
    const configuredContext = { requestId: 'default', secret: 'configured' };
    const preparedInputs: Array<RuntimeContext | undefined> = [];
    const lifecycleContexts: RuntimeContext[] = [];
    const telemetryContexts: unknown[] = [];
    const { harness } = mockHarness({
      script: () => [
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: 'ok' },
        { type: 'text-end', id: 'text-1' },
        {
          type: 'finish-step',
          finishReason: { unified: 'stop', raw: 'end_turn' },
          usage: zeroUsage(),
        },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'end_turn' },
          totalUsage: zeroUsage(),
        },
      ],
    });
    const agent = new HarnessAgent<
      typeof harness,
      {},
      RuntimeContext,
      never,
      { requestId: string }
    >({
      harness,
      runtimeContext: configuredContext,
      callOptionsSchema: z.object({ requestId: z.string() }),
      prepareCall: ({ options, runtimeContext, ...rest }) => {
        preparedInputs.push(runtimeContext);
        return {
          ...rest,
          runtimeContext: { requestId: options.requestId, secret: 'private' },
        };
      },
      onStart: ({ runtimeContext }) => {
        lifecycleContexts.push(runtimeContext);
      },
      onStepStart: ({ runtimeContext }) => {
        lifecycleContexts.push(runtimeContext);
      },
      onStepEnd: ({ runtimeContext }) => {
        lifecycleContexts.push(runtimeContext);
      },
      onEnd: ({ runtimeContext }) => {
        lifecycleContexts.push(runtimeContext);
      },
      telemetry: {
        includeRuntimeContext: { requestId: true },
        integrations: [
          {
            onEnd: event => {
              telemetryContexts.push(
                (event as { runtimeContext: unknown }).runtimeContext,
              );
            },
          },
        ],
      },
    });
    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });

    const generated = await agent.generate({
      session,
      prompt: 'first',
      options: { requestId: 'req-1' },
    });
    const streamed = await agent.stream({
      session,
      prompt: 'second',
      options: { requestId: 'req-2' },
    });
    await streamed.consumeStream();

    expect(preparedInputs).toEqual([configuredContext, configuredContext]);
    expect(generated.finalStep.runtimeContext).toEqual({
      requestId: 'req-1',
      secret: 'private',
    });
    expect((await streamed.finalStep).runtimeContext).toEqual({
      requestId: 'req-2',
      secret: 'private',
    });
    expect(lifecycleContexts).toEqual([
      ...Array(4).fill(generated.finalStep.runtimeContext),
      ...Array(4).fill((await streamed.finalStep).runtimeContext),
    ]);
    expect(telemetryContexts).toEqual([
      { requestId: 'req-1' },
      { requestId: 'req-2' },
    ]);
    await session.destroy();
  });

  test('defaults to empty runtime context when prepareCall clears it', async () => {
    const { harness } = mockHarness({ script: () => finishEvents() });
    const agent = new HarnessAgent<typeof harness, {}, { requestId: string }>({
      harness,
      runtimeContext: { requestId: 'configured' },
      prepareCall: call => ({ ...call, runtimeContext: undefined }),
    });
    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });
    const result = await agent.generate({ session, prompt: 'go' });

    expect(result.finalStep.runtimeContext).toEqual({});
    await session.destroy();
  });

  test('preserves prepared runtime context during an in-memory continuation', async () => {
    type RuntimeContext = { requestId: string };
    const preparedContext = { requestId: 'prepared' };
    const { harness } = mockHarness({
      script: () => [
        finishEvents()[0]!,
        { type: 'text-delta', id: 'next-step', delta: 'next' },
      ],
      continueScript: () => [
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: 'done' },
        { type: 'text-end', id: 'text-1' },
        {
          type: 'finish-step',
          finishReason: { unified: 'stop', raw: 'end_turn' },
          usage: zeroUsage(),
        },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'end_turn' },
          totalUsage: zeroUsage(),
        },
      ],
    });
    const prepareCallSpy = vi.fn();
    const agent = new HarnessAgent<typeof harness, {}, RuntimeContext>({
      harness,
      runtimeContext: { requestId: 'default' },
      prepareCall: call => {
        prepareCallSpy();
        return { ...call, runtimeContext: preparedContext };
      },
      stopWhen: isStepCount(1),
    });
    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });

    const first = await agent.generate({ session, prompt: 'go' });
    expect(session.hasUnfinishedTurn()).toBe(true);
    expect(first.finalStep.runtimeContext).toBe(preparedContext);

    const continued = await agent.continueGenerate({ session });
    expect(continued.finalStep.runtimeContext).toBe(preparedContext);
    expect(prepareCallSpy).toHaveBeenCalledTimes(1);
    await session.destroy();
  });

  test.each([
    { name: 'rebound context', rebind: true, expectedRequestId: 'prepared' },
    {
      name: 'constructor fallback',
      rebind: false,
      expectedRequestId: 'default',
    },
  ])(
    'uses $name after recreating a suspended turn without serializing runtime context',
    async ({ rebind, expectedRequestId }) => {
      type RuntimeContext = { requestId: string };
      const preparedContext = { requestId: 'prepared' };
      const { harness } = mockHarness({
        script: () => [
          finishEvents()[0]!,
          { type: 'text-delta', id: 'next-step', delta: 'next' },
        ],
        continueScript: () => [
          { type: 'text-start', id: 'text-1' },
          { type: 'text-delta', id: 'text-1', delta: 'done' },
          { type: 'text-end', id: 'text-1' },
          {
            type: 'finish-step',
            finishReason: { unified: 'stop', raw: 'end_turn' },
            usage: zeroUsage(),
          },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'end_turn' },
            totalUsage: zeroUsage(),
          },
        ],
      });
      const prepareCallSpy = vi.fn();
      const agent = new HarnessAgent<typeof harness, {}, RuntimeContext>({
        harness,
        runtimeContext: { requestId: 'default' },
        prepareCall: call => {
          prepareCallSpy();
          return { ...call, runtimeContext: preparedContext };
        },
        stopWhen: isStepCount(1),
      });
      const sandboxSession = makeSandboxSession();
      let session = await agent.createSession({ sandboxSession });

      const first = await agent.generate({ session, prompt: 'go' });
      expect(first.finalStep.runtimeContext).toBe(preparedContext);
      const sessionId = session.sessionId;
      const continueFrom = await session.suspendTurn();
      expect(continueFrom).not.toHaveProperty('runtimeContext');
      expect(continueFrom.turnSettings).not.toHaveProperty('runtimeContext');

      session = await agent.createSession({
        sessionId,
        continueFrom: structuredClone(continueFrom),
        sandboxSession,
        ...(rebind ? { runtimeContext: preparedContext } : {}),
      });
      const continued = await agent.continueGenerate({ session });
      expect(continued.finalStep.runtimeContext).toEqual({
        requestId: expectedRequestId,
      });
      expect(prepareCallSpy).toHaveBeenCalledTimes(1);
      await session.destroy();
    },
  );

  test('forwards configured runtime context through every public turn entry point', async () => {
    type RuntimeContext = { conversationId: string };
    const runtimeContext = { conversationId: 'conversation-1' };
    const lifecycleContexts: RuntimeContext[] = [];
    const telemetryContexts: RuntimeContext[] = [];
    const completedTurn = () => [
      { type: 'stream-start' as const, modelId: 'mock-model' },
      { type: 'text-start' as const, id: 'text-1' },
      {
        type: 'text-delta' as const,
        id: 'text-1',
        delta: 'completed',
      },
      { type: 'text-end' as const, id: 'text-1' },
      {
        type: 'finish-step' as const,
        finishReason: { unified: 'stop' as const, raw: 'stop' },
        usage: zeroUsage(),
      },
      {
        type: 'finish' as const,
        finishReason: { unified: 'stop' as const, raw: 'stop' },
        totalUsage: zeroUsage(),
      },
    ];
    const { harness } = mockHarness({
      script: completedTurn,
      continueScript: completedTurn,
    });
    const agent = new HarnessAgent<typeof harness, {}, RuntimeContext>({
      harness,
      runtimeContext,
      telemetry: {
        includeRuntimeContext: { conversationId: true },
        integrations: [
          {
            onEnd: event => {
              telemetryContexts.push(
                (event as unknown as { runtimeContext: RuntimeContext })
                  .runtimeContext,
              );
            },
          },
        ],
      },
      onEnd: event => {
        lifecycleContexts.push(event.runtimeContext);
      },
    });

    const generateSession = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });
    const generated = await agent.generate({
      session: generateSession,
      prompt: 'generate',
    });
    expect(generated.finalStep.runtimeContext).toBe(runtimeContext);
    await generateSession.destroy();

    const streamSession = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });
    const streamed = await agent.stream({
      session: streamSession,
      prompt: 'stream',
    });
    await streamed.consumeStream();
    expect((await streamed.finalStep).runtimeContext).toBe(runtimeContext);
    await streamSession.destroy();

    const continueState = {
      type: 'continue-turn' as const,
      harnessId: 'mock',
      specificationVersion: 'harness-v1' as const,
      data: {},
    };
    const continueGenerateSession = await agent.createSession({
      continueFrom: continueState,
      sandboxSession: makeSandboxSession(),
    });
    const continuedGeneration = await agent.continueGenerate({
      session: continueGenerateSession,
    });
    expect(continuedGeneration.finalStep.runtimeContext).toBe(runtimeContext);
    await continueGenerateSession.destroy();

    const continueStreamSession = await agent.createSession({
      continueFrom: continueState,
      sandboxSession: makeSandboxSession(),
    });
    const continuedStream = await agent.continueStream({
      session: continueStreamSession,
    });
    await continuedStream.consumeStream();
    expect((await continuedStream.finalStep).runtimeContext).toBe(
      runtimeContext,
    );
    await continueStreamSession.destroy();

    expect(lifecycleContexts).toEqual([
      runtimeContext,
      runtimeContext,
      runtimeContext,
      runtimeContext,
    ]);
    expect(telemetryContexts).toEqual([
      runtimeContext,
      runtimeContext,
      runtimeContext,
      runtimeContext,
    ]);
  });

  test('runs lifecycle callbacks in order and merges settings before call callbacks', async () => {
    const builtinTools = {
      bash: tool({
        inputSchema: z.object({ command: z.string() }),
      }),
    };
    const { harness } = mockHarness({
      builtinTools,
      script: () => [
        { type: 'stream-start', modelId: 'resolved-model' },
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'bash',
          input: JSON.stringify({ command: 'pwd' }),
          providerExecuted: true,
        },
        {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName: 'bash',
          result: { output: '/work' },
        },
        {
          type: 'finish-step',
          finishReason: { unified: 'stop', raw: 'end_turn' },
          usage: zeroUsage(),
        },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'end_turn' },
          totalUsage: zeroUsage(),
        },
      ],
    });
    const events: string[] = [];
    const callIds: string[] = [];
    let stepFromCallback: unknown;
    let finalStepFromCallback: unknown;
    const record = (name: string) => (event: { callId: string }) => {
      events.push(name);
      callIds.push(event.callId);
    };
    const agent = new HarnessAgent({
      harness,
      model: 'requested-model',
      onStart: record('settings:start'),
      onStepStart: record('settings:step-start'),
      onLanguageModelCallStart: event => {
        events.push(`model-start:${event.modelId}`);
        callIds.push(event.callId);
      },
      onLanguageModelCallEnd: event => {
        events.push(`model-end:${event.content.at(-1)?.type}`);
        callIds.push(event.callId);
      },
      onToolExecutionStart: record('settings:tool-start'),
      onToolExecutionEnd: event => {
        events.push(`settings:tool-end:${event.toolOutput.type}`);
        callIds.push(event.callId);
      },
      onStepEnd: step => {
        events.push('settings:step-end');
        callIds.push(step.callId);
        stepFromCallback = step;
      },
      onEnd: event => {
        events.push('settings:end');
        callIds.push(event.callId);
        finalStepFromCallback = event.finalStep;
      },
    });
    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });

    const result = await agent.generate({
      session,
      prompt: 'run pwd',
      onStart: record('call:start'),
      onStepStart: record('call:step-start'),
      onToolExecutionStart: record('call:tool-start'),
      onToolExecutionEnd: record('call:tool-end'),
      onStepEnd: record('call:step-end'),
      onEnd: record('call:end'),
    });

    expect(events).toEqual([
      'settings:start',
      'call:start',
      'settings:step-start',
      'call:step-start',
      'model-start:resolved-model',
      'settings:tool-start',
      'call:tool-start',
      'settings:tool-end:tool-result',
      'call:tool-end',
      'model-end:tool-result',
      'settings:step-end',
      'call:step-end',
      'settings:end',
      'call:end',
    ]);
    expect(new Set(callIds).size).toBe(1);
    expect(result.steps[0]).toBe(stepFromCallback);
    expect(result.finalStep).toBe(finalStepFromCallback);
    expect(result.finalStep.model).toEqual({
      provider: 'harness:mock',
      modelId: 'resolved-model',
    });
    await session.destroy();
  });

  test('ignores lifecycle callback failures', async () => {
    const { harness } = mockHarness({
      script: () => [
        { type: 'text-delta', id: 'text-1', delta: 'done' },
        {
          type: 'finish-step',
          finishReason: { unified: 'stop', raw: 'end_turn' },
          usage: zeroUsage(),
        },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'end_turn' },
          totalUsage: zeroUsage(),
        },
      ],
    });
    const fail = () => {
      throw new Error('listener failed');
    };
    const agent = new HarnessAgent({
      harness,
      onStart: fail,
      onStepStart: fail,
      onLanguageModelCallStart: fail,
      onLanguageModelCallEnd: fail,
      onStepEnd: fail,
      onEnd: fail,
    });
    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });

    await expect(
      agent.generate({ session, prompt: 'go' }),
    ).resolves.toMatchObject({
      text: 'done',
    });
    await session.destroy();
  });

  test('exposes the AI SDK Agent contract surface', () => {
    const { harness } = mockHarness({ script: () => [] });
    const agent = new HarnessAgent({
      harness,
      id: 'a1',
    });
    expect(agent.version).toBe('agent-v1');
    expect(agent.id).toBe('a1');
    expect(agent.harnessId).toBe('mock');
    expect(agent.tools).toEqual({});
  });

  test('rejects a caller-defined question tool when the harness owns that name', () => {
    const { harness } = mockHarness({
      script: () => [],
      builtinTools: {
        askUserQuestions: tool({
          inputSchema: z.object({ questions: z.array(z.unknown()) }),
        }),
      },
    });

    expect(
      () =>
        new HarnessAgent({
          harness,
          tools: {
            askUserQuestions: tool({
              inputSchema: z.object({}),
            }),
          },
        }),
    ).toThrow(
      "HarnessAgent tool name 'askUserQuestions' is reserved for harness question requests.",
    );
  });

  test('allows that caller-defined name when the harness has no question tool', () => {
    const { harness } = mockHarness({ script: () => [] });

    expect(
      () =>
        new HarnessAgent({
          harness,
          tools: {
            askUserQuestions: tool({
              inputSchema: z.object({}),
            }),
          },
        }),
    ).not.toThrow();
  });

  test('passes the configured model to each turn', async () => {
    const promptOptions: HarnessV1PromptTurnOptions[] = [];
    const { harness, doStart } = mockHarness({
      script: () => finishEvents(),
      onPromptTurn: options => promptOptions.push(options),
    });
    const agent = new HarnessAgent({
      harness,
      model: 'harness-specific-model',
    });

    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });
    await agent.generate({ session, prompt: 'Hello' });

    expect(doStart.mock.calls[0]?.[0]).not.toHaveProperty('model');
    expect(promptOptions[0]).toMatchObject({
      model: 'harness-specific-model',
    });
    await session.destroy();
  });

  test('passes an undefined model to a turn when no model is configured', async () => {
    const promptOptions: HarnessV1PromptTurnOptions[] = [];
    const { harness, doStart } = mockHarness({
      script: () => finishEvents(),
      onPromptTurn: options => promptOptions.push(options),
    });
    const agent = new HarnessAgent({
      harness,
    });

    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });
    await agent.generate({ session, prompt: 'Hello' });

    expect(doStart.mock.calls[0]?.[0]).not.toHaveProperty('model');
    expect(promptOptions[0]).toHaveProperty('model', undefined);
    await session.destroy();
  });

  test('normalizes and snapshots headers before passing them to doStart', async () => {
    const { harness, doStart } = mockHarness({
      script: () => finishEvents(),
    });
    const headers: Record<string, string | undefined> = {
      'X-Tenant': 'acme',
      'X-Optional': undefined,
    };
    const agent = new HarnessAgent({
      harness,
      headers,
    });
    headers['X-Tenant'] = 'mutated';

    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });

    expect(doStart.mock.calls[0]?.[0]).toMatchObject({
      headers: { 'x-tenant': 'acme' },
    });
    await session.destroy();
  });

  test.each([
    'authorization',
    'Authorization',
    'x-api-key',
    'X-API-Key',
    'user-agent',
    'User-Agent',
    'x-client-app',
    'X-Client-App',
  ])('rejects the managed header %s', header => {
    const { harness } = mockHarness({
      script: () => finishEvents(),
    });

    expect(
      () =>
        new HarnessAgent({
          harness,
          headers: { [header]: 'caller-value' },
        }),
    ).toThrow(
      `HarnessAgent: \`headers\` must not include the managed header \`${header.toLowerCase()}\`.`,
    );
  });

  test('rejects a managed header with an undefined value', () => {
    const { harness } = mockHarness({
      script: () => finishEvents(),
    });

    expect(
      () =>
        new HarnessAgent({
          harness,
          headers: { Authorization: undefined },
        }),
    ).toThrow(
      'HarnessAgent: `headers` must not include the managed header `authorization`.',
    );
  });

  test('passes stable headers when resuming a session', async () => {
    const { harness, doStart } = mockHarness({
      script: () => finishEvents(),
    });
    const sandboxSession = makeSandboxSession();
    const agent = new HarnessAgent({
      harness,
      headers: { 'x-tenant': 'acme' },
    });
    const session = await agent.createSession({
      sessionId: 'session-1',
      sandboxSession,
    });
    const resumeFrom = await session.stop();

    const resumedSession = await agent.createSession({
      sessionId: 'session-1',
      resumeFrom,
      sandboxSession,
    });

    expect(doStart).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        headers: { 'x-tenant': 'acme' },
        resumeFrom,
      }),
    );
    await resumedSession.destroy();
  });

  test('prepares model, skills, instructions, tools, and the prompt for each fresh turn', async () => {
    const promptOptions: HarnessV1PromptTurnOptions[] = [];
    const { harness, doStart } = mockHarness({
      script: () => finishEvents(),
      onPromptTurn: options => promptOptions.push(options),
    });
    const echo = tool({
      description: 'Echo a value.',
      inputSchema: z.object({ value: z.string() }),
      execute: async ({ value }) => value,
    });
    const onPrepareCall = vi.fn();
    const agent = new HarnessAgent({
      harness,
      tools: { echo },
      callOptionsSchema: z.object({ tenant: z.string() }),
      prepareCall: ({ options, ...rest }) => {
        onPrepareCall(options);
        return {
          ...rest,
          prompt: `${rest.prompt} for ${options.tenant}`,
          model: `model-${options.tenant}`,
          skills: [
            {
              name: options.tenant,
              description: `${options.tenant} skill`,
              content: `${options.tenant} instructions`,
            },
          ],
          instructions: {
            role: 'system',
            content: `Serve ${options.tenant}`,
            providerOptions: { test: { cache: true } },
          },
          tools: options.tenant === 'alpha' ? { echo } : undefined,
        };
      },
    });
    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });

    await agent.generate({
      session,
      prompt: 'Hello',
      options: { tenant: 'alpha' },
    });
    await agent.generate({
      session,
      prompt: 'Hello',
      options: { tenant: 'beta' },
    });

    expect(doStart.mock.calls[0]?.[0]).not.toHaveProperty('model');
    expect(doStart.mock.calls[0]?.[0]).not.toHaveProperty('skills');
    expect(doStart.mock.calls[0]?.[0]).not.toHaveProperty('instructions');
    expect(doStart.mock.calls[0]?.[0]).not.toHaveProperty('tools');
    expect(promptOptions).toHaveLength(2);
    expect(promptOptions[0]).toMatchObject({
      prompt: 'Hello for alpha',
      model: 'model-alpha',
      instructions: 'Serve alpha',
      skills: [{ name: 'alpha' }],
      tools: [{ name: 'echo', description: 'Echo a value.' }],
    });
    expect(promptOptions[1]).toMatchObject({
      prompt: 'Hello for beta',
      model: 'model-beta',
      instructions: 'Serve beta',
      skills: [{ name: 'beta' }],
      tools: [],
    });
    expect(onPrepareCall).toHaveBeenCalledTimes(2);
    await session.destroy();
  });

  test('validates custom call options before preparing a turn', async () => {
    const { harness } = mockHarness({ script: () => finishEvents() });
    const agent = new HarnessAgent({
      harness,
      callOptionsSchema: z.object({ tenant: z.string() }),
      prepareCall: ({ options, ...rest }) => ({
        ...rest,
        prompt: `${rest.prompt} for ${options.tenant}`,
      }),
    });
    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });

    await expect(
      agent.generate({
        session,
        prompt: 'Hello',
        options: { tenant: 123 } as never,
      }),
    ).rejects.toThrow();
    await session.destroy();
  });

  test('experimental_steer() submits a message to the running turn', async () => {
    let finishPrompt!: () => void;
    const promptDone = new Promise<void>(resolve => {
      finishPrompt = resolve;
    });
    const { harness, userMessages } = mockHarness({
      script: () => [],
      supportsSteering: true,
      promptDone: () => promptDone,
    });
    const agent = new HarnessAgent({
      harness,
    });
    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });
    const result = await agent.stream({ session, prompt: 'Start.' });

    await agent.experimental_steer({ session, text: 'Change course.' });

    expect(userMessages).toEqual(['Change course.']);
    finishPrompt();
    await result.consumeStream();
    await session.destroy();
  });

  test('experimental_steerTurn() exposes the session-level steering API', async () => {
    let finishPrompt!: () => void;
    const promptDone = new Promise<void>(resolve => {
      finishPrompt = resolve;
    });
    const { harness, userMessages } = mockHarness({
      script: () => [],
      supportsSteering: true,
      promptDone: () => promptDone,
    });
    const agent = new HarnessAgent({
      harness,
    });
    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });
    const result = await agent.stream({ session, prompt: 'Start.' });

    await session.experimental_steerTurn('Change course.');

    expect(userMessages).toEqual(['Change course.']);
    finishPrompt();
    await result.consumeStream();
    await session.destroy();
  });

  test('experimental_steer() reports an unsupported harness capability', async () => {
    let finishPrompt!: () => void;
    const promptDone = new Promise<void>(resolve => {
      finishPrompt = resolve;
    });
    const { harness } = mockHarness({
      script: () => [],
      promptDone: () => promptDone,
    });
    const agent = new HarnessAgent({
      harness,
    });
    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });
    const result = await agent.stream({ session, prompt: 'Start.' });

    await expect(
      agent.experimental_steer({ session, text: 'Change course.' }),
    ).rejects.toSatisfy(HarnessCapabilityUnsupportedError.isInstance);

    finishPrompt();
    await result.consumeStream();
    await session.destroy();
  });

  test('experimental_steer() rejects when the session has no running turn', async () => {
    const { harness } = mockHarness({ script: () => [] });
    const agent = new HarnessAgent({
      harness,
    });
    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });

    await expect(
      agent.experimental_steer({ session, text: 'Change course.' }),
    ).rejects.toThrow('has no running turn to steer');

    await session.destroy();
  });

  test('experimental_steer() rejects while the turn awaits tool approval', async () => {
    const { harness, userMessages } = mockHarness({
      script: () => [
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'weather',
          input: JSON.stringify({ city: 'Paris' }),
        },
      ],
      supportsSteering: true,
    });
    const weather = tool({
      inputSchema: z.object({ city: z.string() }),
      execute: async ({ city }) => ({ city }),
    });
    const agent = new HarnessAgent({
      harness,
      tools: { weather },
      toolApproval: { weather: 'user-approval' },
    });
    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });
    const result = await agent.stream({ session, prompt: 'Start.' });
    await result.consumeStream();

    await expect(
      agent.experimental_steer({ session, text: 'Change course.' }),
    ).rejects.toThrow('has no running turn to steer');
    expect(userMessages).toEqual([]);

    await session.destroy();
  });

  test('experimental_steer() rejects after the active turn is suspended', async () => {
    let finishPrompt!: () => void;
    const promptDone = new Promise<void>(resolve => {
      finishPrompt = resolve;
    });
    const { harness, userMessages } = mockHarness({
      script: () => [],
      supportsSteering: true,
      promptDone: () => promptDone,
      onSuspendTurn: () => finishPrompt(),
    });
    const agent = new HarnessAgent({
      harness,
    });
    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });
    const result = await agent.stream({ session, prompt: 'Start.' });

    await session.suspendTurn();
    await expect(
      agent.experimental_steer({ session, text: 'Change course.' }),
    ).rejects.toThrow('has ended and cannot be reused');
    expect(userMessages).toEqual([]);

    finishPrompt();
    await result.consumeStream();
  });

  test('experimental_steer() targets the current turn when a session is reused', async () => {
    const finishPrompts: Array<() => void> = [];
    const { harness, userMessages } = mockHarness({
      script: () => [],
      supportsSteering: true,
      promptDone: () =>
        new Promise<void>(resolve => {
          finishPrompts.push(resolve);
        }),
    });
    const agent = new HarnessAgent({
      harness,
    });
    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });

    const first = await agent.stream({ session, prompt: 'First.' });
    await agent.experimental_steer({ session, text: 'Steer first.' });
    finishPrompts.shift()!();
    await first.consumeStream();

    const second = await agent.stream({ session, prompt: 'Second.' });
    await agent.experimental_steer({ session, text: 'Steer second.' });
    finishPrompts.shift()!();
    await second.consumeStream();

    expect(userMessages).toEqual(['Steer first.', 'Steer second.']);
    await session.destroy();
  });

  test('does not limit steps when stopWhen is omitted', async () => {
    const step = finishEvents()[0]!;
    const { harness, doSuspendTurn } = mockHarness({
      script: () => [
        ...Array.from({ length: 21 }, () => step),
        finishEvents()[1]!,
      ],
    });
    const agent = new HarnessAgent({
      harness,
    });
    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });

    const result = await agent.generate({ session, prompt: 'keep going' });

    expect(result.steps).toHaveLength(21);
    expect(session.hasUnfinishedTurn()).toBe(false);
    expect(doSuspendTurn).not.toHaveBeenCalled();
    await session.destroy();
  });

  test('generate() stops after a configured step and reuses its captured suspension state', async () => {
    const predicateStepCounts: number[] = [];
    const { harness, doSuspendTurn } = mockHarness({
      script: () => [
        finishEvents()[0]!,
        finishEvents()[0]!,
        finishEvents()[1]!,
      ],
    });
    const agent = new HarnessAgent({
      harness,
      stopWhen: [
        ({ steps }) => {
          predicateStepCounts.push(steps.length);
          return false;
        },
        async ({ steps }) => steps.length === 1,
      ],
    });
    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });

    const result = await agent.generate({ session, prompt: 'one step' });

    expect(result.steps).toHaveLength(1);
    expect(predicateStepCounts).toEqual([1]);
    expect(session.hasUnfinishedTurn()).toBe(true);
    expect(doSuspendTurn).toHaveBeenCalledTimes(1);

    await expect(session.suspendTurn()).resolves.toEqual({
      type: 'continue-turn',
      harnessId: 'mock',
      specificationVersion: 'harness-v1',
      data: {},
      turnSettings: { skills: [], tools: [] },
    });
    expect(doSuspendTurn).toHaveBeenCalledTimes(1);
  });

  test('stream() and continued turns apply stopWhen independently', async () => {
    let continuationCount = 0;
    const continuingTurn = (): HarnessV1StreamPart[] => [
      finishEvents()[0]!,
      { type: 'text-delta', id: 'next-step', delta: 'next' },
    ];
    const { harness, doSuspendTurn } = mockHarness({
      script: continuingTurn,
      continueScript: () => {
        continuationCount += 1;
        return continuationCount <= 2 ? continuingTurn() : [finishEvents()[1]!];
      },
    });
    const agent = new HarnessAgent({
      harness,
      stopWhen: isStepCount(1),
    });

    const sandboxSession = makeSandboxSession();
    let session = await agent.createSession({ sandboxSession });
    const first = await agent.stream({ session, prompt: 'one step at a time' });
    await first.consumeStream();
    await expect(first.steps).resolves.toHaveLength(1);
    let continueFrom = await session.suspendTurn();

    session = await agent.createSession({
      sessionId: session.sessionId,
      continueFrom,
      sandboxSession,
    });
    const second = await agent.continueStream({ session });
    await second.consumeStream();
    await expect(second.steps).resolves.toHaveLength(1);
    continueFrom = await session.suspendTurn();

    session = await agent.createSession({
      sessionId: session.sessionId,
      continueFrom,
      sandboxSession,
    });
    const third = await agent.continueGenerate({ session });
    expect(third.steps).toHaveLength(1);
    continueFrom = await session.suspendTurn();

    session = await agent.createSession({
      sessionId: session.sessionId,
      continueFrom,
      sandboxSession,
    });
    const terminal = await agent.continueGenerate({ session });

    expect(terminal.steps).toHaveLength(0);
    expect(session.hasUnfinishedTurn()).toBe(false);
    expect(doSuspendTurn).toHaveBeenCalledTimes(3);
    await session.destroy();
  });

  test('stopWhen lets a terminal text-only step finish the turn naturally', async () => {
    const { harness, doSuspendTurn } = mockHarness({
      script: () => [
        { type: 'text-delta', id: 't1', delta: 'done' },
        {
          type: 'finish-step',
          finishReason: { unified: 'stop', raw: 'end_turn' },
          usage: zeroUsage(),
        },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'end_turn' },
          totalUsage: zeroUsage(),
        },
      ],
    });
    const agent = new HarnessAgent({
      harness,
      stopWhen: isStepCount(1),
    });
    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });

    const result = await agent.generate({ session, prompt: 'finish' });

    expect(result.text).toBe('done');
    expect(result.steps).toHaveLength(1);
    expect(result.finishReason).toBe('stop');
    expect(session.hasUnfinishedTurn()).toBe(false);
    expect(doSuspendTurn).not.toHaveBeenCalled();
    await session.destroy();
  });

  test('generate() returns text + steps for a simple text-only turn', async () => {
    const { harness } = mockHarness({
      script: () => [
        { type: 'stream-start' },
        { type: 'text-start', id: 't1' },
        { type: 'text-delta', id: 't1', delta: 'Hello, ' },
        { type: 'text-delta', id: 't1', delta: 'world.' },
        { type: 'text-end', id: 't1' },
        {
          type: 'finish-step',
          finishReason: { unified: 'stop', raw: 'end_turn' },
          usage: {
            inputTokens: {
              total: 5,
              noCache: 5,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: { total: 2, text: 2, reasoning: undefined },
          },
        },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'end_turn' },
          totalUsage: {
            inputTokens: {
              total: 5,
              noCache: 5,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: { total: 2, text: 2, reasoning: undefined },
          },
        },
      ],
    });

    const agent = new HarnessAgent({ harness });
    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });
    const result = await agent.generate({ session, prompt: 'hi' });

    expect(result.text).toBe('Hello, world.');
    expect(result.finishReason).toBe('stop');
    expect(result.rawFinishReason).toBe('end_turn');
    expect(result.usage.inputTokens).toBe(5);
    expect(result.usage.outputTokens).toBe(2);
    expect(result.usage.totalTokens).toBe(7);
    expect(result.steps).toHaveLength(1);
    expect(result.finalStep.text).toBe('Hello, world.');
    expect(result.toolCalls).toEqual([]);
    expect(result.toolResults).toEqual([]);
    expect(result.responseMessages).toHaveLength(1);
    expect(result.responseMessages[0]!.role).toBe('assistant');

    await session.destroy();
  });

  test('reports whether typed output is configured', () => {
    const { harness } = mockHarness({ script: () => [] });
    const textAgent = new HarnessAgent({
      harness,
    });
    const outputAgent = new HarnessAgent({
      harness,
      output: Output.object({ schema: z.object({ answer: z.string() }) }),
    });

    expect(textAgent.hasOutput).toBe(false);
    expect(outputAgent.hasOutput).toBe(true);
  });

  test('generates typed output and sends its response format on every turn', async () => {
    const responseFormats: HarnessV1PromptTurnOptions['responseFormat'][] = [];
    const { harness } = mockHarness({
      onPromptTurn: options => {
        responseFormats.push(options.responseFormat);
      },
      script: () => [
        { type: 'text-start', id: 'structured' },
        {
          type: 'text-delta',
          id: 'structured',
          delta: '{"answer":"yes"}',
        },
        { type: 'text-end', id: 'structured' },
        {
          type: 'finish-step',
          finishReason: { unified: 'stop', raw: 'end_turn' },
          usage: zeroUsage(),
        },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'end_turn' },
          totalUsage: zeroUsage(),
        },
      ],
    });
    const agent = new HarnessAgent({
      harness,
      output: Output.object({
        name: 'answer',
        description: 'A yes or no answer.',
        schema: z.object({ answer: z.string() }),
      }),
    });
    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });

    const first = await agent.generate({ session, prompt: 'answer' });
    const second = await agent.generate({ session, prompt: 'answer again' });

    expect(first.output).toEqual({ answer: 'yes' });
    expectTypeOf(first.output).toEqualTypeOf<{ answer: string }>();
    expect(second.output).toEqual({ answer: 'yes' });
    expect(responseFormats).toHaveLength(2);
    for (const responseFormat of responseFormats) {
      expect(responseFormat).toMatchObject({
        type: 'json',
        name: 'answer',
        description: 'A yes or no answer.',
        schema: {
          type: 'object',
          properties: { answer: { type: 'string' } },
          required: ['answer'],
        },
      });
    }

    await session.destroy();
  });

  test('streams partial typed output', async () => {
    const { harness } = mockHarness({
      script: () => [
        { type: 'text-start', id: 'structured' },
        {
          type: 'text-delta',
          id: 'structured',
          delta: '{"answer":"yes"}',
        },
        { type: 'text-end', id: 'structured' },
        {
          type: 'finish-step',
          finishReason: { unified: 'stop', raw: 'end_turn' },
          usage: zeroUsage(),
        },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'end_turn' },
          totalUsage: zeroUsage(),
        },
      ],
    });
    const agent = new HarnessAgent({
      harness,
      output: Output.object({
        schema: z.object({ answer: z.string() }),
      }),
    });
    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });

    const result = await agent.stream({ session, prompt: 'answer' });
    const partialOutputs = [];
    for await (const partialOutput of result.partialOutputStream) {
      partialOutputs.push(partialOutput);
    }

    expect(partialOutputs).toEqual([{ answer: 'yes' }]);
    await expect(result.output).resolves.toEqual({ answer: 'yes' });
    await session.destroy();
  });

  test('streams array elements from typed output', async () => {
    const { harness } = mockHarness({
      script: () => [
        { type: 'text-start', id: 'structured' },
        {
          type: 'text-delta',
          id: 'structured',
          delta: '{"elements":[{"answer":"yes"},{"answer":"no"}]}',
        },
        { type: 'text-end', id: 'structured' },
        {
          type: 'finish-step',
          finishReason: { unified: 'stop', raw: 'end_turn' },
          usage: zeroUsage(),
        },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'end_turn' },
          totalUsage: zeroUsage(),
        },
      ],
    });
    const agent = new HarnessAgent({
      harness,
      output: Output.array({
        element: z.object({ answer: z.string() }),
      }),
    });
    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });

    const result = await agent.stream({ session, prompt: 'answer twice' });
    const elements = [];
    for await (const element of result.elementStream) {
      elements.push(element);
    }

    expect(elements).toEqual([{ answer: 'yes' }, { answer: 'no' }]);
    await session.destroy();
  });

  test('stream() returns a result whose fullStream emits translated parts', async () => {
    const { harness } = mockHarness({
      script: () => [
        { type: 'stream-start' },
        { type: 'text-delta', id: 't1', delta: 'Hi' },
        {
          type: 'finish-step',
          finishReason: { unified: 'stop', raw: undefined },
          usage: {
            inputTokens: {
              total: undefined,
              noCache: undefined,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: {
              total: undefined,
              text: undefined,
              reasoning: undefined,
            },
          },
        },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: undefined },
          totalUsage: {
            inputTokens: {
              total: undefined,
              noCache: undefined,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: {
              total: undefined,
              text: undefined,
              reasoning: undefined,
            },
          },
        },
      ],
    });

    const agent = new HarnessAgent({ harness });
    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });
    const result = await agent.stream({ session, prompt: 'hi' });

    const types: string[] = [];
    for await (const part of result.fullStream) {
      types.push(part.type);
    }

    // The message-level `start` part must be the first chunk, mirroring
    // `streamText` — UI message stream consumers rely on it.
    expect(types[0]).toBe('start');
    expect(types).toContain('text-delta');
    expect(types).toContain('finish-step');
    expect(types).toContain('finish');
    expect(await result.text).toBe('Hi');

    await session.destroy();
  });

  test('releases the session after a turn-start failure', async () => {
    let promptTurnCount = 0;
    const { harness } = mockHarness({
      script: () => finishEvents(),
      onPromptTurn: () => {
        promptTurnCount += 1;
        if (promptTurnCount === 1) {
          throw new Error('failed to start turn');
        }
      },
    });
    const agent = new HarnessAgent({ harness });
    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });

    const failed = await agent.stream({ session, prompt: 'fail' });
    await expect(failed.text).rejects.toThrow('failed to start turn');

    expect(session.hasUnfinishedTurn()).toBe(false);
    await expect(
      agent.generate({ session, prompt: 'recover' }),
    ).resolves.toBeDefined();

    await session.destroy();
  });

  test('releases the session after a continued turn stream error', async () => {
    const { harness } = mockHarness({
      script: () => finishEvents(),
      continueScript: () => [
        { type: 'error', error: new Error('continued turn failed') },
      ],
    });
    const agent = new HarnessAgent({ harness });
    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
      continueFrom: {
        type: 'continue-turn',
        harnessId: 'mock',
        specificationVersion: 'harness-v1',
        data: {},
      },
    });

    const failed = await agent.continueStream({ session });
    await expect(failed.text).rejects.toThrow('continued turn failed');

    expect(session.hasUnfinishedTurn()).toBe(false);
    await expect(
      agent.generate({ session, prompt: 'recover' }),
    ).resolves.toBeDefined();

    await session.destroy();
  });

  test('releases the session after an aborted turn closes without finish', async () => {
    let promptTurnCount = 0;
    const abortController = new AbortController();
    const { harness } = mockHarness({
      onPromptTurn: () => {
        promptTurnCount += 1;
      },
      promptDone: options => {
        if (promptTurnCount > 1) return Promise.resolve();
        const abortSignal = options.abortSignal;
        if (abortSignal == null) {
          throw new Error('Expected an abort signal.');
        }
        return new Promise(resolve => {
          abortSignal.addEventListener('abort', () => resolve(), {
            once: true,
          });
        });
      },
      script: () => (promptTurnCount === 1 ? [] : finishEvents()),
    });
    const agent = new HarnessAgent({ harness });
    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });

    const aborted = await agent.stream({
      session,
      prompt: 'abort',
      abortSignal: abortController.signal,
    });
    abortController.abort();
    await aborted.consumeStream();

    expect(session.hasUnfinishedTurn()).toBe(false);
    await expect(
      agent.generate({ session, prompt: 'recover' }),
    ).resolves.toBeDefined();

    await session.destroy();
  });

  test.each([
    { count: 1, error: false, suspendDuringValidation: false },
    { count: 3, error: true, suspendDuringValidation: false },
    { count: 1, error: false, suspendDuringValidation: true },
  ])(
    'preserves dispatched host results when the adapter suspends ($count calls, error=$error, validation=$suspendDuringValidation)',
    async ({ count, error, suspendDuringValidation }) => {
      let releaseWork!: () => void;
      const work = new Promise<void>(resolve => {
        releaseWork = resolve;
      });
      let resolveStarted!: () => void;
      const started = new Promise<void>(resolve => {
        resolveStarted = resolve;
      });
      let closeStream!: () => void;
      const streamDone = new Promise<void>(resolve => {
        closeStream = resolve;
      });
      let resolveClosed!: () => void;
      const closed = new Promise<void>(resolve => {
        resolveClosed = resolve;
      });
      let channelClosed = false;
      const completed: string[] = [];
      const execute = vi.fn(async ({ query }: { query: string }) => {
        if (execute.mock.calls.length === count) resolveStarted();
        await work;
        completed.push(query);
        if (error && query === '1') throw new Error('tool unavailable');
        return { answer: query };
      });
      const calls: Extract<HarnessV1StreamPart, { type: 'tool-call' }>[] =
        Array.from({ length: count }, (_, index) => ({
          type: 'tool-call',
          toolCallId: `call-${index}`,
          toolName: 'research',
          input: JSON.stringify({ query: String(index) }),
        }));
      const { harness, toolResults, prompts, doContinueTurn } = mockHarness({
        script: () => calls,
        promptDone: () => streamDone,
        onDoStart: () => {
          channelClosed = false;
        },
        onSuspendTurn: () => {
          channelClosed = true;
          closeStream();
          resolveClosed();
        },
        onSubmitToolResult: async () => {
          if (channelClosed) {
            throw new Error(
              'SandboxChannel: cannot send tool-result — channel is closed.',
            );
          }
        },
        continueScript: () => [
          ...calls.map(call => ({
            type: 'tool-result' as const,
            toolCallId: call.toolCallId,
            toolName: call.toolName,
            result: { answer: call.toolCallId },
          })),
          ...finishEvents(),
        ],
      });
      const agent = new HarnessAgent({
        harness,
        tools: {
          research: tool({
            inputSchema: z.object({ query: z.string() }).refine(async () => {
              if (suspendDuringValidation) {
                resolveStarted();
                await work;
              }
              return true;
            }),
            execute,
          }),
        },
      });
      const sandboxSession = makeSandboxSession();
      const session = await agent.createSession({ sandboxSession });
      const first = await agent.stream({ session, prompt: 'research' });
      const firstParts: string[] = [];
      const firstRead = (async () => {
        for await (const part of first.fullStream) firstParts.push(part.type);
      })();
      await started;
      const suspension = session.suspendTurn();
      await closed;
      releaseWork();
      const continueFrom = await suspension;
      await firstRead;

      expect(completed).toHaveLength(count);
      expect(continueFrom.pendingToolResults).toHaveLength(count);
      expect(toolResults).toEqual([]);
      expect(firstParts).not.toContain('error');
      expect(firstParts.filter(type => type === 'tool-result')).toHaveLength(
        count - Number(error),
      );
      expect(firstParts.filter(type => type === 'tool-error')).toHaveLength(
        Number(error),
      );

      const resumed = await agent.createSession({
        sessionId: session.sessionId,
        continueFrom: structuredClone(continueFrom),
        sandboxSession,
      });
      const second = await agent.continueStream({ session: resumed });
      const secondParts: string[] = [];
      for await (const part of second.fullStream) secondParts.push(part.type);

      expect(execute).toHaveBeenCalledTimes(count);
      expect(prompts).toEqual(['research']);
      expect(doContinueTurn).toHaveBeenCalledOnce();
      expect(toolResults).toHaveLength(count);
      expect(toolResults).toEqual(
        expect.arrayContaining(
          calls.map((call, index) => ({
            toolCallId: call.toolCallId,
            output:
              error && index === 1
                ? { error: 'Error: tool unavailable' }
                : { answer: String(index) },
            ...(error && index === 1 ? { isError: true } : {}),
          })),
        ),
      );
      expect(secondParts).not.toContain('tool-result');
      expect(secondParts).not.toContain('tool-error');
      expect(secondParts.filter(type => type === 'finish-step')).toHaveLength(
        1,
      );
      await expect(second.steps).resolves.toHaveLength(1);
      await resumed.destroy();
    },
  );

  test('preserves a resumed approved host call across another suspension', async () => {
    let startWork!: () => void;
    const started = new Promise<void>(resolve => {
      startWork = resolve;
    });
    let finishWork!: () => void;
    const work = new Promise<void>(resolve => {
      finishWork = resolve;
    });
    let signalClosed!: () => void;
    const closed = new Promise<void>(resolve => {
      signalClosed = resolve;
    });
    let channelClosed = false;
    let continuationCount = 0;
    const execute = vi.fn(async () => {
      startWork();
      await work;
      return { answer: 'retained' };
    });
    const { harness, toolResults } = mockHarness({
      script: () => [],
      onDoStart: () => {
        channelClosed = false;
      },
      onSuspendTurn: () => {
        channelClosed = true;
        signalClosed();
      },
      onSubmitToolResult: async () => {
        if (channelClosed) throw new Error('channel is closed');
      },
      continueScript: () =>
        ++continuationCount === 1
          ? []
          : [
              {
                type: 'tool-result',
                toolCallId: 'call-1',
                toolName: 'research',
                result: { answer: 'retained' },
              },
              ...finishEvents(),
            ],
    });
    const agent = new HarnessAgent({
      harness,
      tools: {
        research: tool({ inputSchema: z.object({}), execute }),
      },
    });
    const sandboxSession = makeSandboxSession();
    const session = await agent.createSession({
      sandboxSession,
      continueFrom: {
        type: 'continue-turn',
        harnessId: 'mock',
        specificationVersion: 'harness-v1',
        data: {},
        pendingToolApprovals: [
          {
            approvalId: 'approval-1',
            toolCallId: 'call-1',
            toolName: 'research',
            input: '{}',
            kind: 'custom',
            providerExecuted: false,
          },
        ],
      },
    });
    const first = await agent.continueStream({
      session,
      toolApprovalContinuations: [
        {
          type: 'tool-approval-response',
          approvalId: 'approval-1',
          approved: true,
        },
      ],
    });
    const firstParts: string[] = [];
    const consume = (async () => {
      for await (const part of first.fullStream) firstParts.push(part.type);
    })();
    await started;
    const suspension = session.suspendTurn();
    await closed;
    finishWork();
    const continueFrom = await suspension;
    await consume;

    expect(firstParts).not.toContain('error');
    expect(firstParts.filter(type => type === 'tool-result')).toHaveLength(1);
    expect(continueFrom.pendingToolResults).toHaveLength(1);
    expect(continueFrom.pendingToolApprovals).toBeUndefined();

    const resumed = await agent.createSession({
      sessionId: session.sessionId,
      continueFrom: structuredClone(continueFrom),
      sandboxSession,
    });
    const second = await agent.continueStream({ session: resumed });
    await second.consumeStream();

    expect(execute).toHaveBeenCalledOnce();
    expect(toolResults).toEqual([
      { toolCallId: 'call-1', output: { answer: 'retained' } },
    ]);
    await resumed.destroy();
  });

  test.each(['detach', 'stop'] as const)(
    'session.%s() preserves an in-flight host result in its nested continuation',
    async lifecycleMethod => {
      let releaseWork!: () => void;
      const work = new Promise<void>(resolve => {
        releaseWork = resolve;
      });
      let resolveStarted!: () => void;
      const started = new Promise<void>(resolve => {
        resolveStarted = resolve;
      });
      let closeStream!: () => void;
      const streamDone = new Promise<void>(resolve => {
        closeStream = resolve;
      });
      let resolveClosed!: () => void;
      const closed = new Promise<void>(resolve => {
        resolveClosed = resolve;
      });
      let channelClosed = false;
      const execute = vi.fn(async () => {
        resolveStarted();
        await work;
        return { answer: 'retained' };
      });
      const toolCall = {
        type: 'tool-call' as const,
        toolCallId: 'call-1',
        toolName: 'research',
        input: '{}',
      };
      const { harness, toolResults, doContinueTurn } = mockHarness({
        script: () => [toolCall],
        promptDone: () => streamDone,
        onDoStart: () => {
          channelClosed = false;
        },
        onSuspendTurn: () => {
          channelClosed = true;
          closeStream();
          resolveClosed();
        },
        onSubmitToolResult: async () => {
          if (channelClosed) throw new Error('channel is closed');
        },
        continueScript: () => [
          {
            type: 'tool-result',
            toolCallId: toolCall.toolCallId,
            toolName: toolCall.toolName,
            result: { answer: 'retained' },
          },
          ...finishEvents(),
        ],
      });
      const agent = new HarnessAgent({
        harness,
        tools: {
          research: tool({ inputSchema: z.object({}), execute }),
        },
      });
      const sandboxSession = makeSandboxSession();
      const session = await agent.createSession({ sandboxSession });
      const first = await agent.stream({ session, prompt: 'research' });
      const firstRead = first.consumeStream();
      await started;

      const ending =
        lifecycleMethod === 'detach' ? session.detach() : session.stop();
      await closed;
      releaseWork();
      const resumeFrom = await ending;
      await firstRead;

      expect(resumeFrom.continueFrom?.pendingToolResults).toEqual([
        {
          toolCallId: toolCall.toolCallId,
          toolName: toolCall.toolName,
          input: toolCall.input,
          completedResult: { output: { answer: 'retained' } },
        },
      ]);
      expect(toolResults).toEqual([]);

      const resumed = await agent.createSession({
        sessionId: session.sessionId,
        resumeFrom: structuredClone(resumeFrom),
        sandboxSession,
      });
      const second = await agent.continueStream({ session: resumed });
      await second.consumeStream();

      expect(execute).toHaveBeenCalledOnce();
      expect(doContinueTurn).toHaveBeenCalledOnce();
      expect(toolResults).toEqual([
        {
          toolCallId: toolCall.toolCallId,
          output: { answer: 'retained' },
        },
      ]);
      await resumed.destroy();
    },
  );

  test('keeps a turn unfinished when suspension closes its stream mid-step', async () => {
    let resolvePromptDone!: () => void;
    const promptDone = new Promise<void>(resolve => {
      resolvePromptDone = resolve;
    });
    const { harness } = mockHarness({
      script: () => [
        { type: 'text-start', id: 't1' },
        { type: 'text-delta', id: 't1', delta: 'partial' },
      ],
      promptDone: () => promptDone,
      onSuspendTurn: () => {
        resolvePromptDone();
      },
    });
    const agent = new HarnessAgent({ harness });
    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });
    const result = await agent.stream({ session, prompt: 'work' });

    const continueFrom = await session.suspendTurn();
    await result.consumeStream();

    expect(continueFrom).toEqual({
      type: 'continue-turn',
      harnessId: 'mock',
      specificationVersion: 'harness-v1',
      data: {},
      turnSettings: { skills: [], tools: [] },
    });
    expect(session.hasUnfinishedTurn()).toBe(true);
    await expect(result.steps).resolves.toEqual([]);
  });

  test('settles an aborted turn with an abort part and releases the session for the next turn', async () => {
    let promptTurnCount = 0;
    const abortController = new AbortController();
    abortController.abort();
    const { harness } = mockHarness({
      onPromptTurn: () => {
        promptTurnCount += 1;
      },
      script: () =>
        promptTurnCount === 1
          ? [
              {
                type: 'error',
                error: 'AbortError: This operation was aborted',
              },
            ]
          : finishEvents(),
    });
    const agent = new HarnessAgent({ harness });
    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });

    const aborted = await agent.stream({
      session,
      prompt: 'abort',
      abortSignal: abortController.signal,
    });

    const types: string[] = [];
    for await (const part of aborted.fullStream) {
      types.push(part.type);
    }

    // The user stop surfaces as an `abort` part, not an `error` part …
    expect(types).toContain('abort');
    expect(types).not.toContain('error');
    // … and the turn-settlement lifecycle ran: the session returns to idle
    // and accepts the next turn.
    expect(session.hasUnfinishedTurn()).toBe(false);
    await expect(
      agent.generate({ session, prompt: 'recover' }),
    ).resolves.toBeDefined();

    await session.destroy();
  });

  test('does not log a bridge error to stderr for a turn the caller aborted', async () => {
    const abortController = new AbortController();
    abortController.abort();
    const { harness } = mockHarness({
      script: () => [
        {
          type: 'error',
          error: 'AbortError: This operation was aborted',
        },
      ],
    });
    const agent = new HarnessAgent({ harness });
    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });

    const stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    try {
      const aborted = await agent.stream({
        session,
        prompt: 'abort',
        abortSignal: abortController.signal,
      });
      await aborted.consumeStream();

      // The caller's own signal produced the error-shaped part; diagnosing it
      // to stderr would read as a malfunction.
      const errorLines = stderrSpy.mock.calls
        .map(call => String(call[0]))
        .filter(line => line.includes('harness stream error'));
      expect(errorLines).toEqual([]);
    } finally {
      stderrSpy.mockRestore();
    }

    await session.destroy();
  });

  test('continueStream() continues an in-flight turn and streams translated parts', async () => {
    const { harness, doContinueTurn, prompts } = mockHarness({
      script: () => [],
      continueScript: () => [
        { type: 'stream-start' },
        { type: 'text-delta', id: 't1', delta: 'Still running' },
        {
          type: 'finish-step',
          finishReason: { unified: 'stop', raw: undefined },
          usage: {
            inputTokens: {
              total: undefined,
              noCache: undefined,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: {
              total: undefined,
              text: undefined,
              reasoning: undefined,
            },
          },
        },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: undefined },
          totalUsage: {
            inputTokens: {
              total: undefined,
              noCache: undefined,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: {
              total: undefined,
              text: undefined,
              reasoning: undefined,
            },
          },
        },
      ],
    });

    const agent = new HarnessAgent({
      harness,
      instructions: {
        role: 'system',
        content: 'Be concise.',
        providerOptions: { test: { cache: true } },
      },
    });
    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
      continueFrom: {
        type: 'continue-turn',
        harnessId: 'mock',
        specificationVersion: 'harness-v1',
        data: {},
      },
    });
    const result = await agent.continueStream({ session });

    const types: string[] = [];
    for await (const part of result.fullStream) {
      types.push(part.type);
    }

    expect(types).toContain('text-delta');
    expect(types).toContain('finish-step');
    expect(types).toContain('finish');
    expect(await result.text).toBe('Still running');
    expect(prompts).toEqual([]);
    expect(doContinueTurn).toHaveBeenCalledTimes(1);
    expect(doContinueTurn.mock.calls[0]?.[0].instructions).toBe('Be concise.');

    await session.destroy();
  });

  test('continueGenerate() continues an in-flight turn and returns generated text', async () => {
    const { harness, doContinueTurn, prompts } = mockHarness({
      script: () => [],
      continueScript: () => [
        { type: 'stream-start' },
        { type: 'text-start', id: 't1' },
        { type: 'text-delta', id: 't1', delta: 'Completed' },
        { type: 'text-end', id: 't1' },
        {
          type: 'finish-step',
          finishReason: { unified: 'stop', raw: 'end_turn' },
          usage: {
            inputTokens: {
              total: 3,
              noCache: 3,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: { total: 1, text: 1, reasoning: undefined },
          },
        },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'end_turn' },
          totalUsage: {
            inputTokens: {
              total: 3,
              noCache: 3,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: { total: 1, text: 1, reasoning: undefined },
          },
        },
      ],
    });

    const agent = new HarnessAgent({ harness });
    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
      continueFrom: {
        type: 'continue-turn',
        harnessId: 'mock',
        specificationVersion: 'harness-v1',
        data: {},
      },
    });
    const result = await agent.continueGenerate({ session });

    expect(result.text).toBe('Completed');
    expect(result.finishReason).toBe('stop');
    expect(result.rawFinishReason).toBe('end_turn');
    expect(result.usage.inputTokens).toBe(3);
    expect(result.usage.outputTokens).toBe(1);
    expect(prompts).toEqual([]);
    expect(doContinueTurn).toHaveBeenCalledTimes(1);

    await session.destroy();
  });

  test('serializes and resumes a client-side tool result pause', async () => {
    const weather = tool({
      description: 'Get weather',
      inputSchema: z.object({ city: z.string() }),
    });
    const { harness, toolResults, doContinueTurn } = mockHarness({
      script: () => [
        {
          type: 'tool-call',
          toolCallId: 'c1',
          toolName: 'weather',
          input: JSON.stringify({ city: 'Lima' }),
        },
      ],
      continueScript: () => [
        {
          type: 'tool-call',
          toolCallId: 'c1',
          toolName: 'weather',
          input: JSON.stringify({ city: 'Lima' }),
        },
        {
          type: 'tool-result',
          toolCallId: 'c1',
          toolName: 'weather',
          result: { city: 'Lima', celsius: 19 },
        },
        {
          type: 'finish-step',
          finishReason: { unified: 'tool-calls', raw: 'tool_use' },
          usage: zeroUsage(),
        },
        { type: 'text-delta', id: 't1', delta: 'It is 19°C in Lima.' },
        {
          type: 'finish-step',
          finishReason: { unified: 'stop', raw: 'end_turn' },
          usage: zeroUsage(),
        },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'end_turn' },
          totalUsage: zeroUsage(),
        },
      ],
    });
    let prepareCallCount = 0;
    const agent = new HarnessAgent({
      harness,
      tools: { weather },
      callOptionsSchema: z.object({ city: z.string() }),
      prepareCall: ({ options, ...call }) => {
        prepareCallCount += 1;
        return {
          ...call,
          skills: [
            {
              name: `${options.city}-weather`,
              description: 'Weather guidance.',
              content: 'Use the weather tool.',
            },
          ],
          instructions: `Be concise about ${options.city}.`,
          tools: { weather },
        };
      },
    });
    const sandboxSession = makeSandboxSession();
    let session = await agent.createSession({ sandboxSession });

    const first = await agent.stream({
      session,
      prompt: 'Check Lima weather',
      options: { city: 'lima' },
    });
    await first.consumeStream();

    expect(session.hasUnfinishedTurn()).toBe(true);
    expect(await first.steps).toHaveLength(1);
    expect(toolResults).toEqual([]);

    const sessionId = session.sessionId;
    const continueFrom = await session.suspendTurn();
    expect(session.hasUnfinishedTurn()).toBe(true);
    expect(continueFrom.pendingToolResults).toEqual([
      {
        toolCallId: 'c1',
        toolName: 'weather',
        input: JSON.stringify({ city: 'Lima' }),
      },
    ]);
    expect(continueFrom.turnSettings).toMatchObject({
      skills: [{ name: 'lima-weather' }],
      instructions: 'Be concise about lima.',
      tools: [{ name: 'weather', description: 'Get weather' }],
    });

    session = await agent.createSession({
      sessionId,
      continueFrom,
      sandboxSession,
    });
    expect(session.hasUnfinishedTurn()).toBe(true);
    const continued = await agent.continueStream({
      session,
      toolResultContinuations: [
        {
          type: 'tool-result',
          toolCallId: 'c1',
          toolName: 'weather',
          output: {
            type: 'json',
            value: { city: 'Lima', celsius: 19 },
          },
        },
      ],
    });
    const continuedPartTypes: string[] = [];
    for await (const part of continued.fullStream) {
      continuedPartTypes.push(part.type);
    }

    expect(toolResults).toEqual([
      {
        toolCallId: 'c1',
        output: { city: 'Lima', celsius: 19 },
        isError: undefined,
        toolResult: {
          type: 'tool-result',
          toolCallId: 'c1',
          toolName: 'weather',
          output: {
            type: 'json',
            value: { city: 'Lima', celsius: 19 },
          },
        },
      },
    ]);
    expect(continuedPartTypes).toEqual([
      'start',
      'start-step',
      'text-delta',
      'finish-step',
      'finish',
    ]);
    expect((await continued.steps).map(step => step.text)).toEqual([
      'It is 19°C in Lima.',
    ]);
    expect(session.hasUnfinishedTurn()).toBe(false);
    expect(prepareCallCount).toBe(1);
    expect(doContinueTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        skills: [expect.objectContaining({ name: 'lima-weather' })],
        instructions: 'Be concise about lima.',
        tools: [expect.objectContaining({ name: 'weather' })],
      }),
    );

    await session.destroy();
  });

  test('collects a client-side tool result from messages', async () => {
    const weather = tool({
      description: 'Get weather',
      inputSchema: z.object({ city: z.string() }),
    });
    const { harness, toolResults } = mockHarness({
      script: () => [
        {
          type: 'tool-call',
          toolCallId: 'c1',
          toolName: 'weather',
          input: JSON.stringify({ city: 'Lima' }),
        },
      ],
      continueScript: () => finishEvents(),
    });
    const agent = new HarnessAgent({
      harness,
      tools: { weather },
    });
    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });

    const first = await agent.stream({ session, prompt: 'Check Lima weather' });
    await first.consumeStream();
    const continued = await agent.stream({
      session,
      messages: [
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'c1',
              toolName: 'weather',
              output: {
                type: 'json',
                value: { city: 'Lima', celsius: 19 },
              },
            },
          ],
        },
      ],
    });
    await continued.consumeStream();

    expect(toolResults).toEqual([
      {
        toolCallId: 'c1',
        output: { city: 'Lima', celsius: 19 },
        isError: undefined,
        toolResult: {
          type: 'tool-result',
          toolCallId: 'c1',
          toolName: 'weather',
          output: {
            type: 'json',
            value: { city: 'Lima', celsius: 19 },
          },
        },
      },
    ]);
    expect(session.hasUnfinishedTurn()).toBe(false);

    await session.destroy();
  });

  test('continueStream() rejects when there is no unfinished turn', async () => {
    const { harness } = mockHarness({ script: () => [] });
    const agent = new HarnessAgent({ harness });
    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });

    await expect(agent.continueStream({ session })).rejects.toThrow(
      /no unfinished turn to continue/,
    );

    await session.destroy();
  });

  test('resumeFrom.continueFrom resumes a session that must continue before accepting a new prompt', async () => {
    const { harness, doContinueTurn, prompts } = mockHarness({
      script: () => [
        { type: 'text-delta', id: 't2', delta: 'after' },
        {
          type: 'finish-step',
          finishReason: { unified: 'stop', raw: undefined },
          usage: {
            inputTokens: {
              total: undefined,
              noCache: undefined,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: {
              total: undefined,
              text: undefined,
              reasoning: undefined,
            },
          },
        },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: undefined },
          totalUsage: {
            inputTokens: {
              total: undefined,
              noCache: undefined,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: {
              total: undefined,
              text: undefined,
              reasoning: undefined,
            },
          },
        },
      ],
      continueScript: () => [
        { type: 'text-delta', id: 't1', delta: 'continued' },
        {
          type: 'finish-step',
          finishReason: { unified: 'stop', raw: undefined },
          usage: {
            inputTokens: {
              total: undefined,
              noCache: undefined,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: {
              total: undefined,
              text: undefined,
              reasoning: undefined,
            },
          },
        },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: undefined },
          totalUsage: {
            inputTokens: {
              total: undefined,
              noCache: undefined,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: {
              total: undefined,
              text: undefined,
              reasoning: undefined,
            },
          },
        },
      ],
    });

    const agent = new HarnessAgent({ harness });
    const session = await agent.createSession({
      sessionId: 's1',
      sandboxSession: makeSandboxSession(),
      resumeFrom: {
        type: 'resume-session',
        harnessId: 'mock',
        specificationVersion: 'harness-v1',
        data: {},
        continueFrom: {
          type: 'continue-turn',
          harnessId: 'mock',
          specificationVersion: 'harness-v1',
          data: {},
        },
      },
    });

    await expect(
      agent.generate({ session, prompt: 'new prompt too early' }),
    ).rejects.toThrow(/must be continued/);

    const continued = await agent.continueGenerate({ session });
    expect(continued.text).toBe('continued');
    const after = await agent.generate({ session, prompt: 'new prompt now' });
    expect(after.text).toBe('after');

    expect(doContinueTurn).toHaveBeenCalledTimes(1);
    expect(prompts).toEqual(['new prompt now']);

    await session.destroy();
  });

  test('sandboxConfig.onSession runs after the session work dir exists and before harness start', async () => {
    const { harness, doStart } = mockHarness({ script: () => [] });
    const run = vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '' }));
    const restrictedSession = { label: 'restricted', run };
    const sandboxSession = makeSandboxSession({
      run,
      restricted: () => restrictedSession as never,
    });
    const onSandboxSession = vi.fn(async () => {});
    const agent = new HarnessAgent({
      harness,
      sandboxConfig: { onSession: onSandboxSession },
    });

    const session = await agent.createSession({
      sessionId: 's1',
      sandboxSession,
    });

    expect(run).toHaveBeenCalledWith({
      command: 'mkdir -p "$WORK_DIR"',
      env: { WORK_DIR: '/work/mock-s1' },
      abortSignal: undefined,
    });
    expect(onSandboxSession).toHaveBeenCalledWith({
      session: restrictedSession,
      sessionWorkDir: '/work/mock-s1',
      abortSignal: undefined,
    });
    expect(run.mock.invocationCallOrder[0]!).toBeLessThan(
      onSandboxSession.mock.invocationCallOrder[0]!,
    );
    expect(onSandboxSession.mock.invocationCallOrder[0]!).toBeLessThan(
      doStart.mock.invocationCallOrder[0]!,
    );

    await session.destroy();
  });

  test('workDir dot uses the sandbox default working directory for the session and harness', async () => {
    const { harness, doStart } = mockHarness({ script: () => [] });
    const run = vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '' }));
    const restrictedSession = { label: 'restricted', run };
    const sandboxSession = makeSandboxSession({
      run,
      restricted: () => restrictedSession as never,
    });
    const onSandboxSession = vi.fn(async () => {});
    const agent = new HarnessAgent({
      harness,
      sandboxConfig: { workDir: '.', onSession: onSandboxSession },
    });

    const session = await agent.createSession({
      sessionId: 's1',
      sandboxSession,
    });

    expect(run).toHaveBeenCalledWith({
      command: 'mkdir -p "$WORK_DIR"',
      env: { WORK_DIR: '/work' },
      abortSignal: undefined,
    });
    expect(onSandboxSession).toHaveBeenCalledWith({
      session: restrictedSession,
      sessionWorkDir: '/work',
      abortSignal: undefined,
    });
    expect(doStart.mock.calls[0]?.[0]).toMatchObject({
      sessionWorkDir: '/work',
    });

    await session.destroy();
  });

  test('deprecated top-level onSandboxSession warns and still runs', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { harness } = mockHarness({ script: () => [] });
      const onSandboxSession = vi.fn(async () => {});
      const agent = new HarnessAgent({
        harness,
        onSandboxSession,
      });

      const session = await agent.createSession({
        sessionId: 's1',
        sandboxSession: makeSandboxSession(),
      });

      expect(warn).toHaveBeenCalledWith(
        'HarnessAgent: `onSandboxSession` is deprecated. Use `sandboxConfig.onSession` instead.',
      );
      expect(onSandboxSession).toHaveBeenCalledWith({
        session: expect.any(Object),
        sessionWorkDir: '/work/mock-s1',
        abortSignal: undefined,
      });

      await session.destroy();
    } finally {
      warn.mockRestore();
    }
  });

  test('validates sandbox bootstrap settings', () => {
    const { harness } = mockHarness({ script: () => [] });

    expect(
      () =>
        new HarnessAgent({
          harness,
          sandboxConfig: { onBootstrap: async () => {} },
        }),
    ).toThrow(/must be provided together/);

    expect(
      () =>
        new HarnessAgent({
          harness,
          sandboxConfig: { bootstrapHash: 'hash' },
        }),
    ).toThrow(/must be provided together/);

    expect(
      () =>
        new HarnessAgent({
          harness,
          sandboxConfig: { workDir: '../repo' },
        }),
    ).toThrow(/workDir/);
  });

  test('requires a configured provider or a provided sandbox session', async () => {
    const { harness } = mockHarness({ script: () => [] });
    const agent = new HarnessAgent({ harness });

    await expect(agent.createSession()).rejects.toThrow(
      'HarnessAgent.createSession: configure `sandbox` on HarnessAgent or pass `sandboxSession` to createSession().',
    );
  });

  test('deprecated constructor sandbox provider creates and resumes sessions and warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { harness } = mockHarness({ script: () => [] });
      const sandboxSession = makeSandboxSession();
      const createSession = vi.fn(async () => sandboxSession);
      const resumeSession = vi.fn(async () => sandboxSession);
      const agent = new HarnessAgent({
        harness,
        sandbox: {
          specificationVersion: 'harness-sandbox-v1',
          providerId: 'mock-sandbox',
          createSession,
          resumeSession,
        },
      });

      const first = await agent.createSession({ sessionId: 's1' });
      const resumeFrom = await first.stop();
      const resumed = await agent.createSession({
        sessionId: 's1',
        resumeFrom,
      });

      expect(warn).toHaveBeenCalledWith(
        'HarnessAgent: `sandbox` is deprecated. Supply `sandboxSession` to createSession() instead.',
      );
      expect(createSession).toHaveBeenCalledOnce();
      expect(resumeSession).toHaveBeenCalledOnce();
      await resumed.destroy();
    } finally {
      warn.mockRestore();
    }
  });

  test('uses a provided basic sandbox session, resolves its working directory, and applies the harness bootstrap recipe', async () => {
    const base = mockHarness({ script: () => [] });
    const recipe: HarnessV1Bootstrap = {
      harnessId: 'mock',
      bootstrapDir: '.harness-bootstrap/mock',
      files: [],
      commands: [],
    };
    const harness: HarnessV1 = {
      ...base.harness,
      getBootstrap: vi.fn(async () => recipe),
    };
    const readTextFile = vi.fn(async () => null);
    const writeTextFile = vi.fn(async () => {});
    const run = vi.fn(async (args: { command: string }) => ({
      exitCode: 0,
      stdout:
        args.command === 'pwd'
          ? '/work\n'
          : args.command === 'printf "%s" "$HOME"'
            ? '/home/agent'
            : '',
      stderr: '',
    }));
    const restrictedSession = {
      readTextFile,
      writeTextFile,
      run,
    } as unknown as SandboxSession;
    const agent = new HarnessAgent({ harness });

    const session = await agent.createSession({
      sessionId: 's1',
      sandboxSession: restrictedSession,
      resumeFrom: {
        type: 'resume-session',
        harnessId: 'mock',
        specificationVersion: 'harness-v1',
        data: {},
      },
    });

    expect(writeTextFile).toHaveBeenCalledWith({
      path: expect.stringMatching(
        /^\/home\/agent\/\.ai-sdk-harness\/\.harness-bootstrap\/mock\/\.bootstrap-[0-9a-f]{16}\.ok$/,
      ),
      content: expect.any(String),
      abortSignal: undefined,
    });
    expect(run).toHaveBeenCalledWith({
      command: 'pwd',
      abortSignal: undefined,
    });
    expect(base.doStart).toHaveBeenCalledWith(
      expect.objectContaining({ sandboxSession: restrictedSession }),
    );

    await session.destroy();
  });

  test('deprecated constructor sandbox provider is ignored when a sandbox session is provided', async () => {
    const { harness } = mockHarness({ script: () => [] });
    const createSession = vi.fn(async () => makeSandboxSession());
    const resumeSession = vi.fn(async () => makeSandboxSession());
    const agent = new HarnessAgent({
      harness,
      sandbox: {
        specificationVersion: 'harness-sandbox-v1',
        providerId: 'mock-sandbox',
        createSession,
        resumeSession,
      },
    });

    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });

    expect(createSession).not.toHaveBeenCalled();
    expect(resumeSession).not.toHaveBeenCalled();
    await session.destroy();
  });

  test('does not stop a provided sandbox session when harness startup fails', async () => {
    const base = mockHarness({ script: () => [] });
    const harness: HarnessV1 = {
      ...base.harness,
      doStart: vi.fn(async () => {
        throw new Error('start failed');
      }),
    };
    const sandboxStop = vi.fn(async () => {});
    const sandboxDestroy = vi.fn(async () => {});
    const sandboxSession = makeSandboxSession({
      stop: sandboxStop,
      destroy: sandboxDestroy,
    });
    const agent = new HarnessAgent({ harness });

    await expect(agent.createSession({ sandboxSession })).rejects.toThrow(
      'start failed',
    );
    expect(sandboxStop).not.toHaveBeenCalled();
    expect(sandboxDestroy).not.toHaveBeenCalled();
  });

  test('deprecated constructor sandbox provider runs sandboxConfig.onBootstrap during onFirstCreate', async () => {
    const { harness } = mockHarness({ script: () => [] });
    const run = vi.fn(async (args: { command: string }) => {
      if (args.command === 'pwd') {
        return { exitCode: 0, stdout: '/work\n', stderr: '' };
      }
      if (args.command === 'printf "%s" "$HOME"') {
        return { exitCode: 0, stdout: '/home/agent', stderr: '' };
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    });
    const files = new Map<string, string>();
    const restrictedSession = {
      label: 'restricted',
      run,
      readTextFile: vi.fn(
        async ({ path }: { path: string }) => files.get(path) ?? null,
      ),
      writeTextFile: vi.fn(
        async ({ path, content }: { path: string; content: string }) => {
          files.set(path, content);
        },
      ),
    };
    const sandboxSession = makeSandboxSession({
      run,
      restricted: () => restrictedSession as never,
    });
    const createSession = vi.fn(
      async (
        opts: Parameters<HarnessV1SandboxProvider['createSession']>[0],
      ) => {
        await opts?.onFirstCreate?.(restrictedSession as never, {});
        return sandboxSession;
      },
    );
    const onSandboxBootstrap = vi.fn(async () => {});
    const onSandboxSession = vi.fn(async () => {});
    const agent = new HarnessAgent({
      harness,
      sandbox: {
        specificationVersion: 'harness-sandbox-v1',
        providerId: 'mock-sandbox',
        createSession,
      },
      sandboxConfig: {
        workDir: 'ai-sdk',
        bootstrapHash: 'repo-v1',
        onBootstrap: onSandboxBootstrap,
        onSession: onSandboxSession,
      },
    });

    const session = await agent.createSession({ sessionId: 's1' });

    expect(createSession.mock.calls[0]![0]).toEqual({
      sessionId: 's1',
      abortSignal: undefined,
      identity: expect.stringMatching(/^[0-9a-f]{16}$/),
      onFirstCreate: expect.any(Function),
    });
    expect(onSandboxBootstrap).toHaveBeenCalledWith({
      session: restrictedSession,
      workDir: '/work/ai-sdk',
      abortSignal: undefined,
    });
    expect(onSandboxSession).toHaveBeenCalledWith({
      session: restrictedSession,
      sessionWorkDir: '/work/ai-sdk',
      abortSignal: undefined,
    });

    await session.destroy();
  });

  test('sandboxConfig.onBootstrap runs for a resumed session missing its marker while onSession still runs', async () => {
    const { harness } = mockHarness({ script: () => [] });
    const onSandboxBootstrap = vi.fn(async () => {});
    const onSandboxSession = vi.fn(async () => {});
    const agent = new HarnessAgent({
      harness,
      sandboxConfig: {
        workDir: 'ai-sdk',
        bootstrapHash: 'repo-v1',
        onBootstrap: onSandboxBootstrap,
        onSession: onSandboxSession,
      },
    });

    const session = await agent.createSession({
      sessionId: 's1',
      sandboxSession: makeSandboxSession(),
      resumeFrom: {
        type: 'resume-session',
        harnessId: 'mock',
        specificationVersion: 'harness-v1',
        data: {},
      },
    });

    expect(onSandboxBootstrap).toHaveBeenCalledOnce();
    expect(onSandboxSession).toHaveBeenCalledWith({
      session: expect.any(Object),
      sessionWorkDir: '/work/ai-sdk',
      abortSignal: undefined,
    });

    await session.destroy();
  });

  test('deprecated constructor sandbox provider uses separate bootstrap and snapshot identities', async () => {
    const base = mockHarness({ script: () => [] });
    const recipe: HarnessV1Bootstrap = {
      harnessId: 'mock',
      bootstrapDir: '.harness-bootstrap/mock',
      files: [],
      commands: [],
    };
    const harness: HarnessV1 = {
      ...base.harness,
      getBootstrap: vi.fn(async () => recipe),
    };
    const readTextFile = vi.fn(async () => null);
    const writeTextFile = vi.fn(async () => {});
    const run = vi.fn(async (args: { command: string }) => ({
      exitCode: 0,
      stdout:
        args.command === 'pwd'
          ? '/work\n'
          : args.command === 'printf "%s" "$HOME"'
            ? '/home/agent'
            : '',
      stderr: '',
    }));
    const restrictedSession = {
      run,
      readTextFile,
      writeTextFile,
    };
    const sandboxSession = makeSandboxSession({
      run,
      restricted: () => restrictedSession as never,
    });
    const createSession = vi.fn(
      async (
        opts: Parameters<HarnessV1SandboxProvider['createSession']>[0],
      ) => {
        await opts?.onFirstCreate?.(restrictedSession as never, {});
        return sandboxSession;
      },
    );
    const agent = new HarnessAgent({
      harness,
      sandbox: {
        specificationVersion: 'harness-sandbox-v1',
        providerId: 'mock-sandbox',
        createSession,
      },
      sandboxConfig: { workDir: 'ai-sdk' },
    });

    const session = await agent.createSession({ sessionId: 's1' });

    expect(createSession.mock.calls[0]![0]?.identity).toMatch(/^[0-9a-f]{16}$/);
    expect(createSession.mock.calls[0]![0]?.identity).not.toBe(
      await hashHarnessBootstrap(recipe),
    );
    const writeCalls = writeTextFile.mock.calls as unknown as Array<
      [{ path: string }]
    >;
    const markerWrite = writeCalls.at(-1)?.[0];
    // Applied by `onFirstCreate`, before a `HarnessV1NetworkSandboxSession`
    // even exists — resolved straight from the plain `SandboxSession`'s HOME,
    // never the working directory.
    expect(markerWrite?.path).toMatch(
      /^\/home\/agent\/\.ai-sdk-harness\/\.harness-bootstrap\/mock\/\.bootstrap-[0-9a-f]{16}\.ok$/,
    );

    await session.destroy();
  });

  test('readHistory() reads the runtime history through the adapter', async () => {
    const history = {
      messages: [
        {
          role: 'user' as const,
          content: [{ type: 'text' as const, text: 'hello' }],
        },
        {
          role: 'assistant' as const,
          at: '2026-09-29T12:00:00.000Z',
          harnessMetadata: {
            mock: { raw: { messageId: 'assistant-1' } },
          },
          content: [
            { type: 'reasoning' as const, text: 'thinking it over' },
            {
              type: 'tool-call' as const,
              toolCallId: 'tool-1',
              toolName: 'bash',
              nativeName: 'Bash',
              input: { command: 'ls' },
            },
            {
              type: 'tool-result' as const,
              toolCallId: 'tool-1',
              toolName: 'bash',
              output: { type: 'text' as const, value: 'README.md' },
            },
            { type: 'text' as const, text: 'done' },
          ],
        },
      ],
      cursor: 'cursor-1',
    };
    const doReadHistory = vi.fn(async () => history);
    const { harness } = mockHarness({ script: () => [], doReadHistory });
    const agent = new HarnessAgent({ harness });
    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });

    await expect(session.readHistory()).resolves.toEqual(history);
    await session.readHistory({ since: 'cursor-1' });
    expect(doReadHistory).toHaveBeenLastCalledWith({ since: 'cursor-1' });

    await session.destroy();
  });

  test('readHistory() throws HarnessCapabilityUnsupportedError when the adapter lacks it', async () => {
    const { harness } = mockHarness({ script: () => [] });
    const agent = new HarnessAgent({ harness });
    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });

    await expect(session.readHistory()).rejects.toSatisfy(error =>
      HarnessCapabilityUnsupportedError.isInstance(error),
    );

    await session.destroy();
  });

  test('readHistory() rejects once the session is no longer active', async () => {
    const { harness } = mockHarness({
      script: () => [],
      doReadHistory: async () => ({ messages: [], cursor: 'c' }),
    });
    const agent = new HarnessAgent({ harness });
    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });
    await session.destroy();

    await expect(session.readHistory()).rejects.toThrow(
      /not active and cannot read history/,
    );
  });

  test('ensures the harness bootstrap recipe on resumed sessions', async () => {
    const base = mockHarness({ script: () => [] });
    const recipe: HarnessV1Bootstrap = {
      harnessId: 'mock',
      bootstrapDir: '.harness-bootstrap/mock',
      files: [],
      commands: [],
    };
    const harness: HarnessV1 = {
      ...base.harness,
      getBootstrap: vi.fn(async () => recipe),
    };
    // No marker: the sandbox was bootstrapped by an older recipe, or never.
    const readTextFile = vi.fn(async (_options: { path: string }) => null);
    const writeTextFile = vi.fn(async () => {});
    const run = vi.fn(async (args: { command: string }) => ({
      exitCode: 0,
      stdout:
        args.command === 'pwd'
          ? '/work\n'
          : args.command === 'printf "%s" "$HOME"'
            ? '/home/agent'
            : '',
      stderr: '',
    }));
    const restrictedSession = { run, readTextFile, writeTextFile };
    const sandboxSession = makeSandboxSession({
      run,
      restricted: () => restrictedSession as never,
    });
    const agent = new HarnessAgent({
      harness,
      sandboxConfig: { workDir: 'ai-sdk' },
    });

    const session = await agent.createSession({
      sessionId: 's1',
      sandboxSession,
      resumeFrom: {
        type: 'resume-session',
        harnessId: 'mock',
        specificationVersion: 'harness-v1',
        data: {},
      },
    });

    expect(readTextFile.mock.calls[0]![0]).toEqual(
      expect.objectContaining({
        path: expect.stringMatching(
          /^\/home\/agent\/\.ai-sdk-harness\/\.harness-bootstrap\/mock\/\.bootstrap-[0-9a-f]{16}\.ok$/,
        ),
      }),
    );
    const writeCalls = writeTextFile.mock.calls as unknown as Array<
      [{ path: string }]
    >;
    expect(writeCalls.at(-1)?.[0]?.path).toMatch(
      /^\/home\/agent\/\.ai-sdk-harness\/\.harness-bootstrap\/mock\/\.bootstrap-[0-9a-f]{16}\.ok$/,
    );

    await session.destroy();
  });

  test('sandboxConfig.onSession runs for resumed sessions', async () => {
    const { harness } = mockHarness({ script: () => [] });
    const sandboxSessionEvents: Array<{ sessionWorkDir: string }> = [];
    const onSandboxSession = vi.fn(async (opts: { sessionWorkDir: string }) => {
      sandboxSessionEvents.push({ sessionWorkDir: opts.sessionWorkDir });
    });
    const agent = new HarnessAgent({
      harness,
      sandboxConfig: { onSession: onSandboxSession },
    });

    const session = await agent.createSession({
      sessionId: 's1',
      sandboxSession: makeSandboxSession(),
      resumeFrom: {
        type: 'resume-session',
        harnessId: 'mock',
        specificationVersion: 'harness-v1',
        data: {},
      },
    });

    expect(onSandboxSession).toHaveBeenCalledTimes(1);
    expect(sandboxSessionEvents).toEqual([{ sessionWorkDir: '/work/mock-s1' }]);

    await session.destroy();
  });

  test("sandboxConfig.setup 'lazy' creates the work dir and runs onSession on the first sandbox operation, not at createSession()", async () => {
    const { harness, doStart } = mockHarness({ script: () => [] });
    const run = vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '' }));
    const readTextFile = vi.fn(async () => 'content');
    const restrictedSession = { label: 'restricted', run, readTextFile };
    const sandboxSession = makeSandboxSession({
      run,
      readTextFile,
      restricted: () => restrictedSession as never,
    });
    const onSession = vi.fn(async () => {});
    const agent = new HarnessAgent({
      harness,
      sandboxConfig: { setup: 'lazy', onSession },
    });

    const session = await agent.createSession({
      sessionId: 's1',
      sandboxSession,
    });

    expect(doStart).toHaveBeenCalledTimes(1);
    expect(run).not.toHaveBeenCalled();
    expect(onSession).not.toHaveBeenCalled();

    const startedSandbox: SandboxSession =
      doStart.mock.calls[0]?.[0].sandboxSession;
    await expect(
      startedSandbox.readTextFile({ path: '/work/mock-s1/a.txt' }),
    ).resolves.toBe('content');

    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith({
      command: 'mkdir -p "$WORK_DIR"',
      env: { WORK_DIR: '/work/mock-s1' },
      abortSignal: undefined,
    });
    expect(onSession).toHaveBeenCalledWith({
      session: restrictedSession,
      sessionWorkDir: '/work/mock-s1',
      abortSignal: undefined,
    });
    expect(run.mock.invocationCallOrder[0]!).toBeLessThan(
      onSession.mock.invocationCallOrder[0]!,
    );
    expect(onSession.mock.invocationCallOrder[0]!).toBeLessThan(
      readTextFile.mock.invocationCallOrder[0]!,
    );

    await session.destroy();
  });

  test("sandboxConfig.setup 'lazy' runs setup once for concurrent first operations on the session and its restricted view", async () => {
    const { harness, doStart } = mockHarness({ script: () => [] });
    const sandboxSession = makeSandboxSession();
    const agent = new HarnessAgent({
      harness,
      sandboxConfig: { setup: 'lazy' },
    });

    const session = await agent.createSession({
      sessionId: 's1',
      sandboxSession,
    });
    expect(sandboxSession.run).not.toHaveBeenCalled();
    const startedSandbox: HarnessV1NetworkSandboxSession =
      doStart.mock.calls[0]?.[0].sandboxSession;

    await Promise.all([
      startedSandbox.readTextFile({ path: '/work/mock-s1/a.txt' }),
      startedSandbox.restricted().writeTextFile({
        path: '/work/mock-s1/b.txt',
        content: 'b',
      }),
      startedSandbox.restricted().run({ command: 'true' }),
    ]);

    const mkdirCalls = vi
      .mocked(sandboxSession.run)
      .mock.calls.filter(([args]) => args.command === 'mkdir -p "$WORK_DIR"');
    expect(mkdirCalls).toHaveLength(1);
    expect(sandboxSession.run).toHaveBeenCalledWith({ command: 'true' });

    await session.destroy();
  });

  test("sandboxConfig.setup 'lazy' rejects the operation whose setup fails and retries setup on the next operation", async () => {
    const { harness, doStart } = mockHarness({ script: () => [] });
    const run = vi
      .fn()
      .mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: 'denied' })
      .mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
    const readTextFile = vi.fn(async () => 'content');
    const sandboxSession = makeSandboxSession({ run, readTextFile });
    const agent = new HarnessAgent({
      harness,
      sandboxConfig: { setup: 'lazy' },
    });

    const session = await agent.createSession({
      sessionId: 's1',
      sandboxSession,
    });
    const startedSandbox: SandboxSession =
      doStart.mock.calls[0]?.[0].sandboxSession;

    await expect(
      startedSandbox.readTextFile({ path: '/work/mock-s1/a.txt' }),
    ).rejects.toThrow(
      'Failed to create sandbox work directory /work/mock-s1 (exit 1): denied',
    );
    expect(readTextFile).not.toHaveBeenCalled();

    await expect(
      startedSandbox.readTextFile({ path: '/work/mock-s1/a.txt' }),
    ).resolves.toBe('content');
    expect(run).toHaveBeenCalledTimes(2);
    expect(readTextFile).toHaveBeenCalledTimes(1);

    await session.destroy();
  });

  test("sandboxConfig.setup 'lazy' stops and destroys the sandbox without running setup", async () => {
    const { harness, doStart } = mockHarness({ script: () => [] });
    const run = vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '' }));
    const stop = vi.fn(async () => {});
    const destroy = vi.fn(async () => {});
    const sandboxSession = makeSandboxSession({ run, stop, destroy });
    const onSession = vi.fn(async () => {});
    const agent = new HarnessAgent({
      harness,
      sandboxConfig: { setup: 'lazy', onSession },
    });

    const session = await agent.createSession({
      sessionId: 's1',
      sandboxSession,
    });
    const startedSandbox: HarnessV1NetworkSandboxSession =
      doStart.mock.calls[0]?.[0].sandboxSession;

    await startedSandbox.stop();
    await startedSandbox.destroy();

    expect(stop).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(run).not.toHaveBeenCalled();
    expect(onSession).not.toHaveBeenCalled();

    await session.destroy();
  });

  test("sandboxConfig.setup 'lazy' rejects a harness with a bootstrap recipe before touching the sandbox", async () => {
    const base = mockHarness({ script: () => [] });
    const harness: HarnessV1 = {
      ...base.harness,
      getBootstrap: vi.fn(async () => ({
        harnessId: 'mock',
        bootstrapDir: '.harness-bootstrap/mock',
        files: [],
        commands: [],
      })),
    };
    const message =
      "HarnessAgent.createSession: `sandboxConfig.setup: 'lazy'` is not supported for harness 'mock' because it declares a sandbox bootstrap recipe.";
    const sandboxSession = makeSandboxSession();
    const createSession = vi.fn(async () => makeSandboxSession());

    await expect(
      new HarnessAgent({
        harness,
        sandboxConfig: { setup: 'lazy' },
      }).createSession({ sandboxSession }),
    ).rejects.toThrow(message);
    await expect(
      new HarnessAgent({
        harness,
        sandbox: {
          specificationVersion: 'harness-sandbox-v1',
          providerId: 'mock-sandbox',
          createSession,
        },
        sandboxConfig: { setup: 'lazy' },
      }).createSession(),
    ).rejects.toThrow(message);

    expect(sandboxSession.run).not.toHaveBeenCalled();
    expect(sandboxSession.readTextFile).not.toHaveBeenCalled();
    expect(sandboxSession.writeTextFile).not.toHaveBeenCalled();
    expect(sandboxSession.stop).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
    expect(base.doStart).not.toHaveBeenCalled();
  });

  test("sandboxConfig.setup 'lazy' with a sandbox provider acquires the sandbox at createSession() and defers the work dir", async () => {
    const { harness, doStart } = mockHarness({ script: () => [] });
    const run = vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '' }));
    const sandboxSession = makeSandboxSession({ run });
    const createSession = vi.fn(async () => sandboxSession);
    const agent = new HarnessAgent({
      harness,
      sandbox: {
        specificationVersion: 'harness-sandbox-v1',
        providerId: 'mock-sandbox',
        createSession,
      },
      sandboxConfig: { setup: 'lazy' },
    });

    const session = await agent.createSession({ sessionId: 's1' });

    expect(createSession).toHaveBeenCalledTimes(1);
    expect(run).not.toHaveBeenCalled();

    const startedSandbox: SandboxSession =
      doStart.mock.calls[0]?.[0].sandboxSession;
    await startedSandbox.run({ command: 'ls' });

    expect(run.mock.calls).toEqual([
      [
        {
          command: 'mkdir -p "$WORK_DIR"',
          env: { WORK_DIR: '/work/mock-s1' },
          abortSignal: undefined,
        },
      ],
      [{ command: 'ls' }],
    ]);

    await session.destroy();
  });

  test("sandboxConfig.setup 'lazy' with a lazy network sandbox session acquires no sandbox for a chat-only turn", async () => {
    const { harness, doStart } = mockHarness({
      script: () => [
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: 'hello' },
        { type: 'text-end', id: 'text-1' },
        {
          type: 'finish-step',
          finishReason: { unified: 'stop', raw: 'end_turn' },
          usage: zeroUsage(),
        },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'end_turn' },
          totalUsage: zeroUsage(),
        },
      ],
    });
    const run = vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '' }));
    const readTextFile = vi.fn(async () => 'content');
    const acquiredSandbox = makeSandboxSession({ run, readTextFile });
    const acquire = vi.fn(async () => acquiredSandbox);
    const agent = new HarnessAgent({
      harness,
      sandboxConfig: { setup: 'lazy' },
    });

    const session = await agent.createSession({
      sessionId: 's1',
      sandboxSession: createLazyNetworkSandboxSession({
        acquire,
        defaultWorkingDirectory: '/work',
      }),
    });
    const generated = await agent.generate({ session, prompt: 'hi' });

    expect(generated.text).toBe('hello');
    expect(acquire).not.toHaveBeenCalled();

    const startedSandbox: SandboxSession =
      doStart.mock.calls[0]?.[0].sandboxSession;
    await startedSandbox.readTextFile({ path: '/work/mock-s1/a.txt' });

    expect(acquire).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith({
      command: 'mkdir -p "$WORK_DIR"',
      env: { WORK_DIR: '/work/mock-s1' },
      abortSignal: undefined,
    });
    expect(run.mock.invocationCallOrder[0]!).toBeLessThan(
      readTextFile.mock.invocationCallOrder[0]!,
    );

    await session.destroy();
  });

  test('createSession() rejects resume state with top-level pending tool approvals', async () => {
    const { harness } = mockHarness({ script: () => [] });
    const agent = new HarnessAgent({ harness });

    await expect(
      agent.createSession({
        resumeFrom: {
          type: 'resume-session',
          harnessId: 'mock',
          specificationVersion: 'harness-v1',
          data: {},
          pendingToolApprovals: [],
        } as HarnessV1ResumeSessionState,
      }),
    ).rejects.toThrow(/cannot contain pending tool approvals/);
  });

  test('createSession() rejects resume state with top-level pending tool results', async () => {
    const { harness } = mockHarness({ script: () => [] });
    const agent = new HarnessAgent({ harness });

    await expect(
      agent.createSession({
        resumeFrom: {
          type: 'resume-session',
          harnessId: 'mock',
          specificationVersion: 'harness-v1',
          data: {},
          pendingToolResults: [],
        } as HarnessV1ResumeSessionState,
      }),
    ).rejects.toThrow(/cannot contain pending tool results/);
  });

  test('host-side tools are executed and the result is submitted back', async () => {
    const { harness, toolResults } = mockHarness({
      script: () => [
        {
          type: 'tool-call',
          toolCallId: 'c1',
          toolName: 'echo',
          input: JSON.stringify({ value: 'ping' }),
        },
        {
          type: 'finish-step',
          finishReason: { unified: 'tool-calls', raw: 'tool_use' },
          usage: {
            inputTokens: {
              total: undefined,
              noCache: undefined,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: {
              total: undefined,
              text: undefined,
              reasoning: undefined,
            },
          },
        },
        {
          type: 'finish',
          finishReason: { unified: 'tool-calls', raw: 'tool_use' },
          totalUsage: {
            inputTokens: {
              total: undefined,
              noCache: undefined,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: {
              total: undefined,
              text: undefined,
              reasoning: undefined,
            },
          },
        },
      ],
    });

    const echo = tool({
      description: 'Echo a string',
      inputSchema: z.object({ value: z.string() }),
      execute: async ({ value }: { value: string }) => ({ echoed: value }),
    });

    const agent = new HarnessAgent({
      harness,
      tools: { echo },
    });
    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });
    const result = await agent.generate({ session, prompt: 'go' });

    expect(toolResults).toEqual([
      { toolCallId: 'c1', output: { echoed: 'ping' } },
    ]);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]!.toolName).toBe('echo');

    await session.destroy();
  });

  test('passes prepareCall tool context to host tools and step results', async () => {
    const { harness, toolResults } = mockHarness({
      script: () => [
        {
          type: 'tool-call',
          toolCallId: 'c1',
          toolName: 'lookupAccount',
          input: JSON.stringify({}),
        },
        ...finishEvents(),
      ],
    });
    const execute = vi.fn(
      async (
        _input: Record<string, never>,
        { context }: { context: { userId: string } },
      ) => ({ userId: context.userId }),
    );
    const lookupAccount = tool({
      inputSchema: z.object({}),
      contextSchema: z.object({ userId: z.string() }),
      execute,
    });
    const agent = new HarnessAgent({
      harness,
      tools: { lookupAccount },
      toolsContext: {
        lookupAccount: { userId: 'initial-user' },
      },
      callOptionsSchema: z.object({ userId: z.string() }),
      prepareCall: ({ options, ...rest }) => ({
        ...rest,
        toolsContext: {
          lookupAccount: { userId: options.userId },
        },
      }),
    });
    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });

    const result = await agent.generate({
      session,
      prompt: 'go',
      options: { userId: 'user-123' },
    });

    expect(execute).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        context: { userId: 'user-123' },
      }),
    );
    expect(toolResults).toEqual([
      { toolCallId: 'c1', output: { userId: 'user-123' } },
    ]);
    expect(result.steps[0]?.toolsContext).toEqual({
      lookupAccount: { userId: 'user-123' },
    });

    await session.destroy();
  });

  test('rebinds prepareCall tool context after recreating a suspended session', async () => {
    let finishInitialPrompt!: () => void;
    const initialPromptDone = new Promise<void>(resolve => {
      finishInitialPrompt = resolve;
    });
    const { harness, toolResults } = mockHarness({
      script: () => [],
      promptDone: () => initialPromptDone,
      onSuspendTurn: () => finishInitialPrompt(),
      continueScript: () => [
        {
          type: 'tool-call',
          toolCallId: 'c1',
          toolName: 'lookupAccount',
          input: JSON.stringify({}),
        },
        ...finishEvents(),
      ],
    });
    const execute = vi.fn(
      async (
        _input: Record<string, never>,
        { context }: { context: { userId: string } },
      ) => ({ userId: context.userId }),
    );
    const lookupAccount = tool({
      inputSchema: z.object({}),
      contextSchema: z.object({ userId: z.string() }),
      execute,
    });
    const agent = new HarnessAgent({
      harness,
      tools: { lookupAccount },
      toolsContext: {
        lookupAccount: { userId: 'initial-user' },
      },
      callOptionsSchema: z.object({ userId: z.string() }),
      prepareCall: ({ options, ...rest }) => ({
        ...rest,
        toolsContext: {
          lookupAccount: { userId: options.userId },
        },
      }),
    });
    const sandboxSession = makeSandboxSession();
    let session = await agent.createSession({ sandboxSession });
    const first = await agent.stream({
      session,
      prompt: 'go',
      options: { userId: 'user-123' },
    });
    const firstConsumption = first.consumeStream();
    const sessionId = session.sessionId;
    const continueFrom = await session.suspendTurn();
    await firstConsumption;

    // Context remains host-only instead of being serialized with turn state.
    expect(continueFrom.turnSettings).not.toHaveProperty('toolsContext');

    session = await agent.createSession({
      sessionId,
      continueFrom: structuredClone(continueFrom),
      sandboxSession,
      toolsContext: {
        lookupAccount: { userId: 'user-123' },
      },
    });
    await agent.continueGenerate({ session });

    expect(execute).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ context: { userId: 'user-123' } }),
    );
    expect(toolResults).toEqual([
      { toolCallId: 'c1', output: { userId: 'user-123' } },
    ]);

    await session.destroy();
  });

  test('rejects missing required host tool context before execution', async () => {
    const { harness, toolResults } = mockHarness({
      script: () => [
        {
          type: 'tool-call',
          toolCallId: 'c1',
          toolName: 'lookupAccount',
          input: JSON.stringify({}),
        },
        ...finishEvents(),
      ],
    });
    const execute = vi.fn(async () => ({ ok: true }));
    const lookupAccount = tool({
      inputSchema: z.object({}),
      contextSchema: z.object({ userId: z.string() }),
      execute,
    });
    const agent = new HarnessAgent({
      harness,
      tools: { lookupAccount },
      toolsContext: {} as never,
    });
    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });

    await agent.generate({ session, prompt: 'go' });

    expect(execute).not.toHaveBeenCalled();
    expect(toolResults).toEqual([
      {
        toolCallId: 'c1',
        output: { error: 'Tool context validation failed.' },
        isError: true,
      },
    ]);

    await session.destroy();
  });

  test('validates host tool context without disclosing it to the model', async () => {
    const { harness, toolResults } = mockHarness({
      script: () => [
        {
          type: 'tool-call',
          toolCallId: 'c1',
          toolName: 'lookupAccount',
          input: JSON.stringify({}),
        },
        ...finishEvents(),
      ],
    });
    const execute = vi.fn(async () => ({ ok: true }));
    let hostValidationError: unknown;
    const lookupAccount = tool({
      inputSchema: z.object({}),
      contextSchema: z.object({ userId: z.string() }),
      execute,
    });
    const agent = new HarnessAgent({
      harness,
      tools: { lookupAccount },
      toolsContext: {
        lookupAccount: { userId: 123, apiKey: 'host-secret' },
      } as never,
      onToolExecutionEnd: event => {
        if (event.toolOutput.type === 'tool-error') {
          hostValidationError = event.toolOutput.error;
        }
      },
    });
    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });

    await agent.generate({ session, prompt: 'go' });

    expect(execute).not.toHaveBeenCalled();
    expect(toolResults).toEqual([
      {
        toolCallId: 'c1',
        output: { error: 'Tool context validation failed.' },
        isError: true,
      },
    ]);
    expect(JSON.stringify(toolResults)).not.toContain('host-secret');
    expect(String(hostValidationError)).toContain('host-secret');

    await session.destroy();
  });

  test('rejects activeTools and inactiveTools together at runtime', () => {
    const { harness } = mockHarness({ script: () => [] });

    expect(
      () =>
        new HarnessAgent({
          harness,
          activeTools: [],
          inactiveTools: [],
        } as never),
    ).toThrow(/either `activeTools` or `inactiveTools`/);
  });

  test('rejects unknown active tool names', () => {
    const { harness } = mockHarness({ script: () => [] });

    expect(
      () =>
        new HarnessAgent({
          harness,
          activeTools: ['missing'],
        }),
    ).toThrow(NoSuchToolError);
  });

  test('activeTools filters custom tool specs and blocks inactive custom execution', async () => {
    const receivedToolSpecs: HarnessV1ToolSpec[][] = [];
    const { harness, toolResults } = mockHarness({
      onPromptTurn: opts => {
        receivedToolSpecs.push([...(opts.tools ?? [])]);
      },
      script: () => [
        {
          type: 'tool-call',
          toolCallId: 'c1',
          toolName: 'hidden',
          input: JSON.stringify({ value: 'ping' }),
        },
        ...finishEvents(),
      ],
    });
    const echo = tool({
      inputSchema: z.object({ value: z.string() }),
      execute: async ({ value }: { value: string }) => ({ echoed: value }),
    });
    const hidden = tool({
      inputSchema: z.object({ value: z.string() }),
      execute: async ({ value }: { value: string }) => ({ hidden: value }),
    });
    const agent = new HarnessAgent({
      harness,
      tools: { echo, hidden },
      activeTools: ['echo'],
    });
    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });

    await agent.generate({ session, prompt: 'go' });

    expect(receivedToolSpecs[0]?.map(spec => spec.name)).toEqual(['echo']);
    expect(toolResults).toEqual([
      {
        toolCallId: 'c1',
        output: {
          type: 'execution-denied',
          reason:
            "Tool 'hidden' is inactive due to the HarnessAgent tool filtering policy.",
        },
      },
    ]);
    await session.destroy();
  });

  test('inactiveTools filters custom tool specs and blocks inactive custom execution', async () => {
    const receivedToolSpecs: HarnessV1ToolSpec[][] = [];
    const { harness, toolResults } = mockHarness({
      onPromptTurn: opts => {
        receivedToolSpecs.push([...(opts.tools ?? [])]);
      },
      script: () => [
        {
          type: 'tool-call',
          toolCallId: 'c1',
          toolName: 'hidden',
          input: JSON.stringify({ value: 'ping' }),
        },
        ...finishEvents(),
      ],
    });
    const echo = tool({
      inputSchema: z.object({ value: z.string() }),
      execute: async ({ value }: { value: string }) => ({ echoed: value }),
    });
    const hidden = tool({
      inputSchema: z.object({ value: z.string() }),
      execute: async ({ value }: { value: string }) => ({ hidden: value }),
    });
    const agent = new HarnessAgent({
      harness,
      tools: { echo, hidden },
      inactiveTools: ['hidden'],
    });
    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });

    await agent.generate({ session, prompt: 'go' });

    expect(receivedToolSpecs[0]?.map(spec => spec.name)).toEqual(['echo']);
    expect(toolResults[0]?.output).toMatchObject({
      type: 'execution-denied',
    });
    await session.destroy();
  });

  test('rejects builtin filtering when the harness cannot enforce it', () => {
    const { harness } = mockHarness({
      builtinTools: {
        bash: tool({
          inputSchema: z.object({ command: z.string() }),
        }),
      },
      script: () => [],
    });

    expect(
      () =>
        new HarnessAgent({
          harness,
          activeTools: [],
        }),
    ).toThrow(HarnessCapabilityUnsupportedError);
  });

  test('passes builtin filtering policy to approval-capable harnesses', async () => {
    let startBuiltinFiltering:
      | Parameters<HarnessV1['doStart']>[0]['builtinToolFiltering']
      | undefined;
    const { harness } = mockHarness({
      builtinTools: {
        bash: tool({
          inputSchema: z.object({ command: z.string() }),
        }),
      },
      supportsBuiltinToolApprovals: true,
      onDoStart: opts => {
        startBuiltinFiltering = opts.builtinToolFiltering;
      },
      script: () => finishEvents(),
    });
    const agent = new HarnessAgent({
      harness,
      activeTools: [],
    });
    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });

    expect(startBuiltinFiltering).toEqual({ mode: 'allow', toolNames: [] });
    await session.destroy();
  });

  test('auto-denies inactive builtin approvals without approval stream parts', async () => {
    const { harness, toolApprovals } = mockHarness({
      builtinTools: {
        bash: tool({
          inputSchema: z.object({ command: z.string() }),
        }),
      },
      supportsBuiltinToolApprovals: true,
      script: () => [
        {
          type: 'tool-call',
          toolCallId: 'b1',
          toolName: 'bash',
          input: JSON.stringify({ command: 'pwd' }),
          providerExecuted: true,
        },
        {
          type: 'tool-approval-request',
          approvalId: 'b1',
          toolCallId: 'b1',
        },
        ...finishEvents(),
      ],
    });
    const agent = new HarnessAgent({
      harness,
      inactiveTools: ['bash'],
    });
    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });
    const result = await agent.stream({ session, prompt: 'go' });
    const parts: string[] = [];

    for await (const part of result.fullStream) {
      parts.push(part.type);
    }

    expect(parts).not.toContain('tool-approval-request');
    expect(parts).not.toContain('tool-approval-response');
    expect(toolApprovals).toEqual([
      {
        approvalId: 'b1',
        approved: false,
        reason:
          "Tool 'bash' is inactive due to the HarnessAgent tool filtering policy.",
      },
    ]);
    await session.destroy();
  });

  test('session.detach() after a tool approval pause returns resume state with nested continuation state', async () => {
    const { harness, doDetach, doSuspendTurn } = mockHarness({
      script: () => [
        {
          type: 'tool-call',
          toolCallId: 'c1',
          toolName: 'weather',
          input: JSON.stringify({ city: 'SF' }),
        },
      ],
    });
    const weather = tool({
      description: 'Get weather',
      inputSchema: z.object({ city: z.string() }),
      execute: async ({ city }: { city: string }) => ({ city }),
    });
    const agent = new HarnessAgent({
      harness,
      tools: { weather },
      toolApproval: { weather: 'user-approval' },
    });
    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });
    const result = await agent.stream({ session, prompt: 'go' });

    const parts: string[] = [];
    for await (const part of result.fullStream) {
      parts.push(part.type);
    }
    const state = await session.detach();

    expect(parts).toContain('tool-approval-request');
    expect(state).toMatchObject({
      type: 'resume-session',
      harnessId: 'mock',
      specificationVersion: 'harness-v1',
      data: {},
      continueFrom: {
        type: 'continue-turn',
        harnessId: 'mock',
        specificationVersion: 'harness-v1',
        data: {},
        pendingToolApprovals: [
          {
            approvalId: expect.any(String),
            toolCallId: 'c1',
            toolName: 'weather',
            input: JSON.stringify({ city: 'SF' }),
            kind: 'custom',
            providerExecuted: false,
          },
        ],
      },
    });
    expect(doDetach).not.toHaveBeenCalled();
    expect(doSuspendTurn).toHaveBeenCalledTimes(1);
  });

  test('session.detach() from UI stream onFinish uses between-turn resume state after normal completion', async () => {
    const { harness, doDetach, doSuspendTurn } = mockHarness({
      script: () => [
        { type: 'text-start', id: 't1' },
        { type: 'text-delta', id: 't1', delta: 'done' },
        { type: 'text-end', id: 't1' },
        {
          type: 'finish-step',
          finishReason: { unified: 'stop', raw: undefined },
          usage: {
            inputTokens: {
              total: undefined,
              noCache: undefined,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: {
              total: undefined,
              text: undefined,
              reasoning: undefined,
            },
          },
        },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: undefined },
          totalUsage: {
            inputTokens: {
              total: undefined,
              noCache: undefined,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: {
              total: undefined,
              text: undefined,
              reasoning: undefined,
            },
          },
        },
      ],
    });
    const agent = new HarnessAgent({ harness });
    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });
    const result = await agent.stream({ session, prompt: 'go' });
    let detachState: HarnessV1ResumeSessionState | undefined;

    const uiStream = result.toUIMessageStream({
      onFinish: async () => {
        detachState = await session.detach();
      },
    });
    for await (const chunk of uiStream) {
      expect(chunk).toBeDefined();
    }

    expect(detachState).toEqual({
      type: 'resume-session',
      harnessId: 'mock',
      specificationVersion: 'harness-v1',
      data: {},
    });
    expect(doDetach).toHaveBeenCalledTimes(1);
    expect(doSuspendTurn).not.toHaveBeenCalled();
  });

  test('toUIMessageStream emits a start chunk carrying the persistence-mode message id', async () => {
    const { harness } = mockHarness({
      script: () => [
        { type: 'text-start', id: 't1' },
        { type: 'text-delta', id: 't1', delta: 'pong' },
        { type: 'text-end', id: 't1' },
        {
          type: 'finish-step',
          finishReason: { unified: 'stop', raw: undefined },
          usage: {
            inputTokens: {
              total: undefined,
              noCache: undefined,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: {
              total: undefined,
              text: undefined,
              reasoning: undefined,
            },
          },
        },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: undefined },
          totalUsage: {
            inputTokens: {
              total: undefined,
              noCache: undefined,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: {
              total: undefined,
              text: undefined,
              reasoning: undefined,
            },
          },
        },
      ],
    });
    const agent = new HarnessAgent({ harness });
    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });
    const result = await agent.stream({ session, prompt: 'ping' });

    // Persistence mode injects the server-generated message id into the
    // stream's `start` chunk — it never synthesizes the chunk itself. If the
    // harness stream lacks a message-level `start` part, there is nothing to
    // inject into, and `useChat` clients keep a locally generated assistant
    // message id that diverges from the id used for persistence.
    const chunks: Array<{ type: string; messageId?: string }> = [];
    for await (const chunk of result.toUIMessageStream({
      originalMessages: [
        { id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'ping' }] },
      ],
      generateMessageId: () => 'msg-server-id',
    })) {
      chunks.push(chunk as { type: string; messageId?: string });
    }

    expect(chunks[0]).toEqual({ type: 'start', messageId: 'msg-server-id' });

    await session.destroy();
  });

  test('a single session can drive multiple generate() turns', async () => {
    const { harness, prompts, doDestroy } = mockHarness({
      script: () => [
        { type: 'text-delta', id: 't', delta: 'ok' },
        {
          type: 'finish-step',
          finishReason: { unified: 'stop', raw: undefined },
          usage: {
            inputTokens: {
              total: undefined,
              noCache: undefined,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: {
              total: undefined,
              text: undefined,
              reasoning: undefined,
            },
          },
        },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: undefined },
          totalUsage: {
            inputTokens: {
              total: undefined,
              noCache: undefined,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: {
              total: undefined,
              text: undefined,
              reasoning: undefined,
            },
          },
        },
      ],
    });

    const agent = new HarnessAgent({ harness });
    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });
    await agent.generate({ session, prompt: 'one' });
    await agent.generate({ session, prompt: 'two' });

    expect(prompts).toHaveLength(2);
    expect(doDestroy).not.toHaveBeenCalled();

    await session.destroy();
    expect(doDestroy).toHaveBeenCalledTimes(1);
  });

  test('session.destroy() is idempotent and rejects further turns', async () => {
    const { harness, doDestroy } = mockHarness({ script: () => [] });
    const agent = new HarnessAgent({ harness });
    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });

    await session.destroy();
    await session.destroy();
    expect(doDestroy).toHaveBeenCalledTimes(1);

    await expect(
      agent.generate({ session, prompt: 'after destroy' }),
    ).rejects.toThrow(/has ended/);
  });

  test('normalizes prompt input — string passes through, message array is reduced to the last user message', async () => {
    function finishOnly(): HarnessV1StreamPart[] {
      return [
        {
          type: 'finish-step',
          finishReason: { unified: 'stop', raw: undefined },
          usage: {
            inputTokens: {
              total: undefined,
              noCache: undefined,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: {
              total: undefined,
              text: undefined,
              reasoning: undefined,
            },
          },
        },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: undefined },
          totalUsage: {
            inputTokens: {
              total: undefined,
              noCache: undefined,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: {
              total: undefined,
              text: undefined,
              reasoning: undefined,
            },
          },
        },
      ];
    }

    const { harness, prompts } = mockHarness({ script: finishOnly });
    const agent = new HarnessAgent({ harness });
    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });

    await agent.generate({ session, prompt: 'plain string' });
    await agent.generate({
      session,
      messages: [
        { role: 'system', content: 'be terse' },
        { role: 'user', content: 'older user turn — dropped' },
        { role: 'assistant', content: 'older assistant turn — dropped' },
        { role: 'user', content: 'latest user turn' },
      ],
    });
    await agent.generate({
      session,
      prompt: [
        { role: 'user', content: 'discarded' },
        { role: 'assistant', content: 'discarded too' },
        { role: 'user', content: [{ type: 'text', text: 'final turn' }] },
      ],
    });

    expect(prompts).toEqual([
      'plain string',
      { role: 'user', content: 'latest user turn' },
      { role: 'user', content: [{ type: 'text', text: 'final turn' }] },
    ]);

    await expect(
      agent.generate({
        session,
        messages: [
          { role: 'system', content: 'no user message here' },
          { role: 'assistant', content: 'nothing for the harness to run' },
        ],
      }),
    ).rejects.toThrow(/at least one `role: "user"` entry/);

    await session.destroy();
  });

  test('session.detach() parks without stopping or destroying the sandbox', async () => {
    const {
      session,
      resumeState,
      doDetach,
      doStop,
      doDestroy,
      sandboxStop,
      sandboxDestroy,
    } = makeLifecycleSession({});

    await expect(session.detach()).resolves.toEqual(resumeState);

    expect(doDetach).toHaveBeenCalledTimes(1);
    expect(doStop).not.toHaveBeenCalled();
    expect(doDestroy).not.toHaveBeenCalled();
    expect(sandboxStop).not.toHaveBeenCalled();
    expect(sandboxDestroy).not.toHaveBeenCalled();
  });

  test('session.detach() keeps the local handle active when detaching fails', async () => {
    const doDetach = vi.fn(async () => {
      throw new Error('could not persist resume state');
    });
    const doStop = vi.fn(async () => ({
      type: 'resume-session' as const,
      harnessId: 'mock',
      specificationVersion: 'harness-v1' as const,
      data: {},
    }));
    const { session } = makeLifecycleSession({
      underlyingSession: { doDetach, doStop },
    });

    await expect(session.detach()).rejects.toThrow(
      'could not persist resume state',
    );
    await expect(session.stop()).resolves.toMatchObject({
      type: 'resume-session',
    });
    expect(doDetach).toHaveBeenCalledTimes(1);
    expect(doStop).toHaveBeenCalledTimes(1);
  });

  test('session.stop() saves state and stops the sandbox', async () => {
    const {
      session,
      resumeState,
      doDetach,
      doStop,
      doDestroy,
      sandboxStop,
      sandboxDestroy,
    } = makeLifecycleSession({});

    await expect(session.stop()).resolves.toEqual(resumeState);

    expect(doDetach).not.toHaveBeenCalled();
    expect(doStop).toHaveBeenCalledTimes(1);
    expect(doDestroy).not.toHaveBeenCalled();
    expect(sandboxStop).toHaveBeenCalledTimes(1);
    expect(sandboxDestroy).not.toHaveBeenCalled();
  });

  test('session.stop() does not stop a caller-owned sandbox', async () => {
    const { session, doStop, sandboxStop, sandboxDestroy } =
      makeLifecycleSession({ ownsSandboxLifecycle: false });

    await session.stop();

    expect(doStop).toHaveBeenCalledTimes(1);
    expect(sandboxStop).not.toHaveBeenCalled();
    expect(sandboxDestroy).not.toHaveBeenCalled();
  });

  test('session.stop() wraps unfinished turns as nested continuation state and stops the sandbox', async () => {
    const {
      session,
      continueState,
      doStop,
      doDestroy,
      sandboxStop,
      sandboxDestroy,
    } = makeLifecycleSession({ turnState: 'suspended' });

    await expect(session.stop()).resolves.toEqual({
      type: 'resume-session',
      harnessId: 'mock',
      specificationVersion: 'harness-v1',
      data: continueState.data,
      continueFrom: continueState,
    });

    expect(doStop).not.toHaveBeenCalled();
    expect(doDestroy).not.toHaveBeenCalled();
    expect(sandboxStop).toHaveBeenCalledTimes(1);
    expect(sandboxDestroy).not.toHaveBeenCalled();
  });

  test('session.suspendTurn() returns raw continuation state and detaches the local handle', async () => {
    const { session, continueState, doDetach, doStop, sandboxStop } =
      makeLifecycleSession({ turnState: 'running' });

    await expect(session.suspendTurn()).resolves.toEqual(continueState);

    expect(doDetach).not.toHaveBeenCalled();
    expect(doStop).not.toHaveBeenCalled();
    expect(sandboxStop).not.toHaveBeenCalled();
    await expect(session.suspendTurn()).rejects.toThrow(/not active/);
  });

  test('session.hasUnfinishedTurn() reflects every turn lifecycle state', async () => {
    for (const [turnState, expected] of [
      ['idle', false],
      ['running', true],
      ['awaiting-approval', true],
      ['awaiting-tool-result', true],
      ['suspended', true],
    ] as const) {
      const { session } = makeLifecycleSession({ turnState });
      expect(session.hasUnfinishedTurn()).toBe(expected);
      await session.destroy();
    }
  });

  test('session.destroy() destroys the sandbox without saving state', async () => {
    const {
      session,
      doDetach,
      doStop,
      doDestroy,
      sandboxStop,
      sandboxDestroy,
    } = makeLifecycleSession({});

    await session.destroy();

    expect(doDetach).not.toHaveBeenCalled();
    expect(doStop).not.toHaveBeenCalled();
    expect(doDestroy).toHaveBeenCalledTimes(1);
    expect(sandboxStop).not.toHaveBeenCalled();
    expect(sandboxDestroy).toHaveBeenCalledTimes(1);
  });

  test('session.compact() forwards to the harness session doCompact, then throws once ended', async () => {
    const { harness, doCompact } = mockHarness({ script: () => [] });
    const agent = new HarnessAgent({ harness });
    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });

    await session.compact();
    await session.compact('keep the error trace');
    expect(doCompact).toHaveBeenCalledTimes(2);
    expect(doCompact).toHaveBeenNthCalledWith(1, undefined);
    expect(doCompact).toHaveBeenNthCalledWith(2, 'keep the error trace');

    await session.destroy();
    await expect(session.compact()).rejects.toThrow(/ended/i);
  });

  test('session.detach() returns validated coords, surfaces resume status, and ends the local handle', async () => {
    const doStop = vi.fn(async () => ({
      type: 'resume-session' as const,
      harnessId: 'mock',
      specificationVersion: 'harness-v1' as const,
      data: {},
    }));
    const doDestroy = vi.fn(async () => {});
    const underlying: HarnessV1Session = {
      sessionId: 's-attach',
      isResume: true,
      doPromptTurn: async (opts: HarnessV1PromptTurnOptions) => {
        queueMicrotask(() => opts.emit({ type: 'finish' } as never));
        return { submitToolResult: async () => {}, done: Promise.resolve() };
      },
      doCompact: async () => {},
      doStop,
      doDestroy,
      doDetach: async () => ({
        type: 'resume-session',
        harnessId: 'mock',
        specificationVersion: 'harness-v1',
        data: { bridge: { port: 5001, token: 't', lastSeenEventId: 3 } },
      }),
      doContinueTurn: async () => ({
        submitToolResult: async () => {},
        done: Promise.resolve(),
      }),
      doSuspendTurn: async () => ({
        type: 'continue-turn',
        harnessId: 'mock',
        specificationVersion: 'harness-v1',
        data: { bridge: { port: 5001, token: 't', lastSeenEventId: 3 } },
      }),
    };
    const harness: HarnessV1 = {
      specificationVersion: 'harness-v1',
      harnessId: 'mock',
      builtinTools: {},
      lifecycleStateSchema: z.object({
        bridge: z
          .object({
            port: z.number(),
            token: z.string(),
            lastSeenEventId: z.number(),
          })
          .optional(),
      }),
      doStart: async () => underlying,
    };

    const agent = new HarnessAgent({ harness });
    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });
    expect(session.isResume).toBe(true);

    const handle = await session.detach();
    expect(handle).toEqual({
      type: 'resume-session',
      harnessId: 'mock',
      specificationVersion: 'harness-v1',
      data: { bridge: { port: 5001, token: 't', lastSeenEventId: 3 } },
    });
    expect(doStop).not.toHaveBeenCalled();
    expect(doDestroy).not.toHaveBeenCalled();

    await expect(
      agent.generate({ session, prompt: 'after detach' }),
    ).rejects.toThrow(/has ended/);
  });

  test('session.stop() returns validated state and ends the local handle', async () => {
    const resumeState = {
      type: 'resume-session' as const,
      harnessId: 'mock',
      specificationVersion: 'harness-v1' as const,
      data: { value: 'saved' },
    };
    const continueState = {
      type: 'continue-turn' as const,
      harnessId: 'mock',
      specificationVersion: 'harness-v1' as const,
      data: { value: 'saved' },
    };
    const doStop = vi.fn(async () => resumeState);
    const doDestroy = vi.fn(async () => {});
    const underlying: HarnessV1Session = {
      sessionId: 's-stop',
      isResume: false,
      doPromptTurn: async () => ({
        submitToolResult: async () => {},
        done: Promise.resolve(),
      }),
      doCompact: async () => {},
      doDetach: async () => resumeState,
      doStop,
      doDestroy,
      doContinueTurn: async () => ({
        submitToolResult: async () => {},
        done: Promise.resolve(),
      }),
      doSuspendTurn: async () => continueState,
    };
    const harness: HarnessV1 = {
      specificationVersion: 'harness-v1',
      harnessId: 'mock',
      builtinTools: {},
      lifecycleStateSchema: z.object({ value: z.string() }),
      doStart: async () => underlying,
    };

    const agent = new HarnessAgent({ harness });
    const session = await agent.createSession({
      sandboxSession: makeSandboxSession(),
    });
    await expect(session.stop()).resolves.toEqual(resumeState);
    expect(doStop).toHaveBeenCalledTimes(1);
    expect(doDestroy).not.toHaveBeenCalled();
    await expect(
      agent.generate({ session, prompt: 'after stop' }),
    ).rejects.toThrow(/has ended/);
  });
});
