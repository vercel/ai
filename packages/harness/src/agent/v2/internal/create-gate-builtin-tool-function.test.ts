import type { JSONValue } from '@ai-sdk/provider';
import { tool, type ToolSet } from '@ai-sdk/provider-utils';
import { afterEach, describe, expect, test } from 'vitest';
import { z } from 'zod/v4';
import type { HarnessV2ToolGateOutput } from '../../../v2/harness-v2-drive-context';
import type { HarnessV2EffectOutput } from '../../../v2/harness-v2-effect';
import { DefaultHarnessAgentSession } from '../harness-agent-session';
import { InMemoryWorld } from '../in-memory-world';
import { createEffectFunction } from './create-effect-function';
import { createGateBuiltinToolFunction } from './create-gate-builtin-tool-function';
import { createLog } from './create-log';
import {
  createStreamWriter,
  decodeStreamRecords,
} from './create-stream-writer';
import type {
  HarnessAgentGateBuiltinToolFunction,
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
  Bash: tool({ inputSchema: z.object({ command: z.string() }) }),
  Read: tool({ inputSchema: z.object({ path: z.string() }), replay: 'safe' }),
};

const call = {
  toolCallId: 'call-1',
  toolName: 'Bash',
  input: { command: 'ls' },
};

/**
 * Creates `gateBuiltinTool()` for a new drive on the given session log.
 */
function createDrive(options: { world: InMemoryWorld; log: HarnessAgentLog }): {
  gateBuiltinTool: HarnessAgentGateBuiltinToolFunction;
  abortController: AbortController;
} {
  const abortController = new AbortController();
  abortControllers.add(abortController);
  const effect = createEffectFunction({
    log: options.log,
    stopAbortSignal: abortController.signal,
    yieldAbortSignal: new AbortController().signal,
    writer: createStreamWriter({
      world: options.world,
      session,
      abortSignal: abortController.signal,
    }),
  });
  const gateBuiltinTool = createGateBuiltinToolFunction({
    builtinTools,
    effect,
    abortSignal: abortController.signal,
  });
  return { gateBuiltinTool, abortController };
}

async function setup() {
  const world = new InMemoryWorld();
  await world.events.create(runId, {
    eventType: 'run_created',
    eventData: { deploymentId: 'test', workflowName: 'harness', input: [] },
  });
  const log = createLog({ world, runId });
  return { world, log, ...createDrive({ world, log }) };
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
 * Asserts that the gate approved the call and returns its report methods.
 */
function getApproved(
  output: HarnessV2ToolGateOutput,
): Extract<HarnessV2ToolGateOutput, { type: 'approved' }> {
  if (output.type !== 'approved') {
    throw new Error(`Expected an approved call, received ${output.type}.`);
  }
  return output;
}

describe('createGateBuiltinToolFunction', () => {
  test('approves a built-in tool call once its start is committed', async () => {
    const { log, gateBuiltinTool } = await setup();

    expect((await gateBuiltinTool(call)).type).toBe('approved');

    expect(await readEffectEvents({ log, type: 'effect-start' })).toEqual([
      {
        key: 'tool:call-1',
        attempt: 1,
        name: 'tool.Bash',
        replay: 'never',
        input: { command: 'ls' },
        deliveredSubmissionIds: [],
      },
    ]);
    expect(await readEffectEvents({ log, type: 'effect-end' })).toEqual([]);
  });

  test('uses the built-in tool replay policy', async () => {
    const { log, gateBuiltinTool } = await setup();

    await gateBuiltinTool({
      toolCallId: 'call-1',
      toolName: 'Read',
      input: { path: 'file.txt' },
    });

    expect(await readEffectEvents({ log, type: 'effect-start' })).toEqual([
      expect.objectContaining({ name: 'tool.Read', replay: 'safe' }),
    ]);
  });

  test('records the reported result and emits the final tool result', async () => {
    const { world, log, gateBuiltinTool } = await setup();
    const approved = getApproved(await gateBuiltinTool(call));

    await approved.result({
      raw: { stdout: 'file.txt' },
      modelOutput: { type: 'text', value: 'file.txt' },
    });

    expect(await readEffectEvents({ log, type: 'effect-end' })).toEqual([
      {
        startId: expect.any(String),
        output: {
          type: 'result',
          value: {
            raw: { stdout: 'file.txt' },
            modelOutput: { type: 'text', value: 'file.txt' },
          },
        },
      },
    ]);
    expect(await readParts({ world })).toEqual([
      {
        type: 'tool-result',
        toolCallId: 'call-1',
        toolName: 'Bash',
        result: { stdout: 'file.txt' },
      },
    ]);
  });

  test('records partial values in order and emits preliminary results', async () => {
    const { world, log, gateBuiltinTool } = await setup();
    const approved = getApproved(await gateBuiltinTool(call));

    await approved.partial({ raw: 'a' });
    expect(await readEffectEvents({ log, type: 'effect-progress' })).toEqual([
      { startId: expect.any(String), partial: { raw: 'a' } },
    ]);

    await Promise.all([
      approved.partial({ raw: 'ab' }),
      approved.partial({ raw: 'abc' }),
    ]);
    await approved.result({ raw: 'abcd' });

    expect(
      (await log.read({ types: ['effect-progress'] })).events.map(event =>
        event.type === 'effect-progress' ? event.data.partial : undefined,
      ),
    ).toEqual([{ raw: 'a' }, { raw: 'ab' }, { raw: 'abc' }, { raw: 'abcd' }]);
    expect(await readParts({ world })).toEqual([
      ...['a', 'ab', 'abc'].map(result => ({
        type: 'tool-result',
        toolCallId: 'call-1',
        toolName: 'Bash',
        result,
        preliminary: true,
      })),
      {
        type: 'tool-result',
        toolCallId: 'call-1',
        toolName: 'Bash',
        result: 'abcd',
      },
    ]);
  });

  test('records a reported error and emits an error result', async () => {
    const { world, log, gateBuiltinTool } = await setup();
    const approved = getApproved(await gateBuiltinTool(call));

    await approved.error({ message: 'command failed' });

    expect(await readEffectEvents({ log, type: 'effect-end' })).toEqual([
      {
        startId: expect.any(String),
        output: { type: 'error', error: { message: 'command failed' } },
      },
    ]);
    expect(await readParts({ world })).toEqual([
      {
        type: 'tool-result',
        toolCallId: 'call-1',
        toolName: 'Bash',
        result: 'command failed',
        isError: true,
      },
    ]);
  });

  test('keeps the first ending report and ignores later reports', async () => {
    const { world, log, gateBuiltinTool } = await setup();
    const approved = getApproved(await gateBuiltinTool(call));

    await Promise.all([
      approved.result({ raw: 'first' }),
      approved.error({ message: 'second' }),
      approved.partial({ raw: 'third' }),
    ]);
    await approved.result({ raw: 'fourth' });

    expect(await readEffectEvents({ log, type: 'effect-end' })).toEqual([
      {
        startId: expect.any(String),
        output: { type: 'result', value: { raw: 'first' } },
      },
    ]);
    expect(await readParts({ world })).toEqual([
      {
        type: 'tool-result',
        toolCallId: 'call-1',
        toolName: 'Bash',
        result: 'first',
      },
    ]);
  });

  test('records an approved call as interrupted when the drive stops', async () => {
    const { log, gateBuiltinTool, abortController } = await setup();
    const approved = getApproved(await gateBuiltinTool(call));
    await approved.partial({ raw: 'partial' });

    abortController.abort();
    await approved.result({ raw: 'late' });
    await approved.partial({ raw: 'later' });

    expect(await readEffectEvents({ log, type: 'effect-end' })).toEqual([
      {
        startId: expect.any(String),
        output: {
          type: 'interrupted',
          retryable: false,
          partial: { raw: 'partial' },
        },
      },
    ]);
  });

  test.each<{
    description: string;
    replay: 'never' | 'safe';
    output: HarnessV2EffectOutput;
    reason: string;
  }>([
    {
      description: 'a result',
      replay: 'never',
      output: { type: 'result', value: { raw: { stdout: 'file.txt' } } },
      reason:
        'This call already ran in this session. Its recorded result: {"stdout":"file.txt"}',
    },
    {
      description: 'an error',
      replay: 'never',
      output: { type: 'error', error: { message: 'command failed' } },
      reason:
        'This call already ran in this session. Its recorded result: command failed',
    },
    {
      description: 'an interruption',
      replay: 'never',
      output: { type: 'interrupted', retryable: false },
      reason:
        'This call was interrupted in an earlier attempt and may or may not have taken effect.',
    },
    {
      description: 'an interruption with a partial',
      replay: 'never',
      output: {
        type: 'interrupted',
        retryable: false,
        partial: { raw: 'half' },
      },
      reason:
        'This call was interrupted in an earlier attempt and may or may not have taken effect.\nPartial output before the interruption: "half"',
    },
  ])(
    'denies a call with $description recorded without running it again',
    async ({ replay, output, reason }) => {
      const { world, log, gateBuiltinTool } = await setup();
      const writer = createLog({ world, runId });
      await writer.append({
        type: 'effect-start',
        id: 'start',
        data: {
          key: 'tool:call-1',
          attempt: 1,
          name: 'tool.Bash',
          replay,
          input: call.input,
          deliveredSubmissionIds: [],
        },
      });
      await writer.append({
        type: 'effect-end',
        id: 'end',
        data: { startId: 'start', output },
      });

      expect(await gateBuiltinTool(call)).toEqual({ type: 'denied', reason });

      expect(
        await readEffectEvents({ log, type: 'effect-start' }),
      ).toHaveLength(1);
      expect(await readParts({ world })).toEqual([]);
    },
  );

  test('denies a never-replay call that an earlier drive left interrupted', async () => {
    const { world, log, gateBuiltinTool, abortController } = await setup();
    getApproved(await gateBuiltinTool(call));
    abortController.abort();
    await expect
      .poll(() => readEffectEvents({ log, type: 'effect-end' }))
      .toHaveLength(1);

    const nextDrive = createDrive({ world, log: createLog({ world, runId }) });
    expect(await nextDrive.gateBuiltinTool(call)).toEqual({
      type: 'denied',
      reason:
        'This call was interrupted in an earlier attempt and may or may not have taken effect.',
    });
    expect(await readEffectEvents({ log, type: 'effect-start' })).toHaveLength(
      1,
    );
  });

  test('approves a safe-replay call that an earlier drive left interrupted as a new attempt', async () => {
    const { world, log, gateBuiltinTool, abortController } = await setup();
    const readCall = {
      toolCallId: 'call-1',
      toolName: 'Read',
      input: { path: 'file.txt' },
    };
    getApproved(await gateBuiltinTool(readCall));
    abortController.abort();
    await expect
      .poll(() => readEffectEvents({ log, type: 'effect-end' }))
      .toHaveLength(1);

    const nextDrive = createDrive({ world, log: createLog({ world, runId }) });
    const approved = getApproved(await nextDrive.gateBuiltinTool(readCall));
    await approved.result({ raw: 'contents' });

    expect(await readEffectEvents({ log, type: 'effect-start' })).toEqual([
      expect.objectContaining({ attempt: 1 }),
      expect.objectContaining({ attempt: 2 }),
    ]);
    expect(await readEffectEvents({ log, type: 'effect-end' })).toEqual([
      {
        startId: expect.any(String),
        output: { type: 'interrupted', retryable: true },
      },
      {
        startId: expect.any(String),
        output: { type: 'result', value: { raw: 'contents' } },
      },
    ]);
  });

  test('records calls to tools that are not built-in tools as errors', async () => {
    const { world, log, gateBuiltinTool } = await setup();
    const message =
      "AI_NoSuchToolError: Model tried to call unavailable tool 'weather'. Available tools: Bash, Read.";
    const weatherCall = {
      toolCallId: 'call-1',
      toolName: 'weather',
      input: { city: 'Paris' },
    };

    expect(await gateBuiltinTool(weatherCall)).toEqual({
      type: 'denied',
      reason: message,
    });
    expect(await readEffectEvents({ log, type: 'effect-end' })).toEqual([
      {
        startId: expect.any(String),
        output: { type: 'error', error: { message } },
      },
    ]);
    expect(await readParts({ world })).toEqual([
      {
        type: 'tool-result',
        toolCallId: 'call-1',
        toolName: 'weather',
        result: message,
        isError: true,
      },
    ]);

    const nextDrive = createDrive({ world, log: createLog({ world, runId }) });
    expect(await nextDrive.gateBuiltinTool(weatherCall)).toEqual({
      type: 'denied',
      reason: `This call already ran in this session. Its recorded result: ${message}`,
    });
    expect(await readEffectEvents({ log, type: 'effect-start' })).toHaveLength(
      1,
    );
  });

  test('denies calls once the drive stopped without recording them', async () => {
    const { log, gateBuiltinTool, abortController } = await setup();
    abortController.abort();

    expect(await gateBuiltinTool(call)).toEqual({
      type: 'denied',
      reason: 'This call was not run because the drive stopped.',
    });
    expect(
      (
        await log.read({
          types: ['effect-start', 'effect-progress', 'effect-end'],
        })
      ).events,
    ).toEqual([]);
  });

  test('rejects input that is not a JSON value without recording it', async () => {
    const { log, gateBuiltinTool } = await setup();

    await expect(
      gateBuiltinTool({
        ...call,
        // oxlint-disable-next-line ai-sdk/no-as-unknown-as -- intentionally invalid value for a runtime validation test.
        input: { when: new Date() } as unknown as JSONValue,
      }),
    ).rejects.toThrow(
      'HarnessAgent.gateBuiltinTool: `input` must be a JSON value.',
    );
    expect(await readEffectEvents({ log, type: 'effect-start' })).toEqual([]);
  });

  test('rejects reported values that cannot be recorded and keeps the call open', async () => {
    const { log, gateBuiltinTool } = await setup();
    const approved = getApproved(await gateBuiltinTool(call));

    await expect(
      // oxlint-disable-next-line ai-sdk/no-as-unknown-as -- intentionally invalid value for a runtime validation test.
      approved.partial({ raw: new Date() as unknown as JSONValue }),
    ).rejects.toThrow(
      'HarnessAgent.gateBuiltinTool: `raw` must be a JSON value.',
    );
    await expect(
      approved.result({
        raw: 'value',
        modelOutput: {
          type: 'json',
          // oxlint-disable-next-line ai-sdk/no-as-unknown-as -- intentionally invalid value for a runtime validation test.
          value: (() => {}) as unknown as JSONValue,
        },
      }),
    ).rejects.toThrow(
      'HarnessAgent.gateBuiltinTool: `modelOutput` must be serializable.',
    );
    expect(await readEffectEvents({ log, type: 'effect-progress' })).toEqual(
      [],
    );

    await approved.result({ raw: 'value' });
    expect(await readEffectEvents({ log, type: 'effect-end' })).toEqual([
      {
        startId: expect.any(String),
        output: { type: 'result', value: { raw: 'value' } },
      },
    ]);
  });

  test('rejects a second gate call for a call that is still open', async () => {
    const { gateBuiltinTool } = await setup();
    getApproved(await gateBuiltinTool(call));

    await expect(gateBuiltinTool(call)).rejects.toThrow(
      'HarnessAgent.effect: the effect is already running.',
    );
  });
});
