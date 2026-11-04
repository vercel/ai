import { afterEach, beforeEach, expect, test, vi } from 'vitest';

type QueryArgs = {
  prompt: AsyncIterable<unknown>;
  options: { abortSignal: AbortSignal };
};

const state = vi.hoisted(() => ({
  emitted: [] as Record<string, unknown>[],
  frames: [] as Record<string, unknown>[],
  lastReadFrame: -1,
  steering: false,
  steeringSettled: false,
  acceptSteering: vi.fn(),
  rejectSteering: vi.fn(),
  closeUserMessages: vi.fn(),
  disposeQuery: vi.fn(),
  emitError: vi.fn(),
  originalArgv: [] as string[],
}));

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: (args: QueryArgs) =>
    (async function* () {
      try {
        const input = args.prompt[Symbol.asyncIterator]();
        const initial = await input.next();
        const promptUuid = Reflect.get(
          initial.value as object,
          'uuid',
        ) as string;
        if (state.steering) await input.next();

        for (const [index, frame] of state.frames.entries()) {
          state.lastReadFrame = index;
          yield JSON.parse(
            JSON.stringify(frame).split('$PROMPT').join(promptUuid),
          );
        }
        if (!args.options.abortSignal.aborted) {
          await new Promise<void>(resolve => {
            args.options.abortSignal.addEventListener(
              'abort',
              () => resolve(),
              {
                once: true,
              },
            );
          });
        }
      } finally {
        state.disposeQuery();
      }
    })(),
}));

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: class {
    registerTool(): void {}
  },
}));

vi.mock('@ai-sdk/harness/bridge', () => ({
  runBridge: async ({
    onStart,
  }: {
    onStart: (start: unknown, turn: unknown) => Promise<void>;
  }) => {
    await onStart(
      {
        prompt:
          'Run `date +%s >> /tmp/repro.txt`, then reply with exactly DONE.',
      },
      {
        abortSignal: new AbortController().signal,
        experimental_userMessages: {
          get pendingCount() {
            return state.steering && !state.steeringSettled ? 1 : 0;
          },
          close: state.closeUserMessages,
          [Symbol.asyncIterator]: async function* () {
            if (!state.steering) return;
            yield {
              messageId: 'steering-message',
              text: 'Actually, reply STEERED.',
              accept: () => {
                state.steeringSettled = true;
                state.acceptSteering();
              },
              reject: (error: unknown) => {
                state.steeringSettled = true;
                state.rejectSteering(error);
              },
            };
          },
        },
        firstTurn: false,
        emit: (event: Record<string, unknown>) => state.emitted.push(event),
        emitWarning: () => {},
        emitError: state.emitError,
        requestToolResult: async () => ({ output: {} }),
        requestToolApproval: async () => ({ approved: true }),
      },
    );
  },
}));

const zeroUsage = {
  input_tokens: 0,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
  output_tokens: 0,
};

const promptQueued = {
  type: 'command_lifecycle',
  command_uuid: '$PROMPT',
  state: 'queued',
};

const notificationResult = {
  type: 'result',
  subtype: 'success',
  is_error: false,
  result: '',
  num_turns: 0,
  usage: zeroUsage,
  origin: { kind: 'task-notification' },
};

const promptResult = {
  type: 'result',
  subtype: 'success',
  is_error: false,
  result: 'DONE',
  usage: { ...zeroUsage, output_tokens: 203 },
  user_message_uuid: '$PROMPT',
};

const finish = () => state.emitted.find(event => event.type === 'finish');

beforeEach(() => {
  state.emitted = [];
  state.frames = [];
  state.lastReadFrame = -1;
  state.steering = false;
  state.steeringSettled = false;
  state.acceptSteering.mockClear();
  state.rejectSteering.mockClear();
  state.closeUserMessages.mockClear();
  state.disposeQuery.mockClear();
  state.emitError.mockClear();
  state.originalArgv = [...process.argv];
  process.argv.splice(
    0,
    process.argv.length,
    'node',
    'bridge.mjs',
    '--workdir',
    '/tmp/harness-claude-code-test/work',
    '--bridge-state-dir',
    '/tmp/harness-claude-code-test/state',
  );
});

afterEach(() => {
  process.argv.splice(0, process.argv.length, ...state.originalArgv);
  vi.resetModules();
});

test('waits for the host prompt result after a queued task-notification result', async () => {
  state.frames = [
    {
      type: 'system',
      subtype: 'task_notification',
      status: 'stopped',
      summary:
        "Background shell command didn't finish before the previous session ended",
    },
    {
      type: 'command_lifecycle',
      command_uuid: '$PROMPT',
      state: 'queued',
    },
    {
      type: 'system',
      subtype: 'init',
      model: 'claude-sonnet-4-5',
    },
    {
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: '',
      num_turns: 0,
      usage: zeroUsage,
      origin: { kind: 'task-notification' },
      result_index: 0,
    },
    {
      type: 'command_lifecycle',
      command_uuid: '$PROMPT',
      state: 'started',
    },
    {
      type: 'stream_event',
      event: {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      },
    },
    {
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'DONE' },
      },
    },
    {
      type: 'stream_event',
      event: { type: 'content_block_stop', index: 0 },
    },
    {
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: 'DONE',
      num_turns: 1,
      usage: {
        input_tokens: 18,
        cache_creation_input_tokens: 551,
        cache_read_input_tokens: 74415,
        output_tokens: 203,
      },
      user_message_uuid: '$PROMPT',
      user_message_uuids: ['$PROMPT'],
      result_index: 1,
    },
  ];

  await import('./index');

  const text = state.emitted
    .filter(event => event.type === 'text-delta')
    .map(event => event.delta)
    .join('');
  expect(text).toBe('DONE');
  expect(state.lastReadFrame).toBe(state.frames.length - 1);
  expect(finish()).toMatchObject({
    totalUsage: { outputTokens: { total: 203 } },
  });
  expect(state.disposeQuery).toHaveBeenCalledOnce();
  expect(state.closeUserMessages).toHaveBeenCalledOnce();
});

test('skips task-notification results even before the CLI echoes the prompt UUID', async () => {
  state.frames = [notificationResult, promptQueued, promptResult];

  await import('./index');

  expect(state.lastReadFrame).toBe(2);
  expect(finish()).toMatchObject({
    totalUsage: { outputTokens: { total: 203 } },
  });
});

test('accepts a task-notification result that consumed the host prompt', async () => {
  state.frames = [
    { ...promptResult, origin: { kind: 'task-notification' } },
    notificationResult,
  ];

  await import('./index');

  expect(state.lastReadFrame).toBe(0);
  expect(finish()).toMatchObject({
    totalUsage: { outputTokens: { total: 203 } },
  });
});

test.each([
  {},
  { user_message_uuid: 'another-command' },
  { user_message_uuids: ['another-command'] },
  { user_message_uuids: null },
])(
  'skips unrelated results after a host lifecycle echo: %j',
  async attribution => {
    state.frames = [
      promptQueued,
      {
        ...notificationResult,
        origin: { kind: 'other-command' },
        usage: { ...zeroUsage, output_tokens: 7 },
        ...attribution,
      },
      { ...promptQueued, state: 'started' },
      promptResult,
    ];

    await import('./index');

    expect(state.lastReadFrame).toBe(3);
    expect(finish()).toMatchObject({
      totalUsage: { outputTokens: { total: 210 } },
    });
  },
);

test.each([
  { user_message_uuid: '$PROMPT' },
  { user_message_uuids: ['$PROMPT'] },
  {
    user_message_uuid: 'another-command',
    user_message_uuids: ['another-command', '$PROMPT'],
  },
])('accepts a prompt result attributed by UUID: %j', async attribution => {
  state.frames = [
    promptQueued,
    notificationResult,
    { ...promptResult, user_message_uuid: undefined, ...attribution },
    notificationResult,
  ];

  await import('./index');

  expect(state.lastReadFrame).toBe(2);
  expect(finish()).toBeDefined();
});

test.each(['cancelled', 'discarded'])(
  'ends the turn when the initial prompt is %s after a notification result',
  async lifecycleState => {
    state.frames = [
      promptQueued,
      notificationResult,
      { ...promptQueued, state: lifecycleState },
      promptResult,
    ];

    await import('./index');

    expect(state.lastReadFrame).toBe(2);
    expect(finish()).toBeDefined();
    expect(state.disposeQuery).toHaveBeenCalledOnce();
  },
);

test('does not treat a completed lifecycle as the prompt result', async () => {
  state.frames = [
    promptQueued,
    notificationResult,
    { ...promptQueued, state: 'completed' },
    promptResult,
  ];

  await import('./index');

  expect(state.lastReadFrame).toBe(3);
  expect(finish()).toBeDefined();
});

test('ends on the first successful result when the CLI echoes no host UUIDs', async () => {
  state.frames = [
    {
      ...promptResult,
      user_message_uuid: undefined,
    },
    promptResult,
  ];

  await import('./index');

  expect(state.lastReadFrame).toBe(0);
  expect(finish()).toBeDefined();
});

test('skips known notifications before an unattributed legacy prompt result', async () => {
  state.frames = [
    notificationResult,
    { ...promptResult, user_message_uuid: undefined },
    notificationResult,
  ];

  await import('./index');

  expect(state.lastReadFrame).toBe(1);
  expect(finish()).toMatchObject({
    totalUsage: { outputTokens: { total: 203 } },
  });
});

test('waits for an accepted steering message result after the prompt result', async () => {
  state.steering = true;
  state.frames = [
    promptQueued,
    notificationResult,
    { ...promptQueued, command_uuid: 'steering-message' },
    promptResult,
    {
      ...promptResult,
      result: 'STEERED',
      user_message_uuid: 'steering-message',
    },
    {
      ...promptQueued,
      command_uuid: 'steering-message',
      state: 'completed',
    },
    notificationResult,
  ];

  await import('./index');

  expect(state.lastReadFrame).toBe(5);
  expect(state.acceptSteering).toHaveBeenCalledOnce();
  expect(finish()).toMatchObject({
    totalUsage: { outputTokens: { total: 406 } },
  });
});

test.each([
  { subtype: 'success', is_error: true, result: 'Request rejected' },
  { subtype: 'error_during_execution', errors: ['Request rejected'] },
])('still reports terminal errors from unrelated results: %j', async result => {
  state.frames = [promptQueued, { ...notificationResult, ...result }];

  await import('./index');

  expect(state.emitError).toHaveBeenCalledWith({
    error: 'Request rejected',
    message: 'claude-code terminal error',
  });
  expect(finish()).toBeUndefined();
  expect(state.disposeQuery).toHaveBeenCalledOnce();
});
