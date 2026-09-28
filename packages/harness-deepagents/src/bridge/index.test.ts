import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type DeepAgentOptions = {
  tools?: Array<{
    name: string;
    invoke: (input: Record<string, unknown>) => Promise<unknown>;
  }>;
  middleware?: Array<{
    name?: string;
    wrapModelCall?: (request: any, handler: any) => Promise<unknown>;
  }>;
  model?: unknown;
  systemPrompt?: string | { suffix?: string };
};

type ChatAnthropicOptions = {
  model?: string;
  thinking?: unknown;
  outputConfig?: unknown;
  clientOptions?: {
    defaultHeaders?: Record<string, string>;
  };
};

const state = vi.hoisted(() => ({
  createDeepAgentOptions: [] as DeepAgentOptions[],
  originalArgv: [] as string[],
  responseFormat: undefined as
    | { type: 'json'; schema: Record<string, unknown> }
    | undefined,
  headers: undefined as Record<string, string> | undefined,
  hostToolResponse: undefined as
    | { output: unknown; isError?: boolean }
    | undefined,
  hostToolOutput: undefined as unknown,
  receivedToolCallId: undefined as string | undefined,
  emitted: [] as Array<Record<string, unknown>>,
}));

vi.mock('deepagents', () => ({
  createDeepAgent: (options: DeepAgentOptions) => {
    state.createDeepAgentOptions.push(options);
    return {
      streamEvents: async function* () {
        if (state.hostToolResponse !== undefined) {
          const hostTool = options.tools?.find(tool => tool.name === 'weather');
          if (!hostTool)
            throw new Error('Weather host tool was not registered');
          yield {
            event: 'on_tool_start',
            name: 'weather',
            run_id: 'langchain-run-id',
            data: { input: { city: 'Berlin' } },
          };
          state.hostToolOutput = await hostTool.invoke({ city: 'Berlin' });
          yield {
            event: 'on_tool_end',
            name: 'weather',
            run_id: 'langchain-run-id',
            data: { output: state.hostToolOutput },
          };
        }
      },
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
        thinking: { type: 'adaptive', display: 'summarized' },
        effort: 'max',
        tools:
          state.hostToolResponse === undefined
            ? []
            : [
                {
                  name: 'weather',
                  inputSchema: {
                    type: 'object',
                    properties: { city: { type: 'string' } },
                    required: ['city'],
                  },
                },
              ],
        responseFormat: state.responseFormat,
        headers: state.headers,
      },
      {
        emit: (event: Record<string, unknown>) => {
          state.emitted.push(event);
        },
        requestToolResult: async (toolCallId: string) => {
          state.receivedToolCallId = toolCallId;
          return state.hostToolResponse ?? { output: {} };
        },
        requestToolApproval: async () => ({ approved: true }),
        abortSignal: new AbortController().signal,
      },
    );
  },
}));

vi.mock('@langchain/anthropic', () => ({
  ChatAnthropic: class {
    model?: string;
    outputConfig?: unknown;
    thinking?: unknown;
    clientOptions?: {
      defaultHeaders?: Record<string, string>;
    };

    constructor(options: ChatAnthropicOptions) {
      this.model = options.model;
      this.outputConfig = options.outputConfig;
      this.thinking = options.thinking;
      this.clientOptions = options.clientOptions;
    }
  },
}));

vi.mock('@langchain/core/messages', () => ({
  AIMessage: { isInstance: () => false },
  ToolMessage: class {},
}));

vi.mock('@langchain/core/tools', () => ({
  tool: vi.fn((...args: unknown[]) => {
    const [invoke, config] = args as [
      (input: Record<string, unknown>) => Promise<unknown>,
      { name: string },
    ];
    return { name: config.name, invoke };
  }),
}));

vi.mock('@langchain/langgraph', () => ({
  Command: class {},
  MemorySaver: class {},
}));

vi.mock('@langchain/mcp-adapters', () => ({
  MultiServerMCPClient: class {},
}));

vi.mock('langchain', () => ({
  createMiddleware: <Middleware>(middleware: Middleware) => middleware,
  toolStrategy: (schema: Record<string, unknown>) => [
    {
      kind: 'tool-strategy',
      name: 'StructuredOutput',
      schema,
    },
  ],
}));

describe('Deep Agents bridge instructions', () => {
  beforeEach(() => {
    state.createDeepAgentOptions = [];
    state.responseFormat = undefined;
    state.headers = undefined;
    state.hostToolResponse = undefined;
    state.hostToolOutput = undefined;
    state.receivedToolCallId = undefined;
    state.emitted = [];
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
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('appends instructions to the native system prompt', async () => {
    await import('./index');

    expect(state.createDeepAgentOptions[0]?.systemPrompt).toEqual({
      suffix: 'Answer every question in German.',
    });
  });

  it('configures reasoning on the default Deep Agents model', async () => {
    await import('./index');

    const { ChatAnthropic } = await import('@langchain/anthropic');
    const resolvedModel = new ChatAnthropic({
      model: 'upstream-selected-model',
    });
    const handler = vi.fn(async request => request.model);
    const wrapModelCall = state.createDeepAgentOptions[0]?.middleware?.find(
      middleware => middleware.name === 'harnessModel',
    )?.wrapModelCall;

    expect(state.createDeepAgentOptions[0]?.model).toBeUndefined();
    expect(wrapModelCall).toBeDefined();
    await wrapModelCall!(
      {
        model: {
          _getModelInstance: async () => resolvedModel,
        },
      },
      handler,
    );
    const configuredModel = handler.mock.calls[0]?.[0].model;
    expect(configuredModel).not.toBe(resolvedModel);
    expect(configuredModel).toMatchObject({
      model: 'upstream-selected-model',
      outputConfig: { effort: 'max' },
      thinking: { type: 'adaptive', display: 'summarized' },
    });
    expect(handler).toHaveBeenCalledWith({ model: configuredModel });
  });

  it('passes headers to a direct Anthropic client', async () => {
    state.headers = { 'x-tenant': 'acme' };
    vi.stubEnv('ANTHROPIC_API_KEY', 'anthropic-key');

    await import('./index');

    const { ChatAnthropic } = await import('@langchain/anthropic');
    const resolvedModel = new ChatAnthropic({
      model: 'upstream-selected-model',
    });
    const handler = vi.fn(async request => request.model);
    const wrapModelCall = state.createDeepAgentOptions[0]?.middleware?.find(
      middleware => middleware.name === 'harnessModel',
    )?.wrapModelCall;

    await wrapModelCall!(
      {
        model: {
          _getModelInstance: async () => resolvedModel,
        },
      },
      handler,
    );

    expect(handler.mock.calls[0]?.[0].model).toMatchObject({
      clientOptions: {
        defaultHeaders: {
          'x-tenant': 'acme',
        },
      },
    });
  });

  it('applies the requested JSON schema for the active turn', async () => {
    const schema = {
      type: 'object',
      properties: { answer: { type: 'string' } },
      required: ['answer'],
    };
    state.responseFormat = { type: 'json', schema };

    await import('./index');

    const wrapModelCall = state.createDeepAgentOptions[0]?.middleware?.find(
      middleware => middleware.name === 'HarnessResponseFormat',
    )?.wrapModelCall;
    const handler = vi.fn(async request => request);
    await wrapModelCall?.({ model: 'model' }, handler);

    expect(handler).toHaveBeenCalledWith({
      model: 'model',
      responseFormat: [
        { kind: 'tool-strategy', name: 'StructuredOutput', schema },
      ],
    });
  });

  async function expectHostToolResult({
    output,
    isError,
  }: {
    output?: unknown;
    isError?: boolean;
  }) {
    state.hostToolResponse = { output, isError };

    await import('./index');

    const toolCallId = state.receivedToolCallId;
    expect(toolCallId).toMatch(/^weather-/);
    expect(state.emitted.filter(event => event.type === 'tool-call')).toEqual([
      {
        type: 'tool-call',
        toolCallId,
        toolName: 'weather',
        input: '{"city":"Berlin"}',
        providerExecuted: false,
      },
    ]);
    expect(state.emitted.filter(event => event.type === 'tool-result')).toEqual(
      [
        {
          type: 'tool-result',
          toolCallId,
          toolName: 'weather',
          result: output ?? null,
          ...(isError !== undefined ? { isError } : {}),
        },
      ],
    );
    expect(state.hostToolOutput).toBe(
      typeof output === 'string' ? output : JSON.stringify(output),
    );
  }

  it('emits one successful host-tool result without duplicating on_tool_end', async () => {
    await expectHostToolResult({ output: { temperature: 18 }, isError: false });
  });

  it('emits one errored host-tool result without duplicating on_tool_end', async () => {
    await expectHostToolResult({
      output: { error: 'Tool input validation failed.' },
      isError: true,
    });
  });

  it('emits null when the host-tool output is absent', async () => {
    await expectHostToolResult({});
  });
});
