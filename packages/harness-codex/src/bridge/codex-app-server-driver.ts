import type { BridgeTurn } from '@ai-sdk/harness/bridge';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { StartMessage } from '../codex-bridge-protocol';
import {
  CodexAppServerClient,
  type CodexAppServerRequest,
} from './codex-app-server-client';
import {
  createAppServerEventHandler,
  type AppServerTurnResult,
} from './create-app-server-event-handler';
import type { CodexStepTracker } from './codex-step-tracker';
import type { CodexEvent } from './create-emit-stream-event';
import { isDeepStrictEqual } from 'node:util';

type Emit = (message: Record<string, unknown>) => void;

const CODEX_CLI_PATH = fileURLToPath(
  new URL('./node_modules/@openai/codex/bin/codex.js', import.meta.url),
);

type RunTurnOptions = {
  start: StartMessage;
  turn: BridgeTurn;
  emit: Emit;
  workdir: string;
  threadId: string | undefined;
  codexModel: string | undefined;
  codexConfig: Record<string, unknown>;
  stepTracker: CodexStepTracker;
  emitStreamEvent: (event: CodexEvent) => void;
};

type ActiveTurn = {
  threadId: string | undefined;
  turnId: string | undefined;
  handler: ReturnType<typeof createAppServerEventHandler>;
  dynamicTools: ReturnType<typeof createDynamicTools>;
  options: RunTurnOptions;
  fail(error: unknown): void;
};

export function createCodexAppServerRuntime(): {
  runTurn(options: RunTurnOptions): Promise<void>;
  close(): Promise<void>;
} {
  let client: CodexAppServerClient | undefined;
  let loadedThreadId: string | undefined;
  let loadedConfig: Record<string, unknown> | undefined;
  let activeTurn: ActiveTurn | undefined;

  const close = async (): Promise<void> => {
    const previous = client;
    client = undefined;
    loadedThreadId = undefined;
    loadedConfig = undefined;
    await previous?.close();
  };

  const runTurn = async (options: RunTurnOptions): Promise<void> => {
    const { start, turn, emit, workdir, threadId, codexModel, codexConfig } =
      options;
    if (activeTurn != null) throw new Error('A Codex turn is already active.');
    const nextConfig = {
      ...codexConfig,
      web_search: start.webSearch ? 'live' : 'disabled',
    };
    if (client != null && !isDeepStrictEqual(loadedConfig, nextConfig)) {
      await close();
    }
    const handler = createAppServerEventHandler({
      stepTracker: options.stepTracker,
      emitStreamEvent: options.emitStreamEvent,
      emitWarning: turn.emitWarning,
      emitError: turn.emitError,
    });
    const dynamicTools = createDynamicTools(start.tools ?? []);
    let rejectProtocolFailure: (error: unknown) => void = () => {};
    const protocolFailure = new Promise<never>((_, reject) => {
      rejectProtocolFailure = reject;
    });
    const currentTurn: ActiveTurn = {
      threadId,
      turnId: undefined,
      handler,
      dynamicTools,
      options,
      fail: rejectProtocolFailure,
    };
    activeTurn = currentTurn;
    let initialized = false;
    if (client == null) {
      const created = new CodexAppServerClient({
        executable: process.execPath,
        args: createCodexAppServerArgs(),
        cwd: workdir,
        env: process.env,
        onNotification: notification => {
          if (client !== created || activeTurn == null) return;
          const params = asRecord(notification.params);
          if (
            notification.method === 'turn/started' &&
            params?.threadId === activeTurn.threadId &&
            activeTurn.turnId == null
          ) {
            const turnId = asRecord(params?.turn)?.id;
            if (typeof turnId === 'string') activeTurn.turnId = turnId;
          }
          activeTurn.handler.handle(notification);
        },
        onRequest: request => {
          const active = activeTurn;
          const params = asRecord(request.params);
          if (
            client !== created ||
            active == null ||
            params?.threadId !== active.threadId ||
            params?.turnId !== active.turnId ||
            active.turnId == null
          ) {
            return Promise.reject(
              new Error(
                'Codex app-server requested a tool for an inactive turn.',
              ),
            );
          }
          return handleAppServerRequest({
            request,
            dynamicTools: active.dynamicTools,
            emit: active.options.emit,
            requestToolResult: active.options.turn.requestToolResult,
          }).catch(error => {
            active.fail(error);
            throw error;
          });
        },
        onStderr: text => {
          const message = text.trim();
          if (message.length > 0) {
            activeTurn?.options.turn.bridgeLog({
              level: 'debug',
              subsystem: 'codex.app-server.stderr',
              message,
            });
          }
        },
      });
      client = created;
      loadedConfig = nextConfig;
      initialized = true;
    }
    const runningClient = client;
    const clientFailure = runningClient.waitUntilFailure();
    const exitFailure = runningClient
      .waitUntilExit()
      .then(({ code, signal }) => {
        throw new Error(
          `Codex app-server exited before the turn completed (code ${code ?? 'null'}, signal ${signal ?? 'null'}).`,
        );
      });
    let removeAbortListener = () => {};
    const abortFailure = new Promise<never>((_, reject) => {
      const onAbort = () => {
        if (currentTurn.threadId != null && currentTurn.turnId != null) {
          void runningClient
            .request({
              method: 'turn/interrupt',
              params: {
                threadId: currentTurn.threadId,
                turnId: currentTurn.turnId,
              },
            })
            .catch(() => {});
        }
        reject(
          turn.abortSignal.reason ?? new DOMException('Aborted', 'AbortError'),
        );
      };
      if (turn.abortSignal.aborted) onAbort();
      else {
        turn.abortSignal.addEventListener('abort', onAbort, { once: true });
        removeAbortListener = () =>
          turn.abortSignal.removeEventListener('abort', onAbort);
      }
    });
    const raceWithProcess = <T>({ operation }: { operation: Promise<T> }) =>
      Promise.race([
        operation,
        abortFailure,
        protocolFailure,
        clientFailure,
        exitFailure,
      ]);
    let keepClient = false;
    try {
      if (initialized) {
        await raceWithProcess({
          operation: runningClient.initialize({
            clientName: 'ai-sdk-harness-codex',
            clientVersion: '1',
          }),
        });
      }
      if (start.restartThread && loadedThreadId != null) {
        await raceWithProcess({
          operation: runningClient.request({
            method: 'thread/unsubscribe',
            params: { threadId: loadedThreadId },
          }),
        });
        loadedThreadId = undefined;
      }
      const threadMethod = threadId == null ? 'thread/start' : 'thread/resume';
      if (loadedThreadId !== threadId || threadId == null) {
        const threadResponse = await raceWithProcess({
          operation: runningClient.request({
            method: threadMethod,
            params:
              threadId == null
                ? {
                    ...createThreadParams({
                      start,
                      workdir,
                      codexModel,
                      codexConfig,
                    }),
                    dynamicTools: dynamicTools.specs,
                  }
                : {
                    threadId,
                    ...createThreadParams({
                      start,
                      workdir,
                      codexModel,
                      codexConfig,
                    }),
                    excludeTurns: true,
                  },
          }),
        });
        assertCodexThreadPermissions({
          response: threadResponse,
          method: threadMethod,
        });
        currentTurn.threadId = readNestedString({
          value: threadResponse,
          path: ['thread', 'id'],
          method: threadMethod,
        });
        loadedThreadId = currentTurn.threadId;
      }
      handler.announceThread(currentTurn.threadId!);
      emit({ type: 'stream-start' });
      const turnResponse = await raceWithProcess({
        operation: runningClient.request({
          method: 'turn/start',
          params: createTurnParams({
            threadId: currentTurn.threadId!,
            start,
            codexModel,
          }),
        }),
      });
      currentTurn.turnId = readNestedString({
        value: turnResponse,
        path: ['turn', 'id'],
        method: 'turn/start',
      });
      handler.setTurnId(currentTurn.turnId);
      const result = await raceWithProcess({
        operation: handler.waitForCompletion(),
      });
      keepClient = true;
      assertSuccessfulTurn(result);
    } catch (error) {
      if (turn.abortSignal.aborted && currentTurn.turnId != null) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          keepClient = await Promise.race([
            handler.waitForCompletion().then(() => true),
            new Promise<boolean>(resolve => {
              timer = setTimeout(() => resolve(false), 5_000);
            }),
            clientFailure.then(
              () => false,
              () => false,
            ),
          ]);
        } finally {
          clearTimeout(timer);
        }
      }
      throw error;
    } finally {
      removeAbortListener();
      if (activeTurn === currentTurn) activeTurn = undefined;
      if (!keepClient) await close();
    }
  };

  return { runTurn, close };
}

export function createCodexAppServerArgs(): string[] {
  return [
    CODEX_CLI_PATH,
    '--config',
    'sandbox_mode="danger-full-access"',
    '--config',
    'approval_policy="never"',
    'app-server',
    '--stdio',
  ];
}

export function createThreadParams({
  start,
  workdir,
  codexModel,
  codexConfig,
}: {
  start: StartMessage;
  workdir: string;
  codexModel: string | undefined;
  codexConfig: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    ...(codexModel == null ? {} : { model: codexModel }),
    cwd: workdir,
    approvalPolicy: 'never',
    sandbox: 'danger-full-access',
    config: {
      ...codexConfig,
      web_search: start.webSearch ? 'live' : 'disabled',
    },
  };
}

export function createTurnParams({
  threadId,
  start,
  codexModel,
}: {
  threadId: string;
  start: StartMessage;
  codexModel: string | undefined;
}): Record<string, unknown> {
  return {
    threadId,
    input: [{ type: 'text', text: start.prompt, text_elements: [] }],
    approvalPolicy: 'never',
    sandboxPolicy: {
      type: 'externalSandbox',
      networkAccess: 'enabled',
    },
    ...(codexModel == null ? {} : { model: codexModel }),
    ...(start.reasoningEffort == null ? {} : { effort: start.reasoningEffort }),
    ...(start.responseFormat?.type === 'json' &&
    start.responseFormat.schema != null
      ? { outputSchema: start.responseFormat.schema }
      : {}),
  };
}

export function assertCodexThreadPermissions({
  response,
  method,
}: {
  response: unknown;
  method: string;
}): void {
  const value = asRecord(response);
  const sandbox = asRecord(value?.sandbox);
  if (
    value?.approvalPolicy !== 'never' ||
    sandbox?.type !== 'dangerFullAccess'
  ) {
    throw new Error(
      `Codex app-server ${method} did not disable approvals and its platform sandbox.`,
    );
  }
}

export function createDynamicTools(
  tools: ReadonlyArray<{
    name: string;
    description?: string;
    inputSchema?: unknown;
  }>,
): {
  specs: Array<Record<string, unknown>>;
  originalNameByAlias: ReadonlyMap<string, string>;
} {
  const validOriginalNames = new Set(
    tools.map(tool => tool.name).filter(isValidDynamicToolName),
  );
  const usedAliases = new Set<string>();
  const originalNameByAlias = new Map<string, string>();
  const specs = tools.map((tool, index) => {
    let alias = tool.name;
    if (!isValidDynamicToolName(alias) || usedAliases.has(alias)) {
      const digest = createHash('sha256')
        .update(tool.name)
        .digest('hex')
        .slice(0, 16);
      const base = `ai_sdk_tool_${digest}`;
      alias = base;
      let suffix = index;
      while (usedAliases.has(alias) || validOriginalNames.has(alias)) {
        alias = `${base}_${suffix++}`;
      }
    }
    usedAliases.add(alias);
    originalNameByAlias.set(alias, tool.name);
    return {
      type: 'function',
      name: alias,
      description: tool.description ?? '',
      inputSchema: tool.inputSchema ?? {},
    };
  });
  return { specs, originalNameByAlias };
}

function isValidDynamicToolName(name: string): boolean {
  return (
    name.length > 0 &&
    name.length <= 128 &&
    /^[a-zA-Z0-9_-]+$/.test(name) &&
    name !== 'mcp' &&
    !name.startsWith('mcp__')
  );
}

export async function handleAppServerRequest({
  request,
  dynamicTools,
  emit,
  requestToolResult,
}: {
  request: CodexAppServerRequest;
  dynamicTools: ReturnType<typeof createDynamicTools>;
  emit: Emit;
  requestToolResult: BridgeTurn['requestToolResult'];
}): Promise<unknown> {
  if (request.method !== 'item/tool/call') {
    throw new Error(
      `Codex app-server requested unsupported method '${request.method}'.`,
    );
  }
  const params = asRecord(request.params);
  if (
    params == null ||
    typeof params.callId !== 'string' ||
    typeof params.tool !== 'string'
  ) {
    throw new Error('Codex app-server sent an invalid dynamic tool request.');
  }
  const originalToolName = dynamicTools.originalNameByAlias.get(params.tool);
  if (originalToolName == null) {
    throw new Error(
      `Codex app-server requested unknown dynamic tool '${params.tool}'.`,
    );
  }
  emit({
    type: 'tool-call',
    toolCallId: params.callId,
    toolName: originalToolName,
    input: JSON.stringify(params.arguments ?? {}),
    providerExecuted: false,
  });
  const result = await requestToolResult(params.callId);
  emit({
    type: 'tool-result',
    toolCallId: params.callId,
    toolName: originalToolName,
    result: result.output ?? null,
    isError: result.isError === true,
  });
  return {
    contentItems: [
      { type: 'inputText', text: serializeToolOutput(result.output) },
    ],
    success: result.isError !== true,
  };
}

function serializeToolOutput(output: unknown): string {
  if (typeof output === 'string') return output;
  try {
    return JSON.stringify(output) ?? String(output);
  } catch {
    return String(output);
  }
}

function readNestedString({
  value,
  path,
  method,
}: {
  value: unknown;
  path: string[];
  method: string;
}): string {
  let current: unknown = value;
  for (const segment of path) current = asRecord(current)?.[segment];
  if (typeof current !== 'string' || current.length === 0) {
    throw new Error(`Codex app-server ${method} returned an invalid response.`);
  }
  return current;
}

function assertSuccessfulTurn(result: AppServerTurnResult): void {
  if (result.status === 'completed') return;
  if (result.status === 'interrupted') {
    throw new DOMException('Codex turn was interrupted.', 'AbortError');
  }
  throw new Error(
    result.error ?? `Codex turn ended with status '${result.status}'.`,
  );
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
