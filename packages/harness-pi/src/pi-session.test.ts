import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type AgentSession,
  type ExtensionAPI,
  type ExtensionFactory,
  type ProviderConfig,
  type Skill,
  type ToolDefinition,
  ModelRuntime,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';
import type * as PiCodingAgentModule from '@earendil-works/pi-coding-agent';
import type {
  HarnessV1NetworkSandboxSession,
  HarnessV1Session,
  HarnessV1Skill,
  HarnessV1StreamPart,
  HarnessV1ToolSpec,
} from '@ai-sdk/harness';
import {
  HarnessAgent,
  type HarnessAgentContinueTurnState,
} from '@ai-sdk/harness/agent';
import { tool } from '@ai-sdk/provider-utils';
import { existsSync } from 'node:fs';
import { devNull, tmpdir } from 'node:os';
import path from 'node:path';
import { z } from 'zod/v4';
import { createPi } from './pi-harness';
import {
  createPiSession,
  type PiHarnessExtensionFactory,
  type PiHarnessExtensionSession,
} from './pi-session';

type FakePiTool = Pick<ToolDefinition, 'name' | 'execute'>;
type FakeExtensionsResult = {
  readonly errors: unknown[];
  readonly extensions: unknown[];
  readonly runtime: object;
};
type FakeSkillsResult = {
  readonly skills: Skill[];
  readonly diagnostics: [];
};
type FakeAgentsFilesResult = {
  readonly agentsFiles: Array<{ path: string; content: string }>;
};
type ResourceLoaderOptions = {
  readonly agentsFilesOverride?: (
    base: FakeAgentsFilesResult,
  ) => FakeAgentsFilesResult;
  readonly appendSystemPromptOverride?: (base: string[]) => string[];
  readonly extensionFactories?: Array<ExtensionFactory>;
  readonly extensionsOverride?: (
    base: FakeExtensionsResult,
  ) => FakeExtensionsResult;
  readonly noContextFiles?: boolean;
  readonly noExtensions?: boolean;
  readonly noPromptTemplates?: boolean;
  readonly noSkills?: boolean;
  readonly noThemes?: boolean;
  readonly skillsOverride?: (base: FakeSkillsResult) => FakeSkillsResult;
};

const piMock = vi.hoisted(() => {
  const extensionHandlers = new Map<
    string,
    Array<(event?: unknown) => unknown>
  >();
  return {
    agentSessionExtensionResults: [] as FakeExtensionsResult[],
    createAgentSession: vi.fn(),
    customTools: [] as FakePiTool[],
    appendSystemPrompts: [] as string[][],
    extensionApi: {
      on: vi.fn((eventType: string, handler: (event?: unknown) => unknown) => {
        const handlers = extensionHandlers.get(eventType) ?? [];
        handlers.push(handler);
        extensionHandlers.set(eventType, handlers);
      }),
      registerMcpServer: vi.fn(),
    } as unknown as ExtensionAPI,
    extensionFactoryInputs: [] as Array<{
      readonly reference: Array<ExtensionFactory>;
      readonly snapshot: Array<ExtensionFactory>;
    }>,
    extensionHandlers,
    resourceLoaderReloadCount: 0,
    resourceLoaderOptions: [] as ResourceLoaderOptions[],
    registerProvider: vi.fn(),
    session: undefined as AgentSession | undefined,
    sessionManagerOpen: vi.fn(),
  };
});

const mcpMock = vi.hoisted(() => {
  const mcpExtensionFactory = vi.fn();
  const toolSearchFactory = vi.fn();
  return {
    createMcpExtension: vi.fn(() => mcpExtensionFactory),
    createToolSearchExtension: vi.fn(() => toolSearchFactory),
    mcpExtensionFactory,
    toolSearchFactory,
  };
});

vi.mock('@earendil-works/pi-coding-agent', async importOriginal => {
  const actual = await importOriginal<typeof PiCodingAgentModule>();
  return {
    ...actual,
    createAgentSession: piMock.createAgentSession,
    createMcpExtension: mcpMock.createMcpExtension,
    createToolSearchExtension: mcpMock.createToolSearchExtension,
    DefaultResourceLoader: class {
      private extensionsResult: FakeExtensionsResult = {
        errors: [],
        extensions: [],
        runtime: {},
      };

      constructor(private readonly options: ResourceLoaderOptions) {
        piMock.resourceLoaderOptions.push(options);
        const extensionFactories = options.extensionFactories ?? [];
        piMock.extensionFactoryInputs.push({
          reference: extensionFactories,
          snapshot: [...extensionFactories],
        });
      }

      async reload() {
        piMock.resourceLoaderReloadCount += 1;
        piMock.appendSystemPrompts.push(
          this.options.appendSystemPromptOverride?.([]) ?? [],
        );
        for (const factory of this.options.extensionFactories ?? []) {
          await factory(piMock.extensionApi);
        }
        const base = { errors: [], extensions: [], runtime: {} };
        this.extensionsResult = this.options.extensionsOverride?.(base) ?? base;
      }

      getExtensions() {
        return this.extensionsResult;
      }
    },
    defineTool: vi.fn(tool => tool),
    ModelRegistry: class {
      private readonly providerConfigs = new Map<string, ProviderConfig>();

      getAll = vi.fn(() => []);
      getRegisteredProviderConfig = vi.fn((provider: string) =>
        this.providerConfigs.get(provider),
      );
      registerProvider = vi.fn((provider: string, config: ProviderConfig) => {
        this.providerConfigs.set(provider, {
          ...this.providerConfigs.get(provider),
          ...config,
        });
        piMock.registerProvider(provider, config);
      });
    },
    ModelRuntime: {
      create: vi.fn(async () => ({
        setRuntimeApiKey: vi.fn(async () => {}),
      })),
    },
    SessionManager: {
      create: vi.fn(() => ({
        getSessionFile: () => undefined,
      })),
      open: piMock.sessionManagerOpen,
    },
    SettingsManager: {
      inMemory: vi.fn(() => ({})),
      create: vi.fn(() => ({})),
    },
  };
});

describe('createPiSession', () => {
  beforeEach(() => {
    piMock.agentSessionExtensionResults = [];
    piMock.customTools = [];
    piMock.appendSystemPrompts = [];
    piMock.extensionFactoryInputs = [];
    piMock.extensionHandlers.clear();
    piMock.resourceLoaderReloadCount = 0;
    piMock.resourceLoaderOptions = [];
    piMock.registerProvider.mockClear();
    piMock.session = undefined;
    vi.mocked(piMock.extensionApi.registerMcpServer).mockClear();
    mcpMock.createMcpExtension.mockClear();
    mcpMock.createToolSearchExtension.mockClear();
    mcpMock.mcpExtensionFactory.mockClear();
    mcpMock.toolSearchFactory.mockClear();
    piMock.createAgentSession.mockReset();
    piMock.createAgentSession.mockImplementation(async options => {
      piMock.agentSessionExtensionResults.push(
        options.resourceLoader.getExtensions(),
      );
      piMock.customTools = options.customTools;
      return { session: piMock.session };
    });
    piMock.sessionManagerOpen.mockReset();
    piMock.sessionManagerOpen.mockImplementation(() => ({
      getSessionFile: () => undefined,
    }));
  });

  it('rejects structured output turns', async () => {
    const session = await createPiSession({
      sessionId: 'session-structured-output',
      sandboxSession: createSandboxSession(),
      sessionWorkDir: '/sandbox/work',
      settings: {},
      clientApp: 'ai-sdk-harness-pi/0.0.0-test',
      isResume: false,
    });

    try {
      await expect(
        session.doPromptTurn({
          skills: [],
          tools: [],
          prompt: 'Generate an object.',
          responseFormat: {
            type: 'json',
            schema: { type: 'object' },
          },
          emit: () => {},
        }),
      ).rejects.toMatchObject({
        name: 'AI_HarnessCapabilityUnsupportedError',
        harnessId: 'pi',
      });
    } finally {
      await session.doDestroy();
    }
  });

  it('fails the turn when the requested model is not in the Pi catalog', async () => {
    const { session: fakePiSession, prompt } = createFakePiSession();
    piMock.session = fakePiSession;
    const session = await createPiSession({
      sessionId: 'session-unknown-model',
      sandboxSession: createSandboxSession(),
      sessionWorkDir: '/sandbox/work',
      settings: {},
      clientApp: 'ai-sdk-harness-pi/0.0.0-test',
      isResume: false,
    });

    try {
      await expect(
        session.doPromptTurn({
          skills: [],
          tools: [],
          prompt: 'Hello.',
          model: 'openai/not-a-real-model',
          emit: vi.fn(),
        }),
      ).rejects.toMatchObject({
        name: 'AI_HarnessCapabilityUnsupportedError',
        harnessId: 'pi',
        message:
          "Harness 'pi' has no model 'openai/not-a-real-model' in its catalog.",
      });
      expect(prompt).not.toHaveBeenCalled();
    } finally {
      await session.doDestroy();
    }
  });

  it('loads a caller-supplied inline extension factory through createPi', async () => {
    const factory = vi.fn((piApi: ExtensionAPI) => {
      expect(piApi).toBe(piMock.extensionApi);
    });

    const session = await createPi({
      extensionFactories: [factory],
    }).doStart({
      sessionId: 'session-inline-extension',
      sandboxSession: createSandboxSession(),
      sessionWorkDir: '/sandbox/work',
    });

    try {
      expect(factory).toHaveBeenCalledOnce();
    } finally {
      await session.doDestroy();
    }
  });

  it('gives inline extensions the harness session and the current turn instructions', async () => {
    const sandboxSession = createSandboxSession();
    const sessions: PiHarnessExtensionSession[] = [];
    const instructionsSeen: Array<string | undefined> = [];
    const factory: PiHarnessExtensionFactory = (piApi, extensionSession) => {
      sessions.push(extensionSession);
      piApi.on('agent_start', () => {
        instructionsSeen.push(extensionSession.instructions());
      });
    };
    piMock.session = Object.assign(
      createFakePiSession({
        promptImplementation: async () => {
          for (const handler of piMock.extensionHandlers.get('agent_start') ??
            []) {
            await handler();
          }
        },
      }).session,
      { getActiveToolNames: () => [], setActiveToolsByName: vi.fn() },
    );

    const session = await createPi({ extensionFactories: [factory] }).doStart({
      sessionId: 'session-extension-harness-session',
      sandboxSession,
      sessionWorkDir: '/sandbox/work',
    });

    try {
      for (const instructions of ['Answer in French.', 'Answer in German.']) {
        const control = await session.doPromptTurn({
          skills: [],
          prompt: 'Hello.',
          instructions,
          tools: [],
          emit: vi.fn(),
        });
        await control.done;
      }

      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toMatchObject({
        sandboxSession: sandboxSession.restricted(),
        sessionWorkDir: '/sandbox/work',
      });
      expect(instructionsSeen).toEqual([
        'Answer in French.',
        'Answer in German.',
      ]);
    } finally {
      await session.doDestroy();
    }
  });

  it('keeps tools registered by inline extensions enabled', async () => {
    const factory = vi.fn();
    piMock.session = createFakePiSession().session;

    const session = await createPi({
      extensionFactories: [factory],
    }).doStart({
      sessionId: 'session-extension-tools',
      sandboxSession: createSandboxSession(),
      sessionWorkDir: '/sandbox/work',
    });

    try {
      const control = await session.doPromptTurn({
        skills: [],
        prompt: 'Use an extension tool.',
        tools: [],
        emit: vi.fn(),
      });
      await control.done;

      const createOptions = piMock.createAgentSession.mock.lastCall?.[0];
      expect(createOptions).toMatchObject({ noTools: 'builtin' });
      expect(createOptions).not.toHaveProperty('tools');
    } finally {
      await session.doDestroy();
    }
  });

  it.each([
    { nativeName: 'read', filteredTool: 'read' },
    { nativeName: 'find', filteredTool: 'glob' },
  ])(
    'classifies an extension replacing filtered $filteredTool on every turn',
    async ({ nativeName, filteredTool }) => {
      const { session: fakePiSession } = createFakePiSession({
        promptEvents: [
          { type: 'turn_start' },
          {
            type: 'message_update',
            assistantMessageEvent: {
              type: 'toolcall_start',
              contentIndex: 0,
              partial: {
                content: [
                  { type: 'toolCall', id: 'extension-call', name: nativeName },
                ],
              },
            },
          },
          {
            type: 'tool_execution_start',
            toolCallId: 'extension-call',
            toolName: nativeName,
            args: { query: 'example' },
          },
          {
            type: 'tool_execution_end',
            toolCallId: 'extension-call',
            toolName: nativeName,
            result: { content: [{ type: 'text', text: 'extension result' }] },
          },
          {
            type: 'turn_end',
            message: { role: 'assistant', content: [], stopReason: 'stop' },
          },
        ],
      });
      piMock.session = fakePiSession;
      const session = await createPi({
        extensionFactories: [vi.fn()],
      }).doStart({
        sessionId: `session-filtered-extension-${nativeName}`,
        sandboxSession: createSandboxSession(),
        sessionWorkDir: '/sandbox/work',
        builtinToolFiltering: { mode: 'deny', toolNames: [filteredTool] },
      });

      try {
        for (const prompt of ['First turn.', 'Second turn.']) {
          const emitted: HarnessV1StreamPart[] = [];
          const control = await session.doPromptTurn({
            skills: [],
            prompt,
            tools: [],
            emit: part => emitted.push(part),
          });
          await control.done;

          expect(
            emitted.filter(part =>
              ['tool-input-start', 'tool-call', 'tool-result'].includes(
                part.type,
              ),
            ),
          ).toEqual([
            {
              type: 'tool-input-start',
              id: 'extension-call',
              toolName: nativeName,
              dynamic: true,
              providerExecuted: true,
            },
            {
              type: 'tool-call',
              toolCallId: 'extension-call',
              toolName: nativeName,
              input: '{"query":"example"}',
              dynamic: true,
              providerExecuted: true,
            },
            {
              type: 'tool-result',
              toolCallId: 'extension-call',
              toolName: nativeName,
              result: 'extension result',
              dynamic: true,
            },
          ]);
        }

        expect(piMock.customTools.map(tool => tool.name)).not.toContain(
          nativeName,
        );
        expect(piMock.createAgentSession).toHaveBeenCalledOnce();
      } finally {
        await session.doDestroy();
      }
    },
  );

  it('defaults model requests to the cacheRetention setting', async () => {
    const streamFunction = vi.fn();
    const piSession = Object.assign(createFakePiSession().session, {
      agent: { streamFunction },
    });
    piMock.session = piSession;

    const session = await createPi({ cacheRetention: 'long' }).doStart({
      sessionId: 'session-cache-retention',
      sandboxSession: createSandboxSession(),
      sessionWorkDir: '/sandbox/work',
    });

    try {
      const control = await session.doPromptTurn({
        skills: [],
        prompt: 'Hello.',
        tools: [],
        emit: vi.fn(),
      });
      await control.done;

      const model = { id: 'claude-sonnet-4-5' };
      const context = { messages: [] };
      piSession.agent.streamFunction(model as never, context as never, {
        maxTokens: 1024,
      });

      expect(streamFunction).toHaveBeenCalledWith(model, context, {
        maxTokens: 1024,
        cacheRetention: 'long',
      });

      piSession.agent.streamFunction(model as never, context as never, {
        cacheRetention: 'none',
      });

      expect(streamFunction).toHaveBeenLastCalledWith(model, context, {
        cacheRetention: 'none',
      });
    } finally {
      await session.doDestroy();
    }
  });

  it('preserves caller order and passes a fresh mutable factory array', async () => {
    const callOrder: string[] = [];
    const firstFactory: ExtensionFactory = () => {
      callOrder.push('first');
    };
    const secondFactory: ExtensionFactory = () => {
      callOrder.push('second');
    };
    const extensionFactories = [firstFactory, secondFactory] as const;

    const session = await createPi({ extensionFactories }).doStart({
      sessionId: 'session-ordered-extensions',
      sandboxSession: createSandboxSession(),
      sessionWorkDir: '/sandbox/work',
    });

    try {
      const extensionFactoryInput = piMock.extensionFactoryInputs.at(-1);
      expect(callOrder).toEqual(['first', 'second']);
      expect(extensionFactoryInput?.snapshot).toHaveLength(2);
      expect(extensionFactoryInput?.reference).not.toBe(extensionFactories);
    } finally {
      await session.doDestroy();
    }
  });

  it('does not reload inline extensions between turns', async () => {
    const observedEvents: string[] = [];
    const factory = vi.fn((piApi: ExtensionAPI) => {
      piApi.on('agent_start', () => {
        observedEvents.push('agent_start');
      });
    });
    piMock.session = {
      abort: vi.fn(async () => {}),
      compact: vi.fn(async () => {}),
      dispose: vi.fn(),
      getSessionStats: () => ({
        tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      }),
      prompt: vi.fn(async () => {
        for (const handler of piMock.extensionHandlers.get('agent_start') ??
          []) {
          await handler();
        }
      }),
      steer: vi.fn(async () => {}),
      subscribe: vi.fn(() => () => {}),
    } as unknown as AgentSession;

    const session = await createPi({
      extensionFactories: [factory],
    }).doStart({
      sessionId: 'session-multiple-extension-turns',
      sandboxSession: createSandboxSession(),
      sessionWorkDir: '/sandbox/work',
    });

    try {
      for (const prompt of ['first turn', 'second turn']) {
        const control = await session.doPromptTurn({
          skills: [],
          prompt,
          tools: [],
          emit: vi.fn(),
        });
        await control.done;
      }

      expect(factory).toHaveBeenCalledOnce();
      expect(observedEvents).toEqual(['agent_start', 'agent_start']);
      expect(piMock.resourceLoaderReloadCount).toBe(3);
      expect(piMock.agentSessionExtensionResults).toHaveLength(1);
    } finally {
      await session.doDestroy();
    }
  });

  it("reports each turn's own usage rather than the session's running total", async () => {
    const sessionTokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    const turnUsages = [
      { input: 4, output: 137, cacheRead: 0, cacheWrite: 13343, reasoning: 0 },
      {
        input: 2,
        output: 45,
        cacheRead: 13343,
        cacheWrite: 168,
        reasoning: 30,
      },
    ];
    let turnIndex = 0;
    piMock.session = createFakePiSession({
      getSessionStats: () => ({ tokens: { ...sessionTokens } }),
      promptImplementation: async (_text, emitEvent) => {
        const usage = turnUsages[turnIndex++];
        sessionTokens.input += usage.input;
        sessionTokens.output += usage.output;
        sessionTokens.cacheRead += usage.cacheRead;
        sessionTokens.cacheWrite += usage.cacheWrite;
        const message = {
          role: 'assistant',
          content: [{ type: 'text', text: 'done' }],
          usage,
        };
        emitEvent({ type: 'turn_start' });
        emitEvent({ type: 'message_start', message });
        emitEvent({ type: 'message_end', message });
        emitEvent({ type: 'turn_end', message });
      },
    }).session;
    const session = await createPiSession({
      sessionId: 'session-turn-usage',
      sandboxSession: createSandboxSession(),
      sessionWorkDir: '/sandbox/work',
      settings: {},
      clientApp: 'ai-sdk-harness-pi/0.0.0-test',
      isResume: false,
    });

    try {
      const finishes: unknown[] = [];
      for (const prompt of ['first turn', 'second turn']) {
        const emit = vi.fn();
        const control = await session.doPromptTurn({
          skills: [],
          prompt,
          tools: [],
          emit,
        });
        await control.done;
        finishes.push(
          emit.mock.calls.map(([part]) => part).find(p => p.type === 'finish'),
        );
      }

      expect(finishes).toEqual([
        expect.objectContaining({
          totalUsage: {
            inputTokens: {
              total: 13347,
              noCache: 4,
              cacheRead: 0,
              cacheWrite: 13343,
            },
            outputTokens: { total: 137, text: 137, reasoning: 0 },
          },
        }),
        expect.objectContaining({
          totalUsage: {
            inputTokens: {
              total: 13513,
              noCache: 2,
              cacheRead: 13343,
              cacheWrite: 168,
            },
            outputTokens: { total: 45, text: 15, reasoning: 30 },
          },
        }),
      ]);
    } finally {
      await session.doDestroy();
    }
  });

  it('finishes a turn that Pi recovered by retrying a failed request', async () => {
    const usage = { input: 2, output: 7, cacheRead: 0, cacheWrite: 0 };
    const failed = {
      role: 'assistant',
      content: [{ type: 'text', text: 'Coffee beans grow' }],
      stopReason: 'error',
      errorMessage:
        '529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}',
      usage,
    };
    const answer = {
      role: 'assistant',
      content: [{ type: 'text', text: 'Coffee beans come from cherries.' }],
      stopReason: 'stop',
      usage,
    };
    piMock.session = createFakePiSession({
      promptEvents: [
        { type: 'agent_start' },
        { type: 'turn_start' },
        { type: 'message_start', message: failed },
        { type: 'message_end', message: failed },
        { type: 'turn_end', message: failed },
        { type: 'agent_end', messages: [], willRetry: true },
        {
          type: 'auto_retry_start',
          attempt: 1,
          maxAttempts: 3,
          delayMs: 2000,
          errorMessage: failed.errorMessage,
        },
        { type: 'agent_start' },
        { type: 'turn_start' },
        { type: 'message_start', message: answer },
        { type: 'message_end', message: answer },
        { type: 'auto_retry_end', success: true, attempt: 1 },
        { type: 'turn_end', message: answer },
        { type: 'agent_end', messages: [], willRetry: false },
      ],
    }).session;
    const session = await createPiSession({
      sessionId: 'session-retried-turn',
      sandboxSession: createSandboxSession(),
      sessionWorkDir: '/sandbox/work',
      settings: {},
      clientApp: 'ai-sdk-harness-pi/0.0.0-test',
      isResume: false,
    });

    try {
      const emit = vi.fn();
      const control = await session.doPromptTurn({
        skills: [],
        prompt: 'Where do coffee beans come from?',
        tools: [],
        emit,
      });
      await control.done;

      const types = emit.mock.calls.map(([part]) => part.type);
      expect(types).not.toContain('error');
      expect(types.at(-1)).toBe('finish');
    } finally {
      await session.doDestroy();
    }
  });

  it('does not report a terminal error from a turn cut by its own suspension', async () => {
    const started = createDeferred<void>();
    const aborted = createDeferred<void>();
    const failed = {
      role: 'assistant',
      content: [],
      stopReason: 'error',
      errorMessage:
        '400 {"type":"error","error":{"type":"invalid_request_error","message":"bad request"}}',
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    };
    const fake = createFakePiSession({
      promptImplementation: async (_text, emitEvent) => {
        emitEvent({ type: 'turn_start' });
        started.resolve();
        await aborted.promise;
        emitEvent({ type: 'message_start', message: failed });
        emitEvent({ type: 'message_end', message: failed });
        emitEvent({ type: 'turn_end', message: failed });
      },
    });
    fake.abort.mockImplementation(async () => aborted.resolve());
    piMock.session = fake.session;
    const session = await createPiSession({
      sessionId: 'session-suspend-terminal-error',
      sandboxSession: createSandboxSession(),
      sessionWorkDir: '/sandbox/work',
      settings: {},
      clientApp: 'ai-sdk-harness-pi/0.0.0-test',
      isResume: false,
    });
    const emit = vi.fn();
    const control = await session.doPromptTurn({
      skills: [],
      prompt: 'go',
      tools: [],
      emit,
    });
    await started.promise;

    await session.doSuspendTurn();
    await control.done;

    expect(emit.mock.calls.map(([part]) => part.type)).not.toContain('error');
  });

  it('does not report a turn that throws while it is being suspended', async () => {
    const started = createDeferred<void>();
    const aborted = createDeferred<void>();
    const fake = createFakePiSession({
      promptImplementation: async (_text, emitEvent) => {
        emitEvent({ type: 'turn_start' });
        started.resolve();
        await aborted.promise;
        throw new Error('socket hang up');
      },
    });
    fake.abort.mockImplementation(async () => aborted.resolve());
    piMock.session = fake.session;
    const session = await createPiSession({
      sessionId: 'session-suspend-thrown-error',
      sandboxSession: createSandboxSession(),
      sessionWorkDir: '/sandbox/work',
      settings: {},
      clientApp: 'ai-sdk-harness-pi/0.0.0-test',
      isResume: false,
    });
    const emit = vi.fn();
    const control = await session.doPromptTurn({
      skills: [],
      prompt: 'go',
      tools: [],
      emit,
    });
    await started.promise;

    await session.doSuspendTurn();
    await control.done;

    expect(emit.mock.calls.map(([part]) => part.type)).not.toContain('error');
  });

  it('lets a running tool settle before aborting a suspended turn', async () => {
    const toolStarted = createDeferred<void>();
    const toolDone = createDeferred<void>();
    const aborted = createDeferred<void>();
    const toolEvent = { toolCallId: 'tool-1', toolName: 'mcp__video__render' };
    const cut = {
      role: 'assistant',
      content: [],
      stopReason: 'aborted',
      errorMessage: 'Request was aborted',
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    };
    const fake = createFakePiSession({
      promptImplementation: async (_text, emitEvent) => {
        emitEvent({ type: 'turn_start' });
        emitEvent({ type: 'tool_execution_start', ...toolEvent, args: {} });
        toolStarted.resolve();
        await toolDone.promise;
        emitEvent({
          type: 'tool_execution_end',
          ...toolEvent,
          result: { content: [{ type: 'text', text: 'rendered' }] },
          isError: false,
        });
        await aborted.promise;
        emitEvent({ type: 'message_start', message: cut });
        emitEvent({ type: 'message_end', message: cut });
        emitEvent({ type: 'turn_end', message: cut });
      },
    });
    fake.abort.mockImplementation(async () => aborted.resolve());
    piMock.session = fake.session;
    const session = await createPiSession({
      sessionId: 'session-suspend-settles-tool',
      sandboxSession: createSandboxSession(),
      sessionWorkDir: '/sandbox/work',
      settings: { suspendToolSettleMs: 5000 },
      clientApp: 'ai-sdk-harness-pi/0.0.0-test',
      isResume: false,
    });
    const emit = vi.fn();
    const control = await session.doPromptTurn({
      skills: [],
      prompt: 'render the video',
      tools: [],
      emit,
    });
    await toolStarted.promise;

    const suspension = session.doSuspendTurn();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(fake.abort).not.toHaveBeenCalled();

    const [blockToolCall] = piMock.extensionHandlers.get('tool_call') ?? [];
    expect(
      blockToolCall?.({
        type: 'tool_call',
        toolName: 'bash',
        toolCallId: 'tool-2',
        input: { command: 'ls' },
      }),
    ).toEqual({ block: true, reason: expect.stringContaining('pausing') });

    toolDone.resolve();
    await suspension;
    await control.done;

    expect(fake.abort).toHaveBeenCalledOnce();
    const types = emit.mock.calls.map(([part]) => part.type);
    expect(types).toContain('tool-result');
    expect(types).not.toContain('error');
  });

  it('aborts a suspended turn once suspendToolSettleMs passes with a tool still running', async () => {
    const toolStarted = createDeferred<void>();
    const aborted = createDeferred<void>();
    const fake = createFakePiSession({
      promptImplementation: async (_text, emitEvent) => {
        emitEvent({ type: 'turn_start' });
        emitEvent({
          type: 'tool_execution_start',
          toolCallId: 'tool-1',
          toolName: 'bash',
          args: { command: 'sleep 60' },
        });
        toolStarted.resolve();
        await aborted.promise;
      },
    });
    fake.abort.mockImplementation(async () => aborted.resolve());
    piMock.session = fake.session;
    const session = await createPiSession({
      sessionId: 'session-suspend-settle-timeout',
      sandboxSession: createSandboxSession(),
      sessionWorkDir: '/sandbox/work',
      settings: { suspendToolSettleMs: 20 },
      clientApp: 'ai-sdk-harness-pi/0.0.0-test',
      isResume: false,
    });
    const control = await session.doPromptTurn({
      skills: [],
      prompt: 'wait',
      tools: [],
      emit: vi.fn(),
    });
    await toolStarted.promise;

    await session.doSuspendTurn();
    await control.done;

    expect(fake.abort).toHaveBeenCalledOnce();
  });

  it('materializes skills under sandbox HOME on prompt turn', async () => {
    piMock.session = {
      abort: vi.fn(async () => {}),
      compact: vi.fn(async () => {}),
      dispose: vi.fn(),
      getSessionStats: () => ({
        tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      }),
      prompt: vi.fn(async () => {}),
      steer: vi.fn(async () => {}),
      subscribe: vi.fn(() => () => {}),
    } as unknown as AgentSession;
    const sandboxSession = createSandboxSession();
    const session = await createPiSession({
      sessionId: 'session-skills',
      sandboxSession,
      sessionWorkDir: '/sandbox/work',
      settings: {},
      clientApp: 'ai-sdk-harness-pi/0.0.0-test',
      isResume: false,
    });

    try {
      const control = await session.doPromptTurn({
        skills: [
          {
            name: 'demo-skill',
            description: 'Demo skill description',
            content: 'Skill instructions content',
          },
        ],
        prompt: 'test prompt',
        tools: [],
        emit: vi.fn(),
      });
      await control.done;

      expect(sandboxSession.run).toHaveBeenCalledWith(
        expect.objectContaining({
          command: "mkdir -p '/sandbox/home/.agents/skills'",
        }),
      );
      expect(sandboxSession.writeTextFile).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/sandbox/home/.agents/skills/demo-skill/SKILL.md',
          content:
            '---\nname: demo-skill\ndescription: Demo skill description\n---\n\nSkill instructions content',
        }),
      );
    } finally {
      await session.doDestroy();
    }
  });

  it('removes materialized skills once, then leaves the sandbox alone', async () => {
    piMock.session = createFakePiSession().session;
    const sandboxSession = createSandboxSession();
    const session = await createPiSession({
      sessionId: 'session-skills-removed',
      sandboxSession,
      sessionWorkDir: '/sandbox/work',
      settings: {},
      clientApp: 'ai-sdk-harness-pi/0.0.0-test',
      isResume: false,
    });
    const runTurn = async (skills: HarnessV1Skill[]) => {
      const control = await session.doPromptTurn({
        skills,
        prompt: 'test prompt',
        tools: [],
        emit: vi.fn(),
      });
      await control.done;
    };

    try {
      await runTurn([
        {
          name: 'demo-skill',
          description: 'Demo skill description',
          content: 'Skill instructions content',
        },
      ]);
      await runTurn([]);
      expect(sandboxSession.run).toHaveBeenCalledWith(
        expect.objectContaining({
          command: "rm -rf -- '/sandbox/home/.agents/skills/demo-skill'",
        }),
      );

      vi.mocked(sandboxSession.run).mockClear();
      vi.mocked(sandboxSession.readTextFile).mockClear();
      await runTurn([]);
      expect(sandboxSession.run).not.toHaveBeenCalled();
      expect(sandboxSession.readTextFile).not.toHaveBeenCalled();
    } finally {
      await session.doDestroy();
    }
  });

  it('applies fileToolPathPolicy to the native read tool', async () => {
    const files = new Map([
      ['/tmp/report.txt', 'report body'],
      ['/sandbox/home/notes.txt', 'notes body'],
      ['/sandbox/home/.credentials/token', 'secret body'],
    ]);
    const sandboxSession = createSandboxSession();
    const run = vi.mocked(sandboxSession.run);
    const runWithoutRealpath = run.getMockImplementation()!;
    run.mockImplementation(async input => {
      const target = input.command.match(/^target='([^']+)'/)?.[1];
      const marker = input.command.match(/realpath_marker='([^']+)'/)?.[1];
      if (target == null || marker == null) return runWithoutRealpath(input);
      return {
        stdout: `${Buffer.from(target).toString('base64')}${marker}`,
        stderr: '',
        exitCode: 0,
      };
    });
    vi.mocked(sandboxSession.readBinaryFile).mockImplementation(
      async ({ path: filePath }) => {
        const content = files.get(filePath);
        return content == null ? null : new TextEncoder().encode(content);
      },
    );
    let reads: PromiseSettledResult<string>[] = [];
    piMock.session = createFakePiSession({
      promptImplementation: async () => {
        reads = await Promise.allSettled([
          executeReadTool('/tmp/report.txt'),
          executeReadTool('~/notes.txt'),
          executeReadTool('/sandbox/home/.credentials/token'),
        ]);
      },
    }).session;

    const session = await createPi({
      fileToolPathPolicy: {
        readableRoots: ['/sandbox/home', '/tmp'],
        deniedRoots: ['/sandbox/home/.credentials'],
      },
    }).doStart({
      sessionId: 'session-file-tool-path-policy',
      sandboxSession,
      sessionWorkDir: '/sandbox/work',
    });

    try {
      const control = await session.doPromptTurn({
        skills: [],
        prompt: 'test prompt',
        tools: [],
        emit: vi.fn(),
      });
      await control.done;

      expect(reads).toEqual([
        { status: 'fulfilled', value: expect.stringContaining('report body') },
        { status: 'fulfilled', value: expect.stringContaining('notes body') },
        {
          status: 'rejected',
          reason: expect.objectContaining({
            message: expect.stringContaining('inside a denied root'),
          }),
        },
      ]);
    } finally {
      await session.doDestroy();
    }
  });

  it('refuses the canonical target of a symlinked denied root', async () => {
    const alias = '/sandbox/home/blocked';
    const target = '/sandbox/work/private';
    const sandboxSession = createSandboxSession();
    const run = vi.mocked(sandboxSession.run);
    const runWithoutRealpath = run.getMockImplementation()!;
    run.mockImplementation(async input => {
      const remotePath = input.command.match(/^target='([^']+)'/)?.[1];
      const marker = input.command.match(/realpath_marker='([^']+)'/)?.[1];
      if (remotePath == null || marker == null) {
        return runWithoutRealpath(input);
      }
      return {
        stdout: `${Buffer.from(remotePath === alias ? target : remotePath).toString('base64')}${marker}`,
        stderr: '',
        exitCode: 0,
      };
    });
    vi.mocked(sandboxSession.readBinaryFile).mockImplementation(
      async ({ path: filePath }) =>
        filePath === `${target}/notes.txt`
          ? new TextEncoder().encode('private notes')
          : filePath === '/sandbox/work/public.txt'
            ? new TextEncoder().encode('public notes')
            : null,
    );

    let reads: PromiseSettledResult<string>[] = [];
    piMock.session = createFakePiSession({
      promptImplementation: async () => {
        reads = await Promise.allSettled([
          executeReadTool(`${target}/notes.txt`),
          executeReadTool(`${alias}/notes.txt`),
          executeReadTool('/sandbox/work/public.txt'),
        ]);
      },
    }).session;

    const session = await createPi({
      fileToolPathPolicy: {
        readableRoots: ['/sandbox/home'],
        deniedRoots: [alias],
      },
    }).doStart({
      sessionId: 'session-symlinked-denied-root',
      sandboxSession,
      sessionWorkDir: '/sandbox/work',
    });

    try {
      const control = await session.doPromptTurn({
        skills: [],
        prompt: 'test prompt',
        tools: [],
        emit: vi.fn(),
      });
      await control.done;

      expect(reads).toEqual([
        {
          status: 'rejected',
          reason: expect.objectContaining({
            message: expect.stringContaining('inside a denied root'),
          }),
        },
        {
          status: 'rejected',
          reason: expect.objectContaining({
            message: expect.stringContaining('inside a denied root'),
          }),
        },
        {
          status: 'fulfilled',
          value: expect.stringContaining('public notes'),
        },
      ]);
      expect(sandboxSession.readBinaryFile).not.toHaveBeenCalledWith({
        path: `${target}/notes.txt`,
      });
    } finally {
      await session.doDestroy();
    }
  });

  it('fails native file tools when a denied root cannot be resolved in the sandbox', async () => {
    const alias = '/sandbox/home/blocked';
    const sandboxSession = createSandboxSession();
    const run = vi.mocked(sandboxSession.run);
    run.mockImplementation(async ({ command }) => ({
      stdout: command.startsWith(`target='${alias}'`)
        ? '__PI_REALPATH_FAILED__\n'
        : '',
      stderr: '',
      exitCode: command.startsWith(`target='${alias}'`) ? 3 : 0,
    }));
    const readErrors: unknown[] = [];
    piMock.session = createFakePiSession({
      promptImplementation: async () => {
        for (const file of ['first.txt', 'second.txt']) {
          await executeReadTool(file).catch(error => readErrors.push(error));
        }
      },
    }).session;

    const session = await createPi({
      fileToolPathPolicy: { deniedRoots: [alias] },
    }).doStart({
      sessionId: 'session-unresolved-denied-root',
      sandboxSession,
      sessionWorkDir: '/sandbox/work',
    });
    expect(run).not.toHaveBeenCalled();

    try {
      const control = await session.doPromptTurn({
        skills: [],
        prompt: 'test prompt',
        tools: [],
        emit: vi.fn(),
      });
      await control.done;

      const unresolved = expect.objectContaining({
        message: `Unable to resolve path: ${alias}`,
      });
      expect(readErrors).toEqual([unresolved, unresolved]);
      expect(
        run.mock.calls.filter(([{ command }]) =>
          command.startsWith(`target='${alias}'`),
        ),
      ).toHaveLength(2);
      expect(sandboxSession.readBinaryFile).not.toHaveBeenCalled();
    } finally {
      await session.doDestroy();
    }
  });

  it('starts and runs a chat-only turn without touching the sandbox', async () => {
    const sandboxSession = createThrowingSandboxSession();
    const { session: fakePiSession, prompt } = createFakePiSession();
    piMock.session = fakePiSession;

    const session = await createPi().doStart({
      sessionId: 'session-chat-only',
      sandboxSession,
      sessionWorkDir: '/sandbox/work',
    });
    const control = await session.doPromptTurn({
      skills: [],
      prompt: 'Hello.',
      tools: [],
      emit: vi.fn(),
    });
    await control.done;
    await session.doStop();

    expect(prompt).toHaveBeenCalledExactlyOnceWith('Hello.');
    for (const method of [
      sandboxSession.run,
      sandboxSession.spawn,
      sandboxSession.readFile,
      sandboxSession.readBinaryFile,
      sandboxSession.readTextFile,
      sandboxSession.writeFile,
      sandboxSession.writeBinaryFile,
      sandboxSession.writeTextFile,
      sandboxSession.stop,
      sandboxSession.destroy,
      sandboxSession.getPortEndpoint,
      sandboxSession.getPortUrl,
    ]) {
      expect(method).not.toHaveBeenCalled();
    }
  });

  it('keeps native reads inside the workspace without fileToolPathPolicy', async () => {
    const sandboxSession = createSandboxSession();
    let reads: PromiseSettledResult<string>[] = [];
    piMock.session = createFakePiSession({
      promptImplementation: async () => {
        reads = await Promise.allSettled([
          executeReadTool('/tmp/report.txt'),
          executeReadTool('/sandbox/home/notes.txt'),
        ]);
      },
    }).session;

    const session = await createPi().doStart({
      sessionId: 'session-default-file-tool-paths',
      sandboxSession,
      sessionWorkDir: '/sandbox/work',
    });

    try {
      const control = await session.doPromptTurn({
        skills: [],
        prompt: 'test prompt',
        tools: [],
        emit: vi.fn(),
      });
      await control.done;

      const escapesWorkspace = {
        status: 'rejected',
        reason: expect.objectContaining({
          message: expect.stringContaining('escapes the workspace'),
        }),
      };
      expect(reads).toEqual([escapesWorkspace, escapesWorkspace]);
      expect(sandboxSession.readBinaryFile).not.toHaveBeenCalledWith(
        expect.objectContaining({ path: '/tmp/report.txt' }),
      );
    } finally {
      await session.doDestroy();
    }
  });

  describe('native read tool', () => {
    const onePixelPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );

    async function readInSandbox(
      files: Record<string, Uint8Array | string>,
      read: () => Promise<unknown>,
    ) {
      const sandboxSession = createSandboxSession();
      const run = vi.mocked(sandboxSession.run);
      const runWithoutRealpath = run.getMockImplementation()!;
      run.mockImplementation(async input => {
        const target = input.command.match(/^target='([^']+)'/)?.[1];
        const marker = input.command.match(/realpath_marker='([^']+)'/)?.[1];
        if (target == null || marker == null) return runWithoutRealpath(input);
        return {
          stdout: `${Buffer.from(target).toString('base64')}${marker}`,
          stderr: '',
          exitCode: 0,
        };
      });
      vi.mocked(sandboxSession.readBinaryFile).mockImplementation(
        async ({ path: filePath }) => {
          const content = files[filePath];
          return typeof content === 'string'
            ? new TextEncoder().encode(content)
            : content;
        },
      );
      let result: unknown;
      piMock.session = createFakePiSession({
        promptImplementation: async () => {
          result = await read();
        },
      }).session;

      const session = await createPi().doStart({
        sessionId: 'session-native-read',
        sandboxSession,
        sessionWorkDir: '/sandbox/work',
      });
      try {
        const control = await session.doPromptTurn({
          skills: [],
          prompt: 'test prompt',
          tools: [],
          emit: vi.fn(),
        });
        await control.done;
      } finally {
        await session.doDestroy();
      }
      return { result, sandboxSession };
    }

    it('returns an image read as an image block', async () => {
      const { result } = await readInSandbox(
        { '/sandbox/work/screenshot.png': onePixelPng },
        () => executeReadToolContent('screenshot.png'),
      );

      expect(result).toEqual([
        { type: 'text', text: 'Read image file [image/png]' },
        { type: 'image', mimeType: 'image/png', data: expect.any(String) },
      ]);
    });

    it('pages a long text read with an offset continuation notice', async () => {
      const text = Array.from(
        { length: 3_000 },
        (_, index) => `line ${index + 1}`,
      ).join('\n');
      const { result, sandboxSession } = await readInSandbox(
        { '/sandbox/work/large.txt': text },
        () =>
          Promise.all([
            executeReadToolContent('large.txt'),
            executeReadToolContent('/sandbox/work/large.txt', {
              offset: 2001,
              limit: 10,
            }),
          ]),
      );

      const [firstPage, nextPage] = result as Array<
        Array<{ type: string; text: string }>
      >;
      expect(firstPage).toEqual([
        {
          type: 'text',
          text: expect.stringContaining(
            '[Showing lines 1-2000 of 3000. Use offset=2001 to continue.]',
          ),
        },
      ]);
      expect(nextPage).toEqual([
        {
          type: 'text',
          text: `${Array.from({ length: 10 }, (_, index) => `line ${index + 2001}`).join('\n')}\n\n[990 more lines in file. Use offset=2011 to continue.]`,
        },
      ]);
      expect(sandboxSession.readBinaryFile).toHaveBeenCalledTimes(2);
    });
  });

  it('steers the active Pi session', async () => {
    let finishPrompt!: () => void;
    const promptDone = new Promise<void>(resolve => {
      finishPrompt = resolve;
    });
    const steer = vi.fn(async () => {});
    piMock.session = {
      abort: vi.fn(async () => {}),
      compact: vi.fn(async () => {}),
      dispose: vi.fn(),
      getSessionStats: () => ({
        tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      }),
      prompt: vi.fn(async () => promptDone),
      steer,
      subscribe: vi.fn(() => () => {}),
    } as unknown as AgentSession;
    const session = await createPiSession({
      sessionId: 'session-steering',
      sandboxSession: createSandboxSession(),
      sessionWorkDir: '/sandbox/work',
      settings: {},
      clientApp: 'ai-sdk-harness-pi/0.0.0-test',
      isResume: false,
    });

    try {
      const control = await session.doPromptTurn({
        skills: [],
        prompt: 'Weather in Paris?',
        tools: [],
        emit: vi.fn(),
      });
      await control.submitUserMessage?.('Actually, Paris, Texas.');

      expect(steer).toHaveBeenCalledExactlyOnceWith('Actually, Paris, Texas.');
      finishPrompt();
      await control.done;
    } finally {
      await session.doDestroy();
    }
  });

  it('reloads inline extensions when the Pi session is rebuilt', async () => {
    const factory = vi.fn();
    piMock.session = {
      abort: vi.fn(async () => {}),
      compact: vi.fn(async () => {}),
      dispose: vi.fn(),
      getSessionStats: () => ({
        tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      }),
      prompt: vi.fn(async () => {}),
      steer: vi.fn(async () => {}),
      subscribe: vi.fn(() => () => {}),
    } as unknown as AgentSession;

    const session = await createPi({
      extensionFactories: [factory],
    }).doStart({
      sessionId: 'session-rebuilt-extension-runtime',
      sandboxSession: createSandboxSession(),
      sessionWorkDir: '/sandbox/work',
    });

    try {
      const firstControl = await session.doPromptTurn({
        skills: [],
        prompt: 'first turn',
        tools: [],
        emit: vi.fn(),
      });
      await firstControl.done;
      const secondControl = await session.doPromptTurn({
        skills: [],
        prompt: 'second turn',
        tools: [{ name: 'new-tool' }],
        emit: vi.fn(),
      });
      await secondControl.done;

      expect(factory).toHaveBeenCalledTimes(2);
      expect(piMock.resourceLoaderReloadCount).toBe(3);
      expect(piMock.agentSessionExtensionResults).toHaveLength(2);
      expect(piMock.agentSessionExtensionResults[0]).not.toBe(
        piMock.agentSessionExtensionResults[1],
      );
    } finally {
      await session.doDestroy();
    }
  });

  it('keeps filesystem extensions and other resources disabled by default', async () => {
    const session = await createPi().doStart({
      sessionId: 'session-no-extensions',
      sandboxSession: createSandboxSession(),
      sessionWorkDir: '/sandbox/work',
    });

    try {
      expect(piMock.resourceLoaderOptions.at(-1)).toMatchObject({
        extensionFactories: [],
        noContextFiles: true,
        noExtensions: true,
        noPromptTemplates: true,
        noSkills: true,
        noThemes: true,
      });
      expect(
        piMock.resourceLoaderOptions.at(-1)?.agentsFilesOverride?.({
          agentsFiles: [{ path: '/sandbox/work/AGENTS.md', content: 'x' }],
        }),
      ).toEqual({ agentsFiles: [] });
      expect(
        piMock.resourceLoaderOptions.at(-1)?.skillsOverride?.({
          skills: [],
          diagnostics: [],
        }),
      ).toEqual({ skills: [], diagnostics: [] });
      expect(
        piMock.resourceLoaderOptions.at(-1)?.extensionsOverride,
      ).toBeUndefined();
    } finally {
      await session.doDestroy();
    }
  });

  it('gives Pi the configured context files and skills and lets read open the skill file', async () => {
    const skillPath = '/sandbox/skills/brand-voice/SKILL.md';
    const sandboxSession = createSandboxSession();
    const run = vi.mocked(sandboxSession.run);
    const runWithoutRealpath = run.getMockImplementation()!;
    run.mockImplementation(async input => {
      const target = input.command.match(/^target='([^']+)'/)?.[1];
      const marker = input.command.match(/realpath_marker='([^']+)'/)?.[1];
      if (target == null || marker == null) return runWithoutRealpath(input);
      return {
        stdout: `${Buffer.from(target).toString('base64')}${marker}`,
        stderr: '',
        exitCode: 0,
      };
    });
    vi.mocked(sandboxSession.readBinaryFile).mockImplementation(
      async ({ path: filePath }) =>
        filePath === skillPath ? new TextEncoder().encode('voice rules') : null,
    );
    let reads: PromiseSettledResult<string>[] = [];
    piMock.session = createFakePiSession({
      promptImplementation: async () => {
        reads = await Promise.allSettled([
          executeReadTool(skillPath),
          executeReadTool('/sandbox/skills/other/SKILL.md'),
        ]);
      },
    }).session;

    const session = await createPi({
      resources: {
        contextFiles: [
          { path: '/sandbox/work/AGENTS.md', content: 'Project note' },
        ],
        skills: [
          {
            name: 'brand-voice',
            description: 'Voice rules',
            filePath: skillPath,
          },
        ],
      },
    }).doStart({
      sessionId: 'session-resources',
      sandboxSession,
      sessionWorkDir: '/sandbox/work',
    });

    try {
      const control = await session.doPromptTurn({
        skills: [],
        prompt: 'test prompt',
        tools: [],
        emit: vi.fn(),
      });
      await control.done;

      const loaderOptions = piMock.resourceLoaderOptions.at(-1);
      expect(loaderOptions?.agentsFilesOverride?.({ agentsFiles: [] })).toEqual(
        {
          agentsFiles: [
            { path: '/sandbox/work/AGENTS.md', content: 'Project note' },
          ],
        },
      );
      expect(
        loaderOptions?.skillsOverride?.({ skills: [], diagnostics: [] }),
      ).toEqual({
        skills: [
          {
            name: 'brand-voice',
            description: 'Voice rules',
            filePath: skillPath,
            baseDir: '/sandbox/skills/brand-voice',
            sourceInfo: {
              path: skillPath,
              source: 'harness',
              scope: 'temporary',
              origin: 'top-level',
              baseDir: '/sandbox/skills/brand-voice',
            },
            disableModelInvocation: false,
          },
        ],
        diagnostics: [],
      });
      expect(reads).toEqual([
        { status: 'fulfilled', value: expect.stringContaining('voice rules') },
        {
          status: 'rejected',
          reason: expect.objectContaining({
            message: expect.stringContaining('escapes the workspace'),
          }),
        },
      ]);
    } finally {
      await session.doDestroy();
    }
  });

  it('registers configured MCP servers as direct Pi tools by default', async () => {
    const bindExtensions = vi.fn(async () => {});
    const dispose = vi.fn();
    piMock.session = {
      bindExtensions,
      dispose,
      extensionRunner: { emit: vi.fn(async () => {}) },
      getSessionStats: () => ({
        tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      }),
      prompt: vi.fn(async () => {}),
      subscribe: vi.fn(() => () => {}),
    } as unknown as AgentSession;

    const sandboxSession = createSandboxSession();
    const session = await createPiSession({
      sessionId: 'session-mcp',
      sandboxSession,
      sessionWorkDir: '/sandbox/work',
      settings: {
        mcpServers: {
          memory: { command: 'memory-mcp', args: [] },
        },
      },
      clientApp: 'ai-sdk-harness-pi/0.0.0-test',
      isResume: false,
    });
    const control = await session.doPromptTurn({
      skills: [],
      prompt: 'Use an MCP tool.',
      tools: [],
      emit: vi.fn(),
    });
    await control.done;
    await session.doDestroy();

    expect(
      piMock.extensionApi.registerMcpServer,
    ).toHaveBeenCalledExactlyOnceWith('memory', {
      exposure: 'direct',
      command: 'memory-mcp',
      args: [],
    });
    expect(mcpMock.createMcpExtension).toHaveBeenCalledExactlyOnceWith({
      loadConfig: expect.any(Function),
      logPath: devNull,
    });
    const [mcpOptions] = mcpMock.createMcpExtension.mock
      .lastCall as unknown as [{ loadConfig: () => unknown }];
    expect(mcpOptions.loadConfig()).toEqual({ servers: [], errors: [] });
    expect(mcpMock.createToolSearchExtension).toHaveBeenCalledOnce();
    expect(piMock.resourceLoaderOptions.at(-1)?.extensionFactories).toEqual([
      mcpMock.toolSearchFactory,
      mcpMock.mcpExtensionFactory,
      expect.any(Function),
    ]);
    expect(piMock.createAgentSession).toHaveBeenCalledWith(
      expect.objectContaining({ noTools: 'builtin' }),
    );
    expect(bindExtensions).toHaveBeenCalledWith({ mode: 'print' });
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("keeps a server's own exposure and tool overrides", async () => {
    const brand = {
      url: 'https://mcp.example.com',
      headers: { Authorization: 'Bearer token' },
      exposure: 'deferred',
      toolExposure: { secret: 'hidden' },
    } as const;

    const session = await createPi({ mcpServers: { brand } }).doStart({
      sessionId: 'session-mcp-exposure',
      sandboxSession: createSandboxSession(),
      sessionWorkDir: '/sandbox/work',
    });

    try {
      expect(
        piMock.extensionApi.registerMcpServer,
      ).toHaveBeenCalledExactlyOnceWith('brand', brand);
    } finally {
      await session.doDestroy();
    }
  });

  it('shuts down MCP servers on dispose without reloading the Pi session', async () => {
    const emit = vi.fn(async () => {});
    const dispose = vi.fn();
    const reload = vi.fn(async () => {});
    piMock.session = {
      bindExtensions: vi.fn(async () => {}),
      dispose,
      extensionRunner: { emit },
      getSessionStats: () => ({
        tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      }),
      prompt: vi.fn(async () => {}),
      reload,
      subscribe: vi.fn(() => () => {}),
    } as unknown as AgentSession;

    const session = await createPiSession({
      sessionId: 'session-mcp-dispose',
      sandboxSession: createSandboxSession(),
      sessionWorkDir: '/sandbox/work',
      settings: {
        mcpServers: {
          memory: { command: 'memory-mcp', args: [] },
        },
      },
      clientApp: 'ai-sdk-harness-pi/0.0.0-test',
      isResume: false,
    });
    const control = await session.doPromptTurn({
      skills: [],
      prompt: 'Use an MCP tool.',
      tools: [],
      emit: vi.fn(),
    });
    await control.done;
    await session.doDestroy();

    expect(reload).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith({
      type: 'session_shutdown',
      reason: 'quit',
    });
    expect(emit.mock.invocationCallOrder[0]).toBeLessThan(
      dispose.mock.invocationCallOrder[0],
    );
  });

  it('preserves extension shutdown reasons when MCP sessions rebuild', async () => {
    const observedReasons: string[] = [];
    const factory = vi.fn((piApi: ExtensionAPI) => {
      piApi.on('session_shutdown', event => {
        observedReasons.push(event.reason);
      });
    });
    const createSessionMock = (handlerIndex: number) => {
      const emit = vi.fn(
        async (event: {
          type: 'session_shutdown';
          reason: 'reload' | 'quit';
        }) => {
          await piMock.extensionHandlers
            .get('session_shutdown')
            ?.[handlerIndex]?.(event);
        },
      );
      const dispose = vi.fn();
      const reload = vi.fn(async () => {});
      return {
        emit,
        dispose,
        reload,
        session: {
          bindExtensions: vi.fn(async () => {}),
          dispose,
          extensionRunner: { emit },
          getSessionStats: () => ({
            tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          }),
          prompt: vi.fn(async () => {}),
          reload,
          subscribe: vi.fn(() => () => {}),
        } as unknown as AgentSession,
      };
    };
    const first = createSessionMock(0);
    const second = createSessionMock(1);
    piMock.createAgentSession
      .mockResolvedValueOnce({ session: first.session })
      .mockResolvedValueOnce({ session: second.session });

    const session = await createPi({
      extensionFactories: [factory],
      mcpServers: {
        memory: { command: 'memory-mcp', args: [] },
      },
    }).doStart({
      sessionId: 'session-mcp-rebuild',
      sandboxSession: createSandboxSession(),
      sessionWorkDir: '/sandbox/work',
    });

    try {
      const firstControl = await session.doPromptTurn({
        skills: [],
        prompt: 'First turn.',
        tools: [],
        emit: vi.fn(),
      });
      await firstControl.done;
      const secondControl = await session.doPromptTurn({
        skills: [],
        prompt: 'Second turn.',
        tools: [{ name: 'new-tool' }],
        emit: vi.fn(),
      });
      await secondControl.done;

      expect(observedReasons).toEqual(['reload']);
      expect(first.emit).toHaveBeenCalledExactlyOnceWith({
        type: 'session_shutdown',
        reason: 'reload',
      });
      expect(first.emit.mock.invocationCallOrder[0]).toBeLessThan(
        first.dispose.mock.invocationCallOrder[0],
      );
      expect(first.reload).not.toHaveBeenCalled();
      expect(factory).toHaveBeenCalledTimes(2);
      expect(mcpMock.mcpExtensionFactory).toHaveBeenCalledTimes(2);
      expect(mcpMock.toolSearchFactory).toHaveBeenCalledTimes(2);
      expect(piMock.extensionApi.registerMcpServer).toHaveBeenCalledTimes(2);

      await session.doDestroy();

      expect(observedReasons).toEqual(['reload', 'quit']);
      expect(second.emit).toHaveBeenCalledExactlyOnceWith({
        type: 'session_shutdown',
        reason: 'quit',
      });
      expect(second.emit.mock.invocationCallOrder[0]).toBeLessThan(
        second.dispose.mock.invocationCallOrder[0],
      );
      expect(second.reload).not.toHaveBeenCalled();
      expect(factory).toHaveBeenCalledTimes(2);
      expect(mcpMock.mcpExtensionFactory).toHaveBeenCalledTimes(2);
    } finally {
      await session.doDestroy();
    }
  });

  it('loads configured MCP servers alongside caller-supplied extension factories', async () => {
    const factory = vi.fn();

    const session = await createPi({
      extensionFactories: [factory],
      mcpServers: { memory: { command: 'memory-mcp', args: [] } },
    }).doStart({
      sessionId: 'session-mcp-and-extensions',
      sandboxSession: createSandboxSession(),
      sessionWorkDir: '/sandbox/work',
    });

    try {
      expect(piMock.extensionFactoryInputs.at(-1)?.snapshot).toEqual([
        expect.any(Function),
        mcpMock.toolSearchFactory,
        mcpMock.mcpExtensionFactory,
        expect.any(Function),
      ]);
      expect(factory).toHaveBeenCalledOnce();
      expect(mcpMock.mcpExtensionFactory).toHaveBeenCalledOnce();
    } finally {
      await session.doDestroy();
    }
  });

  it.each([
    {
      mcpSettings: { toolPrefix: 'none' },
      messages: ['toolPrefix', 'mcp__<server>__<tool>'],
    },
    {
      mcpSettings: { outputGuard: false },
      messages: ['outputGuard'],
    },
  ] as const)(
    'rejects mcpSettings $mcpSettings that native MCP cannot honor',
    async ({ mcpSettings, messages }) => {
      const start = createPi({
        mcpServers: { memory: { command: 'memory-mcp', args: [] } },
        mcpSettings,
      }).doStart({
        sessionId: 'session-mcp-settings',
        sandboxSession: createSandboxSession(),
        sessionWorkDir: '/sandbox/work',
      });

      for (const message of messages) {
        await expect(start).rejects.toThrow(message);
      }
      expect(piMock.createAgentSession).not.toHaveBeenCalled();
    },
  );

  it('accepts mcpSettings that match native MCP', async () => {
    const session = await createPi({
      mcpServers: { memory: { command: 'memory-mcp', args: [] } },
      mcpSettings: { toolPrefix: 'mcp', outputGuard: true },
    }).doStart({
      sessionId: 'session-mcp-settings-native',
      sandboxSession: createSandboxSession(),
      sessionWorkDir: '/sandbox/work',
    });

    await session.doDestroy();
  });

  it('rejects unsafe resume session filenames before sandbox restore', async () => {
    const sandboxSession = createSandboxSession();

    await expect(
      createPiSession({
        sessionId: 'session-unsafe',
        sandboxSession,
        sessionWorkDir: '/sandbox/work',
        settings: {},
        clientApp: 'ai-sdk-harness-pi/0.0.0-test',
        isResume: true,
        resumeSessionFileName: '../session.jsonl',
      }),
    ).rejects.toThrow('Invalid Pi session file name');

    expect(sandboxSession.readBinaryFile).not.toHaveBeenCalled();
  });

  it('initializes the restored Pi session before compacting a cold resume', async () => {
    const { session: fakePiSession, compact, prompt } = createFakePiSession();
    piMock.session = fakePiSession;
    const { journal } = createJournal([userMessage('remember this')]);
    piMock.sessionManagerOpen.mockImplementation(() => journal);

    const session = await createPiSession({
      sessionId: 'session-cold-resume-compaction',
      sandboxSession: createSandboxSession({
        sessionFileContent: 'pi-journal',
      }),
      sessionWorkDir: '/sandbox/work',
      settings: {},
      clientApp: 'ai-sdk-harness-pi/0.0.0-test',
      isResume: true,
      resumeSessionFileName: 'pi-session.jsonl',
    });

    try {
      expect(piMock.createAgentSession).not.toHaveBeenCalled();

      await session.doCompact('preserve the decisions');

      expect(piMock.sessionManagerOpen).toHaveBeenCalledOnce();
      expect(piMock.createAgentSession).toHaveBeenCalledWith(
        expect.objectContaining({ sessionManager: journal }),
      );
      expect(compact).toHaveBeenCalledWith('preserve the decisions');

      const control = await session.doPromptTurn({
        skills: [],
        tools: [],
        prompt: 'continue',
        emit: vi.fn(),
      });
      await control.done;

      expect(piMock.createAgentSession).toHaveBeenCalledOnce();
      expect(prompt).toHaveBeenCalledWith('continue');
    } finally {
      await session.doDestroy();
    }
  });

  it('appends instructions without changing the user prompt or reloading MCP extensions', async () => {
    const prompt = vi.fn(async () => {});
    piMock.session = {
      abort: vi.fn(async () => {}),
      bindExtensions: vi.fn(async () => {}),
      compact: vi.fn(async () => {}),
      dispose: vi.fn(),
      getActiveToolNames: vi.fn(() => []),
      getSessionStats: () => ({
        tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      }),
      prompt,
      reload: vi.fn(async () => {}),
      setActiveToolsByName: vi.fn(),
      steer: vi.fn(async () => {}),
      subscribe: vi.fn(() => () => {}),
    } as unknown as AgentSession;

    const session = await createPiSession({
      sessionId: 'session-instructions',
      sandboxSession: createSandboxSession(),
      sessionWorkDir: '/sandbox/work',
      settings: {
        mcpServers: { memory: { command: 'memory-mcp', args: [] } },
      },
      clientApp: 'ai-sdk-harness-pi/0.0.0-test',
      isResume: false,
    });
    const control = await session.doPromptTurn({
      skills: [],
      tools: [],
      prompt: 'do the thing',
      instructions: 'Use turbo build.',
      emit: vi.fn(),
    });
    await control.done;

    expect(piMock.appendSystemPrompts.at(-1)).toEqual(['Use turbo build.']);
    expect(prompt).toHaveBeenCalledWith('do the thing');
    expect(mcpMock.mcpExtensionFactory).toHaveBeenCalledOnce();
  });

  it('parks a pending tool turn on suspend and resumes it in-process', async () => {
    const toolStarted = createDeferred<void>();
    let resolvedToolResult: unknown;
    const prompt = vi.fn(async () => {
      const tool = piMock.customTools.find(tool => tool.name === 'weather');
      if (!tool) throw new Error('Expected weather tool.');
      const toolResultPromise = tool.execute(
        'tool-1',
        {},
        undefined,
        undefined,
        undefined as never,
      );
      toolStarted.resolve();
      resolvedToolResult = await toolResultPromise;
    });
    const abort = vi.fn(async () => {});
    piMock.session = {
      abort,
      compact: vi.fn(async () => {}),
      dispose: vi.fn(),
      getSessionStats: () => ({
        tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      }),
      prompt,
      steer: vi.fn(async () => {}),
      subscribe: vi.fn(() => () => {}),
    } as unknown as AgentSession;

    const sandboxSession = createSandboxSession();
    const session = await createPiSession({
      sessionId: 'session-1',
      sandboxSession,
      sessionWorkDir: '/sandbox/work',
      settings: {},
      clientApp: 'ai-sdk-harness-pi/0.0.0-test',
      isResume: false,
    });
    const toolSpecs: HarnessV1ToolSpec[] = [{ name: 'weather' }];
    const control = await session.doPromptTurn({
      skills: [],
      prompt: 'go',
      tools: toolSpecs,
      emit: vi.fn(),
    });

    await toolStarted.promise;
    await expect(session.doSuspendTurn()).resolves.toEqual({
      type: 'continue-turn',
      harnessId: 'pi',
      specificationVersion: 'harness-v1',
      data: {},
    });
    expect(abort).not.toHaveBeenCalled();

    const resumedSession = await createPiSession({
      sessionId: 'session-1',
      sandboxSession,
      sessionWorkDir: '/sandbox/work',
      settings: {},
      clientApp: 'ai-sdk-harness-pi/0.0.0-test',
      isResume: true,
      resumeStateType: 'continue-turn',
    });
    const resumedControl = await resumedSession.doContinueTurn({
      skills: [],
      tools: toolSpecs,
      emit: vi.fn(),
    });

    await resumedControl.submitToolResult({
      toolCallId: 'tool-1',
      output: { weather: 'sunny' },
    });
    await resumedControl.done;
    await control.done;

    expect(prompt).toHaveBeenCalledTimes(1);
    expect(resolvedToolResult).toMatchInlineSnapshot(
      {
        content: [{ type: 'text', text: '{"weather":"sunny"}' }],
        details: undefined,
      },
      `
      {
        "content": [
          {
            "text": "{"weather":"sunny"}",
            "type": "text",
          },
        ],
        "details": undefined,
      }
    `,
    );
  });

  it('reattaches a pending turn detached with matching resume-session state', async () => {
    const toolStarted = createDeferred<void>();
    let resolvedToolResult: unknown;
    const { session: fakePiSession, prompt } = createFakePiSession({
      promptImplementation: async () => {
        const tool = piMock.customTools.find(tool => tool.name === 'weather');
        if (!tool) throw new Error('Expected weather tool.');
        const toolResultPromise = tool.execute(
          'tool-detached',
          {},
          undefined,
          undefined,
          undefined as never,
        );
        toolStarted.resolve();
        resolvedToolResult = await toolResultPromise;
      },
    });
    piMock.session = fakePiSession;

    const sandboxSession = createSandboxSession();
    const session = await createPiSession({
      sessionId: 'session-detached',
      sandboxSession,
      sessionWorkDir: '/sandbox/work',
      settings: {},
      clientApp: 'ai-sdk-harness-pi/0.0.0-test',
      isResume: false,
    });
    const tools: HarnessV1ToolSpec[] = [{ name: 'weather' }];
    const originalControl = await session.doPromptTurn({
      skills: [],
      tools,
      prompt: 'go',
      emit: vi.fn(),
    });
    await toolStarted.promise;
    await session.doDetach();

    const resumedSession = await createPiSession({
      sessionId: session.sessionId,
      sandboxSession,
      sessionWorkDir: '/sandbox/work',
      settings: {},
      clientApp: 'ai-sdk-harness-pi/0.0.0-test',
      isResume: true,
      resumeStateType: 'resume-session',
    });
    const resumedControl = await resumedSession.doContinueTurn({
      skills: [],
      tools,
      emit: vi.fn(),
    });
    await resumedControl.submitToolResult({
      toolCallId: 'tool-detached',
      output: 'sunny',
    });
    await resumedControl.done;
    await originalControl.done;

    expect(prompt).toHaveBeenCalledOnce();
    expect(resolvedToolResult).toMatchObject({
      content: [{ type: 'text', text: 'sunny' }],
    });
    await resumedSession.doDestroy();
  });

  it.each([
    {
      lifecycle: 'suspend',
      runLifecycle: (session: HarnessV1Session) => session.doSuspendTurn(),
      expectedStateType: 'continue-turn',
    },
    {
      lifecycle: 'detach',
      runLifecycle: (session: HarnessV1Session) => session.doDetach(),
      expectedStateType: 'resume-session',
    },
  ])(
    'releases a pending tool turn on $lifecycle when in-process reattachment is disabled',
    async ({ lifecycle, runLifecycle, expectedStateType }) => {
      const toolStarted = createDeferred<void>();
      const {
        session: fakePiSession,
        abort,
        dispose,
      } = createFakePiSession({
        promptImplementation: async () => {
          const tool = piMock.customTools.find(tool => tool.name === 'weather');
          if (!tool) throw new Error('Expected weather tool.');
          const toolResultPromise = tool.execute(
            `tool-${lifecycle}`,
            {},
            undefined,
            undefined,
            undefined as never,
          );
          toolStarted.resolve();
          await toolResultPromise;
        },
      });
      piMock.session = fakePiSession;

      const sessionId = `session-disabled-reattach-${lifecycle}`;
      const hostRoot = path.join(tmpdir(), 'ai-sdk-harness', 'pi', sessionId);
      const session = await createPiSession({
        sessionId,
        sandboxSession: createSandboxSession(),
        sessionWorkDir: '/sandbox/work',
        settings: { reattachInProcess: false },
        clientApp: 'ai-sdk-harness-pi/0.0.0-test',
        isResume: false,
      });
      const control = await session.doPromptTurn({
        skills: [],
        prompt: 'go',
        tools: [{ name: 'weather' }],
        emit: vi.fn(),
      });
      await toolStarted.promise;

      await expect(runLifecycle(session)).resolves.toMatchObject({
        type: expectedStateType,
      });
      await expect(control.done).resolves.toBeUndefined();

      expect(abort).toHaveBeenCalledOnce();
      expect(dispose).toHaveBeenCalledOnce();
      expect(existsSync(hostRoot)).toBe(false);
    },
  );

  it.each([
    {
      name: 'in-process reattachment is disabled',
      settings: { reattachInProcess: false },
      resumeStateType: 'continue-turn' as const,
    },
    {
      name: 'the lifecycle state has progressed to resume-session',
      settings: {},
      resumeStateType: 'resume-session' as const,
    },
    {
      name: 'request-scoped settings changed',
      settings: {},
      resumeStateType: 'continue-turn' as const,
      initialAgentDir: '/request-1/agent',
      resumeAgentDir: '/request-2/agent',
    },
    {
      name: 'mcpSettings changed',
      settings: { mcpSettings: { outputGuard: true } },
      resumeStateType: 'continue-turn' as const,
    },
  ])('cold-restores a parked session when $name', async input => {
    const toolStarted = createDeferred<void>();
    const {
      session: fakePiSession,
      prompt,
      abort,
      dispose,
    } = createFakePiSession({
      promptImplementation: async () => {
        const tool = piMock.customTools.find(tool => tool.name === 'weather');
        if (!tool) throw new Error('Expected weather tool.');
        const toolResultPromise = tool.execute(
          'tool-cold-restore',
          {},
          undefined,
          undefined,
          undefined as never,
        );
        toolStarted.resolve();
        await toolResultPromise;
      },
    });
    piMock.session = fakePiSession;

    const sandboxSession = createSandboxSession();
    const session = await createPiSession({
      sessionId: `session-cold-restore-${input.resumeStateType}-${String(
        'reattachInProcess' in input.settings,
      )}`,
      sandboxSession,
      sessionWorkDir: '/sandbox/work',
      settings: {},
      clientApp: 'ai-sdk-harness-pi/0.0.0-test',
      isResume: false,
      ...(input.initialAgentDir ? { agentDir: input.initialAgentDir } : {}),
    });
    const control = await session.doPromptTurn({
      skills: [],
      prompt: 'go',
      tools: [{ name: 'weather' }],
      emit: vi.fn(),
    });
    await toolStarted.promise;
    await session.doSuspendTurn();

    const resumedSession = await createPiSession({
      sessionId: session.sessionId,
      sandboxSession,
      sessionWorkDir: '/sandbox/work',
      settings: input.settings,
      clientApp: 'ai-sdk-harness-pi/0.0.0-test',
      isResume: true,
      resumeStateType: input.resumeStateType,
      ...(input.resumeAgentDir ? { agentDir: input.resumeAgentDir } : {}),
    });

    await control.done;
    expect(resumedSession).not.toBe(session);
    expect(prompt).toHaveBeenCalledOnce();
    expect(abort).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
    await resumedSession.doDestroy();
  });

  it('holds a cross-process rerun until dangling host tool results arrive, then injects them into the journal', async () => {
    const { session: fakePiSession, prompt } = createFakePiSession();
    piMock.session = fakePiSession;
    const { journal, appendedMessages } = createJournal([
      userMessage('ask the user something'),
      assistantMessageWithToolCalls([{ id: 'tool-1', name: 'askUser' }]),
    ]);
    piMock.sessionManagerOpen.mockImplementation(() => journal);

    const sandboxSession = createSandboxSession({
      sessionFileContent: 'pi-journal',
    });
    const session = await createPiSession({
      sessionId: 'session-cross-process',
      sandboxSession,
      sessionWorkDir: '/sandbox/work',
      settings: {},
      clientApp: 'ai-sdk-harness-pi/0.0.0-test',
      isResume: true,
      resumeSessionFileName: 'pi-session.jsonl',
    });

    const emit = vi.fn();
    const control = await session.doContinueTurn({
      skills: [],
      tools: [{ name: 'askUser' }],
      instructions: 'Return the tool result exactly.',
      emit,
    });

    // The rerun must wait for the framework to re-deliver the result of the
    // journal-pending tool call; starting it eagerly would resolve the call
    // as a synthetic empty result and drop the submission below.
    expect(prompt).not.toHaveBeenCalled();

    await control.submitToolResult({
      toolCallId: 'tool-1',
      output: { selection: 'Option A' },
    });
    await control.done;

    expect(appendedMessages).toEqual([
      {
        role: 'toolResult',
        toolCallId: 'tool-1',
        toolName: 'askUser',
        content: [{ type: 'text', text: '{"selection":"Option A"}' }],
        isError: false,
        timestamp: expect.any(Number),
      },
    ]);
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(prompt).toHaveBeenCalledWith('');
    expect(emit.mock.calls.slice(0, 2)).toEqual([
      [{ type: 'stream-start' }],
      [
        {
          type: 'finish-step',
          finishReason: { unified: 'tool-calls', raw: undefined },
          usage: {
            inputTokens: {
              total: 0,
              noCache: 0,
              cacheRead: 0,
              cacheWrite: 0,
            },
            outputTokens: {
              total: 0,
              text: 0,
              reasoning: 0,
            },
          },
          harnessMetadata: { pi: { inferredStep: true } },
        },
      ],
    ]);
    expect(piMock.appendSystemPrompts.at(-1)).toEqual([
      'Return the tool result exactly.',
    ]);
    expect(piMock.sessionManagerOpen).toHaveBeenCalledTimes(1);
  });

  it('preserves the error flag when injecting a cross-process tool result', async () => {
    const { session: fakePiSession } = createFakePiSession();
    piMock.session = fakePiSession;
    const { journal, appendedMessages } = createJournal([
      userMessage('call the tool'),
      assistantMessageWithToolCalls([{ id: 'tool-1', name: 'askUser' }]),
    ]);
    piMock.sessionManagerOpen.mockImplementation(() => journal);

    const session = await createPiSession({
      sessionId: 'session-cross-process-error',
      sandboxSession: createSandboxSession({
        sessionFileContent: 'pi-journal',
      }),
      sessionWorkDir: '/sandbox/work',
      settings: {},
      clientApp: 'ai-sdk-harness-pi/0.0.0-test',
      isResume: true,
      resumeSessionFileName: 'pi-session.jsonl',
    });
    const control = await session.doContinueTurn({
      skills: [],
      tools: [{ name: 'askUser' }],
      emit: vi.fn(),
    });

    await control.submitToolResult({
      toolCallId: 'tool-1',
      output: { error: 'answer unavailable' },
      isError: true,
    });
    await control.done;

    expect(appendedMessages).toMatchInlineSnapshot(
      [
        {
          timestamp: expect.any(Number),
        },
      ],
      `
      [
        {
          "content": [
            {
              "text": "{"error":"answer unavailable"}",
              "type": "text",
            },
          ],
          "isError": true,
          "role": "toolResult",
          "timestamp": Any<Number>,
          "toolCallId": "tool-1",
          "toolName": "askUser",
        },
      ]
    `,
    );
  });

  it('reruns immediately on cross-process resume when the journal has no dangling host tool calls', async () => {
    const { session: fakePiSession, prompt } = createFakePiSession();
    piMock.session = fakePiSession;
    const { journal } = createJournal([
      userMessage('ask the user something'),
      assistantMessageWithToolCalls([{ id: 'tool-1', name: 'askUser' }]),
      {
        role: 'toolResult',
        toolCallId: 'tool-1',
        toolName: 'askUser',
        content: [{ type: 'text', text: 'already answered' }],
        isError: false,
        timestamp: 0,
      },
    ]);
    piMock.sessionManagerOpen.mockImplementation(() => journal);

    const sandboxSession = createSandboxSession({
      sessionFileContent: 'pi-journal',
    });
    const session = await createPiSession({
      sessionId: 'session-cross-process-resolved',
      sandboxSession,
      sessionWorkDir: '/sandbox/work',
      settings: {},
      clientApp: 'ai-sdk-harness-pi/0.0.0-test',
      isResume: true,
      resumeSessionFileName: 'pi-session.jsonl',
    });

    const control = await session.doContinueTurn({
      skills: [],
      tools: [{ name: 'askUser' }],
      emit: vi.fn(),
    });
    await control.done;

    expect(prompt).toHaveBeenCalledTimes(1);
    expect(prompt).toHaveBeenCalledWith('');
    expect(journal.appendMessage).not.toHaveBeenCalled();
  });

  it('does not re-await results already delivered by a previous continuation of the same session', async () => {
    const { session: fakePiSession, prompt } = createFakePiSession();
    piMock.session = fakePiSession;
    const { journal, appendedMessages } = createJournal([
      userMessage('ask the user two things'),
      assistantMessageWithToolCalls([
        { id: 'tool-1', name: 'askUser' },
        { id: 'tool-2', name: 'askUser' },
      ]),
    ]);
    piMock.sessionManagerOpen.mockImplementation(() => journal);

    const sandboxSession = createSandboxSession({
      sessionFileContent: 'pi-journal',
    });
    const session = await createPiSession({
      sessionId: 'session-cross-process-reentrant',
      sandboxSession,
      sessionWorkDir: '/sandbox/work',
      settings: {},
      clientApp: 'ai-sdk-harness-pi/0.0.0-test',
      isResume: true,
      resumeSessionFileName: 'pi-session.jsonl',
    });

    // First continuation delivers only tool-1's result, then ends (e.g. it
    // paused again awaiting a tool-result continuation for tool-2).
    const firstControl = await session.doContinueTurn({
      skills: [],
      tools: [{ name: 'askUser' }],
      emit: vi.fn(),
    });
    await firstControl.submitToolResult({
      toolCallId: 'tool-1',
      output: 'first answer',
    });
    expect(prompt).not.toHaveBeenCalled();

    // Second continuation: the framework will only re-deliver tool-2 — it
    // marked tool-1 settled. The new barrier must not wait on tool-1 again.
    const secondControl = await session.doContinueTurn({
      skills: [],
      tools: [{ name: 'askUser' }],
      emit: vi.fn(),
    });
    // Installing the new barrier settles the abandoned first turn cleanly.
    await expect(firstControl.done).resolves.toBeUndefined();
    expect(prompt).not.toHaveBeenCalled();

    await secondControl.submitToolResult({
      toolCallId: 'tool-2',
      output: 'second answer',
    });
    await secondControl.done;

    expect(appendedMessages).toEqual([
      {
        role: 'toolResult',
        toolCallId: 'tool-1',
        toolName: 'askUser',
        content: [{ type: 'text', text: 'first answer' }],
        isError: false,
        timestamp: expect.any(Number),
      },
      {
        role: 'toolResult',
        toolCallId: 'tool-2',
        toolName: 'askUser',
        content: [{ type: 'text', text: 'second answer' }],
        isError: false,
        timestamp: expect.any(Number),
      },
    ]);
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(prompt).toHaveBeenCalledWith('');
  });

  it('flushes results delivered before a suspend into the journal so a later resume sees them', async () => {
    const { session: fakePiSession, prompt } = createFakePiSession();
    piMock.session = fakePiSession;
    const { journal, appendedMessages } = createJournal([
      userMessage('ask the user two things'),
      assistantMessageWithToolCalls([
        { id: 'tool-1', name: 'askUser' },
        { id: 'tool-2', name: 'askUser' },
      ]),
    ]);
    piMock.sessionManagerOpen.mockImplementation(() => journal);

    const sandboxSession = createSandboxSession({
      sessionFileContent: 'pi-journal',
    });
    const session = await createPiSession({
      sessionId: 'session-cross-process-partial',
      sandboxSession,
      sessionWorkDir: '/sandbox/work',
      settings: {},
      clientApp: 'ai-sdk-harness-pi/0.0.0-test',
      isResume: true,
      resumeSessionFileName: 'pi-session.jsonl',
    });

    const control = await session.doContinueTurn({
      skills: [],
      tools: [{ name: 'askUser' }],
      emit: vi.fn(),
    });
    await control.submitToolResult({
      toolCallId: 'tool-1',
      output: 'first answer',
    });

    // Still awaiting tool-2; the rerun has not started.
    expect(prompt).not.toHaveBeenCalled();

    await expect(session.doSuspendTurn()).resolves.toEqual({
      type: 'continue-turn',
      harnessId: 'pi',
      specificationVersion: 'harness-v1',
      data: { sessionFileName: 'pi-session.jsonl' },
    });
    await control.done;

    expect(appendedMessages).toEqual([
      {
        role: 'toolResult',
        toolCallId: 'tool-1',
        toolName: 'askUser',
        content: [{ type: 'text', text: 'first answer' }],
        isError: false,
        timestamp: expect.any(Number),
      },
    ]);
    expect(prompt).not.toHaveBeenCalled();
    // The updated journal is pushed back into the sandbox for the next resume.
    expect(sandboxSession.writeBinaryFile).toHaveBeenCalled();
  });

  it('cancels a deferred rerun initialization before suspending', async () => {
    const setup = await startDeferredCrossProcessRerun({
      sessionId: 'session-cross-process-suspend-during-startup',
    });

    const suspension = setup.session.doSuspendTurn();
    setup.agentSessionCreation.resolve({ session: setup.fakePiSession });

    await expect(suspension).resolves.toEqual({
      type: 'continue-turn',
      harnessId: 'pi',
      specificationVersion: 'harness-v1',
      data: { sessionFileName: 'pi-session.jsonl' },
    });
    await expect(setup.control.done).resolves.toBeUndefined();
    expect(setup.prompt).not.toHaveBeenCalled();
    expect(setup.dispose).toHaveBeenCalledOnce();
  });

  it('waits for deferred rerun initialization to cancel before stopping', async () => {
    const setup = await startDeferredCrossProcessRerun({
      sessionId: 'session-cross-process-stop-during-startup',
    });
    const done = expect(setup.control.done).rejects.toMatchObject({
      name: 'AbortError',
    });

    const stopping = setup.session.doStop();
    setup.agentSessionCreation.resolve({ session: setup.fakePiSession });

    await expect(stopping).resolves.toEqual({
      type: 'resume-session',
      harnessId: 'pi',
      specificationVersion: 'harness-v1',
      data: { sessionFileName: 'pi-session.jsonl' },
    });
    await done;
    expect(setup.prompt).not.toHaveBeenCalled();
    expect(setup.dispose).toHaveBeenCalledOnce();
  });

  it('rejects an abort received during deferred rerun initialization', async () => {
    const abortController = new AbortController();
    const setup = await startDeferredCrossProcessRerun({
      sessionId: 'session-cross-process-abort-during-startup',
      abortSignal: abortController.signal,
    });
    const done = expect(setup.control.done).rejects.toThrow(
      'cancel deferred rerun',
    );

    abortController.abort(new Error('cancel deferred rerun'));
    setup.agentSessionCreation.resolve({ session: setup.fakePiSession });

    await done;
    expect(setup.prompt).not.toHaveBeenCalled();
    await setup.session.doDestroy();
    expect(setup.dispose).toHaveBeenCalledOnce();
  });

  it('attaches another continuation to deferred rerun initialization', async () => {
    const setup = await startDeferredCrossProcessRerun({
      sessionId: 'session-cross-process-attach-during-startup',
    });
    const attachedEmit = vi.fn();

    const attachedControl = await setup.session.doContinueTurn({
      skills: [],
      tools: [{ name: 'askUser' }],
      emit: attachedEmit,
    });
    setup.agentSessionCreation.resolve({ session: setup.fakePiSession });

    await Promise.all([setup.control.done, attachedControl.done]);
    expect(piMock.createAgentSession).toHaveBeenCalledOnce();
    expect(setup.prompt).toHaveBeenCalledOnce();
    expect(setup.emit).not.toHaveBeenCalledWith({ type: 'stream-start' });
    expect(attachedEmit).toHaveBeenCalledWith({ type: 'stream-start' });
    await setup.session.doDestroy();
  });

  it('replays an approved host tool through HarnessAgent before rerunning Pi', async () => {
    const execute = vi.fn(async () => ({ selection: 'Option A' }));
    const askUser = tool({
      description: 'Ask the user to select an option.',
      inputSchema: z.object({ question: z.string() }),
      execute,
    });
    const { session: fakePiSession, prompt } = createFakePiSession({
      promptEvents: [
        { type: 'turn_start' },
        {
          type: 'message_start',
          message: { role: 'assistant', content: [] },
        },
        {
          type: 'message_update',
          assistantMessageEvent: {
            type: 'text_delta',
            delta: 'Option A',
          },
        },
        {
          type: 'message_end',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Option A' }],
            stopReason: 'stop',
          },
        },
        {
          type: 'turn_end',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Option A' }],
            stopReason: 'stop',
          },
        },
      ],
    });
    piMock.session = fakePiSession;
    const { journal, appendedMessages } = createJournal([
      userMessage('ask the user something'),
      assistantMessageWithToolCalls([{ id: 'tool-1', name: 'askUser' }]),
    ]);
    piMock.sessionManagerOpen.mockImplementation(() => journal);
    const sandboxSession = createSandboxSession({
      sessionFileContent: 'pi-journal',
    });
    const continueFrom: HarnessAgentContinueTurnState = {
      type: 'continue-turn',
      harnessId: 'pi',
      specificationVersion: 'harness-v1',
      data: { sessionFileName: 'pi-session.jsonl' },
      pendingToolApprovals: [
        {
          approvalId: 'approval-1',
          toolCallId: 'tool-1',
          toolName: 'askUser',
          input: '{"question":"Choose an option"}',
          kind: 'custom',
          providerExecuted: false,
        },
      ],
    };
    const agent = new HarnessAgent({
      harness: createPi(),
      tools: { askUser },
      toolApproval: { askUser: 'user-approval' },
    });
    const session = await agent.createSession({
      sessionId: 'session-harness-agent-cross-process',
      continueFrom,
      sandboxSession,
    });

    try {
      const result = await agent.continueGenerate({
        session,
        toolApprovalContinuations: [
          {
            type: 'tool-approval-response',
            approvalId: 'approval-1',
            approved: true,
          },
        ],
      });

      expect(execute).toHaveBeenCalledOnce();
      expect(result.text).toBe('Option A');
      expect(appendedMessages).toEqual([
        {
          role: 'toolResult',
          toolCallId: 'tool-1',
          toolName: 'askUser',
          content: [{ type: 'text', text: '{"selection":"Option A"}' }],
          isError: false,
          timestamp: expect.any(Number),
        },
      ]);
      expect(prompt).toHaveBeenCalledWith('');
    } finally {
      await session.destroy();
    }
  });

  it('uses agentDir for auth, models, and settings when provided', async () => {
    vi.mocked(ModelRuntime.create).mockClear();
    vi.mocked(SettingsManager.inMemory).mockClear();
    vi.mocked(SettingsManager.create).mockClear();

    vi.stubEnv('OPENAI_API_KEY', undefined);
    const sandboxSession = createSandboxSession();
    try {
      await createPiSession({
        sessionId: 'session-agentdir',
        sandboxSession,
        sessionWorkDir: '/sandbox/work',
        settings: { auth: 'openai' },
        clientApp: 'ai-sdk-harness-pi/0.0.0-test',
        isResume: false,
        agentDir: '/custom/.pi/agent',
      });
    } finally {
      vi.unstubAllEnvs();
    }

    expect(ModelRuntime.create).toHaveBeenCalledWith({
      authPath: '/custom/.pi/agent/auth.json',
      modelsPath: '/custom/.pi/agent/models.json',
      allowModelNetwork: false,
    });
    expect(SettingsManager.create).toHaveBeenCalledExactlyOnceWith(
      expect.any(String),
      '/custom/.pi/agent',
      { projectTrusted: false },
    );
    expect(SettingsManager.inMemory).not.toHaveBeenCalled();
  });

  it('registers explicit provider model configurations', async () => {
    const provider: ProviderConfig = {
      apiKey: 'sk-test',
      baseUrl: 'https://api.example.test/v1',
      api: 'openai-completions',
      authHeader: true,
      models: [
        {
          id: 'my-custom-model',
          name: 'My Custom Model',
          reasoning: false,
          input: ['text'],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 128_000,
          maxTokens: 16_384,
        },
      ],
    };

    await createPiSession({
      sessionId: 'session-custom-provider',
      sandboxSession: createSandboxSession(),
      sessionWorkDir: '/sandbox/work',
      settings: { providers: { myprovider: provider } },
      clientApp: 'ai-sdk-harness-pi/0.0.0-test',
      isResume: false,
    });

    expect(piMock.registerProvider).toHaveBeenLastCalledWith(
      'myprovider',
      provider,
    );
  });

  it('falls back to temp dir and inMemory settings when agentDir is omitted', async () => {
    vi.mocked(ModelRuntime.create).mockClear();
    vi.mocked(SettingsManager.inMemory).mockClear();
    vi.mocked(SettingsManager.create).mockClear();

    const sandboxSession = createSandboxSession();
    await createPiSession({
      sessionId: 'session-no-agentdir',
      sandboxSession,
      sessionWorkDir: '/sandbox/work',
      settings: {},
      clientApp: 'ai-sdk-harness-pi/0.0.0-test',
      isResume: false,
    });

    expect(SettingsManager.inMemory).toHaveBeenCalledExactlyOnceWith(
      {},
      { projectTrusted: false },
    );
    expect(SettingsManager.create).not.toHaveBeenCalled();
  });
});

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function executeReadTool(file_path: string): Promise<string> {
  return JSON.stringify(await executeReadToolContent(file_path));
}

async function executeReadToolContent(
  file_path: string,
  page?: { offset: number; limit: number },
) {
  const tool = piMock.customTools.find(tool => tool.name === 'read');
  if (!tool) throw new Error('Expected read tool.');
  const result = await tool.execute(
    'tool-1',
    { file_path, ...page },
    undefined,
    undefined,
    undefined as never,
  );
  return result.content;
}

function createFakePiSession({
  promptEvents = [],
  promptImplementation,
  getSessionStats = () => ({
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  }),
}: {
  promptEvents?: unknown[];
  promptImplementation?: (
    text: string,
    emitEvent: (event: unknown) => void,
  ) => Promise<void>;
  getSessionStats?: () => unknown;
} = {}) {
  const subscribers = new Set<(event: unknown) => void>();
  const emitEvent = (event: unknown) => {
    for (const subscriber of subscribers) {
      subscriber(event);
    }
  };
  const prompt = vi.fn(async (text: string) => {
    if (promptImplementation) return promptImplementation(text, emitEvent);
    for (const event of promptEvents) emitEvent(event);
  });
  const abort = vi.fn(async () => {});
  const compact = vi.fn(async () => {});
  const dispose = vi.fn();
  const session = {
    abort,
    compact,
    dispose,
    getSessionStats,
    prompt,
    steer: vi.fn(async () => {}),
    subscribe: vi.fn((subscriber: (event: unknown) => void) => {
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    }),
  } as unknown as AgentSession;
  return { session, prompt, abort, compact, dispose };
}

async function startDeferredCrossProcessRerun({
  sessionId,
  abortSignal,
}: {
  sessionId: string;
  abortSignal?: AbortSignal;
}) {
  const { session: fakePiSession, prompt, dispose } = createFakePiSession();
  const { journal } = createJournal([
    userMessage('ask the user something'),
    assistantMessageWithToolCalls([{ id: 'tool-1', name: 'askUser' }]),
  ]);
  piMock.sessionManagerOpen.mockImplementation(() => journal);
  const agentSessionCreation = createDeferred<{ session: AgentSession }>();
  piMock.createAgentSession.mockImplementation(
    async () => agentSessionCreation.promise,
  );
  const session = await createPiSession({
    sessionId,
    sandboxSession: createSandboxSession({
      sessionFileContent: 'pi-journal',
    }),
    sessionWorkDir: '/sandbox/work',
    settings: {},
    clientApp: 'ai-sdk-harness-pi/0.0.0-test',
    isResume: true,
    resumeSessionFileName: 'pi-session.jsonl',
  });
  const emit = vi.fn();
  const control = await session.doContinueTurn({
    skills: [],
    tools: [{ name: 'askUser' }],
    emit,
    ...(abortSignal ? { abortSignal } : {}),
  });
  await control.submitToolResult({
    toolCallId: 'tool-1',
    output: 'answer',
  });
  await vi.waitFor(() => {
    expect(piMock.createAgentSession).toHaveBeenCalledOnce();
  });

  return {
    session,
    control,
    emit,
    agentSessionCreation,
    fakePiSession,
    prompt,
    dispose,
  };
}

/**
 * Fake `SessionManager` handle over a fixed restored journal. Records
 * messages appended by the adapter (the injected host tool results).
 */
function createJournal(messages: unknown[]) {
  const appendedMessages: unknown[] = [];
  const journal = {
    getSessionFile: () => 'pi-session.jsonl',
    buildSessionContext: () => ({ messages }),
    appendMessage: vi.fn((message: unknown) => {
      appendedMessages.push(message);
      return 'appended-entry';
    }),
  };
  return { journal, appendedMessages };
}

function userMessage(text: string) {
  return {
    role: 'user',
    content: [{ type: 'text', text }],
    timestamp: 0,
  };
}

function assistantMessageWithToolCalls(
  toolCalls: Array<{ id: string; name: string }>,
) {
  return {
    role: 'assistant',
    content: toolCalls.map(toolCall => ({
      type: 'toolCall',
      id: toolCall.id,
      name: toolCall.name,
      arguments: {},
    })),
    stopReason: 'toolUse',
    timestamp: 0,
  };
}

function createSandboxSession(options?: {
  /** When set, resume-path `readBinaryFile` finds a persisted session file. */
  sessionFileContent?: string;
}): HarnessV1NetworkSandboxSession {
  const textFiles = new Map<string, string>();
  const sandbox = {
    id: 'sandbox',
    defaultWorkingDirectory: '/sandbox',
    ports: [],
    destroy: vi.fn(async () => {}),
    getPortEndpoint: vi.fn(),
    getPortUrl: vi.fn(),
    readBinaryFile: vi.fn(async ({ path }: { path: string }) => {
      return options?.sessionFileContent != null
        ? new TextEncoder().encode(options.sessionFileContent)
        : undefined;
    }),
    readTextFile: vi.fn(async ({ path }: { path: string }) =>
      textFiles.get(path),
    ),
    restricted: vi.fn(() => sandbox),
    run: vi.fn(async ({ command }: { command: string }) => {
      const manifestMove = command.match(/^mv -f '([^']+)' '([^']+)'$/);
      if (manifestMove != null) {
        const content = textFiles.get(manifestMove[1]!);
        if (content != null) textFiles.set(manifestMove[2]!, content);
      }
      return {
        stdout: command === 'printf "%s" "$HOME"' ? '/sandbox/home' : '',
        stderr: '',
        exitCode: 0,
      };
    }),
    stop: vi.fn(async () => {}),
    writeBinaryFile: vi.fn(async () => {}),
    writeTextFile: vi.fn(
      async ({ path, content }: { path: string; content: string }) => {
        textFiles.set(path, content);
      },
    ),
  };
  return sandbox as unknown as HarnessV1NetworkSandboxSession;
}

function createThrowingSandboxSession(): HarnessV1NetworkSandboxSession {
  const untouchable = () =>
    vi.fn(async (): Promise<never> => {
      throw new Error('sandbox must not be touched');
    });
  const sandbox: HarnessV1NetworkSandboxSession = {
    id: 'sandbox',
    description: 'throwing sandbox',
    defaultWorkingDirectory: '/sandbox',
    ports: [],
    run: untouchable(),
    spawn: untouchable(),
    readFile: untouchable(),
    readBinaryFile: untouchable(),
    readTextFile: untouchable(),
    writeFile: untouchable(),
    writeBinaryFile: untouchable(),
    writeTextFile: untouchable(),
    stop: untouchable(),
    destroy: untouchable(),
    getPortEndpoint: untouchable(),
    getPortUrl: untouchable(),
    restricted: () => sandbox,
  };
  return sandbox;
}
