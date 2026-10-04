import { afterEach, beforeEach, expect, test, vi } from 'vitest';

type QueryArgs = {
  prompt: AsyncIterable<unknown>;
};

const state = vi.hoisted(() => ({
  emitted: [] as Record<string, unknown>[],
  frames: [] as Record<string, unknown>[],
  originalArgv: [] as string[],
}));

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: (args: QueryArgs) =>
    (async function* () {
      const initial = await args.prompt[Symbol.asyncIterator]().next();
      const promptUuid = Reflect.get(initial.value as object, 'uuid') as string;

      for (const frame of state.frames) {
        yield JSON.parse(
          JSON.stringify(frame).split('$PROMPT').join(promptUuid),
        );
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
          pendingCount: 0,
          close: () => {},
          [Symbol.asyncIterator]: async function* () {},
        },
        firstTurn: false,
        emit: (event: Record<string, unknown>) => state.emitted.push(event),
        emitWarning: () => {},
        emitError: () => {},
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

beforeEach(() => {
  state.emitted = [];
  state.frames = [];
  state.originalArgv = [...process.argv];
  process.argv.splice(
    0,
    process.argv.length,
    'node',
    'bridge.mjs',
    '--workdir',
    '/tmp/harness-claude-code-reproduction/work',
    '--bridge-state-dir',
    '/tmp/harness-claude-code-reproduction/state',
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
});
