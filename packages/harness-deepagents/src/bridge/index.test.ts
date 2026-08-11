import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type DeepAgentOptions = {
  systemPrompt?: string | { suffix?: string };
};

const state = vi.hoisted(() => ({
  createDeepAgentOptions: [] as DeepAgentOptions[],
  originalArgv: [] as string[],
}));

vi.mock('deepagents', () => ({
  createDeepAgent: (options: DeepAgentOptions) => {
    state.createDeepAgentOptions.push(options);
    return {
      streamEvents: async () => [],
      getState: async () => ({ tasks: [] }),
    };
  },
  LocalShellBackend: class {},
}));

vi.mock('@ai-sdk/harness/bridge', () => ({
  runBridge: async ({
    onStart,
  }: {
    onStart: (start: unknown, turn: unknown) => Promise<void>;
  }) => {
    await onStart(
      {
        prompt: 'What is the capital of France?',
        instructions: 'Answer every question in German.',
        tools: [],
      },
      {
        emit: () => {},
        requestToolResult: async () => ({ output: {} }),
        requestToolApproval: async () => ({ approved: true }),
        abortSignal: new AbortController().signal,
      },
    );
  },
}));

vi.mock('@langchain/anthropic', () => ({
  ChatAnthropic: class {},
}));

vi.mock('@langchain/core/messages', () => ({
  AIMessage: { isInstance: () => false },
  ToolMessage: class {},
}));

vi.mock('@langchain/core/tools', () => ({
  tool: vi.fn(),
}));

vi.mock('@langchain/langgraph', () => ({
  Command: class {},
  MemorySaver: class {},
}));

vi.mock('@langchain/mcp-adapters', () => ({
  MultiServerMCPClient: class {},
}));

describe('Deep Agents bridge instructions', () => {
  beforeEach(() => {
    state.createDeepAgentOptions = [];
    state.originalArgv = [...process.argv];
    process.argv.splice(
      0,
      process.argv.length,
      'node',
      'bridge.mjs',
      '--workdir',
      '/tmp/harness-deepagents-test/work',
      '--bridge-state-dir',
      '/tmp/harness-deepagents-test/state',
    );
  });

  afterEach(() => {
    process.argv.splice(0, process.argv.length, ...state.originalArgv);
    vi.resetModules();
  });

  it('appends instructions to the native system prompt', async () => {
    await import('./index');

    expect(state.createDeepAgentOptions[0]?.systemPrompt).toEqual({
      suffix: 'Answer every question in German.',
    });
  });
});
