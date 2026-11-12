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
import { DefaultHarnessAgentSession } from '../harness-agent-session';
import { InMemoryWorld } from '../in-memory-world';
import { createEffectFunction } from './create-effect-function';
import { createExecuteHostToolFunction } from './create-execute-host-tool-function';
import { createLog } from './create-log';
import {
  createStreamWriter,
  decodeStreamRecords,
} from './create-stream-writer';
import type {
  HarnessAgentExecuteHostToolFunction,
  HarnessAgentLog,
  HarnessAgentStreamPartRecord,
} from './types';

const abortControllers = new Set<AbortController>();

afterEach(() => {
  for (const controller of abortControllers) controller.abort();
  abortControllers.clear();
});

const runId = 'host-tool-session';
const session = new DefaultHarnessAgentSession({
  sessionId: 'session-1',
  sandboxId: 'sandbox-1',
  runId,
});

const sandboxSession = { description: 'sandbox' } as SandboxSession;

/**
 * Creates `executeHostTool()` for a new drive on the given session log.
 */
function createDrive(options: {
  world: InMemoryWorld;
  log: HarnessAgentLog;
  tools: ToolSet;
}): {
  executeHostTool: HarnessAgentExecuteHostToolFunction;
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
    yieldAbortSignal: new AbortController().signal,
    writer,
  });
  const getSandboxSession = vi.fn(async () => sandboxSession);
  const executeHostTool = createExecuteHostToolFunction({
    tools: options.tools,
    effect,
    getSandboxSession,
  });
  return { executeHostTool, abortController, getSandboxSession };
}

async function setup(options: { tools: ToolSet }) {
  const world = new InMemoryWorld();
  await world.events.create(runId, {
    eventType: 'run_created',
    eventData: { deploymentId: 'test', workflowName: 'harness', input: [] },
  });
  const log = createLog({ world, runId });
  return { world, log, ...createDrive({ world, log, tools: options.tools }) };
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

const call = {
  toolCallId: 'call-1',
  toolName: 'weather',
  input: { city: 'Paris' },
};

describe('createExecuteHostToolFunction', () => {
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
    expect((await log.read({ types: ['effect-end'] })).events).toHaveLength(2);
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
        toModelOutput: ({ output }) => ({ type: 'text', value: `${output}!` }),
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
