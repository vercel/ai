import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertCodexThreadPermissions,
  createCodexAppServerRuntime,
  createCodexAppServerArgs,
  createDynamicTools,
  createThreadParams,
  createTurnParams,
  handleAppServerRequest,
} from './codex-app-server-driver';
import type { StartMessage } from '../codex-bridge-protocol';
import type { BridgeTurn } from '@ai-sdk/harness/bridge';
import { createCodexStepTracker } from './codex-step-tracker';
import { createTrustedApplyPatchHook } from './codex-tool-filtering-hook';

const server = vi.hoisted(() => ({
  clients: [] as Array<{
    calls: Array<{ method: string; params?: unknown }>;
    closed: number;
    args: string[];
    onRequest: (request: {
      id: number;
      method: string;
      params: unknown;
    }) => Promise<unknown>;
    onNotification: (notification: {
      method: string;
      params?: unknown;
    }) => void;
    fail(error: Error): void;
  }>,
  nextThread: 0,
  nextTurn: 0,
  autoComplete: true,
  hookResponse: undefined as unknown,
  steerResponse: undefined as
    | ((params: unknown) => Promise<unknown> | unknown)
    | undefined,
}));

vi.mock('./codex-app-server-client', () => ({
  CodexAppServerClient: class {
    calls: Array<{ method: string; params?: unknown }> = [];
    closed = 0;
    args: string[];
    onRequest: (request: {
      id: number;
      method: string;
      params: unknown;
    }) => Promise<unknown>;
    onNotification: (notification: {
      method: string;
      params?: unknown;
    }) => void;
    private rejectFailure: (error: Error) => void = () => {};
    private failure = new Promise<never>((_, reject) => {
      this.rejectFailure = reject;
    });
    private exited = new Promise<never>(() => {});

    constructor({
      args,
      onNotification,
      onRequest,
    }: {
      args: string[];
      onNotification: (notification: {
        method: string;
        params?: unknown;
      }) => void;
      onRequest: (request: {
        id: number;
        method: string;
        params: unknown;
      }) => Promise<unknown>;
    }) {
      this.args = args;
      this.onNotification = onNotification;
      this.onRequest = onRequest;
      server.clients.push(this);
    }

    async initialize() {
      this.calls.push({ method: 'initialize' });
    }

    async request({ method, params }: { method: string; params?: unknown }) {
      this.calls.push({ method, params });
      if (method === 'thread/unsubscribe') return {};
      if (method === 'hooks/list') return server.hookResponse;
      if (method === 'thread/start' || method === 'thread/resume') {
        return {
          thread: {
            id:
              method === 'thread/start'
                ? `thread-${++server.nextThread}`
                : (params as { threadId: string }).threadId,
          },
          approvalPolicy: 'never',
          sandbox: { type: 'dangerFullAccess' },
        };
      }
      if (method === 'turn/start') {
        const threadId = (params as { threadId: string }).threadId;
        const turn = { id: `turn-${++server.nextTurn}`, status: 'completed' };
        if (server.autoComplete) {
          queueMicrotask(() => {
            this.onNotification({
              method: 'turn/started',
              params: { threadId, turn },
            });
            this.onNotification({
              method: 'turn/completed',
              params: { threadId, turn },
            });
          });
        }
        return { turn };
      }
      if (method === 'turn/steer') {
        return (
          server.steerResponse?.(params) ?? {
            turnId: `turn-${server.nextTurn}`,
          }
        );
      }
      return {};
    }

    waitUntilFailure() {
      return this.failure;
    }
    waitUntilExit() {
      return this.exited;
    }
    async close() {
      this.closed++;
    }
    fail(error: Error) {
      this.rejectFailure(error);
    }
  },
}));

function createUserMessages() {
  type Message = {
    messageId: string;
    text: string;
    accept: () => void;
    reject: (error?: unknown) => void;
  };
  const messages: Message[] = [];
  const pending = new Set<Message>();
  const waiters: Array<(result: IteratorResult<Message>) => void> = [];
  let closed = false;
  const queue = {
    get pendingCount() {
      return pending.size;
    },
    close(error?: unknown) {
      closed = true;
      for (const message of pending) message.reject(error);
      pending.clear();
      messages.length = 0;
      for (const waiter of waiters.splice(0)) {
        waiter({ done: true, value: undefined });
      }
    },
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<Message>> {
          const message = messages.shift();
          if (message != null)
            return Promise.resolve({ done: false, value: message });
          if (closed) return Promise.resolve({ done: true, value: undefined });
          return new Promise(resolve => waiters.push(resolve));
        },
      };
    },
  };
  return {
    queue,
    push(text: string, messageId: string) {
      const message: Message = {
        messageId,
        text,
        accept: vi.fn(),
        reject: vi.fn(),
      };
      pending.add(message);
      const waiter = waiters.shift();
      if (waiter != null) waiter({ done: false, value: message });
      else messages.push(message);
      return message;
    },
  };
}

describe('Codex app-server runtime lifecycle', () => {
  beforeEach(() => {
    server.clients = [];
    server.nextThread = 0;
    server.nextTurn = 0;
    server.autoComplete = true;
    server.hookResponse = undefined;
    server.steerResponse = undefined;
  });

  function createOptions({
    threadId,
    codexConfig = {},
    start = {},
    abortSignal = new AbortController().signal,
    emit = () => {},
    userMessages = createUserMessages(),
  }: {
    threadId?: string;
    codexConfig?: Record<string, unknown>;
    start?: Partial<StartMessage>;
    abortSignal?: AbortSignal;
    emit?: (event: Record<string, unknown>) => void;
    userMessages?: ReturnType<typeof createUserMessages>;
  } = {}) {
    const send = vi.fn();
    return {
      start: {
        type: 'start',
        prompt: 'Hello',
        tools: [{ name: 'host_tool' }],
        ...start,
      } as StartMessage,
      turn: {
        abortSignal,
        emitWarning: vi.fn(),
        emitError: vi.fn(),
        bridgeLog: vi.fn(),
        requestToolResult: vi.fn(async () => ({ output: 'done' })),
        experimental_userMessages: userMessages.queue,
      } as unknown as BridgeTurn,
      emit,
      workdir: '/workspace',
      threadId,
      codexModel: 'gpt-5.3-codex',
      codexConfig,
      stepTracker: createCodexStepTracker({ send }),
      emitStreamEvent: vi.fn(),
    };
  }

  function methods(client: (typeof server.clients)[number]) {
    return client.calls.map(call => call.method);
  }

  it('initializes once, reuses the loaded thread, and closes on request', async () => {
    const runtime = createCodexAppServerRuntime();
    const first = createOptions();
    await runtime.runTurn(first);
    const second = createOptions({
      threadId: 'thread-1',
      start: { prompt: 'Next' },
    });
    await runtime.runTurn(second);

    expect(server.clients).toHaveLength(1);
    expect(methods(server.clients[0]!)).toEqual([
      'initialize',
      'thread/start',
      'turn/start',
      'turn/start',
    ]);
    expect(
      server.clients[0]!.calls.find(call => call.method === 'thread/start')
        ?.params,
    ).toHaveProperty('experimentalRawEvents', true);
    expect(second.emitStreamEvent).toHaveBeenCalledWith({
      type: 'thread.started',
      thread_id: 'thread-1',
    });
    await runtime.close();
    expect(server.clients[0]?.closed).toBe(1);
  });

  it('restarts a thread inside the same app-server process', async () => {
    const runtime = createCodexAppServerRuntime();
    await runtime.runTurn(createOptions());
    await runtime.runTurn(
      createOptions({
        start: { restartThread: true },
      }),
    );

    expect(server.clients).toHaveLength(1);
    expect(methods(server.clients[0]!)).toEqual([
      'initialize',
      'thread/start',
      'turn/start',
      'thread/unsubscribe',
      'thread/start',
      'turn/start',
    ]);
    await runtime.close();
  });

  it('cold-resumes on config, web search, or provider header changes', async () => {
    const runtime = createCodexAppServerRuntime();
    await runtime.runTurn(createOptions());
    await runtime.runTurn(
      createOptions({
        threadId: 'thread-1',
        codexConfig: {
          model_providers: { openai: { http_headers: { tenant: 'a' } } },
        },
      }),
    );
    await runtime.runTurn(
      createOptions({
        threadId: 'thread-1',
        codexConfig: {
          model_providers: { openai: { http_headers: { tenant: 'a' } } },
        },
        start: { webSearch: true },
      }),
    );

    expect(server.clients).toHaveLength(3);
    expect(server.clients.slice(0, 2).map(client => client.closed)).toEqual([
      1, 1,
    ]);
    expect(methods(server.clients[1]!)).toEqual([
      'initialize',
      'thread/resume',
      'turn/start',
    ]);
    expect(
      server.clients[1]!.calls.find(call => call.method === 'thread/resume')
        ?.params,
    ).not.toHaveProperty('experimentalRawEvents');
    expect(methods(server.clients[2]!)).toEqual([
      'initialize',
      'thread/resume',
      'turn/start',
    ]);
    await runtime.close();
  });

  it('disables all environment tools and web search without starting a hook', async () => {
    const runtime = createCodexAppServerRuntime();
    await runtime.runTurn(
      createOptions({
        start: {
          webSearch: true,
          builtinToolFiltering: {
            mode: 'allow',
            toolNames: [],
          },
        },
      }),
    );
    const client = server.clients[0]!;
    expect(methods(client)).not.toContain('hooks/list');
    expect(
      (
        client.calls.find(call => call.method === 'thread/start')?.params as
          | { config: unknown }
          | undefined
      )?.config,
    ).toEqual({
      environments: [],
      features: { shell_tool: false, view_image: false },
      web_search: 'disabled',
    });
    await runtime.close();
  });

  it('disables individual tools without disabling available environment tools', async () => {
    const runtime = createCodexAppServerRuntime();
    await runtime.runTurn(
      createOptions({
        start: {
          builtinToolFiltering: {
            mode: 'deny',
            toolNames: ['bash', 'view_image'],
          },
        },
      }),
    );
    expect(
      (
        server.clients[0]!.calls.find(call => call.method === 'thread/start')
          ?.params as { config: unknown } | undefined
      )?.config,
    ).toEqual({
      features: { shell_tool: false, view_image: false },
      web_search: 'disabled',
    });
    await runtime.close();
  });

  it('starts a trusted apply_patch hook, checks it before the turn, and reuses the process', async () => {
    const hook = createTrustedApplyPatchHook({ codexConfig: {} });
    server.hookResponse = {
      data: [
        {
          hooks: [
            {
              key: hook.key,
              eventName: 'preToolUse',
              handlerType: 'command',
              command: hook.command,
              matcher: '^apply_patch$',
              currentHash: hook.hash,
              enabled: true,
              trustStatus: 'trusted',
            },
          ],
          errors: [],
        },
      ],
    };
    const runtime = createCodexAppServerRuntime();
    const start = {
      builtinToolFiltering: {
        mode: 'deny' as const,
        toolNames: ['apply_patch'],
      },
    };
    await runtime.runTurn(createOptions({ start }));
    await runtime.runTurn(createOptions({ threadId: 'thread-1', start }));
    const client = server.clients[0]!;
    expect(server.clients).toHaveLength(1);
    expect(client.args).toContain(`hooks=${hook.cliOverrides[0]!.slice(6)}`);
    expect(methods(client)).toEqual([
      'initialize',
      'hooks/list',
      'thread/start',
      'turn/start',
      'hooks/list',
      'turn/start',
    ]);
    await runtime.close();
  });

  it('refuses to start a turn when the apply_patch hook is not trusted', async () => {
    const runtime = createCodexAppServerRuntime();
    await expect(
      runtime.runTurn(
        createOptions({
          start: {
            builtinToolFiltering: {
              mode: 'deny',
              toolNames: ['apply_patch'],
            },
          },
        }),
      ),
    ).rejects.toThrow('did not load the trusted apply_patch filtering hook');
    expect(methods(server.clients[0]!)).toEqual(['initialize', 'hooks/list']);
    expect(server.clients[0]?.closed).toBe(1);
  });

  it('rejects stale tool requests without invoking the current turn tool', async () => {
    server.autoComplete = false;
    const runtime = createCodexAppServerRuntime();
    const first = createOptions();
    const pendingFirst = runtime.runTurn(first);
    await vi.waitFor(() =>
      expect(
        server.clients[0]?.calls.some(call => call.method === 'turn/start'),
      ).toBe(true),
    );
    const client = server.clients[0]!;
    client.onNotification({
      method: 'turn/completed',
      params: {
        threadId: 'thread-1',
        turn: { id: 'turn-1', status: 'completed' },
      },
    });
    await pendingFirst;

    const next = createOptions({ threadId: 'thread-1' });
    const pendingNext = runtime.runTurn(next);
    await vi.waitFor(() =>
      expect(
        client.calls.filter(call => call.method === 'turn/start'),
      ).toHaveLength(2),
    );
    await expect(
      client.onRequest({
        id: 1,
        method: 'item/tool/call',
        params: {
          threadId: 'thread-1',
          turnId: 'turn-1',
          tool: 'host_tool',
          callId: 'old',
        },
      }),
    ).rejects.toThrow('inactive turn');
    expect(next.turn.requestToolResult).not.toHaveBeenCalled();
    await expect(
      client.onRequest({
        id: 2,
        method: 'item/tool/call',
        params: {
          threadId: 'thread-1',
          turnId: 'turn-2',
          tool: 'host_tool',
          callId: 'current',
        },
      }),
    ).resolves.toEqual({
      contentItems: [{ type: 'inputText', text: 'done' }],
      success: true,
    });
    expect(next.turn.requestToolResult).toHaveBeenCalledWith('current');
    client.onNotification({
      method: 'turn/completed',
      params: {
        threadId: 'thread-1',
        turn: { id: 'turn-2', status: 'completed' },
      },
    });
    await pendingNext;
    await runtime.close();
  });

  it('steers the active turn while a host tool result is pending and sends messages in order', async () => {
    server.autoComplete = false;
    const runtime = createCodexAppServerRuntime();
    const userMessages = createUserMessages();
    const options = createOptions({ userMessages });
    let releaseTool: ((value: { output: string }) => void) | undefined;
    vi.mocked(options.turn.requestToolResult).mockImplementation(
      () => new Promise(resolve => (releaseTool = resolve)),
    );
    const pending = runtime.runTurn(options);
    await vi.waitFor(() =>
      expect(
        server.clients[0]?.calls.some(call => call.method === 'turn/start'),
      ).toBe(true),
    );
    const client = server.clients[0]!;
    const toolRequest = client.onRequest({
      id: 1,
      method: 'item/tool/call',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        tool: 'host_tool',
        callId: 'call-1',
      },
    });
    await vi.waitFor(() =>
      expect(options.turn.requestToolResult).toHaveBeenCalledWith('call-1'),
    );
    const first = userMessages.push('Actually, Paris, Texas.', 'message-1');
    const second = userMessages.push('Use Celsius.', 'message-2');
    await vi.waitFor(() => expect(second.accept).toHaveBeenCalledOnce());
    expect(first.accept).toHaveBeenCalledOnce();
    expect(first.reject).not.toHaveBeenCalled();
    expect(second.reject).not.toHaveBeenCalled();
    expect(client.calls.filter(call => call.method === 'turn/steer')).toEqual([
      {
        method: 'turn/steer',
        params: {
          threadId: 'thread-1',
          expectedTurnId: 'turn-1',
          clientUserMessageId: 'message-1',
          input: [
            {
              type: 'text',
              text: 'Actually, Paris, Texas.',
              text_elements: [],
            },
          ],
        },
      },
      {
        method: 'turn/steer',
        params: {
          threadId: 'thread-1',
          expectedTurnId: 'turn-1',
          clientUserMessageId: 'message-2',
          input: [{ type: 'text', text: 'Use Celsius.', text_elements: [] }],
        },
      },
    ]);
    releaseTool!({ output: 'done' });
    await toolRequest;
    client.onNotification({
      method: 'turn/completed',
      params: {
        threadId: 'thread-1',
        turn: { id: 'turn-1', status: 'completed' },
      },
    });
    await pending;
    await runtime.close();
  });

  it('rejects failed and mismatched steering requests without failing the turn', async () => {
    server.autoComplete = false;
    let count = 0;
    server.steerResponse = () => {
      count++;
      if (count === 1) throw new Error('No active turn');
      if (count === 2) return { turnId: 'a-different-turn' };
      return { turnId: 'turn-1' };
    };
    const runtime = createCodexAppServerRuntime();
    const userMessages = createUserMessages();
    const pending = runtime.runTurn(createOptions({ userMessages }));
    await vi.waitFor(() =>
      expect(
        server.clients[0]?.calls.some(call => call.method === 'turn/start'),
      ).toBe(true),
    );
    const rejected = userMessages.push('First', 'message-1');
    const mismatched = userMessages.push('Second', 'message-2');
    const accepted = userMessages.push('Third', 'message-3');
    await vi.waitFor(() => expect(accepted.accept).toHaveBeenCalledOnce());
    expect(rejected.reject).toHaveBeenCalledWith(new Error('No active turn'));
    expect(mismatched.reject).toHaveBeenCalledWith(
      new Error('Codex app-server turn/steer returned an unexpected turn ID.'),
    );
    server.clients[0]!.onNotification({
      method: 'turn/completed',
      params: {
        threadId: 'thread-1',
        turn: { id: 'turn-1', status: 'completed' },
      },
    });
    await pending;
    await runtime.close();
  });

  it('rejects a pending steering request when the turn ends', async () => {
    server.autoComplete = false;
    server.steerResponse = () => new Promise(() => {});
    const runtime = createCodexAppServerRuntime();
    const userMessages = createUserMessages();
    const pending = runtime.runTurn(createOptions({ userMessages }));
    await vi.waitFor(() =>
      expect(
        server.clients[0]?.calls.some(call => call.method === 'turn/start'),
      ).toBe(true),
    );
    const message = userMessages.push('Too late.', 'message-1');
    await vi.waitFor(() =>
      expect(
        server.clients[0]?.calls.some(call => call.method === 'turn/steer'),
      ).toBe(true),
    );
    server.clients[0]!.onNotification({
      method: 'turn/completed',
      params: {
        threadId: 'thread-1',
        turn: { id: 'turn-1', status: 'completed' },
      },
    });
    await pending;
    expect(message.accept).not.toHaveBeenCalled();
    expect(message.reject).toHaveBeenCalledOnce();
    await runtime.close();
  });

  it('closes a failed process and cold-resumes on the next turn', async () => {
    server.autoComplete = false;
    const runtime = createCodexAppServerRuntime();
    const pending = runtime.runTurn(createOptions());
    await vi.waitFor(() =>
      expect(
        server.clients[0]?.calls.some(call => call.method === 'turn/start'),
      ).toBe(true),
    );
    server.clients[0]!.fail(new Error('app-server crashed'));
    await expect(pending).rejects.toThrow('app-server crashed');
    expect(server.clients[0]?.closed).toBe(1);

    server.autoComplete = true;
    await runtime.runTurn(createOptions({ threadId: 'thread-1' }));
    expect(methods(server.clients[1]!)).toEqual([
      'initialize',
      'thread/resume',
      'turn/start',
    ]);
    await runtime.close();
  });

  it('interrupts an aborted turn and reuses the process once Codex settles', async () => {
    server.autoComplete = false;
    const runtime = createCodexAppServerRuntime();
    const controller = new AbortController();
    const pending = runtime.runTurn(
      createOptions({ abortSignal: controller.signal }),
    );
    await vi.waitFor(() =>
      expect(
        server.clients[0]?.calls.some(call => call.method === 'turn/start'),
      ).toBe(true),
    );

    controller.abort();
    const client = server.clients[0]!;
    client.onNotification({
      method: 'turn/completed',
      params: {
        threadId: 'thread-1',
        turn: { id: 'turn-1', status: 'interrupted' },
      },
    });
    await expect(pending).rejects.toThrow();
    expect(methods(client)).toContain('turn/interrupt');
    expect(client.closed).toBe(0);

    server.autoComplete = true;
    await runtime.runTurn(createOptions({ threadId: 'thread-1' }));
    expect(server.clients).toHaveLength(1);
    await runtime.close();
  });
});

describe('Codex app-server sandbox configuration', () => {
  const start = {
    type: 'start',
    prompt: 'Inspect the parent directory.',
    reasoningEffort: 'high',
    responseFormat: {
      type: 'json',
      schema: { type: 'object' },
    },
    webSearch: true,
  } as StartMessage;

  it('disables the Codex sandbox before app-server startup', () => {
    expect(createCodexAppServerArgs().slice(1)).toEqual([
      '--config',
      'sandbox_mode="danger-full-access"',
      '--config',
      'approval_policy="never"',
      'app-server',
      '--stdio',
    ]);
  });

  it('disables the Codex sandbox when starting or resuming a thread', () => {
    expect(
      createThreadParams({
        start,
        workdir: '/workspace',
        codexModel: 'gpt-5.3-codex',
        codexConfig: { model_reasoning_summary: 'detailed' },
      }),
    ).toEqual({
      model: 'gpt-5.3-codex',
      cwd: '/workspace',
      approvalPolicy: 'never',
      sandbox: 'danger-full-access',
      config: {
        model_reasoning_summary: 'detailed',
        web_search: 'live',
      },
    });
  });

  it('declares the HarnessAgent sandbox as the only sandbox for every turn', () => {
    expect(
      createTurnParams({
        threadId: 'thread-1',
        start,
        codexModel: 'gpt-5.3-codex',
      }),
    ).toEqual({
      threadId: 'thread-1',
      input: [
        {
          type: 'text',
          text: 'Inspect the parent directory.',
          text_elements: [],
        },
      ],
      approvalPolicy: 'never',
      sandboxPolicy: {
        type: 'externalSandbox',
        networkAccess: 'enabled',
      },
      model: 'gpt-5.3-codex',
      effort: 'high',
      outputSchema: { type: 'object' },
    });
  });

  it('fails before a turn if Codex did not disable its sandbox', () => {
    expect(() =>
      assertCodexThreadPermissions({
        response: {
          approvalPolicy: 'never',
          sandbox: { type: 'workspaceWrite' },
        },
        method: 'thread/start',
      }),
    ).toThrow(
      'Codex app-server thread/start did not disable approvals and its platform sandbox.',
    );
  });

  it('accepts the disabled thread policy returned by Codex', () => {
    expect(() =>
      assertCodexThreadPermissions({
        response: {
          approvalPolicy: 'never',
          sandbox: { type: 'dangerFullAccess' },
        },
        method: 'thread/start',
      }),
    ).not.toThrow();
  });
});

describe('Codex app-server dynamic tools', () => {
  it('preserves supported names and deterministically aliases invalid or reserved names', () => {
    const tools = [
      {
        name: 'get_weather',
        description: 'Get weather.',
        inputSchema: { type: 'object' },
      },
      {
        name: 'mcp__reserved',
        description: 'Reserved.',
        inputSchema: { type: 'object' },
      },
      {
        name: 'invalid.name',
        description: 'Invalid.',
        inputSchema: { type: 'object' },
      },
    ];

    const first = createDynamicTools(tools);
    const second = createDynamicTools(tools);
    const names = first.specs.map(spec => spec.name);

    expect(first.specs).toEqual(second.specs);
    expect(names[0]).toBe('get_weather');
    expect(names.slice(1)).toEqual([
      expect.stringMatching(/^ai_sdk_tool_[a-f0-9]{16}$/),
      expect.stringMatching(/^ai_sdk_tool_[a-f0-9]{16}$/),
    ]);
    expect(
      names.map(name => first.originalNameByAlias.get(String(name))),
    ).toEqual(tools.map(tool => tool.name));
  });

  it('uses an empty input schema when none is provided', () => {
    expect(createDynamicTools([{ name: 'no_args' }]).specs).toEqual([
      {
        type: 'function',
        name: 'no_args',
        description: '',
        inputSchema: {},
      },
    ]);
  });

  it('routes a tool request by call id and returns text output', async () => {
    const emitted: Array<Record<string, unknown>> = [];
    const dynamicTools = createDynamicTools([
      {
        name: 'get_weather',
        description: 'Get weather.',
        inputSchema: { type: 'object' },
      },
    ]);
    const requestToolResult = vi.fn(async () => ({
      output: { temperature: 21 },
    }));

    await expect(
      handleAppServerRequest({
        request: {
          id: 42,
          method: 'item/tool/call',
          params: {
            threadId: 'thread-1',
            turnId: 'turn-1',
            callId: 'call-1',
            namespace: null,
            tool: 'get_weather',
            arguments: { city: 'Berlin' },
          },
        },
        dynamicTools,
        emit: event => emitted.push(event),
        requestToolResult,
      }),
    ).resolves.toEqual({
      contentItems: [{ type: 'inputText', text: '{"temperature":21}' }],
      success: true,
    });
    expect(requestToolResult).toHaveBeenCalledWith('call-1');
    expect(emitted).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'get_weather',
        input: '{"city":"Berlin"}',
        providerExecuted: false,
      },
      {
        type: 'tool-result',
        toolCallId: 'call-1',
        toolName: 'get_weather',
        result: { temperature: 21 },
        isError: false,
      },
    ]);
  });

  it('reports host tool errors through dynamic tool success', async () => {
    const emitted: Array<Record<string, unknown>> = [];
    const dynamicTools = createDynamicTools([
      {
        name: 'fail',
        inputSchema: { type: 'object' },
      },
    ]);

    await expect(
      handleAppServerRequest({
        request: {
          id: 'rpc-1',
          method: 'item/tool/call',
          params: {
            callId: 'call-1',
            tool: 'fail',
            arguments: {},
          },
        },
        dynamicTools,
        emit: event => emitted.push(event),
        requestToolResult: async () => ({
          output: 'failed',
          isError: true,
        }),
      }),
    ).resolves.toEqual({
      contentItems: [{ type: 'inputText', text: 'failed' }],
      success: false,
    });
    expect(emitted.at(-1)).toEqual({
      type: 'tool-result',
      toolCallId: 'call-1',
      toolName: 'fail',
      result: 'failed',
      isError: true,
    });
  });
});
