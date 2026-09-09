import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { ThreadOptions } from '@openai/codex-sdk';

type CodexOptions = {
  config?: Record<string, unknown>;
};
type TurnOptions = { outputSchema?: Record<string, unknown> };
const CODEX_ENV_KEYS = [
  'AI_GATEWAY_API_KEY',
  'AI_GATEWAY_BASE_URL',
  'OPENAI_BASE_URL',
  'CODEX_API_KEY',
] as const;

const state = vi.hoisted(() => ({
  codexOptions: [] as CodexOptions[],
  threadOptions: [] as ThreadOptions[],
  turnOptions: [] as TurnOptions[],
  startModel: 'gpt-5.5',
  startResponseFormat: undefined as
    | { type: 'json'; schema: Record<string, unknown> }
    | undefined,
  startInstructions: undefined as string | undefined,
  startReasoningEffort: undefined as
    | ThreadOptions['modelReasoningEffort']
    | undefined,
  startResumeThreadId: undefined as string | undefined,
  startRestartThread: false,
  startCodexConfig: undefined as Record<string, unknown> | undefined,
  startMcpServers: undefined as Record<string, unknown> | undefined,
  startHeaders: undefined as Record<string, string> | undefined,
  resumeThreadCalls: [] as string[],
  originalArgv: [] as string[],
  originalEnv: {} as Record<
    (typeof CODEX_ENV_KEYS)[number],
    string | undefined
  >,
}));

vi.mock('@openai/codex-sdk', () => ({
  Codex: class {
    constructor(options: CodexOptions) {
      state.codexOptions.push(options);
    }

    startThread(options: ThreadOptions = {}) {
      state.threadOptions.push(options);
      return {
        runStreamed: async (...[, options]: [string, TurnOptions]) => {
          state.turnOptions.push(options);
          return {
            events: (async function* () {
              yield { type: 'turn.completed' };
            })(),
          };
        },
      };
    }

    resumeThread(id: string) {
      state.resumeThreadCalls.push(id);
      return this.startThread();
    }
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
        tools: [
          {
            name: 'get_weather',
            description: 'Get the weather.',
            inputSchema: { type: 'object' },
          },
        ],
      },
      {
        emit: () => {},
        requestToolResult: async () => ({ output: {} }),
        abortSignal: new AbortController().signal,
        experimental_userMessages: {
          pendingCount: 0,
          close: () => {},
          [Symbol.asyncIterator]: async function* () {},
        },
      },
    );
  },
}));

describe('Codex bridge config', () => {
  beforeEach(() => {
    state.codexOptions = [];
    state.threadOptions = [];
    state.turnOptions = [];
    state.startModel = 'gpt-5.5';
    state.startResponseFormat = undefined;
    state.startInstructions = undefined;
    state.startReasoningEffort = undefined;
    state.startResumeThreadId = undefined;
    state.startRestartThread = false;
    state.startCodexConfig = undefined;
    state.startMcpServers = undefined;
    state.startHeaders = undefined;
    state.resumeThreadCalls = [];
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
      '--cli-shim-dir',
      '/tmp/harness-codex-test/shim',
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

  test('does not register host tools as Codex MCP servers', async () => {
    await import('./index');

    expect(state.codexOptions).toHaveLength(1);
    expect(state.codexOptions[0]?.config?.mcp_servers).toBeUndefined();
  });

  test('passes configured MCP servers to Codex', async () => {
    state.startMcpServers = {
      context7: { url: 'https://mcp.context7.com/mcp' },
    };

    await import('./index');

    expect(state.codexOptions[0]?.config?.mcp_servers).toEqual(
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

    expect(state.codexOptions[0]?.config).not.toBe(codexConfig);
    expect(state.codexOptions[0]?.config).toMatchInlineSnapshot(`
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

  test('requests detailed reasoning summaries by default', async () => {
    await import('./index');

    expect(state.codexOptions).toHaveLength(1);
    expect(state.codexOptions[0]?.config).toMatchInlineSnapshot(`
      {
        "developer_instructions": "Only respond with your \`final\` message once you have fully addressed the user request.",
        "model_reasoning_summary": "detailed",
      }
    `);
  });

  test.each(['xhigh', 'max'] as const)(
    'passes %s reasoning effort to Codex',
    async reasoningEffort => {
      state.startReasoningEffort = reasoningEffort;

      await import('./index');

      expect(state.threadOptions[0]?.modelReasoningEffort).toBe(
        reasoningEffort,
      );
    },
  );

  test('disables WebSockets for a configured direct OpenAI endpoint', async () => {
    process.env.CODEX_API_KEY = 'CODEX_API_KEY';
    process.env.OPENAI_BASE_URL = 'https://api.openai.com/v1';

    await import('./index');

    expect({
      modelProvider: state.codexOptions[0]?.config?.model_provider,
      modelProviders: state.codexOptions[0]?.config?.model_providers,
      preferredAuthMethod: state.codexOptions[0]?.config?.preferred_auth_method,
    }).toMatchInlineSnapshot(`
      {
        "modelProvider": "agent_bridge_openai",
        "modelProviders": {
          "agent_bridge_openai": {
            "base_url": "https://api.openai.com/v1",
            "env_key": "CODEX_API_KEY",
            "name": "Agent Bridge OpenAI",
            "supports_websockets": false,
            "wire_api": "responses",
          },
        },
        "preferredAuthMethod": "apikey",
      }
    `);
  });

  test('injects session instructions as developer instructions', async () => {
    state.startInstructions = 'Answer every question in German.';

    await import('./index');

    expect(state.codexOptions[0]?.config?.base_instructions).toBeUndefined();
    expect(state.codexOptions[0]?.config?.developer_instructions).toBe(
      'Answer every question in German.\n\n' +
        'Only respond with your `final` message once you have fully addressed the user request.',
    );
  });

  test('starts a fresh thread when the host requests a configuration restart', async () => {
    state.startResumeThreadId = 'thread-previous';
    state.startRestartThread = true;

    await import('./index');

    expect(state.resumeThreadCalls).toEqual([]);
    expect(state.threadOptions).toHaveLength(1);
  });

  test('uses the creator-qualified model and forces summaries for AI Gateway', async () => {
    process.env.AI_GATEWAY_API_KEY = 'gateway-key';
    process.env.AI_GATEWAY_BASE_URL = 'https://ai-gateway.test/v1';

    await import('./index');

    expect({
      model: state.threadOptions[0]?.model,
      reasoningSummary: state.codexOptions[0]?.config?.model_reasoning_summary,
      supportsReasoningSummaries:
        state.codexOptions[0]?.config?.model_supports_reasoning_summaries,
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

    expect(state.codexOptions[0]?.config?.model_providers)
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

    expect(state.threadOptions[0]?.model).toBe('openai/gpt-5.5');
  });

  test('passes the requested JSON schema to Codex', async () => {
    state.startResponseFormat = {
      type: 'json',
      schema: {
        type: 'object',
        properties: { answer: { type: 'string' } },
        required: ['answer'],
      },
    };

    await import('./index');

    expect(state.turnOptions[0]?.outputSchema).toEqual(
      state.startResponseFormat.schema,
    );
  });
});
