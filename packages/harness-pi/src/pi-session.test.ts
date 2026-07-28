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
    sessionManagerOpen: vi.fn(),
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
    piMock.customTools = [];
    piMock.session = undefined;
    piMock.createAgentSession.mockReset();
    piMock.createAgentSession.mockImplementation(async options => {
      piMock.customTools = options.customTools;
      return { session: piMock.session };
    });
    piMock.sessionManagerOpen.mockReset();
    piMock.sessionManagerOpen.mockImplementation(() => ({
      getSessionFile: () => undefined,
    }));
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
      skills: [],
      settings: {},
      clientApp: 'ai-sdk/harness-pi/0.0.0-test',
      isResume: true,
      resumeSessionFileName: 'pi-session.jsonl',
    });

    const control = await session.doContinueTurn({
      tools: [{ name: 'askUser' }],
      emit: vi.fn(),
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
      skills: [],
      settings: {},
      clientApp: 'ai-sdk/harness-pi/0.0.0-test',
      isResume: true,
      resumeSessionFileName: 'pi-session.jsonl',
    });

    const control = await session.doContinueTurn({
      tools: [{ name: 'askUser' }],
      emit: vi.fn(),
    });
    await control.done;

    expect(prompt).toHaveBeenCalledTimes(1);
    expect(prompt).toHaveBeenCalledWith('');
    expect(journal.appendMessage).not.toHaveBeenCalled();
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
      skills: [],
      settings: {},
      clientApp: 'ai-sdk/harness-pi/0.0.0-test',
      isResume: true,
      resumeSessionFileName: 'pi-session.jsonl',
    });

    const control = await session.doContinueTurn({
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

function createFakePiSession() {
  const prompt = vi.fn(async (_text: string) => {});
  const session = {
    abort: vi.fn(async () => {}),
    compact: vi.fn(async () => {}),
    dispose: vi.fn(),
    getSessionStats: () => ({
      tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    }),
    prompt,
    steer: vi.fn(async () => {}),
    subscribe: vi.fn(() => () => {}),
  } as unknown as AgentSession;
  return { session, prompt };
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
  const sandbox = {
    defaultWorkingDirectory: '/sandbox',
    destroy: vi.fn(async () => {}),
    getPortUrl: vi.fn(),
    readBinaryFile: vi.fn(async () =>
      options?.sessionFileContent != null
        ? new TextEncoder().encode(options.sessionFileContent)
        : undefined,
    ),
    restricted: vi.fn(() => sandbox),
    run: vi.fn(async () => ({ stdout: '', stderr: '', exitCode: 0 })),
    stop: vi.fn(async () => {}),
    writeBinaryFile: vi.fn(async () => {}),
    writeTextFile: vi.fn(async () => {}),
  };
  return sandbox as unknown as HarnessV1NetworkSandboxSession;
}
