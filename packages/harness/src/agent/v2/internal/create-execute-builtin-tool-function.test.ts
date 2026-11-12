import type { JSONValue } from '@ai-sdk/provider';
import { tool, type ToolSet } from '@ai-sdk/provider-utils';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { z } from 'zod/v4';
import type { HarnessV2ToolExecutionValue } from '../../../v2/harness-v2-drive-context';
import { DefaultHarnessAgentSession } from '../harness-agent-session';
import { InMemoryWorld } from '../in-memory-world';
import { createEffectFunction } from './create-effect-function';
import { createExecuteBuiltinToolFunction } from './create-execute-builtin-tool-function';
import { createLog } from './create-log';
import {
  createStreamWriter,
  decodeStreamRecords,
} from './create-stream-writer';
import type {
  HarnessAgentExecuteBuiltinToolFunction,
  HarnessAgentLog,
  HarnessAgentStreamPartRecord,
} from './types';

const abortControllers = new Set<AbortController>();

afterEach(() => {
  for (const controller of abortControllers) controller.abort();
  abortControllers.clear();
});

const runId = 'builtin-tool-session';
const session = new DefaultHarnessAgentSession({
  sessionId: 'session-1',
  sandboxId: 'sandbox-1',
  runId,
});

const builtinTools: ToolSet = {
  bash: tool({ inputSchema: z.object({ command: z.string() }) }),
  read: tool({ inputSchema: z.object({ path: z.string() }), replay: 'safe' }),
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

/**
 * Creates `executeBuiltinTool()` for a new drive on the given session log.
 */
function createDrive(options: {
  world: InMemoryWorld;
  log: HarnessAgentLog;
  yieldAbortSignal?: AbortSignal;
}): {
  executeBuiltinTool: HarnessAgentExecuteBuiltinToolFunction;
  abortController: AbortController;
} {
  const abortController = new AbortController();
  abortControllers.add(abortController);
  const effect = createEffectFunction({
    log: options.log,
    stopAbortSignal: abortController.signal,
    yieldAbortSignal: options.yieldAbortSignal ?? new AbortController().signal,
    writer: createStreamWriter({
      world: options.world,
      session,
      abortSignal: abortController.signal,
    }),
  });
  const executeBuiltinTool = createExecuteBuiltinToolFunction({
    builtinTools,
    effect,
  });
  return { executeBuiltinTool, abortController };
}

async function setup(options?: { yieldAbortSignal?: AbortSignal }) {
  const world = new InMemoryWorld();
  await world.events.create(runId, {
    eventType: 'run_created',
    eventData: { deploymentId: 'test', workflowName: 'harness', input: [] },
  });
  const log = createLog({ world, runId });
  return { world, log, ...createDrive({ world, log, ...options }) };
}

/**
 * Returns the stream parts written so far, without their record tags.
 */
async function readParts(options: { world: InMemoryWorld }) {
  const { data } = await options.world.streams.getChunks(
    runId,
    session.getStreamName(),
    { limit: 1000 },
  );
  const records: HarnessAgentStreamPartRecord[] = await decodeStreamRecords({
    text: data.map(chunk => new TextDecoder().decode(chunk.data)).join(''),
  });
  return records.map(record => record.part);
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

describe('createExecuteBuiltinToolFunction', () => {
  test('records the returned value and emits the final tool result', async () => {
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
    expect(await readEffectEvents({ log, type: 'effect-progress' })).toEqual(
      [],
    );
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
    const nextDrive = createDrive({ world, log: createLog({ world, runId }) });
    const output = await nextDrive.executeBuiltinTool({
      ...bashCall,
      execute,
    });

    expect(output).toEqual({ type: 'result', value: { raw: 'first' } });
    expect(execute).not.toHaveBeenCalled();
    expect(await readEffectEvents({ log, type: 'effect-start' })).toHaveLength(
      1,
    );
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
    const nextDrive = createDrive({ world, log: createLog({ world, runId }) });

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

    const nextDrive = createDrive({ world, log: createLog({ world, runId }) });
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
