import type { JSONValue } from '@ai-sdk/provider';
import {
  dynamicTool,
  tool,
  type Experimental_SandboxSession as SandboxSession,
  type ToolExecutionOptions,
  type ToolSet,
} from '@ai-sdk/provider-utils';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { z } from 'zod/v4';
import type { HarnessV2ToolExecutionValue } from '../../../v2/harness-v2-drive-context';
import { DefaultHarnessAgentSession } from '../harness-agent-session';
import { InMemoryWorld } from '../in-memory-world';
import { createEffectFunction } from './create-effect-function';
import {
  createExecuteToolFunctions,
  type HarnessAgentExecuteBuiltinToolFunction,
  type HarnessAgentExecuteHostToolFunction,
} from './create-execute-tool-functions';
import { createLog, type HarnessAgentLog } from './create-log';
import {
  createStreamWriter,
  decodeStreamRecords,
  type HarnessAgentStreamPartRecord,
} from './create-stream-writer';

const abortControllers = new Set<AbortController>();

afterEach(() => {
  for (const controller of abortControllers) controller.abort();
  abortControllers.clear();
});

const runId = 'tool-session';
const session = new DefaultHarnessAgentSession({
  sessionId: 'session-1',
  sandboxId: 'sandbox-1',
  runId,
});

const sandboxSession = { description: 'sandbox' } as SandboxSession;

const builtinTools: ToolSet = {
  bash: tool({ inputSchema: z.object({ command: z.string() }) }),
  read: tool({ inputSchema: z.object({ path: z.string() }), replay: 'safe' }),
};

/**
 * Creates `executeHostTool()` and `executeBuiltinTool()` for a new drive on
 * the given session log, with the given app tools and `builtinTools` as the
 * harness's built-in tools.
 */
function createDrive(options: {
  world: InMemoryWorld;
  log: HarnessAgentLog;
  tools?: ToolSet;
  yieldAbortSignal?: AbortSignal;
}): {
  executeHostTool: HarnessAgentExecuteHostToolFunction;
  executeBuiltinTool: HarnessAgentExecuteBuiltinToolFunction;
  abortController: AbortController;
  getSandboxSession: ReturnType<typeof vi.fn>;
} {
  const abortController = new AbortController();
  abortControllers.add(abortController);
  const writer = createStreamWriter({
    world: options.world,
    session,
    abortSignal: abortController.signal,
  });
  const effect = createEffectFunction({
    log: options.log,
    stopAbortSignal: abortController.signal,
    yieldAbortSignal: options.yieldAbortSignal ?? new AbortController().signal,
    writer,
  });
  const getSandboxSession = vi.fn(async () => sandboxSession);
  const { executeHostTool, executeBuiltinTool } = createExecuteToolFunctions({
    log: options.log,
    tools: options.tools ?? {},
    builtinTools,
    effect,
    getSandboxSession,
  });
  return {
    executeHostTool,
    executeBuiltinTool,
    abortController,
    getSandboxSession,
  };
}

async function setup(options?: {
  tools?: ToolSet;
  yieldAbortSignal?: AbortSignal;
}) {
  const world = new InMemoryWorld();
  await world.events.create(runId, {
    eventType: 'run_created',
    eventData: { deploymentId: 'test', workflowName: 'harness', input: [] },
  });
  const log = createLog({ world, runId });
  return { world, log, ...createDrive({ world, log, ...options }) };
}

/**
 * Reads every record written to the session's stream so far.
 */
async function readStream(options: {
  world: InMemoryWorld;
}): Promise<HarnessAgentStreamPartRecord[]> {
  const { data } = await options.world.streams.getChunks(
    runId,
    session.getStreamName(),
    { limit: 1000 },
  );
  return decodeStreamRecords({
    text: data.map(chunk => new TextDecoder().decode(chunk.data)).join(''),
  });
}

/**
 * Returns the stream parts written so far, without their record tags.
 */
async function readParts(options: { world: InMemoryWorld }) {
  return (await readStream(options)).flatMap(record =>
    Object.hasOwn(record, 'part') ? [record.part] : [],
  );
}

/**
 * Returns the data of every committed event of the given effect event type.
 */
async function readEffectEvents(options: {
  log: HarnessAgentLog;
  type: 'effect-start' | 'effect-progress' | 'effect-end';
}) {
  return (await options.log.read({ types: [options.type] })).events.map(
    event => event.data,
  );
}

/**
 * Execute callback that runs until its attempt is aborted.
 */
function executeUntilAborted(options: {
  abortSignal: AbortSignal;
}): Promise<HarnessV2ToolExecutionValue> {
  return new Promise((_resolve, reject) => {
    options.abortSignal.addEventListener(
      'abort',
      () => reject(options.abortSignal.reason),
      { once: true },
    );
  });
}

const call = {
  toolCallId: 'call-1',
  toolName: 'weather',
  input: { city: 'Paris' },
};

const bashCall = {
  toolCallId: 'call-1',
  toolName: 'bash',
  input: { command: 'ls' },
};

const readCall = {
  toolCallId: 'call-1',
  toolName: 'read',
  input: { path: 'file.txt' },
};

describe('createExecuteToolFunctions', () => {
  describe('executeHostTool', () => {
    test('executes the tool as a recorded effect and emits its result', async () => {
      let executionOptions: ToolExecutionOptions<unknown> | undefined;
      const { world, log, executeHostTool } = await setup({
        tools: {
          weather: tool({
            inputSchema: z.object({ city: z.string() }),
            execute: async ({ city }, options) => {
              executionOptions = options;
              return { city, temperature: 21 };
            },
          }),
        },
      });

      expect(await executeHostTool(call)).toStrictEqual({
        type: 'result',
        value: { raw: { city: 'Paris', temperature: 21 } },
      });

      expect(executionOptions).toEqual({
        toolCallId: 'call-1',
        messages: [],
        abortSignal: expect.any(AbortSignal),
        context: undefined,
        experimental_sandbox: sandboxSession,
      });
      const starts = (await log.read({ types: ['effect-start'] })).events;
      expect(starts).toEqual([
        expect.objectContaining({
          data: expect.objectContaining({
            key: 'tool:call-1',
            name: 'tool.weather',
            replay: 'never',
            input: { city: 'Paris' },
          }),
        }),
      ]);
      expect(await readStream({ world })).toEqual([
        {
          part: {
            type: 'tool-result',
            toolCallId: 'call-1',
            toolName: 'weather',
            result: { city: 'Paris', temperature: 21 },
          },
          startId: starts[0].id,
        },
      ]);
    });

    test('uses the tool replay policy', async () => {
      const { log, executeHostTool } = await setup({
        tools: {
          weather: tool({
            inputSchema: z.object({ city: z.string() }),
            replay: 'safe',
            execute: async () => 'sunny',
          }),
        },
      });
      await executeHostTool(call);
      expect(
        (await log.read({ types: ['effect-start'] })).events[0],
      ).toMatchObject({ data: { replay: 'safe' } });
    });

    test('converts tool outputs to JSON', async () => {
      const { world, executeHostTool } = await setup({
        tools: {
          weather: tool({
            inputSchema: z.object({ city: z.string() }),
            execute: async () => ({
              observedAt: new Date('2026-01-02T03:04:05.000Z'),
              missing: undefined,
              custom: { toJSON: () => 'custom' },
            }),
          }),
          nothing: tool({
            inputSchema: z.object({}),
            execute: async () => undefined,
          }),
        },
      });

      expect(await executeHostTool(call)).toStrictEqual({
        type: 'result',
        value: {
          raw: {
            observedAt: '2026-01-02T03:04:05.000Z',
            custom: 'custom',
          },
        },
      });
      expect(
        await executeHostTool({
          toolCallId: 'call-2',
          toolName: 'nothing',
          input: {},
        }),
      ).toStrictEqual({ type: 'result', value: { raw: null } });
      expect(await readParts({ world })).toEqual([
        expect.objectContaining({
          result: expect.objectContaining({
            observedAt: '2026-01-02T03:04:05.000Z',
            custom: 'custom',
          }),
        }),
        expect.objectContaining({ result: null }),
      ]);
    });

    test('returns the model output only when the tool defines toModelOutput', async () => {
      const toModelOutput = vi.fn(
        ({ output }: { output: { observedAt: Date } }) => ({
          type: 'text' as const,
          value: `Observed at ${output.observedAt.getUTCFullYear()}`,
        }),
      );
      const { executeHostTool } = await setup({
        tools: {
          weather: tool({
            inputSchema: z.object({ city: z.string() }),
            execute: async () => ({
              observedAt: new Date('2026-01-02T03:04:05.000Z'),
            }),
            toModelOutput,
          }),
        },
      });

      expect(await executeHostTool(call)).toStrictEqual({
        type: 'result',
        value: {
          raw: { observedAt: '2026-01-02T03:04:05.000Z' },
          modelOutput: { type: 'text', value: 'Observed at 2026' },
        },
      });
      expect(toModelOutput).toHaveBeenCalledWith({
        toolCallId: 'call-1',
        input: { city: 'Paris' },
        output: { observedAt: new Date('2026-01-02T03:04:05.000Z') },
      });
    });

    test('records an unserializable model output as an error', async () => {
      const { executeHostTool } = await setup({
        tools: {
          weather: tool({
            inputSchema: z.object({ city: z.string() }),
            execute: async () => 'sunny',
            toModelOutput: () =>
              ({
                type: 'json',
                value: { callback: () => 'not serializable' },
              }) as never,
          }),
        },
      });

      expect(await executeHostTool(call)).toEqual({
        type: 'error',
        error: {
          message:
            "Error: The model output of tool 'weather' is not serializable.",
        },
      });
    });

    test('records preliminary values of generator tools as partial output', async () => {
      const { world, log, executeHostTool } = await setup({
        tools: {
          weather: tool({
            inputSchema: z.object({ city: z.string() }),
            async *execute() {
              yield { status: 'loading' };
              yield { status: 'done', temperature: 21 };
            },
          }),
        },
      });

      expect(await executeHostTool(call)).toStrictEqual({
        type: 'result',
        value: { raw: { status: 'done', temperature: 21 } },
      });
      expect(
        (await log.read({ types: ['effect-progress'] })).events.map(
          event => event.type === 'effect-progress' && event.data.partial,
        ),
      ).toEqual([
        { raw: { status: 'loading' } },
        { raw: { status: 'done', temperature: 21 } },
        { raw: { status: 'done', temperature: 21 } },
      ]);
      expect(await readParts({ world })).toEqual([
        expect.objectContaining({
          result: { status: 'loading' },
          preliminary: true,
        }),
        expect.objectContaining({
          result: { status: 'done', temperature: 21 },
          preliminary: true,
        }),
        {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName: 'weather',
          result: { status: 'done', temperature: 21 },
        },
      ]);
    });

    test.each(['never', 'safe'] as const)(
      'resolves an interruption with the last partial value: %s',
      async replay => {
        const execute = vi.fn();
        let abortController: AbortController | undefined;
        const tools: ToolSet = {
          weather: tool({
            inputSchema: z.object({ city: z.string() }),
            replay,
            async *execute() {
              execute();
              yield { status: 'loading' };
              abortController?.abort();
              yield { status: 'done' };
            },
          }),
        };
        const drive = await setup({ tools });
        abortController = drive.abortController;

        const output = await drive.executeHostTool(call);
        expect(output).toStrictEqual({
          type: 'interrupted',
          retryable: replay === 'safe',
          partial: { raw: { status: 'loading' } },
        });
        expect(
          (await readParts({ world: drive.world })).some(
            part => part.type === 'tool-result' && part.isError === true,
          ),
        ).toBe(false);

        abortController = undefined;
        const next = createDrive({ world: drive.world, log: drive.log, tools });
        expect(await next.executeHostTool(call)).toStrictEqual(
          replay === 'safe'
            ? { type: 'result', value: { raw: { status: 'done' } } }
            : output,
        );
        expect(execute).toHaveBeenCalledTimes(replay === 'safe' ? 2 : 1);
      },
    );

    test('records a thrown error and emits an error result', async () => {
      const { world, executeHostTool } = await setup({
        tools: {
          weather: tool({
            inputSchema: z.object({ city: z.string() }),
            execute: async (): Promise<string> => {
              throw new Error('Weather service unavailable.');
            },
          }),
        },
      });

      expect(await executeHostTool(call)).toEqual({
        type: 'error',
        error: { message: 'Error: Weather service unavailable.' },
      });
      expect(await readParts({ world })).toEqual([
        {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName: 'weather',
          result: 'Error: Weather service unavailable.',
          isError: true,
        },
      ]);
    });

    test('records calls to unknown and provider-executed tools as errors', async () => {
      const { world, log, executeHostTool, getSandboxSession } = await setup({
        tools: {
          weather: tool({
            inputSchema: z.object({ city: z.string() }),
            execute: async () => 'sunny',
          }),
          search: {
            type: 'provider',
            id: 'test.search',
            isProviderExecuted: true,
            args: {},
            inputSchema: z.object({}),
            outputSchema: z.string(),
          },
        },
      });

      const message =
        "AI_NoSuchToolError: Model tried to call unavailable tool 'Bash'. Available tools: weather.";
      expect(
        await executeHostTool({
          toolCallId: 'call-1',
          toolName: 'Bash',
          input: {},
        }),
      ).toEqual({ type: 'error', error: { message } });
      expect(
        await executeHostTool({
          toolCallId: 'call-2',
          toolName: 'search',
          input: {},
        }),
      ).toEqual({
        type: 'error',
        error: {
          message:
            "AI_NoSuchToolError: Model tried to call unavailable tool 'search'. Available tools: weather.",
        },
      });

      expect(getSandboxSession).not.toHaveBeenCalled();
      expect((await log.read({ types: ['effect-end'] })).events).toHaveLength(
        2,
      );
      expect((await readParts({ world }))[0]).toEqual({
        type: 'tool-result',
        toolCallId: 'call-1',
        toolName: 'Bash',
        result: message,
        isError: true,
        dynamic: true,
      });
    });

    test('records input that does not match the input schema as an error', async () => {
      const execute = vi.fn(async () => 'sunny');
      const { log, executeHostTool } = await setup({
        tools: {
          weather: tool({
            inputSchema: z.object({ city: z.string() }),
            execute,
          }),
        },
      });

      const output = await executeHostTool({ ...call, input: { city: 42 } });
      expect(output).toMatchObject({ type: 'error' });
      expect(output.type === 'error' && output.error.message).toContain(
        'Invalid input for tool weather',
      );
      expect(execute).not.toHaveBeenCalled();
      expect((await log.read({ types: ['effect-start'] })).events).toHaveLength(
        1,
      );
      expect(
        (await log.read({ types: ['tool-execution-start'] })).events,
      ).toEqual([]);
    });

    test('commits tool-execution-start after resolving the sandbox and before executing the tool', async () => {
      const committedBeforeExecute: unknown[] = [];
      let log!: HarnessAgentLog;
      const setupResult = await setup({
        tools: {
          weather: tool({
            inputSchema: z.object({ city: z.string() }),
            execute: async () => {
              committedBeforeExecute.push(
                ...(await log.read({ types: ['tool-execution-start'] })).events,
              );
              return 'sunny';
            },
          }),
        },
      });
      log = setupResult.log;
      const { getSandboxSession, executeHostTool } = setupResult;

      await executeHostTool(call);

      const [start] = (await log.read({ types: ['effect-start'] })).events;
      expect(getSandboxSession).toHaveBeenCalledTimes(1);
      expect(committedBeforeExecute).toEqual([
        {
          type: 'tool-execution-start',
          id: `tool-execution-start:${start.id}`,
          data: { startId: start.id },
        },
      ]);
    });

    test('hides tool context validation details', async () => {
      const { executeHostTool } = await setup({
        tools: {
          weather: tool({
            inputSchema: z.object({ city: z.string() }),
            contextSchema: z.object({ apiKey: z.string() }),
            execute: async () => 'sunny',
          }),
        },
      });

      expect(await executeHostTool(call)).toEqual({
        type: 'error',
        error: { message: 'Error: Tool context validation failed.' },
      });
    });

    test('marks results of dynamic tools as dynamic', async () => {
      const { world, executeHostTool } = await setup({
        tools: {
          weather: dynamicTool({
            inputSchema: z.object({ city: z.string() }),
            execute: async () => 'sunny',
          }),
        },
      });

      await executeHostTool(call);
      expect(await readParts({ world })).toEqual([
        expect.objectContaining({ result: 'sunny', dynamic: true }),
      ]);
    });

    test('suspends client tools without recording them', async () => {
      const { world, log, executeHostTool, getSandboxSession } = await setup({
        tools: {
          weather: tool({
            inputSchema: z.object({ city: z.string() }),
            outputSchema: z.string(),
          }),
        },
      });

      expect(await executeHostTool(call)).toEqual({
        type: 'suspended',
        reason: 'client-tool',
      });
      expect((await log.read()).events).toEqual([]);
      expect(await readStream({ world })).toEqual([]);
      expect(getSandboxSession).not.toHaveBeenCalled();
    });

    test('rejects input that is not a JSON value without recording it', async () => {
      const { log, executeHostTool } = await setup({
        tools: {
          weather: tool({
            inputSchema: z.object({ city: z.string() }),
            execute: async () => 'sunny',
          }),
        },
      });

      await expect(
        executeHostTool({
          ...call,
          // oxlint-disable-next-line ai-sdk/no-as-unknown-as -- intentionally invalid value for a runtime validation test.
          input: { city: new Date() } as unknown as JSONValue,
        }),
      ).rejects.toThrow(
        'HarnessAgent.executeHostTool: `input` must be a JSON value.',
      );
      expect((await log.read()).events).toEqual([]);
    });

    test('replays a recorded call without executing or emitting again', async () => {
      const execute = vi.fn(async () => 'sunny');
      const tools: ToolSet = {
        weather: tool({
          inputSchema: z.object({ city: z.string() }),
          execute,
          toModelOutput: ({ output }) => ({
            type: 'text',
            value: `${output}!`,
          }),
        }),
      };
      const { world, log, executeHostTool } = await setup({ tools });
      const output = await executeHostTool(call);
      const records = await readStream({ world });

      const next = createDrive({ world, log, tools });
      expect(await next.executeHostTool(call)).toStrictEqual(output);
      expect(output).toStrictEqual({
        type: 'result',
        value: {
          raw: 'sunny',
          modelOutput: { type: 'text', value: 'sunny!' },
        },
      });
      expect(execute).toHaveBeenCalledTimes(1);
      expect(next.getSandboxSession).not.toHaveBeenCalled();
      expect(await readStream({ world })).toEqual(records);
    });
  });

  describe('executeBuiltinTool', () => {
    test('records the returned value as one partial and the final value, and emits the final tool result', async () => {
      const { world, log, executeBuiltinTool } = await setup();

      const output = await executeBuiltinTool({
        ...bashCall,
        execute: async () => ({
          raw: { stdout: 'file.txt' },
          modelOutput: { type: 'text', value: 'file.txt' },
        }),
      });

      const value = {
        raw: { stdout: 'file.txt' },
        modelOutput: { type: 'text', value: 'file.txt' },
      };
      expect(output).toEqual({ type: 'result', value });
      expect(await readEffectEvents({ log, type: 'effect-start' })).toEqual([
        {
          key: 'tool:call-1',
          attempt: 1,
          name: 'tool.bash',
          replay: 'never',
          input: { command: 'ls' },
          deliveredSubmissionIds: [],
        },
      ]);
      expect(await readEffectEvents({ log, type: 'effect-progress' })).toEqual([
        { startId: expect.any(String), partial: value },
      ]);
      expect(await readEffectEvents({ log, type: 'effect-end' })).toEqual([
        { startId: expect.any(String), output: { type: 'result', value } },
      ]);
      expect(await readParts({ world })).toEqual([
        {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName: 'bash',
          result: { stdout: 'file.txt' },
        },
      ]);
    });

    test('commits tool-execution-start before running execute', async () => {
      const { log, executeBuiltinTool } = await setup();
      let committedBeforeExecute: unknown[] = [];

      await executeBuiltinTool({
        ...bashCall,
        execute: async () => {
          committedBeforeExecute = (
            await log.read({ types: ['tool-execution-start'] })
          ).events;
          return { raw: 'file.txt' };
        },
      });

      const [start] = (await log.read({ types: ['effect-start'] })).events;
      expect(committedBeforeExecute).toEqual([
        {
          type: 'tool-execution-start',
          id: `tool-execution-start:${start.id}`,
          data: { startId: start.id },
        },
      ]);
    });

    test('runs a never-replay attempt again when its interruption was recorded as retryable', async () => {
      const { log, executeBuiltinTool } = await setup();
      await log.append({
        type: 'effect-start',
        id: 'abandoned',
        data: {
          key: 'tool:call-1',
          attempt: 1,
          name: 'tool.bash',
          replay: 'never',
          input: { command: 'ls' },
          deliveredSubmissionIds: [],
        },
      });
      await log.append({
        type: 'effect-end',
        id: 'recovered',
        data: {
          startId: 'abandoned',
          output: { type: 'interrupted', retryable: true },
        },
      });

      expect(
        await executeBuiltinTool({
          ...bashCall,
          execute: async () => ({ raw: 'file.txt' }),
        }),
      ).toEqual({ type: 'result', value: { raw: 'file.txt' } });
      expect(await readEffectEvents({ log, type: 'effect-start' })).toEqual([
        expect.objectContaining({ attempt: 1 }),
        expect.objectContaining({ attempt: 2 }),
      ]);
    });

    test('records yielded values as partials and the last one as the final value', async () => {
      const { world, log, executeBuiltinTool } = await setup();

      const output = await executeBuiltinTool({
        ...bashCall,
        async *execute() {
          yield { raw: 'a' };
          yield { raw: 'ab' };
        },
      });

      expect(output).toEqual({ type: 'result', value: { raw: 'ab' } });
      expect(await readEffectEvents({ log, type: 'effect-progress' })).toEqual([
        { startId: expect.any(String), partial: { raw: 'a' } },
        { startId: expect.any(String), partial: { raw: 'ab' } },
      ]);
      expect(await readParts({ world })).toEqual([
        {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName: 'bash',
          result: 'a',
          preliminary: true,
        },
        {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName: 'bash',
          result: 'ab',
          preliminary: true,
        },
        {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName: 'bash',
          result: 'ab',
        },
      ]);
    });

    test('passes the attempt abort signal to execute', async () => {
      const { executeBuiltinTool } = await setup();
      const execute = vi.fn(async () => ({ raw: null }));

      await executeBuiltinTool({ ...bashCall, execute });

      expect(execute).toHaveBeenCalledWith({
        abortSignal: expect.any(AbortSignal),
      });
    });

    test('uses the built-in tool replay policy', async () => {
      const { log, executeBuiltinTool } = await setup();

      await executeBuiltinTool({
        ...readCall,
        execute: async () => ({ raw: 'contents' }),
      });

      expect(await readEffectEvents({ log, type: 'effect-start' })).toEqual([
        expect.objectContaining({ name: 'tool.read', replay: 'safe' }),
      ]);
    });

    test('records a thrown error and emits an error tool result', async () => {
      const { world, log, executeBuiltinTool } = await setup();

      const output = await executeBuiltinTool({
        ...bashCall,
        execute: async () => {
          throw new Error('command failed');
        },
      });

      expect(output).toEqual({
        type: 'error',
        error: { message: 'Error: command failed' },
      });
      expect(await readEffectEvents({ log, type: 'effect-end' })).toEqual([
        { startId: expect.any(String), output },
      ]);
      expect(await readParts({ world })).toEqual([
        {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName: 'bash',
          result: 'Error: command failed',
          isError: true,
        },
      ]);
    });

    test('returns a recorded outcome in a later drive without running execute again', async () => {
      const { world, log, executeBuiltinTool } = await setup();
      await executeBuiltinTool({
        ...bashCall,
        execute: async () => ({ raw: 'first' }),
      });

      const execute = vi.fn(async () => ({ raw: 'second' }));
      const nextDrive = createDrive({
        world,
        log: createLog({ world, runId }),
      });
      const output = await nextDrive.executeBuiltinTool({
        ...bashCall,
        execute,
      });

      expect(output).toEqual({ type: 'result', value: { raw: 'first' } });
      expect(execute).not.toHaveBeenCalled();
      expect(
        await readEffectEvents({ log, type: 'effect-start' }),
      ).toHaveLength(1);
      expect(await readParts({ world })).toHaveLength(1);
    });

    test('records an attempt as interrupted when the drive stops', async () => {
      const { log, executeBuiltinTool, abortController } = await setup();

      const pending = executeBuiltinTool({
        ...bashCall,
        async *execute({ abortSignal }) {
          yield { raw: 'partial' };
          yield await executeUntilAborted({ abortSignal });
        },
      });
      await expect
        .poll(() => readEffectEvents({ log, type: 'effect-progress' }))
        .toHaveLength(1);
      abortController.abort();

      const output = {
        type: 'interrupted',
        retryable: false,
        partial: { raw: 'partial' },
      };
      expect(await pending).toEqual(output);
      expect(await readEffectEvents({ log, type: 'effect-end' })).toEqual([
        { startId: expect.any(String), output },
      ]);
    });

    test('returns a never-replay interruption without running execute again', async () => {
      const { world, log, executeBuiltinTool, abortController } = await setup();
      const pending = executeBuiltinTool({
        ...bashCall,
        execute: executeUntilAborted,
      });
      await expect
        .poll(() => readEffectEvents({ log, type: 'effect-start' }))
        .toHaveLength(1);
      abortController.abort();
      await pending;

      const execute = vi.fn(async () => ({ raw: 'second' }));
      const nextDrive = createDrive({
        world,
        log: createLog({ world, runId }),
      });

      expect(
        await nextDrive.executeBuiltinTool({ ...bashCall, execute }),
      ).toEqual({ type: 'interrupted', retryable: false });
      expect(execute).not.toHaveBeenCalled();
    });

    test('runs a safe-replay interruption again in a new attempt', async () => {
      const { world, log, executeBuiltinTool, abortController } = await setup();
      const pending = executeBuiltinTool({
        ...readCall,
        execute: executeUntilAborted,
      });
      await expect
        .poll(() => readEffectEvents({ log, type: 'effect-start' }))
        .toHaveLength(1);
      abortController.abort();
      await pending;

      const nextDrive = createDrive({
        world,
        log: createLog({ world, runId }),
      });
      const output = await nextDrive.executeBuiltinTool({
        ...readCall,
        execute: async () => ({ raw: 'contents' }),
      });

      expect(output).toEqual({ type: 'result', value: { raw: 'contents' } });
      expect(await readEffectEvents({ log, type: 'effect-start' })).toEqual([
        expect.objectContaining({ attempt: 1 }),
        expect.objectContaining({ attempt: 2 }),
      ]);
    });

    test('records calls to tools that are not built-in tools as errors without running execute', async () => {
      const { world, executeBuiltinTool } = await setup();
      const execute = vi.fn(async () => ({ raw: 'sunny' }));
      const message =
        "AI_NoSuchToolError: Model tried to call unavailable tool 'weather'. Available tools: bash, read.";

      const output = await executeBuiltinTool({
        toolCallId: 'call-1',
        toolName: 'weather',
        input: { city: 'Paris' },
        execute,
      });

      expect(output).toEqual({ type: 'error', error: { message } });
      expect(execute).not.toHaveBeenCalled();
      expect(
        (
          await createLog({ world, runId }).read({
            types: ['tool-execution-start'],
          })
        ).events,
      ).toEqual([]);
      expect(await readParts({ world })).toEqual([
        {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName: 'weather',
          result: message,
          isError: true,
        },
      ]);
    });

    test.each<{
      description: string;
      execute: () =>
        | Promise<HarnessV2ToolExecutionValue>
        | AsyncIterable<HarnessV2ToolExecutionValue>;
      message: string;
    }>([
      {
        description: 'a value whose raw output is not JSON',
        execute: async () =>
          // oxlint-disable-next-line ai-sdk/no-as-unknown-as -- intentionally invalid value for a runtime validation test.
          ({ raw: new Date() }) as unknown as HarnessV2ToolExecutionValue,
        message:
          'Error: HarnessAgent.executeBuiltinTool: `raw` must be a JSON value.',
      },
      {
        description: 'an iterable that yields nothing',
        async *execute() {},
        message: "Error: The built-in tool 'bash' produced no value.",
      },
    ])('records $description as an error', async ({ execute, message }) => {
      const { executeBuiltinTool } = await setup();

      expect(await executeBuiltinTool({ ...bashCall, execute })).toEqual({
        type: 'error',
        error: { message },
      });
    });

    test('starts no attempt once the yield signal fired', async () => {
      const yieldController = new AbortController();
      yieldController.abort();
      const { log, executeBuiltinTool } = await setup({
        yieldAbortSignal: yieldController.signal,
      });
      const execute = vi.fn(async () => ({ raw: null }));

      expect(await executeBuiltinTool({ ...bashCall, execute })).toEqual({
        type: 'interrupted',
        retryable: true,
      });
      expect(execute).not.toHaveBeenCalled();
      expect(await readEffectEvents({ log, type: 'effect-start' })).toEqual([]);
    });

    test('rejects input that is not a JSON value without recording it', async () => {
      const { log, executeBuiltinTool } = await setup();

      await expect(
        executeBuiltinTool({
          ...bashCall,
          // oxlint-disable-next-line ai-sdk/no-as-unknown-as -- intentionally invalid value for a runtime validation test.
          input: { when: new Date() } as unknown as JSONValue,
          execute: async () => ({ raw: null }),
        }),
      ).rejects.toThrow(
        'HarnessAgent.executeBuiltinTool: `input` must be a JSON value.',
      );
      expect(await readEffectEvents({ log, type: 'effect-start' })).toEqual([]);
    });
  });
});
