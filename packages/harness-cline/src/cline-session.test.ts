import type {
  HarnessV1BuiltinToolFiltering,
  HarnessV1NetworkSandboxSession,
} from '@ai-sdk/harness';
import type {
  AgentMessage,
  AgentRunInput,
  AgentRunResult,
  AgentRuntimeConfig,
  AgentTool,
} from '@cline/agents';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClineSession, type ClineSessionSettings } from './cline-session';

const clineMock = vi.hoisted(() => ({
  configs: [] as AgentRuntimeConfig[],
  continueInputs: [] as Array<AgentRunInput | undefined>,
  modelOptions: [] as unknown[],
  modelSelections: [] as Array<{ providerId: string; modelId?: string }>,
  providerConfigs: [] as Array<{
    providerId: string;
    apiKey?: string;
    apiKeyEnv?: string[];
    baseUrl?: string;
    headers?: Record<string, string>;
  }>,
  runInputs: [] as AgentRunInput[],
  runGate: undefined as Promise<void> | undefined,
  runStatus: 'completed' as AgentRunResult['status'],
  runError: undefined as Error | undefined,
  outputText: '',
}));

vi.mock('@ai-sdk/harness/utils', async importOriginal => ({
  ...(await importOriginal()),
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
      await clineMock.runGate;
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
        status: clineMock.runStatus,
        iterations: 1,
        outputText: clineMock.outputText,
        messages: this.messages,
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        ...(clineMock.runError ? { error: clineMock.runError } : {}),
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
    createDefaultTools: vi.fn(
      (options: {
        executors?: {
          askQuestion?: (
            question: string,
            answers: string[],
            context: Parameters<AgentTool['execute']>[1],
          ) => Promise<string>;
          skills?: (...args: unknown[]) => Promise<string>;
        };
        enableAskQuestion?: boolean;
        enableSkills?: boolean;
      }) => [
        ...(options.enableAskQuestion
          ? [
              {
                name: 'ask_question',
                inputSchema: {},
                execute: (
                  input: { question: string; options: string[] },
                  context: Parameters<AgentTool['execute']>[1],
                ) =>
                  options.executors?.askQuestion?.(
                    input.question,
                    input.options,
                    context,
                  ),
              },
            ]
          : []),
        ...(options.enableSkills
          ? [
              {
                name: 'skills',
                description: `Available skills: ${
                  (
                    options.executors?.skills as
                      | {
                          configuredSkills?: Array<{ name: string }>;
                        }
                      | undefined
                  )?.configuredSkills
                    ?.map(skill => skill.name)
                    .join(', ') ?? ''
                }.`,
                inputSchema: {},
                execute: (
                  input: { skill: string; args?: string },
                  context: Parameters<AgentTool['execute']>[1],
                ) =>
                  options.executors?.skills?.(input.skill, input.args, context),
              },
            ]
          : []),
      ],
    ),
    Llms: {
      ...original.Llms,
      createGateway: vi.fn(
        (config: {
          providerConfigs: Array<(typeof clineMock.providerConfigs)[number]>;
        }) => {
          clineMock.providerConfigs.push(...config.providerConfigs);
          return {
            createAgentModel: (
              selection: {
                providerId: string;
                modelId?: string;
              },
              options?: unknown,
            ) => {
              clineMock.modelSelections.push(selection);
              clineMock.modelOptions.push(options);
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
    clineMock.modelOptions = [];
    clineMock.modelSelections = [];
    clineMock.providerConfigs = [];
    clineMock.runInputs = [];
    clineMock.runGate = undefined;
    clineMock.runStatus = 'completed';
    clineMock.runError = undefined;
    clineMock.outputText = '';
  });

  it('appends instructions to the system prompt without changing the user prompt', async () => {
    const session = await createSession();

    try {
      const control = await session.doPromptTurn({
        skills: [],
        tools: [],
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
          skills: [],
          tools: [],
          prompt,
          instructions: 'Use turbo build.',
          emit: vi.fn(),
        });
        await control.done;
      }

      expect(clineMock.configs).toHaveLength(1);

      const rebuildControl = await session.doPromptTurn({
        skills: [],
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
        skills: [],
        tools: [],
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
        skills: [],
        tools: [],
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
        skills: [],
        tools: [],
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

  it('continues the active turn with queued steering messages', async () => {
    let releaseRun!: () => void;
    clineMock.runGate = new Promise<void>(resolve => {
      releaseRun = resolve;
    });
    const session = await createSession();

    try {
      const control = await session.doPromptTurn({
        skills: [],
        tools: [],
        prompt: 'Weather in Paris?',
        emit: vi.fn(),
      });
      const steering = control.submitUserMessage?.('Actually, Paris, Texas.');
      releaseRun();
      await steering;
      await control.done;

      expect(clineMock.runInputs).toEqual(['Weather in Paris?']);
      expect(clineMock.continueInputs).toEqual(['Actually, Paris, Texas.']);
      await expect(control.submitUserMessage?.('Too late.')).rejects.toThrow(
        'no running turn',
      );
    } finally {
      await session.doDestroy();
    }
  });

  it('rejects queued steering messages when the turn fails before consuming them', async () => {
    let releaseRun!: () => void;
    clineMock.runGate = new Promise<void>(resolve => {
      releaseRun = resolve;
    });
    clineMock.runStatus = 'failed';
    clineMock.runError = new Error('Cline failed');
    const session = await createSession();

    try {
      const control = await session.doPromptTurn({
        skills: [],
        tools: [],
        prompt: 'Weather in Paris?',
        emit: vi.fn(),
      });
      const steering = expect(
        control.submitUserMessage?.('Actually, Paris, Texas.'),
      ).rejects.toThrow('turn ended before accepting');

      releaseRun();

      await steering;
      await control.done;
      expect(clineMock.continueInputs).toEqual([]);
    } finally {
      await session.doDestroy();
    }
  });
});

describe('createClineSession skills', () => {
  beforeEach(() => {
    clineMock.configs = [];
    clineMock.continueInputs = [];
    clineMock.modelOptions = [];
    clineMock.modelSelections = [];
    clineMock.providerConfigs = [];
    clineMock.runInputs = [];
    clineMock.runGate = undefined;
    clineMock.runStatus = 'completed';
    clineMock.runError = undefined;
    clineMock.outputText = '';
  });

  it('exposes skills through the native tool instead of the system prompt', async () => {
    const session = await createSession();

    try {
      const control = await session.doPromptTurn({
        skills: [
          {
            name: 'release-notes',
            description: 'Use when drafting release notes.',
            content: 'Follow the release process.',
          },
        ],
        tools: [],
        prompt: 'Draft release notes.',
        emit: vi.fn(),
      });
      await control.done;

      const config = clineMock.configs[0];
      expect(config.systemPrompt).not.toContain('## Skills');
      expect(config.systemPrompt).not.toContain('.agents/skills');
      expect(findTool({ config, name: 'skills' }).description).toContain(
        'Available skills: release-notes.',
      );
    } finally {
      await session.doDestroy();
    }
  });

  it('rebuilds only when behavior-relevant skill data changes', async () => {
    const session = await createSession();
    const firstSkills = [
      {
        name: 'release-notes',
        description: 'Use when drafting release notes.',
        content: 'Follow the release process.',
        files: [
          { path: 'z.md', content: 'Z' },
          { path: 'a.md', content: 'A' },
        ],
      },
    ];

    try {
      for (const skills of [
        firstSkills,
        [
          {
            ...firstSkills[0],
            files: [...firstSkills[0].files].reverse(),
          },
        ],
      ]) {
        const control = await session.doPromptTurn({
          skills,
          tools: [],
          prompt: 'Draft release notes.',
          emit: vi.fn(),
        });
        await control.done;
      }
      expect(clineMock.configs).toHaveLength(1);

      const changedControl = await session.doPromptTurn({
        skills: [
          {
            ...firstSkills[0],
            files: [
              { path: 'a.md', content: 'Changed' },
              { path: 'z.md', content: 'Z' },
            ],
          },
        ],
        tools: [],
        prompt: 'Draft release notes again.',
        emit: vi.fn(),
      });
      await changedControl.done;

      const removedControl = await session.doPromptTurn({
        skills: [],
        tools: [],
        prompt: 'Continue without skills.',
        emit: vi.fn(),
      });
      await removedControl.done;

      expect(clineMock.configs).toHaveLength(3);
      expect(
        clineMock.configs[2].tools?.some(tool => tool.name === 'skills'),
      ).toBe(false);
    } finally {
      await session.doDestroy();
    }
  });

  it('respects builtin filtering for the skills tool', async () => {
    const session = await createSession({
      builtinToolFiltering: { mode: 'deny', toolNames: ['skills'] },
    });

    try {
      const control = await session.doPromptTurn({
        skills: [
          {
            name: 'release-notes',
            description: 'Use when drafting release notes.',
            content: 'Follow the release process.',
          },
        ],
        tools: [],
        prompt: 'Draft release notes.',
        emit: vi.fn(),
      });
      await control.done;

      expect(
        clineMock.configs[0].tools?.some(tool => tool.name === 'skills'),
      ).toBe(false);
    } finally {
      await session.doDestroy();
    }
  });
});

describe('createClineSession model configuration', () => {
  beforeEach(() => {
    clineMock.configs = [];
    clineMock.continueInputs = [];
    clineMock.modelOptions = [];
    clineMock.modelSelections = [];
    clineMock.providerConfigs = [];
    clineMock.runInputs = [];
    clineMock.runGate = undefined;
    clineMock.runStatus = 'completed';
    clineMock.runError = undefined;
    clineMock.outputText = '';
  });

  it('uses the Cline backend and delegates default model selection', async () => {
    const session = await createSession();

    try {
      expect(clineMock.providerConfigs).toEqual([{ providerId: 'cline' }]);
      expect(clineMock.modelSelections).toEqual([{ providerId: 'cline' }]);
      expect(clineMock.modelOptions).toEqual([undefined]);
    } finally {
      await session.doDestroy();
    }
  });

  it('rebuilds the agent with its message history when the model changes', async () => {
    const session = await createSession();

    try {
      const firstControl = await session.doPromptTurn({
        skills: [],
        tools: [],
        prompt: 'My name is Felix.',
        emit: vi.fn(),
      });
      await firstControl.done;
      const secondControl = await session.doPromptTurn({
        model: 'anthropic/claude-haiku-4-5',
        skills: [],
        tools: [],
        prompt: 'Remember my name?',
        emit: vi.fn(),
      });
      await secondControl.done;

      expect(clineMock.modelSelections).toEqual([
        { providerId: 'cline' },
        { providerId: 'cline', modelId: 'anthropic/claude-haiku-4-5' },
      ]);
      expect(clineMock.configs).toHaveLength(2);
      expect(clineMock.configs[1].initialMessages).toEqual(
        clineMock.configs[0].initialMessages,
      );
    } finally {
      await session.doDestroy();
    }
  });

  it('disables ambient credential lookup for an authentication environment override', async () => {
    const session = await createSession({
      settings: { isAuthenticationEnvironmentOverride: true },
    });

    try {
      expect(clineMock.providerConfigs).toEqual([
        { providerId: 'cline', apiKeyEnv: [] },
      ]);
    } finally {
      await session.doDestroy();
    }
  });

  it('disables reasoning when the effort is none', async () => {
    const session = await createSession({
      settings: { reasoningEffort: 'none' },
    });

    try {
      expect(clineMock.modelOptions).toEqual([
        { reasoning: { enabled: false } },
      ]);
    } finally {
      await session.doDestroy();
    }
  });

  it.each(['minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const)(
    'enables reasoning with %s effort',
    async reasoningEffort => {
      const session = await createSession({
        settings: { reasoningEffort },
      });

      try {
        expect(clineMock.modelOptions).toEqual([
          {
            reasoning: {
              enabled: true,
              effort: reasoningEffort,
            },
          },
        ]);
      } finally {
        await session.doDestroy();
      }
    },
  );

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
        agentHeaders: { 'x-agent': 'agent' },
      },
    });

    try {
      expect(clineMock.providerConfigs).toEqual([
        {
          providerId: 'anthropic',
          apiKey: 'anthropic-key',
          baseUrl: 'https://anthropic.example',
          headers: {
            'x-custom': 'custom',
            'x-agent': 'agent',
          },
        },
      ]);
      expect(clineMock.modelSelections).toEqual([
        { providerId: 'anthropic', modelId: 'claude-opus-5' },
      ]);
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
        agentHeaders: { 'x-agent': 'agent' },
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
            'x-agent': 'agent',
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

describe('createClineSession tool results', () => {
  beforeEach(() => {
    clineMock.configs = [];
    clineMock.continueInputs = [];
    clineMock.modelOptions = [];
    clineMock.modelSelections = [];
    clineMock.providerConfigs = [];
    clineMock.runInputs = [];
    clineMock.runGate = undefined;
    clineMock.runStatus = 'completed';
    clineMock.runError = undefined;
    clineMock.outputText = '';
  });

  it.each([
    {
      label: 'an error object',
      output: { error: 'host tool failed' },
      isError: true,
      expectedIsError: true,
    },
    {
      label: 'an explicit non-error string',
      output: 'host tool succeeded',
      isError: false,
      expectedIsError: undefined,
    },
    {
      label: 'an object without an error flag',
      output: { value: 42 },
      isError: undefined,
      expectedIsError: undefined,
    },
  ])(
    'preserves $label submitted by the host',
    async ({ output, isError, expectedIsError }) => {
      const session = await createSession();

      try {
        const control = await session.doPromptTurn({
          skills: [],
          prompt: 'use the lookup tool',
          tools: [
            {
              name: 'lookup',
              inputSchema: { type: 'object', properties: {} },
            },
          ],
          emit: vi.fn(),
        });
        await control.done;

        const config = clineMock.configs.at(-1);
        if (config == null) throw new Error('expected agent config');
        const tool = findTool({ config, name: 'lookup' });
        const resultPromise = Promise.resolve(
          tool.execute({}, createToolContext({ toolCallId: 'call-1' })),
        );

        await control.submitToolResult({
          toolCallId: 'call-1',
          output,
          ...(isError !== undefined ? { isError } : {}),
        });
        const result = await runAfterToolHook({
          config,
          tool,
          output: await resultPromise,
        });

        expect(result?.result?.output).toBe(output);
        expect(result?.result?.isError).toBe(expectedIsError);
      } finally {
        await session.doDestroy();
      }
    },
  );

  it('marks a pending host tool result as an error when the session is destroyed', async () => {
    const session = await createSession();
    const control = await session.doPromptTurn({
      skills: [],
      prompt: 'use the lookup tool',
      tools: [
        {
          name: 'lookup',
          inputSchema: { type: 'object', properties: {} },
        },
      ],
      emit: vi.fn(),
    });
    await control.done;

    const config = clineMock.configs.at(-1);
    if (config == null) throw new Error('expected agent config');
    const tool = findTool({ config, name: 'lookup' });
    const resultPromise = Promise.resolve(
      tool.execute({}, createToolContext({ toolCallId: 'call-1' })),
    );

    await session.doDestroy();
    const result = await runAfterToolHook({
      config,
      tool,
      output: await resultPromise,
    });

    expect(result).toEqual({
      result: {
        output: { error: 'Cline session stopped' },
        isError: true,
      },
    });
  });

  it('correlates concurrently pending host tool results by tool call ID', async () => {
    const session = await createSession();

    try {
      const control = await session.doPromptTurn({
        skills: [],
        prompt: 'use the lookup tool twice',
        tools: [
          {
            name: 'lookup',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
        emit: vi.fn(),
      });
      await control.done;

      const config = clineMock.configs.at(-1);
      if (config == null) throw new Error('expected agent config');
      const tool = findTool({ config, name: 'lookup' });
      const firstResultPromise = Promise.resolve(
        tool.execute({}, createToolContext({ toolCallId: 'call-1' })),
      );
      const secondResultPromise = Promise.resolve(
        tool.execute({}, createToolContext({ toolCallId: 'call-2' })),
      );

      await control.submitToolResult({
        toolCallId: 'call-2',
        output: { value: 'second' },
      });
      await control.submitToolResult({
        toolCallId: 'call-1',
        output: { value: 'first' },
      });

      const [firstResult, secondResult] = await Promise.all([
        runAfterToolHook({
          config,
          tool,
          output: await firstResultPromise,
        }),
        runAfterToolHook({
          config,
          tool,
          output: await secondResultPromise,
        }),
      ]);

      expect(firstResult?.result?.output).toEqual({ value: 'first' });
      expect(secondResult?.result?.output).toEqual({ value: 'second' });
    } finally {
      await session.doDestroy();
    }
  });

  it('leaves unmarked tool output untouched', async () => {
    const session = await createSession();

    try {
      const control = await session.doPromptTurn({
        skills: [],
        tools: [],
        prompt: 'read a file',
        emit: vi.fn(),
      });
      await control.done;

      const config = clineMock.configs.at(-1);
      if (config == null) throw new Error('expected agent config');
      const tool = findTool({ config, name: 'read' });

      expect(
        await runAfterToolHook({
          config,
          tool,
          output: { output: 'ordinary tool output', isError: true },
        }),
      ).toBeUndefined();
    } finally {
      await session.doDestroy();
    }
  });
});

describe('createClineSession tool execution', () => {
  beforeEach(() => {
    clineMock.configs = [];
    clineMock.continueInputs = [];
    clineMock.modelOptions = [];
    clineMock.modelSelections = [];
    clineMock.providerConfigs = [];
    clineMock.runInputs = [];
    clineMock.runGate = undefined;
    clineMock.runStatus = 'completed';
    clineMock.runError = undefined;
    clineMock.outputText = '';
  });

  it('configures initial and rebuilt agents for parallel tool execution', async () => {
    const session = await createSession();

    try {
      const firstControl = await session.doPromptTurn({
        skills: [],
        tools: [],
        prompt: 'first turn',
        emit: vi.fn(),
      });
      await firstControl.done;

      const secondControl = await session.doPromptTurn({
        skills: [],
        prompt: 'second turn',
        tools: [
          {
            name: 'lookup',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
        emit: vi.fn(),
      });
      await secondControl.done;

      expect(clineMock.configs.map(config => config.toolExecution)).toEqual([
        'parallel',
        'parallel',
      ]);
    } finally {
      await session.doDestroy();
    }
  });

  it('uses a schema-constrained terminal tool for structured output', async () => {
    clineMock.outputText = '{"answer":"yes"}';
    const session = await createSession();
    const emitted: unknown[] = [];

    try {
      const control = await session.doPromptTurn({
        skills: [],
        tools: [],
        prompt: 'Answer.',
        responseFormat: {
          type: 'json',
          schema: {
            type: 'object',
            properties: { answer: { type: 'string' } },
            required: ['answer'],
            additionalProperties: false,
          },
        },
        emit: event => emitted.push(event),
      });
      await control.done;

      const config = clineMock.configs.at(-1);
      if (config == null) throw new Error('expected agent config');
      const structuredOutput = findTool({
        config,
        name: 'structured_output',
      });
      expect(config.completionPolicy).toEqual({
        requireCompletionTool: true,
      });
      expect(structuredOutput.inputSchema).toEqual({
        type: 'object',
        properties: {
          output: {
            type: 'object',
            properties: { answer: { type: 'string' } },
            required: ['answer'],
            additionalProperties: false,
          },
        },
        required: ['output'],
        additionalProperties: false,
      });
      await expect(
        structuredOutput.execute(
          { output: { answer: 42 } },
          createToolContext({ toolCallId: 'invalid' }),
        ),
      ).resolves.toBe('{"answer":42}');
      await expect(
        structuredOutput.execute(
          { output: { answer: 'yes' } },
          createToolContext({ toolCallId: 'valid' }),
        ),
      ).resolves.toBe('{"answer":"yes"}');
      expect(emitted).toEqual(
        expect.arrayContaining([
          {
            type: 'text-delta',
            id: 'structured-output-session-1',
            delta: '{"answer":"yes"}',
          },
        ]),
      );
    } finally {
      await session.doDestroy();
    }
  });

  it('rejects structured output for the tool-less Codex CLI provider', async () => {
    const session = await createSession({
      settings: { providerId: 'openai-codex-cli' },
    });

    try {
      await expect(
        session.doPromptTurn({
          skills: [],
          tools: [],
          prompt: 'Answer.',
          responseFormat: {
            type: 'json',
            schema: { type: 'object' },
          },
          emit: () => {},
        }),
      ).rejects.toMatchObject({
        name: 'AI_HarnessCapabilityUnsupportedError',
        harnessId: 'cline',
      });
    } finally {
      await session.doDestroy();
    }
  });
});

async function createSession(
  input: {
    builtinToolFiltering?: HarnessV1BuiltinToolFiltering;
    isResume?: boolean;
    settings?: Partial<ClineSessionSettings>;
  } = {},
) {
  return createClineSession({
    sessionId: 'session-1',
    sandboxSession: createSandboxSession(),
    sessionWorkDir: '/sandbox/work',
    settings: {
      authEnv: {},
      isAuthenticationEnvironmentOverride: false,
      ...input.settings,
    },
    clientApp: 'ai-sdk/harness-cline/0.0.0-test',
    isResume: input.isResume ?? false,
    ...(input.builtinToolFiltering
      ? { builtinToolFiltering: input.builtinToolFiltering }
      : {}),
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

function createToolContext({
  toolCallId,
}: {
  toolCallId: string;
}): Parameters<AgentTool['execute']>[1] {
  return {
    agentId: 'agent-1',
    runId: 'run-1',
    iteration: 1,
    toolCallId,
  };
}

function findTool({
  config,
  name,
}: {
  config: AgentRuntimeConfig;
  name: string;
}): AgentTool {
  const tool = config.tools?.find(tool => tool.name === name);
  if (tool == null) throw new Error(`expected ${name} tool`);
  return tool;
}

async function runAfterToolHook({
  config,
  tool,
  output,
}: {
  config: AgentRuntimeConfig;
  tool: AgentTool;
  output: unknown;
}) {
  const hook = config.hooks?.afterTool;
  if (hook == null) throw new Error('expected afterTool hook');
  const now = new Date();
  return hook({
    snapshot: {} as never,
    tool,
    toolCall: {
      type: 'tool-call',
      toolCallId: 'call-1',
      toolName: tool.name,
      input: {},
    },
    input: {},
    result: { output },
    startedAt: now,
    endedAt: now,
    durationMs: 0,
  });
}
