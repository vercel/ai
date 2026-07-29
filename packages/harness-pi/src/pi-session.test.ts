import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type AgentSession,
  type ToolDefinition,
  ModelRuntime,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';
import type {
  HarnessV1NetworkSandboxSession,
  HarnessV1ToolSpec,
} from '@ai-sdk/harness';
import { createPiSession } from './pi-session';

type FakePiTool = Pick<ToolDefinition, 'name' | 'execute'>;

const piMock = vi.hoisted(() => {
  return {
    createAgentSession: vi.fn(),
    customTools: [] as FakePiTool[],
    session: undefined as AgentSession | undefined,
    /** Catalog the stubbed `ModelRegistry.getAll()` reports. */
    models: [] as unknown[],
  };
});

vi.mock('@earendil-works/pi-coding-agent', () => {
  return {
    createAgentSession: piMock.createAgentSession,
    DefaultResourceLoader: class {
      async reload() {}
    },
    defineTool: vi.fn(tool => tool),
    ModelRegistry: class {
      getAll = vi.fn(() => piMock.models);
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
    piMock.customTools = [];
    piMock.session = undefined;
    piMock.models = [];
    piMock.createAgentSession.mockReset();
    piMock.createAgentSession.mockImplementation(async options => {
      piMock.customTools = options.customTools;
      return { session: piMock.session };
    });
  });

  it('rejects a configured model that resolves to nothing', async () => {
    // Without this the `model` key is simply omitted and Pi runs the turn on
    // its own default model. Nothing reports the substitution, and when that
    // default has no credential the mismatch surfaces much later as
    // "No API key found for the selected model" — pointing at a credential
    // rather than at the unknown id that caused it.
    const sandboxSession = createSandboxSession();

    await expect(
      createPiSession({
        sessionId: 'session-1',
        sandboxSession,
        sessionWorkDir: '/sandbox/work',
        skills: [],
        settings: { model: 'my-custom-model' },
        clientApp: 'ai-sdk/harness-pi/0.0.0-test',
        isResume: false,
      }),
    ).rejects.toThrow(/my-custom-model.*not found in the model registry/s);
  });

  it('still defers to Pi default when no model is configured', async () => {
    // `model: undefined` legitimately means "no model configured"; only an id
    // that was asked for and did not resolve is an error.
    const sandboxSession = createSandboxSession();

    await expect(
      createPiSession({
        sessionId: 'session-1',
        sandboxSession,
        sessionWorkDir: '/sandbox/work',
        skills: [],
        settings: {},
        clientApp: 'ai-sdk/harness-pi/0.0.0-test',
        isResume: false,
      }),
    ).resolves.toBeDefined();
  });

  it('accepts a configured model that the registry knows', async () => {
    piMock.models = [
      {
        id: 'my-custom-model',
        name: 'My Custom Model',
        api: 'openai-completions',
        provider: 'myprovider',
        baseUrl: 'https://example.test',
        reasoning: false,
        input: ['text'],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 100_000,
        maxTokens: 4_096,
      },
    ];
    const sandboxSession = createSandboxSession();

    await expect(
      createPiSession({
        sessionId: 'session-1',
        sandboxSession,
        sessionWorkDir: '/sandbox/work',
        skills: [],
        settings: { model: 'my-custom-model' },
        clientApp: 'ai-sdk/harness-pi/0.0.0-test',
        isResume: false,
      }),
    ).resolves.toBeDefined();
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
    getPortUrl: vi.fn(),
    readBinaryFile: vi.fn(async () => undefined),
    restricted: vi.fn(() => sandbox),
    run: vi.fn(async () => ({ stdout: '', stderr: '', exitCode: 0 })),
    stop: vi.fn(async () => {}),
    writeBinaryFile: vi.fn(async () => {}),
    writeTextFile: vi.fn(async () => {}),
  };
  return sandbox as unknown as HarnessV1NetworkSandboxSession;
}
