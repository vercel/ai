import { beforeAll, describe, expect, it, vi } from 'vitest';

const runtime = {
  events: vi.fn(() =>
    (async function* () {
      yield {
        ev: 'tool_start',
        session_id: 'native-session',
        call_id: 'call-1',
        name: 'weather',
      };
      yield {
        ev: 'tool_input_delta',
        session_id: 'native-session',
        call_id: 'call-1',
        delta: '{"city":"Paris"}',
      };
      yield {
        ev: 'tool_exec',
        session_id: 'native-session',
        call_id: 'call-1',
        name: 'weather',
      };
      yield {
        ev: 'external_tool_call',
        session_id: 'native-session',
        root_session_id: 'native-session',
        call_id: 'call-1',
        catalog_revision: 1,
        name: 'weather',
        input: { city: 'Paris' },
      };
      yield {
        ev: 'tool_done',
        session_id: 'native-session',
        call_id: 'call-1',
        name: 'weather',
        output: '{"temperature":21}',
      };
      yield { ev: 'turn_done', session_id: 'native-session' };
    })(),
  ),
  createSession: vi.fn(async () => ({ session_id: 'native-session' })),
  setExternalTools: vi.fn(async () => {}),
  sendMessage: vi.fn(async () => {}),
  submitExternalToolResult: vi.fn(async () => {}),
};
let onStart: (start: any, turn: any) => Promise<void>;

vi.mock('@1jehuang/jcode-sdk', () => ({
  JcodeClient: { launch: vi.fn(async () => runtime) },
}));
vi.mock('@ai-sdk/harness/bridge', () => ({
  runBridge: vi.fn(async (options: { onStart: typeof onStart }) => {
    onStart = options.onStart;
  }),
}));
vi.mock('node:process', () => ({
  argv: [
    'node',
    'bridge',
    '--workdir',
    '/work',
    '--bridgeStateDir',
    '/state',
    '--jcodeHome',
    '/home',
  ],
}));

beforeAll(async () => {
  await import('./index');
});

describe('Jcode bridge runtime', () => {
  it('forwards external tool calls and results', async () => {
    const emit = vi.fn();
    await onStart(
      {
        type: 'start',
        prompt: 'hello',
        tools: [{ name: 'weather', inputSchema: { type: 'object' } }],
      },
      {
        emit,
        requestToolResult: vi.fn(async () => ({
          output: { temperature: 21 },
          isError: false,
        })),
        abortSignal: new AbortController().signal,
      },
    );

    expect(runtime.setExternalTools).toHaveBeenCalledWith('native-session', [
      {
        name: 'weather',
        description: '',
        input_schema: { type: 'object' },
      },
    ]);
    expect(emit).toHaveBeenCalledWith({
      type: 'tool-call',
      toolCallId: 'call-1',
      toolName: 'weather',
      input: '{"city":"Paris"}',
      providerExecuted: false,
      dynamic: false,
    });
    expect(runtime.submitExternalToolResult).toHaveBeenCalledWith(
      'native-session',
      {
        call_id: 'call-1',
        output: { temperature: 21 },
        is_error: false,
      },
    );
    expect(emit).toHaveBeenCalledWith({
      type: 'tool-result',
      toolCallId: 'call-1',
      toolName: 'weather',
      result: { temperature: 21 },
    });
  });
});
