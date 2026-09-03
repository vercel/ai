import {
  runBridge,
  type BridgeEvent,
  type BridgeTurn,
} from '@ai-sdk/harness/bridge';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { argv, env as procEnv } from 'node:process';
import type { StartMessage } from '../opencode-bridge-protocol';

import {
  createOpencodeClient,
  createOpencodeServer,
} from '@opencode-ai/sdk/v2';
import {
  createTranslationState,
  emitOpenCodeStreamStart,
  getOpenCodeEventSessionId,
  openCodeMessageInfoFromValue,
  type TranslationState,
  unwrapOpenCodeEvent,
} from './opencode-events';
import {
  createAssistantSnapshotBaseline,
  isAssistantSnapshotAfterBaseline,
  type AssistantSnapshotBaseline,
} from './opencode-context-fallback';
import { createEmitStreamEvent, stringValue } from './create-emit-stream-event';
import { mapOpenCodeFinishReason } from './opencode-finish-step';
import { prependOpenCodeBinToPath } from './opencode-path';
import { configureOpenCodeServerAuth } from './opencode-server-auth';
import {
  addUsage,
  defaultUsage,
  extractSessionTokens,
  mapUsage,
  subtractSessionTokens,
  type HarnessUsage,
  type OpenCodeTokenUsage,
} from './opencode-usage';
import {
  asOpenCodeObject,
  type OpenCodeEvent,
  type OpenCodeObject,
} from './opencode-types';
import { startAuthorizedToolRelay, type ToolRelay } from './tool-relay';
import {
  openCodeQuestionKey,
  toHarnessQuestionsInput,
  toOpenCodeQuestionResponse,
  type OpenCodeQuestionRequest,
} from './question-tool';

type Emit = (msg: Record<string, unknown>) => void;

type OpenCodeClient = ReturnType<typeof createOpencodeClient>;
type OpenCodeServer = Awaited<ReturnType<typeof createOpencodeServer>>;

type RuntimeState = {
  server?: OpenCodeServer;
  client?: OpenCodeClient;
  sessionId?: string;
  relay?: ToolRelay;
  toolNames: Set<string>;
  mcpToolPrefixes: Set<string>;
};

type CommonBuiltinToolName =
  | 'read'
  | 'write'
  | 'edit'
  | 'bash'
  | 'glob'
  | 'grep'
  | 'askUserQuestions';

const NATIVE_TO_COMMON: Readonly<Record<string, CommonBuiltinToolName>> = {
  view: 'read',
  read: 'read',
  write: 'write',
  edit: 'edit',
  bash: 'bash',
  glob: 'glob',
  grep: 'grep',
  question: 'askUserQuestions',
};

const OPENCODE_TO_WIRE: Readonly<Record<string, string>> = {
  list: 'ls',
  ls: 'ls',
  webfetch: 'webfetch',
  task: 'agent',
  agent: 'agent',
  askUserQuestions: 'question',
  subtask: 'agent',
};

const PUBLIC_TO_NATIVE: Readonly<Record<string, string>> = {
  read: 'view',
  write: 'write',
  edit: 'edit',
  bash: 'bash',
  glob: 'glob',
  grep: 'grep',
  ls: 'list',
  webfetch: 'webfetch',
  skill: 'skill',
  todowrite: 'todowrite',
  agent: 'agent',
};

const TOOL_KIND: Readonly<Record<string, 'readonly' | 'edit' | 'bash'>> = {
  read: 'readonly',
  glob: 'readonly',
  grep: 'readonly',
  ls: 'readonly',
  webfetch: 'readonly',
  write: 'edit',
  edit: 'edit',
  bash: 'bash',
  agent: 'bash',
  skill: 'edit',
  todowrite: 'edit',
};
const HARNESS_CLIENT_APP = procEnv.AI_SDK_HARNESS_CLIENT_APP;

const args = parseArgs(argv.slice(2));
const workdir = args.workdir ?? emitFatal('Missing --workdir argument.');
const bridgeStateDir =
  args.bridgeStateDir ?? emitFatal('Missing --bridge-state-dir argument.');
const bootstrapDir = args.bootstrapDir ?? workdir;
const skillsDir = args.skillsDir;
const runtime: RuntimeState = {
  toolNames: new Set(),
  mcpToolPrefixes: new Set(),
};
prependOpenCodeBinToPath({ bootstrapDir, env: procEnv });

await runBridge<StartMessage>({
  bridgeType: 'opencode',
  bridgeStateDir,
  onStart: runTurn,
  onStop: () =>
    runtime.sessionId ? { openCodeSessionId: runtime.sessionId } : {},
});

async function runTurn(start: StartMessage, turn: BridgeTurn): Promise<void> {
  const emit: Emit = msg => turn.emit(msg as BridgeEvent);
  let totalUsage: HarnessUsage | undefined;
  try {
    await ensureRuntime({ start, turn, emit });
    const client = runtime.client!;
    if (start.skillsChanged) {
      await client.instance.dispose({ directory: workdir });
    }
    const sessionId = await ensureSession({ client, start, emit });
    await switchSessionModel({ client, sessionId, start });

    if (start.operation === 'compact') {
      await runCompaction({ client, sessionId, start, turn, emit });
    } else {
      totalUsage = await runPrompt({ client, sessionId, start, turn, emit });
    }
  } catch (err) {
    turn.emitError({ error: err, message: 'OpenCode turn failed' });
  } finally {
    turn.experimental_userMessages.close();
    emit({
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'stop' },
      totalUsage: totalUsage ?? defaultUsage(),
    });
  }
}

async function switchSessionModel({
  client,
  sessionId,
  start,
}: {
  client: OpenCodeClient;
  sessionId: string;
  start: StartMessage;
}): Promise<void> {
  const model = modelRefFromStart(start);
  if (model == null) return;
  const response = await client.v2.session.switchModel({
    sessionID: sessionId,
    model: {
      id: model.modelID,
      providerID: model.providerID,
    },
  });
  if (response.error != null) throw response.error;
}

async function ensureRuntime({
  start,
  turn,
  emit,
}: {
  start: StartMessage;
  turn: BridgeTurn;
  emit: Emit;
}): Promise<void> {
  if (runtime.client) return;

  if (start.tools && start.tools.length > 0) {
    runtime.toolNames = new Set(start.tools.map(tool => tool.name));
    runtime.relay = await startToolRelay({
      tools: start.tools,
      emit,
      requestToolResult: turn.requestToolResult,
    });
  }

  const serverAuthHeaders = configureOpenCodeServerAuth({ env: procEnv });
  const server = await createOpencodeServer({
    hostname: '127.0.0.1',
    port: 0,
    timeout: 30_000,
    config: buildOpenCodeConfig({
      start,
      relayPort: runtime.relay?.port,
    }) as never,
  });
  runtime.server = server;
  runtime.client = createOpencodeClient({
    baseUrl: server.url,
    directory: workdir,
    headers: serverAuthHeaders,
  });
  const mcpStatus = await runtime.client.mcp.status();
  const mcpServers = asOpenCodeObject(mcpStatus.data) ?? {};
  runtime.mcpToolPrefixes = new Set(
    Object.entries(mcpServers)
      .filter(
        ([serverName, status]) =>
          serverName !== 'harness-tools' &&
          asOpenCodeObject(status)?.status === 'connected',
      )
      .map(([serverName]) => `${sanitizeMcpToolName(serverName)}_`),
  );
}

function buildOpenCodeConfig({
  start,
  relayPort,
}: {
  start: StartMessage;
  relayPort: number | undefined;
}): Record<string, unknown> {
  const config: Record<string, unknown> = {
    ...withoutAgentPolicyOverrides(start.openCodeConfig),
    share: 'disabled',
    autoupdate: false,
    permission: {
      read: 'allow',
      glob: 'allow',
      grep: 'allow',
      list: 'allow',
      edit: 'ask',
      bash: 'ask',
      external_directory: 'ask',
      webfetch: 'ask',
      doom_loop: 'ask',
      task: 'ask',
      question: 'allow',
    },
  };
  if (start.model) config.model = start.model;
  if (skillsDir) config.skills = { paths: [skillsDir] };
  const inactiveToolNames = resolveInactiveBuiltinToolNames(start);
  const permission = config.permission as Record<string, unknown>;
  for (const toolName of inactiveToolNames) {
    const permissionName = toPermissionToolName(
      PUBLIC_TO_NATIVE[toolName] ?? toolName,
    );
    if (permissionName === 'ls') {
      permission.list = 'ask';
    } else {
      permission[permissionName] = 'ask';
    }
  }
  const provider = buildProviderConfig(start);
  if (provider) config.provider = provider;
  const mcp = { ...(start.mcpServers ?? {}) };
  if (relayPort && start.tools && start.tools.length > 0) {
    mcp['harness-tools'] = {
      type: 'local',
      enabled: true,
      command: ['node', `${bootstrapDir}/host-tool-mcp.mjs`],
      environment: {
        TOOL_SCHEMAS: JSON.stringify(
          start.tools.map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        ),
        TOOL_RELAY_URL: `http://127.0.0.1:${relayPort}`,
      },
    };
  }
  if (Object.keys(mcp).length > 0) config.mcp = mcp;
  return config;
}

function withoutAgentPolicyOverrides(
  input: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const config = { ...input };
  for (const key of ['agent', 'mode'] as const) {
    const agents = asOpenCodeObject(config[key]);
    if (!agents) continue;
    config[key] = Object.fromEntries(
      Object.entries(agents).map(([name, value]) => {
        const agent = asOpenCodeObject(value);
        if (!agent) return [name, value];
        const safeAgent = { ...agent };
        delete safeAgent.permission;
        delete safeAgent.tools;
        return [name, safeAgent];
      }),
    );
  }
  return config;
}

function buildProviderConfig(
  start: StartMessage,
): Record<string, unknown> | undefined {
  const model = splitModel(start.model, start.provider);
  const providerID =
    model.providerID ?? start.provider ?? procEnv.OPENAI_NAME ?? 'anthropic';
  const modelID = model.modelID;

  if (procEnv.AI_GATEWAY_API_KEY && procEnv.AI_GATEWAY_BASE_URL) {
    return {
      [providerID]: {
        options: {
          apiKey: procEnv.AI_GATEWAY_API_KEY,
          baseURL: toOpenCodeGatewayBaseUrl(procEnv.AI_GATEWAY_BASE_URL),
          ...(HARNESS_CLIENT_APP
            ? {
                headers: {
                  ...start.headers,
                  'x-client-app': HARNESS_CLIENT_APP,
                },
              }
            : start.headers
              ? { headers: start.headers }
              : {}),
        },
        ...(modelID
          ? {
              models: {
                [modelID]: { id: modelID, name: modelID },
              },
            }
          : {}),
      },
    };
  }

  if (
    (procEnv.OPENAI_NAME ||
      (providerID !== 'anthropic' && providerID !== 'openai')) &&
    (procEnv.OPENAI_API_KEY || procEnv.OPENAI_BASE_URL)
  ) {
    const openAICompatibleProviderID = procEnv.OPENAI_NAME ?? providerID;
    return {
      [openAICompatibleProviderID]: {
        options: {
          ...(procEnv.OPENAI_API_KEY ? { apiKey: procEnv.OPENAI_API_KEY } : {}),
          ...(procEnv.OPENAI_BASE_URL
            ? { baseURL: procEnv.OPENAI_BASE_URL }
            : {}),
          ...(start.headers ? { headers: start.headers } : {}),
          ...parseOpenAIQueryParams(),
        },
        ...(modelID
          ? {
              models: {
                [modelID]: { id: modelID, name: modelID },
              },
            }
          : {}),
      },
    };
  }

  if (
    providerID === 'anthropic' &&
    (procEnv.ANTHROPIC_API_KEY ||
      procEnv.ANTHROPIC_AUTH_TOKEN ||
      procEnv.ANTHROPIC_BASE_URL)
  ) {
    return {
      anthropic: {
        options: {
          ...(procEnv.ANTHROPIC_API_KEY
            ? { apiKey: procEnv.ANTHROPIC_API_KEY }
            : {}),
          ...(procEnv.ANTHROPIC_AUTH_TOKEN
            ? { authToken: procEnv.ANTHROPIC_AUTH_TOKEN }
            : {}),
          ...(procEnv.ANTHROPIC_BASE_URL
            ? { baseURL: procEnv.ANTHROPIC_BASE_URL }
            : {}),
          ...(start.headers ? { headers: start.headers } : {}),
        },
      },
    };
  }

  if (
    providerID === 'openai' &&
    (procEnv.OPENAI_API_KEY || procEnv.OPENAI_BASE_URL)
  ) {
    return {
      openai: {
        options: {
          ...(procEnv.OPENAI_API_KEY ? { apiKey: procEnv.OPENAI_API_KEY } : {}),
          ...(procEnv.OPENAI_BASE_URL
            ? { baseURL: procEnv.OPENAI_BASE_URL }
            : {}),
          ...(procEnv.OPENAI_ORGANIZATION
            ? { organization: procEnv.OPENAI_ORGANIZATION }
            : {}),
          ...(procEnv.OPENAI_PROJECT
            ? { project: procEnv.OPENAI_PROJECT }
            : {}),
          ...(start.headers ? { headers: start.headers } : {}),
          ...parseOpenAIQueryParams(),
        },
      },
    };
  }

  return undefined;
}

function parseOpenAIQueryParams(): Record<string, unknown> {
  if (!procEnv.OPENAI_QUERY_PARAMS_JSON) return {};
  try {
    const parsed = JSON.parse(procEnv.OPENAI_QUERY_PARAMS_JSON);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { queryParams: parsed };
    }
  } catch {}
  return {};
}

function toOpenCodeGatewayBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`;
}

async function legacySessionGet({
  client,
  sessionId,
}: {
  client: OpenCodeClient;
  sessionId: string;
}): Promise<{ error?: unknown; data?: unknown }> {
  const session = (client as any).session;
  if (!session?.get) return client.v2.session.get({ sessionID: sessionId });
  return session.get({ sessionID: sessionId });
}

async function legacySessionCreate({
  client,
}: {
  client: OpenCodeClient;
}): Promise<{ error?: unknown; data?: unknown }> {
  return (client as any).session.create({});
}

async function legacySessionPrompt({
  client,
  sessionId,
  start,
  prompt: promptText,
}: {
  client: OpenCodeClient;
  sessionId: string;
  start: StartMessage;
  prompt?: string;
}): Promise<{ error?: unknown; data?: unknown }> {
  const session = (client as any).session;
  const submitPrompt = session.promptAsync ?? session.prompt;
  return submitPrompt.call(session, {
    sessionID: sessionId,
    ...(start.instructions ? { system: start.instructions } : {}),
    ...(start.variant ? { variant: start.variant } : {}),
    ...(start.responseFormat?.type === 'json' &&
    start.responseFormat.schema != null
      ? {
          format: {
            type: 'json_schema' as const,
            schema: start.responseFormat.schema,
          },
        }
      : {}),
    parts: [{ type: 'text', text: promptText ?? start.prompt }],
  });
}

async function legacySessionSummarize({
  client,
  sessionId,
  model,
}: {
  client: OpenCodeClient;
  sessionId: string;
  model: OpenCodeModelRef;
}): Promise<{ error?: unknown; data?: unknown }> {
  return (client as any).session.summarize({
    sessionID: sessionId,
    auto: false,
    providerID: model.providerID,
    modelID: model.modelID,
  });
}

async function subscribeLegacyEvents({
  client,
  signal,
}: {
  client: OpenCodeClient;
  signal: AbortSignal;
}): Promise<AsyncIterable<unknown> | null> {
  const subscribed = await (client as any).event.subscribe(undefined, {
    signal,
    sseMaxRetryAttempts: 0,
  });
  return getEventStream(subscribed);
}

function readSessionId(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const record = data as { id?: unknown; data?: { id?: unknown } };
  if (typeof record.id === 'string') return record.id;
  if (typeof record.data?.id === 'string') return record.data.id;
  return undefined;
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    typeof value === 'object' && value !== null && Symbol.asyncIterator in value
  );
}

function getEventStream(source: unknown): AsyncIterable<unknown> | null {
  if (!source || typeof source !== 'object') return null;
  const candidate = source as { stream?: unknown; data?: unknown };
  if (isAsyncIterable(candidate.stream)) return candidate.stream;
  if (isAsyncIterable(candidate.data)) return candidate.data;
  return null;
}

function legacyStatusType(event: OpenCodeEvent): string | undefined {
  const status = event.properties?.status;
  return status && typeof status === 'object'
    ? String((status as { type?: unknown }).type ?? '')
    : undefined;
}

function legacyRetryStatusMessage(event: OpenCodeEvent): string {
  const status = event.properties?.status;
  const details: string[] = [];
  if (status && typeof status === 'object') {
    const retryStatus = status as { attempt?: unknown; message?: unknown };
    if (typeof retryStatus.attempt === 'number') {
      details.push(`attempt ${retryStatus.attempt}`);
    }
    if (typeof retryStatus.message === 'string' && retryStatus.message.trim()) {
      details.push(retryStatus.message.trim());
    }
  }
  return details.length > 0
    ? `OpenCode session retry: ${details.join('; ')}`
    : 'OpenCode session retry';
}

async function ensureSession({
  client,
  start,
  emit,
}: {
  client: OpenCodeClient;
  start: StartMessage;
  emit: Emit;
}): Promise<string> {
  if (runtime.sessionId) return runtime.sessionId;
  if (start.resumeSessionId) {
    const existing = await legacySessionGet({
      client,
      sessionId: start.resumeSessionId,
    }).catch(() => undefined);
    if (existing && !existing.error) {
      runtime.sessionId = start.resumeSessionId;
      emit({ type: 'bridge-thread', threadId: runtime.sessionId });
      return runtime.sessionId;
    }
  }
  const created = await legacySessionCreate({ client });
  if (created.error) {
    throw new Error(
      `OpenCode session create failed: ${formatError(created.error)}`,
    );
  }
  const id = readSessionId(created.data);
  if (!id) throw new Error('OpenCode session create returned no id.');
  runtime.sessionId = id;
  emit({ type: 'bridge-thread', threadId: id });
  return id;
}

async function runPrompt({
  client,
  sessionId,
  start,
  turn,
  emit,
}: {
  client: OpenCodeClient;
  sessionId: string;
  start: StartMessage;
  turn: BridgeTurn;
  emit: Emit;
}): Promise<HarnessUsage | undefined> {
  const eventsAbort = new AbortController();
  const turnSettled = createDeferred<'event' | 'stream-ended'>();
  let sawContent = false;
  let sawFinishStep = false;
  let sawBusy = false;
  let sawStructuredOutput = false;
  let terminalError: string | undefined;
  let submittingUserMessage = false;
  const state = createTranslationState();
  const initialSessionTokens = await readSessionTokens({
    client,
    sessionId,
  }).catch(() => undefined);
  const assistantBaseline = createAssistantSnapshotBaseline(
    await latestAssistantSnapshot({ client, sessionId }),
  );
  const eventsReady = createDeferred<void>();
  let stepUsage: HarnessUsage | undefined;
  let latestSessionTokens: OpenCodeTokenUsage | undefined;
  const eventLoop = consumeEvents({
    client,
    sessionId,
    permissionMode: start.permissionMode,
    builtinToolFiltering: start.builtinToolFiltering,
    turn,
    state,
    emit: msg => {
      if (msg.type === 'text-delta' || msg.type === 'reasoning-delta') {
        sawContent = true;
      }
      if (msg.type === 'finish-step') {
        sawFinishStep = true;
        stepUsage = addUsage({
          left: stepUsage,
          right: msg.usage as HarnessUsage,
        });
      }
      emit(msg);
    },
    signal: eventsAbort.signal,
    onSubscribed: () => eventsReady.resolve(undefined),
    onEvent: event => {
      if (event.type === 'message.updated') {
        emitOpenCodeStreamStart({
          info: event.properties?.info,
          state,
          emit,
        });
        const info = asOpenCodeObject(event.properties?.info);
        if (
          start.responseFormat?.type === 'json' &&
          info?.structured !== undefined
        ) {
          const id = String(info.id ?? randomUUID());
          emit({ type: 'text-start', id });
          emit({
            type: 'text-delta',
            id,
            delta: JSON.stringify(info.structured),
          });
          emit({ type: 'text-end', id });
          emit({
            type: 'finish-step',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: defaultUsage(),
          });
          sawFinishStep = true;
          sawStructuredOutput = true;
          if (
            !submittingUserMessage &&
            turn.experimental_userMessages.pendingCount === 0
          ) {
            turn.experimental_userMessages.close();
            turnSettled.resolve('event');
            return true;
          }
        }
      }
      if (event.type === 'session.updated') {
        latestSessionTokens =
          extractSessionTokens(event.properties) ?? latestSessionTokens;
      }
      if (
        event.type === 'session.next.step.failed' ||
        event.type === 'session.error'
      ) {
        const error = formatError(event.properties?.error ?? event);
        if (event.type === 'session.error') {
          terminalError = error;
        }
        turn.experimental_userMessages.close(new Error(error));
        turnSettled.resolve('event');
        return true;
      }
      const status = legacyStatusType(event);
      if (status === 'busy') {
        sawBusy = true;
      } else if (status === 'retry') {
        sawBusy = true;
        turn.emitWarning({ message: legacyRetryStatusMessage(event) });
      } else if (sawBusy && status === 'idle') {
        sawBusy = false;
        if (
          !submittingUserMessage &&
          turn.experimental_userMessages.pendingCount === 0 &&
          (start.responseFormat?.type !== 'json' || sawStructuredOutput)
        ) {
          turn.experimental_userMessages.close();
          turnSettled.resolve('event');
          return true;
        }
      }
    },
  }).finally(() => {
    eventsReady.resolve(undefined);
    turn.experimental_userMessages.close(
      new Error('OpenCode event stream ended before the turn settled.'),
    );
    turnSettled.resolve('stream-ended');
  });
  await eventsReady.promise;
  const userMessageLoop = (async () => {
    for await (const message of turn.experimental_userMessages) {
      submittingUserMessage = true;
      try {
        const prompted = await legacySessionPrompt({
          client,
          sessionId,
          start,
          prompt: message.text,
        });
        if (prompted.error) {
          message.reject(
            new Error(`OpenCode prompt failed: ${formatError(prompted.error)}`),
          );
          continue;
        }
        message.accept();
      } catch (error) {
        message.reject(error);
      } finally {
        submittingUserMessage = false;
      }
    }
  })();
  const prompted = await legacySessionPrompt({
    client,
    sessionId,
    start,
  });
  if (prompted.error) {
    eventsAbort.abort();
    turn.experimental_userMessages.close(
      new Error(`OpenCode prompt failed: ${formatError(prompted.error)}`),
    );
    throw new Error(`OpenCode prompt failed: ${formatError(prompted.error)}`);
  }
  const settlement = await turnSettled.promise;
  eventsAbort.abort();
  await eventLoop.catch(() => {});
  await userMessageLoop.catch(() => {});
  if (settlement === 'stream-ended') {
    throw new Error('OpenCode event stream ended before the turn settled.');
  }
  if (terminalError) throw new Error(terminalError);
  if (!sawFinishStep) {
    const emittedFallback = await emitContextFallback({
      client,
      sessionId,
      assistantBaseline,
      state,
      emit,
      emitContent: !sawContent,
    }).catch(() => false);
    if (!emittedFallback) {
      throw new Error(
        'OpenCode turn settled without a correlated assistant response.',
      );
    }
  }
  const finalSessionTokens =
    (await readSessionTokens({ client, sessionId }).catch(() => undefined)) ??
    latestSessionTokens;
  if (initialSessionTokens && finalSessionTokens) {
    return mapUsage(
      subtractSessionTokens({
        before: initialSessionTokens,
        after: finalSessionTokens,
      }),
    );
  }
  return stepUsage;
}

async function runCompaction({
  client,
  sessionId,
  start,
  turn,
  emit,
}: {
  client: OpenCodeClient;
  sessionId: string;
  start: StartMessage;
  turn: BridgeTurn;
  emit: Emit;
}): Promise<void> {
  const eventsAbort = new AbortController();
  const compactionSettled = createDeferred<void>();
  let sawCompaction = false;
  let sawBusy = false;
  let terminalError: string | undefined;
  const model = await resolveCompactionModel({
    client,
    sessionId,
    start,
  });
  if (!model) {
    throw new Error(
      'OpenCode compaction requires a previous turn or an explicit model.',
    );
  }
  const eventLoop = consumeEvents({
    client,
    sessionId,
    permissionMode: start.permissionMode,
    builtinToolFiltering: start.builtinToolFiltering,
    turn,
    state: createTranslationState(),
    emit: msg => {
      if (msg.type === 'compaction') sawCompaction = true;
      emit(msg);
    },
    signal: eventsAbort.signal,
    onEvent: event => {
      if (
        event.type === 'session.next.compaction.ended' ||
        event.type === 'session.compacted'
      ) {
        compactionSettled.resolve();
        return true;
      }
      const status = legacyStatusType(event);
      if (status === 'busy') {
        sawBusy = true;
      } else if (status === 'retry') {
        sawBusy = true;
        turn.emitWarning({ message: legacyRetryStatusMessage(event) });
      } else if (sawBusy && status === 'idle') {
        compactionSettled.resolve();
        return true;
      }
      if (event.type === 'session.error') {
        terminalError = formatError(event.properties?.error ?? event);
        compactionSettled.resolve();
        return true;
      }
    },
  });
  const compacted = await legacySessionSummarize({
    client,
    sessionId,
    model,
  });
  if (compacted.error) {
    eventsAbort.abort();
    throw new Error(
      `OpenCode compaction failed: ${formatError(compacted.error)}`,
    );
  }
  await Promise.race([compactionSettled.promise, sleep(250)]);
  eventsAbort.abort();
  await eventLoop.catch(() => {});
  if (terminalError) throw new Error(terminalError);
  if (!sawCompaction) {
    emit({
      type: 'compaction',
      trigger: 'manual',
      summary: '',
      harnessMetadata: {
        opencode: { missingSummary: true },
      },
    });
  }
}

async function consumeEvents({
  client,
  sessionId,
  permissionMode,
  builtinToolFiltering,
  turn,
  state,
  emit,
  signal,
  onSubscribed,
  onEvent,
}: {
  client: OpenCodeClient;
  sessionId: string;
  permissionMode: StartMessage['permissionMode'];
  builtinToolFiltering: StartMessage['builtinToolFiltering'];
  turn: BridgeTurn;
  state: TranslationState;
  emit: Emit;
  signal: AbortSignal;
  onSubscribed?: () => void;
  onEvent?: (event: OpenCodeEvent) => boolean | void;
}): Promise<void> {
  const stream = await subscribeLegacyEvents({ client, signal });
  onSubscribed?.();
  if (!stream) return;
  const taskSessionIds = new Set([sessionId]);
  const registerSubagentSession = (sourceSessionId: string) =>
    function register({
      parentSessionId,
      sessionId: subagentSessionId,
    }: {
      parentSessionId: string;
      sessionId: string;
    }) {
      if (
        parentSessionId === sourceSessionId &&
        taskSessionIds.has(sourceSessionId)
      ) {
        taskSessionIds.add(subagentSessionId);
      }
    };
  const emitStreamEvent = createEmitStreamEvent({
    state,
    emit,
    emitWarning: turn.emitWarning,
    emitError: turn.emitError,
    toWireToolName,
    nativeNameField,
    getHostToolName,
    authorizeHostToolCall: input => authorizeHostToolCall({ ...input, state }),
    onSubagentSession: registerSubagentSession(sessionId),
    isMcpToolName: toolName =>
      [...runtime.mcpToolPrefixes].some(prefix => toolName.startsWith(prefix)),
    stripWorkDir,
    formatError,
  });
  const descendantEventProcessors = new Map<
    string,
    (event: OpenCodeEvent) => void
  >();
  const processDescendantEvent = (
    descendantSessionId: string,
    event: OpenCodeEvent,
  ) => {
    let processEvent = descendantEventProcessors.get(descendantSessionId);
    if (!processEvent) {
      const descendantState = createTranslationState();
      let currentEvent: OpenCodeEvent | undefined;
      let modelId: string | undefined;
      const emittedUsageStepIds = new Set<string>();
      processEvent = createEmitStreamEvent({
        state: descendantState,
        emit: message => {
          if (message.type !== 'finish-step') return;
          const stepId = getSubagentStepId(currentEvent);
          if (!stepId || emittedUsageStepIds.has(stepId)) return;
          emittedUsageStepIds.add(stepId);
          const opencodeMetadata = asOpenCodeObject(
            message.harnessMetadata,
          )?.opencode;
          const cost = asOpenCodeObject(opencodeMetadata)?.cost;
          emit({
            type: 'raw',
            rawValue: {
              type: 'opencode.subagent-usage',
              version: 1,
              sessionId: descendantSessionId,
              stepId,
              ...(modelId ? { modelId } : {}),
              usage: message.usage,
              ...(typeof cost === 'number' ? { cost } : {}),
            },
          });
        },
        emitWarning: () => undefined,
        emitError: () => undefined,
        toWireToolName,
        nativeNameField,
        getHostToolName,
        authorizeHostToolCall: input =>
          authorizeHostToolCall({ ...input, state: descendantState }),
        onSubagentSession: registerSubagentSession(descendantSessionId),
        isMcpToolName: () => false,
        stripWorkDir,
        formatError,
      });
      const emitDescendantEvent = processEvent;
      processEvent = descendantEvent => {
        currentEvent = descendantEvent;
        if (descendantEvent.type === 'message.updated') {
          const info = openCodeMessageInfoFromValue(
            descendantEvent.properties?.info,
          );
          const providerID = stringValue(info?.providerID);
          const modelID = stringValue(info?.modelID);
          if (providerID && modelID) modelId = `${providerID}/${modelID}`;
        }
        emitDescendantEvent(descendantEvent);
      };
      descendantEventProcessors.set(descendantSessionId, processEvent);
    }
    processEvent(event);
  };
  for await (const rawEvent of stream) {
    if (signal.aborted || turn.abortSignal.aborted) break;
    const event = unwrapOpenCodeEvent(rawEvent);
    const eventSessionId = event ? getOpenCodeEventSessionId(event) : undefined;
    if (!event) continue;
    const scopedSessionId =
      !eventSessionId || eventSessionId === sessionId
        ? sessionId
        : taskSessionIds.has(eventSessionId)
          ? eventSessionId
          : undefined;
    if (!scopedSessionId) continue;
    const isDescendant = scopedSessionId !== sessionId;
    if (event.type === 'question.asked') {
      await handleQuestion({
        client,
        turn,
        emit,
        event,
      });
    } else if (event.type === 'permission.v2.asked') {
      await handlePermissionV2({
        client,
        sessionId: scopedSessionId,
        permissionMode,
        builtinToolFiltering,
        turn,
        emit,
        event,
      });
    } else if (event.type === 'permission.asked') {
      await handlePermission({
        client,
        sessionId: scopedSessionId,
        permissionMode,
        builtinToolFiltering,
        turn,
        emit,
        event,
      });
    } else if (isDescendant) {
      processDescendantEvent(scopedSessionId, event);
    } else {
      emitStreamEvent(event);
    }
    if (isDescendant) continue;
    if (onEvent?.(event)) break;
  }
}

function getSubagentStepId(event: OpenCodeEvent | undefined) {
  if (event?.type === 'message.part.updated') {
    const part = asOpenCodeObject(event.properties?.part);
    if (part?.type !== 'step-finish') return undefined;
    return stringValue(part.id) ?? stringValue(part.messageID) ?? event.id;
  }
  if (event?.type !== 'session.next.step.ended') return undefined;
  return stringValue(event.properties?.stepID) ?? event.id;
}

async function handleQuestion({
  client,
  turn,
  emit,
  event,
}: {
  client: OpenCodeClient;
  turn: BridgeTurn;
  emit: Emit;
  event: OpenCodeEvent;
}): Promise<void> {
  const nativeRequest = event.properties as OpenCodeQuestionRequest | undefined;
  if (
    nativeRequest == null ||
    typeof nativeRequest.id !== 'string' ||
    typeof nativeRequest.sessionID !== 'string' ||
    !Array.isArray(nativeRequest.questions)
  ) {
    return;
  }
  const toolCallId = nativeRequest.tool?.callID ?? nativeRequest.id;

  emit({
    type: 'tool-call',
    toolCallId,
    toolName: 'askUserQuestions',
    nativeName: 'question',
    input: JSON.stringify(toHarnessQuestionsInput(nativeRequest)),
    providerExecuted: false,
    providerMetadata: {
      opencode: {
        nativeRequest,
      },
    },
  });

  const questionKey = openCodeQuestionKey(nativeRequest);
  const result = await turn.requestToolResult({
    toolCallId,
    matches: candidate => {
      const continuedRequest = candidate.toolResult?.providerOptions?.opencode
        ?.nativeRequest as OpenCodeQuestionRequest | undefined;
      return (
        continuedRequest != null &&
        openCodeQuestionKey(continuedRequest) === questionKey
      );
    },
  });
  const nativeResponse = toOpenCodeQuestionResponse({
    nativeRequest,
    output: result.output as Parameters<
      typeof toOpenCodeQuestionResponse
    >[0]['output'],
  });

  const response =
    nativeResponse.action === 'reject'
      ? await client.question.reject({
          requestID: nativeRequest.id,
          directory: workdir,
        })
      : await client.question.reply({
          requestID: nativeRequest.id,
          directory: workdir,
          answers: nativeResponse.answers,
        });
  if (response.error != null) {
    throw new Error(
      `OpenCode question response failed: ${formatError(response.error)}`,
    );
  }
}

function sanitizeMcpToolName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

async function handlePermissionV2({
  client,
  sessionId,
  permissionMode,
  builtinToolFiltering,
  turn,
  emit,
  event,
}: {
  client: OpenCodeClient;
  sessionId: string;
  permissionMode: StartMessage['permissionMode'];
  builtinToolFiltering: StartMessage['builtinToolFiltering'];
  turn: BridgeTurn;
  emit: Emit;
  event: OpenCodeEvent;
}): Promise<void> {
  const props = event.properties ?? {};
  const requestID = String(props.id ?? '');
  if (!requestID) return;
  const reply = await selectPermissionReply({
    action: String(props.action ?? ''),
    resources: Array.isArray(props.resources)
      ? props.resources.map(String)
      : [],
    requestID,
    toolCallId: String(props.source?.callID ?? requestID),
    permissionMode,
    builtinToolFiltering,
    turn,
    emit,
  });
  await client.v2.session.permission.reply({
    sessionID: sessionId,
    requestID,
    reply: reply.reply,
    ...(reply.message ? { message: reply.message } : {}),
  });
}

async function handlePermission({
  client,
  sessionId,
  permissionMode,
  builtinToolFiltering,
  turn,
  emit,
  event,
}: {
  client: OpenCodeClient;
  sessionId: string;
  permissionMode: StartMessage['permissionMode'];
  builtinToolFiltering: StartMessage['builtinToolFiltering'];
  turn: BridgeTurn;
  emit: Emit;
  event: OpenCodeEvent;
}): Promise<void> {
  const props = event.properties ?? {};
  const requestID = String(props.id ?? '');
  if (!requestID) return;
  const tool = asOpenCodeObject(props.tool);
  const reply = await selectPermissionReply({
    action: String(props.permission ?? ''),
    resources: Array.isArray(props.patterns) ? props.patterns.map(String) : [],
    requestID,
    toolCallId: String(tool?.callID ?? requestID),
    permissionMode,
    builtinToolFiltering,
    turn,
    emit,
  });
  await client.permission.reply({
    requestID,
    directory: workdir,
    reply: reply.reply,
    ...(reply.message ? { message: reply.message } : {}),
  });
  void sessionId;
}

async function selectPermissionReply({
  action,
  resources,
  requestID,
  toolCallId,
  permissionMode,
  builtinToolFiltering,
  turn,
  emit,
}: {
  action: string;
  resources: string[];
  requestID: string;
  toolCallId: string;
  permissionMode: StartMessage['permissionMode'];
  builtinToolFiltering: StartMessage['builtinToolFiltering'];
  turn: BridgeTurn;
  emit: Emit;
}): Promise<{ reply: 'once' | 'always' | 'reject'; message?: string }> {
  const toolName = toPermissionToolName(action);
  if (resources.some(resource => isExternalPath(resource))) {
    return { reply: 'reject', message: 'External directory access rejected.' };
  }
  if (
    isBuiltinToolInactive({ toolName, toolFiltering: builtinToolFiltering })
  ) {
    emit({
      type: 'tool-approval-request',
      approvalId: requestID,
      toolCallId,
    });
    const decision = await turn.requestToolApproval(requestID);
    return decision.approved
      ? { reply: 'once' }
      : {
          reply: 'reject',
          ...(decision.reason ? { message: decision.reason } : {}),
        };
  }
  if (!permissionMode || permissionMode === 'allow-all') {
    return { reply: 'always' };
  }
  const kind = TOOL_KIND[toolName] ?? 'bash';
  const allowed =
    permissionMode === 'allow-edits'
      ? kind === 'readonly' || kind === 'edit'
      : kind === 'readonly';
  if (allowed) return { reply: 'always' };

  emit({
    type: 'tool-approval-request',
    approvalId: requestID,
    toolCallId,
  });
  const decision = await turn.requestToolApproval(requestID);
  return decision.approved
    ? { reply: 'once' }
    : {
        reply: 'reject',
        ...(decision.reason ? { message: decision.reason } : {}),
      };
}

function toPermissionToolName(action: string): string {
  const normalized = action.toLowerCase();
  if (normalized.includes('bash') || normalized.includes('shell'))
    return 'bash';
  if (normalized.includes('edit')) return 'edit';
  if (normalized.includes('write')) return 'write';
  if (normalized.includes('webfetch')) return 'webfetch';
  if (normalized.includes('task') || normalized.includes('agent'))
    return 'agent';
  if (normalized.includes('list')) return 'ls';
  if (normalized.includes('grep')) return 'grep';
  if (normalized.includes('glob')) return 'glob';
  if (normalized.includes('read')) return 'read';
  return toWireToolName(normalized);
}

function resolveInactiveBuiltinToolNames(
  start: StartMessage,
): ReadonlyArray<string> {
  const toolFiltering = start.builtinToolFiltering;
  if (toolFiltering == null) return [];
  return toolFiltering.mode === 'allow'
    ? Object.keys(PUBLIC_TO_NATIVE).filter(
        name => !toolFiltering.toolNames.includes(name),
      )
    : toolFiltering.toolNames;
}

function isBuiltinToolInactive(input: {
  toolName: string;
  toolFiltering: StartMessage['builtinToolFiltering'];
}): boolean {
  if (input.toolFiltering == null) return false;
  return input.toolFiltering.mode === 'allow'
    ? !input.toolFiltering.toolNames.includes(input.toolName)
    : input.toolFiltering.toolNames.includes(input.toolName);
}

function isExternalPath(resource: string): boolean {
  if (!path.isAbsolute(resource)) return false;
  const normalized = path.resolve(resource);
  return (
    !isPathInsideOrEqual(normalized, workdir) &&
    (!skillsDir || !isPathInsideOrEqual(normalized, skillsDir))
  );
}

function isPathInsideOrEqual(file: string, root: string): boolean {
  const normalizedRoot = path.resolve(root);
  return file === normalizedRoot || file.startsWith(`${normalizedRoot}/`);
}

function toWireToolName(nativeName: string): string {
  return (
    NATIVE_TO_COMMON[nativeName] ?? OPENCODE_TO_WIRE[nativeName] ?? nativeName
  );
}

function nativeNameField({
  nativeName,
  toolName,
}: {
  nativeName: string;
  toolName: string;
}): { nativeName?: string } {
  if (!nativeName || nativeName === toolName || toolName === 'agent') return {};
  return { nativeName };
}

function getHostToolName(
  toolName: string,
  rawToolName: unknown,
): string | undefined {
  if (runtime.toolNames.has(toolName)) return toolName;
  if (typeof rawToolName === 'string' && runtime.toolNames.has(rawToolName)) {
    return rawToolName;
  }
  if (
    typeof rawToolName === 'string' &&
    rawToolName.startsWith('harness-tools_') &&
    runtime.toolNames.has(rawToolName.slice('harness-tools_'.length))
  ) {
    return rawToolName.slice('harness-tools_'.length);
  }
  return undefined;
}

function authorizeHostToolCall({
  callID,
  toolName,
  input,
  state,
}: {
  callID: string;
  toolName: string;
  input: unknown;
  state: TranslationState;
}): void {
  if (state.hostToolCallsAuthorized.has(callID)) return;
  state.hostToolCallsAuthorized.add(callID);
  runtime.relay?.authorizeToolCall({ toolName, input });
}

async function emitContextFallback({
  client,
  sessionId,
  assistantBaseline,
  state,
  emit,
  emitContent,
}: {
  client: OpenCodeClient;
  sessionId: string;
  assistantBaseline: AssistantSnapshotBaseline;
  state: TranslationState;
  emit: Emit;
  emitContent: boolean;
}): Promise<boolean> {
  const assistant = await latestAssistantSnapshot({ client, sessionId });
  if (
    !assistant ||
    !isAssistantSnapshotAfterBaseline({
      assistant,
      baseline: assistantBaseline,
    })
  ) {
    return false;
  }
  emitOpenCodeStreamStart({ info: assistant, state, emit });
  if (emitContent && Array.isArray(assistant.contentParts)) {
    for (const part of assistant.contentParts) {
      emitAssistantContentPart(part, emit);
    }
  }
  const rawFinish =
    typeof assistant.finish === 'string'
      ? assistant.finish
      : assistant.error
        ? 'error'
        : 'stop';
  emit({
    type: 'finish-step',
    finishReason: {
      unified: mapOpenCodeFinishReason(rawFinish),
      raw: rawFinish,
    },
    usage: mapUsage(assistant.tokens),
    ...(typeof assistant.cost === 'number'
      ? {
          harnessMetadata: {
            opencode: { cost: assistant.cost, fallback: true },
          },
        }
      : { harnessMetadata: { opencode: { fallback: true } } }),
  });
  return true;
}

async function readSessionTokens({
  client,
  sessionId,
}: {
  client: OpenCodeClient;
  sessionId: string;
}): Promise<OpenCodeTokenUsage | undefined> {
  const session = await legacySessionGet({ client, sessionId });
  if (session.error) return undefined;
  return extractSessionTokens(session.data);
}

type AssistantSnapshot = {
  id?: unknown;
  contentParts?: unknown[];
  metadata?: unknown;
  model?: unknown;
  modelID?: unknown;
  providerID?: unknown;
  tokens?: unknown;
  finish?: unknown;
  cost?: unknown;
  error?: unknown;
};

async function latestAssistantSnapshot({
  client,
  sessionId,
}: {
  client: OpenCodeClient;
  sessionId: string;
}): Promise<AssistantSnapshot | undefined> {
  const legacy = await (client as any).session
    .messages({ sessionID: sessionId, limit: 20 })
    .catch(() => undefined);
  const legacyAssistant = latestLegacyAssistantMessage(legacy?.data);
  if (legacyAssistant) return legacyAssistant;

  const context = await client.v2.session
    .context({ sessionID: sessionId })
    .catch(() => undefined);
  if (!context || context.error) return undefined;
  return latestV2AssistantMessage(context.data);
}

function latestLegacyAssistantMessage(
  data: unknown,
): AssistantSnapshot | undefined {
  const messages = Array.isArray(data) ? data : [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const item = messages[i];
    if (!item || typeof item !== 'object') continue;
    const record = item as { info?: unknown; parts?: unknown };
    const info = record.info;
    if (
      info &&
      typeof info === 'object' &&
      (info as { role?: unknown }).role === 'assistant'
    ) {
      return {
        ...(info as Record<string, unknown>),
        contentParts: Array.isArray(record.parts) ? record.parts : undefined,
      };
    }
  }
  return undefined;
}

function latestV2AssistantMessage(
  data: unknown,
): AssistantSnapshot | undefined {
  const messages =
    data &&
    typeof data === 'object' &&
    Array.isArray((data as { data?: unknown }).data)
      ? (data as { data: unknown[] }).data
      : Array.isArray(data)
        ? data
        : [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (
      message &&
      typeof message === 'object' &&
      (message as { type?: unknown }).type === 'assistant'
    ) {
      const record = message as Record<string, unknown>;
      return {
        ...record,
        contentParts: Array.isArray(record.content)
          ? record.content
          : undefined,
      };
    }
  }
  return undefined;
}

function emitAssistantContentPart(part: unknown, emit: Emit): void {
  if (!part || typeof part !== 'object') return;
  const value = part as { type?: unknown; id?: unknown; text?: unknown };
  if (value.type !== 'text' && value.type !== 'reasoning') return;
  const id =
    typeof value.id === 'string' && value.id.length > 0
      ? value.id
      : `${value.type}-${randomUUID()}`;
  const text = typeof value.text === 'string' ? value.text : '';
  if (value.type === 'text') {
    emit({ type: 'text-start', id });
    if (text) emit({ type: 'text-delta', id, delta: text });
    emit({ type: 'text-end', id });
    return;
  }
  emit({ type: 'reasoning-start', id });
  if (text) emit({ type: 'reasoning-delta', id, delta: text });
  emit({ type: 'reasoning-end', id });
}

async function startToolRelay({
  tools,
  emit,
  requestToolResult,
}: {
  tools: ReadonlyArray<{ name: string }>;
  emit: Emit;
  requestToolResult: (
    toolCallId: string,
  ) => Promise<{ output: unknown; isError?: boolean }>;
}): Promise<ToolRelay> {
  return startAuthorizedToolRelay({ tools, emit, requestToolResult });
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve(value: T | PromiseLike<T>): void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function splitModel(
  model: string | undefined,
  provider: string | undefined,
): { providerID?: string; modelID?: string } {
  if (!model) return {};
  if (model.includes('/')) {
    const [providerID, ...rest] = model.split('/');
    return { providerID, modelID: rest.join('/') };
  }
  return { providerID: provider, modelID: model };
}

type OpenCodeModelRef = { providerID: string; modelID: string };

async function resolveCompactionModel({
  client,
  sessionId,
  start,
}: {
  client: OpenCodeClient;
  sessionId: string;
  start: StartMessage;
}): Promise<OpenCodeModelRef | undefined> {
  const assistant = await latestAssistantSnapshot({ client, sessionId }).catch(
    () => undefined,
  );
  const assistantModel = modelRefFromAssistantSnapshot(assistant);
  if (assistantModel) return assistantModel;

  const session = await legacySessionGet({ client, sessionId }).catch(
    () => undefined,
  );
  const sessionModel = modelRefFromSessionInfo(session?.data);
  if (sessionModel) return sessionModel;

  return modelRefFromStart(start);
}

function modelRefFromAssistantSnapshot(
  assistant: AssistantSnapshot | undefined,
): OpenCodeModelRef | undefined {
  if (!assistant) return undefined;
  const model = modelRefFromValue(assistant.model);
  if (model) return model;

  const direct = modelRefFromValue(assistant);
  if (direct) return direct;

  return modelRefFromValue(asOpenCodeObject(assistant.metadata)?.assistant);
}

function modelRefFromSessionInfo(data: unknown): OpenCodeModelRef | undefined {
  const session = asOpenCodeObject(data);
  if (!session) return undefined;
  return modelRefFromValue(session.model) ?? modelRefFromObject(session);
}

function modelRefFromStart(start: StartMessage): OpenCodeModelRef | undefined {
  const model = splitModel(start.model, start.provider);
  if (!model.modelID) return undefined;
  return {
    providerID:
      model.providerID ?? start.provider ?? procEnv.OPENAI_NAME ?? 'anthropic',
    modelID: model.modelID,
  };
}

function modelRefFromValue(value: unknown): OpenCodeModelRef | undefined {
  const model = asOpenCodeObject(value);
  return model ? modelRefFromObject(model) : undefined;
}

function modelRefFromObject(
  value: OpenCodeObject,
): OpenCodeModelRef | undefined {
  const providerID = stringValue(value.providerID);
  const modelID = stringValue(value.modelID ?? value.id);
  if (!providerID || !modelID) return undefined;
  return { providerID, modelID };
}

function stripWorkDir(file: string): string {
  if (!file) return file;
  const normalized = path.resolve(file);
  const root = path.resolve(workdir);
  return normalized.startsWith(`${root}/`)
    ? normalized.slice(root.length + 1)
    : file;
}

function parseArgs(args: string[]): {
  workdir?: string;
  bridgeStateDir?: string;
  bootstrapDir?: string;
  skillsDir?: string;
} {
  const out: {
    workdir?: string;
    bridgeStateDir?: string;
    bootstrapDir?: string;
    skillsDir?: string;
  } = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--workdir' && i + 1 < args.length) {
      out.workdir = args[++i];
    } else if (args[i] === '--bridge-state-dir' && i + 1 < args.length) {
      out.bridgeStateDir = args[++i];
    } else if (args[i] === '--bootstrap-dir' && i + 1 < args.length) {
      out.bootstrapDir = args[++i];
    } else if (args[i] === '--skills-dir' && i + 1 < args.length) {
      out.skillsDir = args[++i];
    }
  }
  return out;
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    const cause = 'cause' in error ? error.cause : undefined;
    if (cause === undefined) return error.message;
    return `${error.message}: ${formatError(cause)}`;
  }
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function emitFatal(message: string): never {
  process.stderr.write(`[OpenCode bridge] ${message}\n`);
  process.exit(1);
}
