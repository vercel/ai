import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

type AppServerOptions = {
  start: {
    tools?: Array<Record<string, unknown>>;
    responseFormat?: { type: 'json'; schema: Record<string, unknown> };
    reasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  };
  threadId: string | undefined;
  codexModel: string | undefined;
  codexConfig: Record<string, unknown>;
  emitStreamEvent(event: { type: 'thread.started'; thread_id: string }): void;
};

const CODEX_ENV_KEYS = [
  'AI_GATEWAY_API_KEY',
  'AI_GATEWAY_BASE_URL',
  'OPENAI_BASE_URL',
  'CODEX_API_KEY',
] as const;

const state = vi.hoisted(() => ({
  startModel: 'gpt-5.5',
  startResponseFormat: undefined as
    | { type: 'json'; schema: Record<string, unknown> }
    | undefined,
  startInstructions: undefined as string | undefined,
  startReasoningEffort: undefined as
    | 'low'
    | 'medium'
    | 'high'
    | 'xhigh'
    | 'max'
    | undefined,
  startResumeThreadId: undefined as string | undefined,
  startRestartThread: false,
  startCodexConfig: undefined as Record<string, unknown> | undefined,
  startMcpServers: undefined as Record<string, unknown> | undefined,
  startHeaders: undefined as Record<string, string> | undefined,
  startTools: [
    {
      name: 'get_weather',
      description: 'Get the weather.',
      inputSchema: { type: 'object' },
    },
  ] as Array<Record<string, unknown>>,
  appServerOptions: [] as AppServerOptions[],
  appServerError: undefined as Error | undefined,
  appServerClosed: 0,
  runSecondTurn: false,
  stoppedData: undefined as unknown,
  emittedErrors: [] as unknown[],
  originalArgv: [] as string[],
  originalEnv: {} as Record<
    (typeof CODEX_ENV_KEYS)[number],
    string | undefined
  >,
}));

vi.mock('@ai-sdk/harness/bridge', () => ({
  runBridge: async ({
    onStart,
    onStop,
    onDestroy,
  }: {
    onStart: (start: unknown, turn: unknown) => Promise<void>;
    onStop: () => Promise<unknown>;
    onDestroy: () => Promise<void>;
  }) => {
    const start = {
      prompt: 'Use the weather tool.',
      responseFormat: state.startResponseFormat,
      ...(state.startInstructions
        ? { instructions: state.startInstructions }
        : {}),
      ...(state.startReasoningEffort
        ? { reasoningEffort: state.startReasoningEffort }
        : {}),
      ...(state.startResumeThreadId
        ? { resumeThreadId: state.startResumeThreadId }
        : {}),
      ...(state.startRestartThread ? { restartThread: true } : {}),
      model: state.startModel,
      codexConfig: state.startCodexConfig,
      mcpServers: state.startMcpServers,
      headers: state.startHeaders,
      tools: state.startTools,
    };
    const turn = {
      emit: () => {},
      emitError: (error: unknown) => state.emittedErrors.push(error),
      requestToolResult: async () => ({ output: {} }),
      abortSignal: new AbortController().signal,
      experimental_userMessages: {
        pendingCount: 0,
        close: () => {},
        [Symbol.asyncIterator]: async function* () {},
      },
    };
    await onStart(start, turn);
    if (state.runSecondTurn) {
      await onStart({ ...start, resumeThreadId: undefined }, turn);
      state.stoppedData = await onStop();
      await onDestroy();
    }
  },
}));

vi.mock('./codex-app-server-driver', () => ({
  createCodexAppServerRuntime: () => ({
    runTurn: async (options: AppServerOptions) => {
      state.appServerOptions.push(options);
      if (state.appServerError != null) throw state.appServerError;
      options.emitStreamEvent({
        type: 'thread.started',
        thread_id: 'app-server-thread',
      });
    },
    close: async () => {
      state.appServerClosed++;
    },
  }),
}));

describe('Codex bridge config', () => {
  beforeEach(() => {
    state.startModel = 'gpt-5.5';
    state.startResponseFormat = undefined;
    state.startInstructions = undefined;
    state.startReasoningEffort = undefined;
    state.startResumeThreadId = undefined;
    state.startRestartThread = false;
    state.startCodexConfig = undefined;
    state.startMcpServers = undefined;
    state.startHeaders = undefined;
    state.startTools = [
      {
        name: 'get_weather',
        description: 'Get the weather.',
        inputSchema: { type: 'object' },
      },
    ];
    state.appServerOptions = [];
    state.appServerError = undefined;
    state.appServerClosed = 0;
    state.runSecondTurn = false;
    state.stoppedData = undefined;
    state.emittedErrors = [];
    state.originalArgv = [...process.argv];
    state.originalEnv = Object.fromEntries(
      CODEX_ENV_KEYS.map(key => [key, process.env[key]]),
    ) as Record<(typeof CODEX_ENV_KEYS)[number], string | undefined>;
    for (const key of CODEX_ENV_KEYS) {
      delete process.env[key];
    }
    process.argv.splice(
      0,
      process.argv.length,
      'node',
      'bridge.mjs',
      '--workdir',
      '/tmp/harness-codex-test/work',
      '--bridge-state-dir',
      '/tmp/harness-codex-test/state',
    );
  });

  afterEach(() => {
    process.argv.splice(0, process.argv.length, ...state.originalArgv);
    for (const key of CODEX_ENV_KEYS) {
      const value = state.originalEnv[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    vi.resetModules();
  });

  test('always runs turns through app-server', async () => {
    state.startTools = [];

    await import('./index');

    expect(state.appServerOptions).toHaveLength(1);
    expect(state.appServerOptions[0]?.start.tools).toEqual([]);
  });

  test('reuses one runtime for turns and closes on stop and destroy', async () => {
    state.runSecondTurn = true;

    await import('./index');

    expect(state.appServerOptions).toHaveLength(2);
    expect(state.appServerOptions[1]?.threadId).toBe('app-server-thread');
    expect(state.stoppedData).toEqual({ threadId: 'app-server-thread' });
    expect(state.appServerClosed).toBe(2);
  });

  test('passes host tools to app-server without registering them as MCP servers', async () => {
    await import('./index');

    expect(state.appServerOptions[0]?.start.tools).toEqual(state.startTools);
    expect(state.appServerOptions[0]?.codexConfig.mcp_servers).toBeUndefined();
  });

  test('passes configured MCP servers to app-server', async () => {
    state.startMcpServers = {
      context7: { url: 'https://mcp.context7.com/mcp' },
    };

    await import('./index');

    expect(state.appServerOptions[0]?.codexConfig.mcp_servers).toEqual(
      state.startMcpServers,
    );
  });

  test('passes through native config without mutating it and preserves adapter-owned values', async () => {
    const codexConfig = {
      model_verbosity: 'low',
      features: { multi_agent: false },
      developer_instructions: 'Caller instructions.',
      model_reasoning_summary: 'none',
    };
    state.startCodexConfig = codexConfig;

    await import('./index');

    expect(state.appServerOptions[0]?.codexConfig).not.toBe(codexConfig);
    expect(state.appServerOptions[0]?.codexConfig).toMatchInlineSnapshot(`
      {
        "developer_instructions": "Only respond with your \`final\` message once you have fully addressed the user request.",
        "features": {
          "multi_agent": false,
        },
        "model_reasoning_summary": "detailed",
        "model_verbosity": "low",
      }
    `);
    expect(codexConfig).toMatchInlineSnapshot(`
      {
        "developer_instructions": "Caller instructions.",
        "features": {
          "multi_agent": false,
        },
        "model_reasoning_summary": "none",
        "model_verbosity": "low",
      }
    `);
  });

  test.each(['xhigh', 'max'] as const)(
    'passes %s reasoning effort to app-server',
    async reasoningEffort => {
      state.startReasoningEffort = reasoningEffort;

      await import('./index');

      expect(state.appServerOptions[0]?.start.reasoningEffort).toBe(
        reasoningEffort,
      );
    },
  );

  test('configures a direct OpenAI endpoint', async () => {
    process.env.CODEX_API_KEY = 'CODEX_API_KEY';
    process.env.OPENAI_BASE_URL = 'https://api.openai.com/v1';

    await import('./index');

    expect(state.appServerOptions[0]?.codexConfig).toMatchObject({
      model_provider: 'agent_bridge_openai',
      model_providers: {
        agent_bridge_openai: {
          base_url: 'https://api.openai.com/v1',
          env_key: 'CODEX_API_KEY',
          supports_websockets: false,
        },
      },
      preferred_auth_method: 'apikey',
    });
  });

  test('configures direct API key auth without an explicit base URL', async () => {
    process.env.CODEX_API_KEY = 'CODEX_API_KEY';

    await import('./index');

    expect(state.appServerOptions[0]?.codexConfig.model_providers)
      .toMatchInlineSnapshot(`
      {
        "agent_bridge_openai": {
          "base_url": "https://api.openai.com/v1",
          "env_key": "CODEX_API_KEY",
          "name": "Agent Bridge OpenAI",
          "supports_websockets": false,
          "wire_api": "responses",
        },
      }
    `);
  });

  test('injects session instructions as developer instructions', async () => {
    state.startInstructions = 'Answer every question in German.';

    await import('./index');

    expect(state.appServerOptions[0]?.codexConfig.developer_instructions).toBe(
      'Answer every question in German.\n\n' +
        'Only respond with your `final` message once you have fully addressed the user request.',
    );
  });

  test('starts a fresh thread when the host requests a configuration restart', async () => {
    state.startResumeThreadId = 'thread-previous';
    state.startRestartThread = true;

    await import('./index');

    expect(state.appServerOptions[0]?.threadId).toBeUndefined();
  });

  test('resumes an app-server thread by id', async () => {
    state.startResumeThreadId = 'thread-previous';

    await import('./index');

    expect(state.appServerOptions[0]?.threadId).toBe('thread-previous');
  });

  test('uses the creator-qualified model and forces summaries for AI Gateway', async () => {
    process.env.AI_GATEWAY_API_KEY = 'gateway-key';
    process.env.AI_GATEWAY_BASE_URL = 'https://ai-gateway.test/v1';

    await import('./index');

    expect({
      model: state.appServerOptions[0]?.codexModel,
      reasoningSummary:
        state.appServerOptions[0]?.codexConfig.model_reasoning_summary,
      supportsReasoningSummaries:
        state.appServerOptions[0]?.codexConfig
          .model_supports_reasoning_summaries,
    }).toMatchInlineSnapshot(`
      {
        "model": "openai/gpt-5.5",
        "reasoningSummary": "detailed",
        "supportsReasoningSummaries": true,
      }
    `);
  });

  test('passes headers to a direct model provider', async () => {
    state.startHeaders = { 'x-tenant': 'acme' };
    process.env.CODEX_API_KEY = 'openai-key';

    await import('./index');

    expect(state.appServerOptions[0]?.codexConfig.model_providers)
      .toMatchInlineSnapshot(`
      {
        "agent_bridge_openai": {
          "base_url": "https://api.openai.com/v1",
          "env_key": "CODEX_API_KEY",
          "http_headers": {
            "x-tenant": "acme",
          },
          "name": "Agent Bridge OpenAI",
          "supports_websockets": false,
          "wire_api": "responses",
        },
      }
    `);
  });

  test('preserves creator-qualified AI Gateway model ids', async () => {
    state.startModel = 'openai/gpt-5.5';
    process.env.AI_GATEWAY_API_KEY = 'gateway-key';
    process.env.AI_GATEWAY_BASE_URL = 'https://ai-gateway.test/v1';

    await import('./index');

    expect(state.appServerOptions[0]?.codexModel).toBe('openai/gpt-5.5');
  });

  test('passes the requested JSON schema to app-server', async () => {
    state.startResponseFormat = {
      type: 'json',
      schema: {
        type: 'object',
        properties: { answer: { type: 'string' } },
        required: ['answer'],
      },
    };

    await import('./index');

    expect(state.appServerOptions[0]?.start.responseFormat?.schema).toEqual(
      state.startResponseFormat.schema,
    );
  });

  test('surfaces app-server failures without another execution path', async () => {
    state.appServerError = new Error(
      'dynamic tool input schema is not supported',
    );

    await import('./index');

    expect(state.appServerOptions).toHaveLength(1);
    expect(state.emittedErrors).toHaveLength(1);
  });
});
