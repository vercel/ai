import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { HarnessV2LogEvent } from '../../../v2/harness-v2-log';
import type { HarnessV2NetworkSandboxSession } from '../../../v2/harness-v2-network-sandbox-session';
import type { HarnessAgentSession } from '../harness-agent-session';
import { InMemoryWorld } from '../in-memory-world';
import { createDriveContext } from './create-drive-context';
import {
  createLog,
  type HarnessAgentLog,
  type HarnessAgentLogEvent,
} from './create-log';
import type { HarnessAgentEffectFunction } from './create-effect-function';
import type {
  HarnessAgentExecuteBuiltinToolFunction,
  HarnessAgentExecuteHostToolFunction,
} from './create-execute-tool-functions';
import type {
  HarnessAgentFinishStepFunction,
  HarnessAgentFinishTurnFunction,
} from './create-finish-functions';
import type { HarnessAgentGateBuiltinToolFunction } from './create-gate-builtin-tool-function';
import type { HarnessAgentStreamWriter } from './create-stream-writer';

const abortControllers = new Set<AbortController>();

afterEach(() => {
  for (const controller of abortControllers) controller.abort();
  abortControllers.clear();
});

const runId = 'drive-context-session';

const usage = {
  inputTokens: {
    total: 10,
    noCache: 10,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
};

const finishReason = { unified: 'stop' as const, raw: 'stop' };

/**
 * Engine events covering every adapter-visible and engine-internal type.
 */
const allEvents: HarnessAgentLogEvent[] = [
  {
    type: 'submission',
    id: 'prompt-1',
    data: {
      type: 'prompt',
      message: { role: 'user', content: 'hello' },
      settings: { skills: [], tools: [] },
    },
  },
  {
    type: 'turn-start',
    id: 'turn-start:prompt-1',
    data: { turnId: 'prompt-1' },
  },
  {
    type: 'effect-start',
    id: 'start-1',
    data: {
      key: 'model:1',
      attempt: 1,
      name: 'model',
      replay: 'safe',
      input: null,
      deliveredSubmissionIds: ['prompt-1'],
    },
  },
  {
    type: 'effect-progress',
    id: 'progress-1',
    data: { startId: 'start-1', partial: 'partial' },
  },
  {
    type: 'effect-end',
    id: 'end-1',
    data: { startId: 'start-1', output: { type: 'result', value: 'done' } },
  },
  {
    type: 'finish-step',
    id: 'finish-step:prompt-1:0',
    data: { turnId: 'prompt-1', stepNumber: 0, finishReason, usage },
  },
  {
    type: 'finish-turn',
    id: 'finish-turn:prompt-1',
    data: { turnId: 'prompt-1', finishReason, totalUsage: usage },
  },
  { type: 'harness:journal', id: 'journal-1', data: { entry: 1 } },
];

/**
 * Creates a sandbox session whose `run` answers `pwd` and `mkdir` commands.
 */
function createSandboxSession(options?: {
  pwd?: string;
  pwdExitCode?: number;
  mkdirExitCode?: number;
}) {
  const run = vi.fn(async ({ command }: { command: string }) => {
    if (command === 'pwd') {
      const exitCode = options?.pwdExitCode ?? 0;
      return {
        exitCode,
        stdout: exitCode === 0 ? `${options?.pwd ?? '/root/'}\n` : '',
        stderr: exitCode === 0 ? '' : 'no shell',
      };
    }
    const exitCode = options?.mkdirExitCode ?? 0;
    return { exitCode, stdout: '', stderr: exitCode === 0 ? '' : 'denied' };
  });
  const sandboxSession: SandboxSession = {
    description: 'mock sandbox',
    readFile: vi.fn(),
    readBinaryFile: vi.fn(),
    readTextFile: vi.fn(),
    writeFile: vi.fn(),
    writeBinaryFile: vi.fn(),
    writeTextFile: vi.fn(),
    stat: vi.fn(),
    listDirectory: vi.fn(),
    deleteFile: vi.fn(),
    spawn: vi.fn(),
    run,
  };
  return { sandboxSession, run };
}

async function setup(options?: {
  sandboxSession?: SandboxSession | HarnessV2NetworkSandboxSession;
  sessionId?: string;
  workDir?: string;
}) {
  const world = new InMemoryWorld();
  await world.events.create(runId, {
    eventType: 'run_created',
    eventData: { deploymentId: 'test', workflowName: 'harness', input: [] },
  });
  const log = createLog({ world, runId });
  const abortController = new AbortController();
  abortControllers.add(abortController);
  const yieldController = new AbortController();
  const getSandboxSession = vi.fn(
    async () =>
      options?.sandboxSession ?? createSandboxSession().sandboxSession,
  );
  const session: HarnessAgentSession = {
    sessionId: options?.sessionId ?? 'session-1',
    sandboxId: 'sandbox-1',
    runId,
    getStreamName: () => runId + '_harness_agent',
    setSandboxSessionResolver: () => {},
    getSandboxSession,
  };
  const writer = {
    emit: vi.fn(),
    unsafeEmit: vi.fn(),
    withdraw: vi.fn(),
    flush: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  } satisfies HarnessAgentStreamWriter;
  const effect: HarnessAgentEffectFunction = vi.fn();
  const executeHostTool: HarnessAgentExecuteHostToolFunction = vi.fn();
  const gateBuiltinTool: HarnessAgentGateBuiltinToolFunction = vi.fn();
  const executeBuiltinTool: HarnessAgentExecuteBuiltinToolFunction = vi.fn();
  const finishStep: HarnessAgentFinishStepFunction = vi.fn();
  const finishTurn: HarnessAgentFinishTurnFunction = vi.fn();
  const context = createDriveContext({
    session,
    log,
    effect,
    writer,
    finishStep,
    finishTurn,
    executeHostTool,
    executeBuiltinTool,
    gateBuiltinTool,
    harnessId: 'mock-harness',
    workDir: options?.workDir,
    stopAbortSignal: abortController.signal,
    yieldAbortSignal: yieldController.signal,
  });
  return {
    log,
    context,
    abortController,
    yieldController,
    getSandboxSession,
    writer,
    effect,
    executeHostTool,
    executeBuiltinTool,
    gateBuiltinTool,
    finishStep,
    finishTurn,
  };
}

async function appendAll(options: { log: HarnessAgentLog }): Promise<void> {
  for (const event of allEvents) await options.log.append(event);
}

describe('createDriveContext', () => {
  test('passes the engine functions and signals through unchanged', async () => {
    const {
      context,
      abortController,
      yieldController,
      effect,
      executeHostTool,
      executeBuiltinTool,
      gateBuiltinTool,
      finishStep,
      finishTurn,
    } = await setup();

    expect(context.effect).toBe(effect);
    expect(context.executeHostTool).toBe(executeHostTool);
    expect(context.executeBuiltinTool).toBe(executeBuiltinTool);
    expect(context.gateBuiltinTool).toBe(gateBuiltinTool);
    expect(context.finishStep).toBe(finishStep);
    expect(context.finishTurn).toBe(finishTurn);
    expect(context.stopAbortSignal).toBe(abortController.signal);
    expect(context.yieldAbortSignal).toBe(yieldController.signal);
  });

  test('builds unsafeEmit from the writer', async () => {
    const { context, writer } = await setup();
    const part = { type: 'text-delta' as const, id: 'text-1', delta: 'hi' };

    context.unsafeEmit(part);

    expect(writer.unsafeEmit).toHaveBeenCalledWith(part);
  });

  describe('log', () => {
    test('reads only HarnessV2 events and keeps the engine position', async () => {
      const { log, context } = await setup();
      await appendAll({ log });
      const engineRead = await log.read();

      const result = await context.log.read();

      expect(result.events.map(event => event.id)).toEqual([
        'prompt-1',
        'start-1',
        'end-1',
        'finish-turn:prompt-1',
        'journal-1',
      ]);
      expect(result.position).toBe(engineRead.position);
    });

    test('applies requested types and never returns engine-internal events', async () => {
      const { log, context } = await setup();
      await appendAll({ log });

      expect(
        (
          await context.log.read({
            // oxlint-disable-next-line ai-sdk/no-as-unknown-as -- intentionally invalid value for a runtime validation test.
            types: [
              'effect-progress',
            ] as unknown as HarnessV2LogEvent['type'][],
          })
        ).events,
      ).toEqual([]);
      expect(
        (await context.log.read({ types: ['effect-end'] })).events.map(
          event => event.id,
        ),
      ).toEqual(['end-1']);
    });

    test('reads events after a position', async () => {
      const { log, context } = await setup();
      await log.append(allEvents[0]);
      const { position } = await context.log.read();
      await log.append(allEvents[7]);

      const result = await context.log.read({ after: position });

      expect(result.events.map(event => event.id)).toEqual(['journal-1']);
    });

    test('appends harness events and generates a missing ID', async () => {
      const { log, context } = await setup();

      await expect(
        context.log.append({ type: 'harness:journal', data: { entry: 2 } }),
      ).resolves.toBe(true);

      const { events } = await log.read();
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: 'harness:journal',
        data: { entry: 2 },
      });
      expect(typeof events[0].id).toBe('string');
    });

    test('returns false for an identical event with the same ID', async () => {
      const { context } = await setup();
      const event = {
        type: 'harness:journal' as const,
        id: 'journal-2',
        data: { entry: 2 },
      };

      await expect(context.log.append(event)).resolves.toBe(true);
      await expect(context.log.append(event)).resolves.toBe(false);
    });

    test('rejects appending a non-harness event without writing', async () => {
      const { log, context } = await setup();

      await expect(context.log.append(allEvents[0] as never)).rejects.toThrow(
        'only `harness:` events can be appended',
      );
      expect((await log.read()).events).toEqual([]);
    });

    test('rejects appending after the drive aborted without writing', async () => {
      const { log, context, abortController } = await setup();
      const reason = new Error('drive stopped');
      abortController.abort(reason);

      await expect(
        context.log.append({ type: 'harness:journal', data: null }),
      ).rejects.toBe(reason);
      expect((await log.read()).events).toEqual([]);
    });

    test('notifies listeners only for engine-written HarnessV2 events', async () => {
      const { log, context } = await setup();
      const listener = vi.fn();
      context.log.onAppend(listener);

      for (const event of allEvents) {
        listener.mockClear();
        await log.append(event);
        expect(listener.mock.calls.length, event.type).toBe(
          ['submission', 'effect-start', 'effect-end', 'finish-turn'].includes(
            event.type,
          )
            ? 1
            : 0,
        );
        for (const call of listener.mock.calls) expect(call).toEqual([]);
      }

      listener.mockClear();
      await context.log.append({ type: 'harness:journal', data: null });
      expect(listener).not.toHaveBeenCalled();
    });

    test('stops notifying after unsubscribing', async () => {
      const { log, context } = await setup();
      const listener = vi.fn();
      const unsubscribe = context.log.onAppend(listener);

      unsubscribe();
      unsubscribe();
      await log.append(allEvents[0]);

      expect(listener).not.toHaveBeenCalled();
    });

    test('unsubscribes listeners when the drive aborts', async () => {
      const { log, context, abortController } = await setup();
      const listener = vi.fn();
      context.log.onAppend(listener);

      abortController.abort();
      await log.append(allEvents[0]);

      expect(listener).not.toHaveBeenCalled();
    });

    test('registers nothing after the drive aborted', async () => {
      const { log, context, abortController } = await setup();
      abortController.abort();
      const listener = vi.fn();

      const unsubscribe = context.log.onAppend(listener);
      await log.append(allEvents[0]);
      unsubscribe();

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('sandbox', () => {
    test('uses the default working directory of a network sandbox session', async () => {
      const { sandboxSession, run } = createSandboxSession();
      const networkSession = Object.assign(sandboxSession, {
        defaultWorkingDirectory: '/vercel/sandbox',
      }) as HarnessV2NetworkSandboxSession;
      const { context } = await setup({ sandboxSession: networkSession });

      const result = await context.sandbox();

      expect(result).toEqual({
        session: networkSession,
        workDir: '/vercel/sandbox/mock-harness-session-1',
      });
      expect(run).toHaveBeenCalledTimes(1);
      expect(run).toHaveBeenCalledWith({
        command: 'mkdir -p "$WORK_DIR"',
        env: { WORK_DIR: '/vercel/sandbox/mock-harness-session-1' },
        abortSignal: expect.any(AbortSignal),
      });
    });

    test('resolves the default working directory with pwd and encodes the default directory', async () => {
      const { sandboxSession, run } = createSandboxSession({ pwd: '/home/u/' });
      const { context } = await setup({
        sandboxSession,
        sessionId: 'a/b',
      });

      const result = await context.sandbox();

      expect(result.workDir).toBe('/home/u/mock-harness-a%2Fb');
      expect(run.mock.calls.map(([options]) => options.command)).toEqual([
        'pwd',
        'mkdir -p "$WORK_DIR"',
      ]);
      expect(Object.keys(result)).toEqual(['session', 'workDir']);
    });

    test('uses a configured work directory', async () => {
      const nested = await setup({
        sandboxSession: createSandboxSession().sandboxSession,
        workDir: 'project/app',
      });
      const root = await setup({
        sandboxSession: createSandboxSession().sandboxSession,
        workDir: '.',
      });

      expect((await nested.context.sandbox()).workDir).toBe(
        '/root/project/app',
      );
      expect((await root.context.sandbox()).workDir).toBe('/root');
    });

    test('resolves the sandbox once per drive', async () => {
      const { context, getSandboxSession } = await setup();

      const [first, second] = await Promise.all([
        context.sandbox(),
        context.sandbox(),
      ]);
      const third = await context.sandbox();

      expect(getSandboxSession).toHaveBeenCalledTimes(1);
      expect(second).toBe(first);
      expect(third).toBe(first);
    });

    test('does not cache a failed resolution', async () => {
      const { sandboxSession } = createSandboxSession({ mkdirExitCode: 1 });
      const { context, getSandboxSession } = await setup({ sandboxSession });

      await expect(context.sandbox()).rejects.toThrow(
        'Failed to create sandbox work directory /root/mock-harness-session-1 (exit 1): denied',
      );
      await expect(context.sandbox()).rejects.toThrow(
        'Failed to create sandbox work directory',
      );
      expect(getSandboxSession).toHaveBeenCalledTimes(2);
    });

    test('keeps a root pwd as the base', async () => {
      const { context } = await setup({
        sandboxSession: createSandboxSession({ pwd: '/' }).sandboxSession,
        workDir: 'app',
      });

      expect((await context.sandbox()).workDir).toBe('/app');
    });

    test.each([
      ['', 'mock-harness-%'],
      ['.', 'mock-harness-%2E'],
      ['..', 'mock-harness-%2E%2E'],
    ])(
      'encodes the session ID %j within a single path segment',
      async (sessionId, directory) => {
        const { context } = await setup({
          sandboxSession: createSandboxSession({ pwd: '/w' }).sandboxSession,
          sessionId,
        });

        expect((await context.sandbox()).workDir).toBe(`/w/${directory}`);
      },
    );

    test('rejects when pwd fails', async () => {
      const { context } = await setup({
        sandboxSession: createSandboxSession({ pwdExitCode: 2 }).sandboxSession,
      });

      await expect(context.sandbox()).rejects.toThrow(
        'Failed to resolve sandbox default working directory (exit 2): no shell',
      );
    });

    test('rejects a relative pwd', async () => {
      const { context } = await setup({
        sandboxSession: createSandboxSession({ pwd: 'relative' })
          .sandboxSession,
      });

      await expect(context.sandbox()).rejects.toThrow(
        'expected an absolute path, got "relative"',
      );
    });
  });
});
