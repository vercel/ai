import type { HarnessV1NetworkSandboxSession } from '@ai-sdk/harness';
import type {
  AgentMessage,
  AgentRunInput,
  AgentRunResult,
  AgentRuntimeConfig,
} from '@cline/agents';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClineSession, type ClineSessionSettings } from './cline-session';

const clineMock = vi.hoisted(() => ({
  configs: [] as AgentRuntimeConfig[],
  continueInputs: [] as Array<AgentRunInput | undefined>,
  modelSelections: [] as Array<{ providerId: string; modelId?: string }>,
  providerConfigs: [] as Array<{
    providerId: string;
    apiKey?: string;
    apiKeyEnv?: string[];
    baseUrl?: string;
    headers?: Record<string, string>;
  }>,
  runInputs: [] as AgentRunInput[],
}));

vi.mock('@ai-sdk/harness/utils', () => ({
  resolveSandboxHomeDir: vi.fn(async () => '/sandbox/home'),
  shellQuote: vi.fn((value: string) => value),
}));

vi.mock('@cline/agents', () => ({
  Agent: class {
    private readonly messages: readonly AgentMessage[];

    constructor(config: AgentRuntimeConfig) {
      clineMock.configs.push(config);
      this.messages = config.initialMessages ?? [];
    }

    abort() {}

    async continue(input?: AgentRunInput): Promise<AgentRunResult> {
      clineMock.continueInputs.push(input);
      return this.result();
    }

    async run(input: AgentRunInput): Promise<AgentRunResult> {
      clineMock.runInputs.push(input);
      return this.result();
    }

    snapshot() {
      return { messages: this.messages };
    }

    subscribe() {
      return () => {};
    }

    private result(): AgentRunResult {
      return {
        agentId: 'agent-1',
        runId: 'run-1',
        status: 'completed',
        iterations: 1,
        outputText: '',
        messages: this.messages,
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
      };
    }
  },
  createTool: vi.fn((tool: unknown) => tool),
}));

vi.mock('@cline/core', async importOriginal => {
  const original = (await importOriginal()) as Record<string, unknown> & {
    Llms: Record<string, unknown>;
  };
  return {
    ...original,
    Llms: {
      ...original.Llms,
      createGateway: vi.fn(
        (config: {
          providerConfigs: Array<(typeof clineMock.providerConfigs)[number]>;
        }) => {
          clineMock.providerConfigs.push(...config.providerConfigs);
          return {
            createAgentModel: (selection: {
              providerId: string;
              modelId?: string;
            }) => {
              clineMock.modelSelections.push(selection);
              return { stream: vi.fn() };
            },
          };
        },
      ),
    },
  };
});

describe('createClineSession instructions', () => {
  beforeEach(() => {
    clineMock.configs = [];
    clineMock.continueInputs = [];
    clineMock.modelSelections = [];
    clineMock.providerConfigs = [];
    clineMock.runInputs = [];
  });

  it('appends instructions to the system prompt without changing the user prompt', async () => {
    const session = await createSession();

    try {
      const control = await session.doPromptTurn({
        prompt: 'do the thing',
        instructions: 'Use turbo build.',
        emit: vi.fn(),
      });
      await control.done;

      expect(clineMock.configs).toHaveLength(1);
      expect(clineMock.configs[0].systemPrompt).toContain(
        '## Sandbox\n\nTest sandbox',
      );
      expect(clineMock.configs[0].systemPrompt).toMatch(
        /## Sandbox\n\nTest sandbox\n\nUse turbo build\.$/,
      );
      expect(clineMock.runInputs).toEqual(['do the thing']);
    } finally {
      await session.doDestroy();
    }
  });

  it('reuses the configured prompt across turns and tool-driven rebuilds', async () => {
    const session = await createSession();

    try {
      for (const prompt of ['first turn', 'second turn']) {
        const control = await session.doPromptTurn({
          prompt,
          instructions: 'Use turbo build.',
          emit: vi.fn(),
        });
        await control.done;
      }

      expect(clineMock.configs).toHaveLength(1);

      const rebuildControl = await session.doPromptTurn({
        prompt: 'third turn',
        instructions: 'Use turbo build.',
        tools: [
          {
            name: 'deploy',
            description: 'Deploy the project.',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
        emit: vi.fn(),
      });
      await rebuildControl.done;

      expect(clineMock.configs).toHaveLength(2);
      const rebuiltSystemPrompt = clineMock.configs[1].systemPrompt ?? '';
      expect(rebuiltSystemPrompt).toBe(clineMock.configs[0].systemPrompt);
      expect(rebuiltSystemPrompt.match(/Use turbo build\./g)).toHaveLength(1);
      expect(clineMock.runInputs).toEqual(['first turn', 'third turn']);
      expect(clineMock.continueInputs).toEqual(['second turn']);
    } finally {
      await session.doDestroy();
    }
  });

  it('applies instructions when prompting a resumed session', async () => {
    const session = await createSession({ isResume: true });

    try {
      const control = await session.doPromptTurn({
        prompt: 'resume the task',
        instructions: 'Use turbo build.',
        emit: vi.fn(),
      });
      await control.done;

      expect(clineMock.configs[0].systemPrompt).toMatch(
        /\n\nUse turbo build\.$/,
      );
      expect(clineMock.runInputs).toEqual(['resume the task']);
    } finally {
      await session.doDestroy();
    }
  });

  it('applies instructions when rerunning a suspended turn', async () => {
    const session = await createSession({ isResume: true });

    try {
      const control = await session.doContinueTurn({
        instructions: 'Use turbo build.',
        emit: vi.fn(),
      });
      await control.done;

      expect(clineMock.configs[0].systemPrompt).toMatch(
        /\n\nUse turbo build\.$/,
      );
      expect(clineMock.runInputs).toEqual([]);
      expect(clineMock.continueInputs).toEqual([undefined]);
    } finally {
      await session.doDestroy();
    }
  });

  it('uses only the adapter system prompt without instructions', async () => {
    const session = await createSession();

    try {
      const control = await session.doPromptTurn({
        prompt: 'do the thing',
        emit: vi.fn(),
      });
      await control.done;

      expect(clineMock.configs[0].systemPrompt).toMatch(
        /## Sandbox\n\nTest sandbox$/,
      );
    } finally {
      await session.doDestroy();
    }
  });
});

describe('createClineSession model configuration', () => {
  beforeEach(() => {
    clineMock.configs = [];
    clineMock.continueInputs = [];
    clineMock.modelSelections = [];
    clineMock.providerConfigs = [];
    clineMock.runInputs = [];
  });

  it('uses the Cline backend and delegates default model selection', async () => {
    const session = await createSession();

    try {
      expect(clineMock.providerConfigs).toEqual([{ providerId: 'cline' }]);
      expect(clineMock.modelSelections).toEqual([{ providerId: 'cline' }]);
      expect(session.modelId).toBeUndefined();
    } finally {
      await session.doDestroy();
    }
  });

  it('maps official Cline environment variables to direct configuration', async () => {
    const session = await createSession({
      settings: {
        authEnv: {
          CLINE_API_KEY: 'cline-key',
          CLINE_API_BASE_URL: 'https://cline.example/',
        },
      },
    });

    try {
      expect(clineMock.providerConfigs).toEqual([
        {
          providerId: 'cline',
          apiKey: 'cline-key',
          baseUrl: 'https://cline.example/api/v1',
        },
      ]);
    } finally {
      await session.doDestroy();
    }
  });

  it('preserves explicit direct provider configuration', async () => {
    const session = await createSession({
      settings: {
        authEnv: { CLINE_API_KEY: 'cline-key' },
        providerId: 'anthropic',
        modelId: 'claude-opus-5',
        apiKey: 'anthropic-key',
        baseUrl: 'https://anthropic.example',
        headers: { 'x-custom': 'custom' },
      },
    });

    try {
      expect(clineMock.providerConfigs).toEqual([
        {
          providerId: 'anthropic',
          apiKey: 'anthropic-key',
          baseUrl: 'https://anthropic.example',
          headers: { 'x-custom': 'custom' },
        },
      ]);
      expect(clineMock.modelSelections).toEqual([
        { providerId: 'anthropic', modelId: 'claude-opus-5' },
      ]);
      expect(session.modelId).toBe('claude-opus-5');
    } finally {
      await session.doDestroy();
    }
  });

  it('overrides direct routing and credentials for AI Gateway', async () => {
    const session = await createSession({
      settings: {
        authEnv: {
          AI_GATEWAY_API_KEY: 'gateway-key',
          AI_GATEWAY_BASE_URL: 'https://gateway.example/',
        },
        providerId: 'anthropic',
        modelId: 'anthropic/claude-opus-5',
        apiKey: 'anthropic-key',
        baseUrl: 'https://anthropic.example',
        headers: { 'x-custom': 'custom' },
      },
    });

    try {
      expect(clineMock.providerConfigs).toEqual([
        {
          providerId: 'cline',
          apiKey: 'gateway-key',
          apiKeyEnv: [],
          baseUrl: 'https://gateway.example/v1',
          headers: {
            'x-custom': 'custom',
            'User-Agent': 'ai-sdk/harness-cline/0.0.0-test',
            'x-client-app': 'ai-sdk/harness-cline/0.0.0-test',
          },
        },
      ]);
      expect(clineMock.modelSelections).toEqual([
        { providerId: 'cline', modelId: 'anthropic/claude-opus-5' },
      ]);
    } finally {
      await session.doDestroy();
    }
  });

  it('disables direct credential fallback when Gateway credentials are missing', async () => {
    const session = await createSession({
      settings: {
        authEnv: {
          AI_GATEWAY_BASE_URL: 'https://ai-gateway.vercel.sh',
        },
        apiKey: 'direct-key',
      },
    });

    try {
      expect(clineMock.providerConfigs).toEqual([
        {
          providerId: 'cline',
          apiKeyEnv: [],
          baseUrl: 'https://ai-gateway.vercel.sh/v1',
          headers: {
            'User-Agent': 'ai-sdk/harness-cline/0.0.0-test',
            'x-client-app': 'ai-sdk/harness-cline/0.0.0-test',
          },
        },
      ]);
    } finally {
      await session.doDestroy();
    }
  });
});

async function createSession(
  input: {
    isResume?: boolean;
    settings?: Partial<ClineSessionSettings>;
  } = {},
) {
  return createClineSession({
    sessionId: 'session-1',
    sandboxSession: createSandboxSession(),
    sessionWorkDir: '/sandbox/work',
    skills: [],
    settings: {
      authEnv: {},
      ...input.settings,
    },
    clientApp: 'ai-sdk/harness-cline/0.0.0-test',
    isResume: input.isResume ?? false,
  });
}

function createSandboxSession(): HarnessV1NetworkSandboxSession {
  const sandbox = {
    defaultWorkingDirectory: '/sandbox',
    description: 'Test sandbox',
    destroy: vi.fn(async () => {}),
    getPortUrl: vi.fn(),
    readBinaryFile: vi.fn(async () => undefined),
    readTextFile: vi.fn(async () => undefined),
    restricted: vi.fn(() => sandbox),
    run: vi.fn(async () => ({ stdout: '', stderr: '', exitCode: 0 })),
    stop: vi.fn(async () => {}),
    writeBinaryFile: vi.fn(async () => {}),
    writeTextFile: vi.fn(async () => {}),
  };
  return sandbox as unknown as HarnessV1NetworkSandboxSession;
}
