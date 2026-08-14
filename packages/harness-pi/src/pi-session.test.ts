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
  HarnessV1ToolSpec,
} from '@ai-sdk/harness';
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
      open: vi.fn(() => ({
        getSessionFile: () => undefined,
      })),
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
        prompt: 'first turn',
        tools: [],
        emit: vi.fn(),
      });
      await firstControl.done;
      const secondControl = await session.doPromptTurn({
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
      skills: [],
      settings: {
        mcpServers: {
          memory: { command: 'memory-mcp', args: [] },
        },
      },
      clientApp: 'ai-sdk/harness-pi/0.0.0-test',
      isResume: false,
    });
    const control = await session.doPromptTurn({
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
        skills: [],
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
      skills: [],
      settings: {
        mcpServers: { memory: { command: 'memory-mcp', args: [] } },
      },
      clientApp: 'ai-sdk/harness-pi/0.0.0-test',
      isResume: false,
    });
    const control = await session.doPromptTurn({
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
      skills: [],
      settings: {},
      clientApp: 'ai-sdk/harness-pi/0.0.0-test',
      isResume: false,
    });
    const toolSpecs: HarnessV1ToolSpec[] = [{ name: 'weather' }];
    const control = await session.doPromptTurn({
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
      skills: [],
      settings: {},
      clientApp: 'ai-sdk/harness-pi/0.0.0-test',
      isResume: true,
    });
    const resumedControl = await resumedSession.doContinueTurn({
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

  it('uses agentDir for auth, models, and settings when provided', async () => {
    vi.mocked(ModelRuntime.create).mockClear();
    vi.mocked(SettingsManager.inMemory).mockClear();
    vi.mocked(SettingsManager.create).mockClear();

    const sandboxSession = createSandboxSession();
    await createPiSession({
      sessionId: 'session-agentdir',
      sandboxSession,
      sessionWorkDir: '/sandbox/work',
      skills: [],
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
      skills: [],
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

function createSandboxSession(): HarnessV1NetworkSandboxSession {
  const sandbox = {
    defaultWorkingDirectory: '/sandbox',
    destroy: vi.fn(async () => {}),
    getPortEndpoint: vi.fn(),
    getPortUrl: vi.fn(),
    readBinaryFile: vi.fn(async () => undefined),
    restricted: vi.fn(() => sandbox),
    run: vi.fn(async ({ command }: { command: string }) => ({
      stdout: command === 'printf "%s" "$HOME"' ? '/sandbox/home' : '',
      stderr: '',
      exitCode: 0,
    })),
    stop: vi.fn(async () => {}),
    writeBinaryFile: vi.fn(async () => {}),
    writeTextFile: vi.fn(async () => {}),
  };
  return sandbox as unknown as HarnessV1NetworkSandboxSession;
}
