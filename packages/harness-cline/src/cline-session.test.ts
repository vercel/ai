import type { HarnessV1NetworkSandboxSession } from '@ai-sdk/harness';
import type {
  AgentMessage,
  AgentRunInput,
  AgentRunResult,
  AgentRuntimeConfig,
} from '@cline/agents';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClineSession } from './cline-session';

const clineMock = vi.hoisted(() => ({
  configs: [] as AgentRuntimeConfig[],
  continueInputs: [] as Array<AgentRunInput | undefined>,
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

describe('createClineSession instructions', () => {
  beforeEach(() => {
    clineMock.configs = [];
    clineMock.continueInputs = [];
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

async function createSession(input: { isResume?: boolean } = {}) {
  return createClineSession({
    sessionId: 'session-1',
    sandboxSession: createSandboxSession(),
    sessionWorkDir: '/sandbox/work',
    skills: [],
    settings: {
      providerId: 'anthropic',
      modelId: 'claude-opus-5',
    },
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
