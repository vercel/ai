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

type Emit = (message: Record<string, unknown>) => void;

const CODEX_CLI_PATH = fileURLToPath(
  new URL('./node_modules/@openai/codex/bin/codex.js', import.meta.url),
);

export async function runCodexAppServerTurn({
  start,
  turn,
  emit,
  workdir,
  threadId,
  codexModel,
  codexConfig,
  stepTracker,
  emitStreamEvent,
}: {
  start: StartMessage;
  turn: BridgeTurn;
  emit: Emit;
  workdir: string;
  threadId: string | undefined;
  codexModel: string | undefined;
  codexConfig: Record<string, unknown>;
  stepTracker: CodexStepTracker;
  emitStreamEvent: (event: CodexEvent) => void;
}): Promise<void> {
  const dynamicTools = createDynamicTools(start.tools ?? []);
  const eventHandler = createAppServerEventHandler({
    stepTracker,
    emitStreamEvent,
    emitWarning: turn.emitWarning,
    emitError: turn.emitError,
  });
  let activeThreadId = threadId;
  let activeTurnId: string | undefined;
  let rejectProtocolFailure: (error: unknown) => void = () => {};
  const protocolFailure = new Promise<never>((_, reject) => {
    rejectProtocolFailure = reject;
  });
  const client = new CodexAppServerClient({
    executable: process.execPath,
    args: [CODEX_CLI_PATH, 'app-server', '--stdio'],
    cwd: workdir,
    env: process.env,
    onNotification: eventHandler.handle,
    onRequest: request =>
      handleAppServerRequest({
        request,
        dynamicTools,
        emit,
        requestToolResult: turn.requestToolResult,
      }).catch(error => {
        rejectProtocolFailure(error);
        throw error;
      }),
    onStderr: text => {
      const message = text.trim();
      if (message.length > 0) {
        turn.bridgeLog({
          level: 'debug',
          subsystem: 'codex.app-server.stderr',
          message,
        });
      }
    },
  });
  let removeAbortListener = () => {};
  const abortFailure = new Promise<never>((_, reject) => {
    const onAbort = () => {
      if (activeThreadId != null && activeTurnId != null) {
        void client
          .request({
            method: 'turn/interrupt',
            params: { threadId: activeThreadId, turnId: activeTurnId },
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
  const clientFailure = client.waitUntilFailure();
  const exitFailure = client.waitUntilExit().then(({ code, signal }) => {
    throw new Error(
      `Codex app-server exited before the turn completed (code ${code ?? 'null'}, signal ${signal ?? 'null'}).`,
    );
  });
  const raceWithProcess = <T>({ operation }: { operation: Promise<T> }) =>
    Promise.race([
      operation,
      abortFailure,
      protocolFailure,
      clientFailure,
      exitFailure,
    ]);

  try {
    await raceWithProcess({
      operation: client.initialize({
        clientName: 'ai-sdk-harness-codex',
        clientVersion: '1',
      }),
    });
    const threadResponse = await raceWithProcess({
      operation: client.request({
        method: activeThreadId == null ? 'thread/start' : 'thread/resume',
        params:
          activeThreadId == null
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
                threadId: activeThreadId,
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
    activeThreadId = readNestedString({
      value: threadResponse,
      path: ['thread', 'id'],
      method: activeThreadId == null ? 'thread/start' : 'thread/resume',
    });
    eventHandler.announceThread(activeThreadId);
    emit({ type: 'stream-start' });

    const turnResponse = await raceWithProcess({
      operation: client.request({
        method: 'turn/start',
        params: {
          threadId: activeThreadId,
          input: [{ type: 'text', text: start.prompt, text_elements: [] }],
          ...(codexModel == null ? {} : { model: codexModel }),
          ...(start.reasoningEffort == null
            ? {}
            : { effort: start.reasoningEffort }),
          ...(start.responseFormat?.type === 'json' &&
          start.responseFormat.schema != null
            ? { outputSchema: start.responseFormat.schema }
            : {}),
        },
      }),
    });
    activeTurnId = readNestedString({
      value: turnResponse,
      path: ['turn', 'id'],
      method: 'turn/start',
    });
    eventHandler.setTurnId(activeTurnId);

    const result = await raceWithProcess({
      operation: eventHandler.waitForCompletion(),
    });
    assertSuccessfulTurn(result);
  } finally {
    removeAbortListener();
    await client.close();
  }
}

function createThreadParams({
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
