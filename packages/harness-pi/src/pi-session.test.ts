import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type AgentSession,
  type ExtensionAPI,
  type ExtensionFactory,
  type ToolDefinition,
  ModelRuntime,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';
import type {
  HarnessV1NetworkSandboxSession,
  HarnessV1SandboxProvider,
  HarnessV1ToolSpec,
} from '@ai-sdk/harness';
import {
  HarnessAgent,
  type HarnessAgentContinueTurnState,
} from '@ai-sdk/harness/agent';
import { tool } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { createPi } from './pi-harness';
import { createPiSession } from './pi-session';

type FakePiTool = Pick<ToolDefinition, 'name' | 'execute'>;
type FakeExtensionsResult = {
  readonly errors: unknown[];
  readonly extensions: unknown[];
  readonly runtime: object;
};
type ResourceLoaderOptions = {
  readonly appendSystemPromptOverride?: (base: string[]) => string[];
  readonly extensionFactories?: Array<ExtensionFactory>;
  readonly extensionsOverride?: (
    base: FakeExtensionsResult,
  ) => FakeExtensionsResult;
  readonly noExtensions?: boolean;
  readonly noPromptTemplates?: boolean;
  readonly noThemes?: boolean;
};

const piMock = vi.hoisted(() => {
  const extensionHandlers = new Map<string, Array<() => unknown>>();
  return {
    agentSessionExtensionResults: [] as FakeExtensionsResult[],
    createAgentSession: vi.fn(),
    customTools: [] as FakePiTool[],
    appendSystemPrompts: [] as string[][],
    extensionApi: {
      on: vi.fn((eventType: string, handler: () => unknown) => {
        const handlers = extensionHandlers.get(eventType) ?? [];
        handlers.push(handler);
        extensionHandlers.set(eventType, handlers);
      }),
    } as unknown as ExtensionAPI,
    extensionFactoryInputs: [] as Array<{
      readonly reference: Array<ExtensionFactory>;
      readonly snapshot: Array<ExtensionFactory>;
    }>,
    extensionHandlers,
    resourceLoaderReloadCount: 0,
    resourceLoaderOptions: [] as ResourceLoaderOptions[],
    session: undefined as AgentSession | undefined,
    sessionManagerOpen: vi.fn(),
  };
});

const mcpAdapterMock = vi.hoisted(() => {
  const mcpExtensionFactory = vi.fn();
  return {
    createMcpAdapter: vi.fn(() => mcpExtensionFactory),
    mcpExtensionFactory,
  };
});

vi.mock('pi-mcp-adapter', () => ({
  createMcpAdapter: mcpAdapterMock.createMcpAdapter,
}));

vi.mock('@earendil-works/pi-coding-agent', () => {
  return {
    createAgentSession: piMock.createAgentSession,
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
      getAll = vi.fn(() => []);
      registerProvider = vi.fn();
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
    piMock.session = undefined;
    mcpAdapterMock.createMcpAdapter.mockClear();
    mcpAdapterMock.mcpExtensionFactory.mockClear();
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
      clientApp: 'ai-sdk/harness-pi/0.0.0-test',
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
      expect(extensionFactoryInput?.snapshot).toEqual(extensionFactories);
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
      clientApp: 'ai-sdk/harness-pi/0.0.0-test',
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
        noExtensions: true,
        noPromptTemplates: true,
        noThemes: true,
      });
      expect(
        piMock.resourceLoaderOptions.at(-1)?.extensionsOverride,
      ).toBeUndefined();
    } finally {
      await session.doDestroy();
    }
  });

  it('registers configured MCP servers as direct Pi extension tools', async () => {
    const bindExtensions = vi.fn(async () => {});
    const dispose = vi.fn();
    const reload = vi.fn(async () => {});
    piMock.session = {
      bindExtensions,
      dispose,
      getSessionStats: () => ({
        tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      }),
      prompt: vi.fn(async () => {}),
      reload,
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
      clientApp: 'ai-sdk/harness-pi/0.0.0-test',
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

    expect(mcpAdapterMock.createMcpAdapter).toHaveBeenCalledWith({
      config: {
        mcpServers: {
          memory: { command: 'memory-mcp', args: [] },
        },
        settings: {
          directTools: true,
          toolPrefix: 'mcp',
          disableProxyTool: true,
        },
      },
    });
    expect(piMock.resourceLoaderOptions.at(-1)?.extensionFactories).toEqual([
      mcpAdapterMock.mcpExtensionFactory,
    ]);
    expect(piMock.createAgentSession).toHaveBeenCalledWith(
      expect.objectContaining({ noTools: 'builtin' }),
    );
    expect(bindExtensions).toHaveBeenCalledWith({ mode: 'print' });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
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
        factory,
        mcpAdapterMock.mcpExtensionFactory,
      ]);
      expect(factory).toHaveBeenCalledOnce();
      expect(mcpAdapterMock.mcpExtensionFactory).toHaveBeenCalledOnce();
    } finally {
      await session.doDestroy();
    }
  });

  it('rejects unsafe resume session filenames before sandbox restore', async () => {
    const sandboxSession = createSandboxSession();

    await expect(
      createPiSession({
        sessionId: 'session-unsafe',
        sandboxSession,
        sessionWorkDir: '/sandbox/work',
        settings: {},
        clientApp: 'ai-sdk/harness-pi/0.0.0-test',
        isResume: true,
        resumeSessionFileName: '../session.jsonl',
      }),
    ).rejects.toThrow('Invalid Pi session file name');

    expect(sandboxSession.readBinaryFile).not.toHaveBeenCalled();
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
      clientApp: 'ai-sdk/harness-pi/0.0.0-test',
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
    expect(mcpAdapterMock.mcpExtensionFactory).toHaveBeenCalledOnce();
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
      clientApp: 'ai-sdk/harness-pi/0.0.0-test',
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
      clientApp: 'ai-sdk/harness-pi/0.0.0-test',
      isResume: true,
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
      clientApp: 'ai-sdk/harness-pi/0.0.0-test',
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
      clientApp: 'ai-sdk/harness-pi/0.0.0-test',
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
              "text": "{\"error\":\"answer unavailable\"}",
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
      clientApp: 'ai-sdk/harness-pi/0.0.0-test',
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
      clientApp: 'ai-sdk/harness-pi/0.0.0-test',
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
      clientApp: 'ai-sdk/harness-pi/0.0.0-test',
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
      sandbox: createSandboxProvider({ sandboxSession }),
      tools: { askUser },
      toolApproval: { askUser: 'user-approval' },
    });
    const session = await agent.createSession({
      sessionId: 'session-harness-agent-cross-process',
      continueFrom,
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

    const sandboxSession = createSandboxSession();
    await createPiSession({
      sessionId: 'session-agentdir',
      sandboxSession,
      sessionWorkDir: '/sandbox/work',
      settings: {},
      clientApp: 'ai-sdk/harness-pi/0.0.0-test',
      isResume: false,
      agentDir: '/custom/.pi/agent',
    });

    expect(ModelRuntime.create).toHaveBeenCalledWith({
      authPath: '/custom/.pi/agent/auth.json',
      modelsPath: '/custom/.pi/agent/models.json',
      allowModelNetwork: false,
    });
    expect(SettingsManager.create).toHaveBeenCalledTimes(1);
    expect(SettingsManager.inMemory).not.toHaveBeenCalled();
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
      clientApp: 'ai-sdk/harness-pi/0.0.0-test',
      isResume: false,
    });

    expect(SettingsManager.inMemory).toHaveBeenCalledTimes(1);
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

function createFakePiSession({
  promptEvents = [],
}: {
  promptEvents?: unknown[];
} = {}) {
  const subscribers = new Set<(event: unknown) => void>();
  const prompt = vi.fn(async (_text: string) => {
    for (const event of promptEvents) {
      for (const subscriber of subscribers) {
        subscriber(event);
      }
    }
  });
  const abort = vi.fn(async () => {});
  const dispose = vi.fn();
  const session = {
    abort,
    compact: vi.fn(async () => {}),
    dispose,
    getSessionStats: () => ({
      tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    }),
    prompt,
    steer: vi.fn(async () => {}),
    subscribe: vi.fn((subscriber: (event: unknown) => void) => {
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    }),
  } as unknown as AgentSession;
  return { session, prompt, abort, dispose };
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
    clientApp: 'ai-sdk/harness-pi/0.0.0-test',
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
    readBinaryFile: vi.fn(async () =>
      options?.sessionFileContent != null
        ? new TextEncoder().encode(options.sessionFileContent)
        : undefined,
    ),
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

function createSandboxProvider({
  sandboxSession,
}: {
  sandboxSession: HarnessV1NetworkSandboxSession;
}): HarnessV1SandboxProvider {
  return {
    specificationVersion: 'harness-sandbox-v1',
    providerId: 'test-sandbox',
    createSession: async () => sandboxSession,
    resumeSession: async () => sandboxSession,
  };
}
