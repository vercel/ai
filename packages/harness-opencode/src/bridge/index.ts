import {
  runBridge,
  type BridgeEvent,
  type BridgeTurn,
} from '@ai-sdk/harness/bridge';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
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
  isStepSettlementEvent,
  type OpenCodeEvent,
  type TranslationState,
  unwrapOpenCodeEvent,
} from './opencode-events';
import {
  createEmitStreamEvent,
  isRecord,
  stringValue,
} from './create-emit-stream-event';
import { mapOpenCodeFinishReason } from './opencode-finish-step';
import { prependOpenCodeBinToPath } from './opencode-path';
import {
  addUsage,
  defaultUsage,
  extractSessionTokens,
  mapUsage,
  subtractSessionTokens,
  type HarnessUsage,
  type OpenCodeTokenUsage,
} from './opencode-usage';
import { startAuthorizedToolRelay, type ToolRelay } from './tool-relay';

type Emit = (msg: Record<string, unknown>) => void;

type OpenCodeClient = ReturnType<typeof createOpencodeClient>;
type OpenCodeServer = Awaited<ReturnType<typeof createOpencodeServer>>;

type RuntimeState = {
  server?: OpenCodeServer;
  client?: OpenCodeClient;
  sessionId?: string;
  relay?: ToolRelay;
  toolNames: Set<string>;
};

type CommonBuiltinToolName =
  | 'read'
  | 'write'
  | 'edit'
  | 'bash'
  | 'glob'
  | 'grep';

const NATIVE_TO_COMMON: Readonly<Record<string, CommonBuiltinToolName>> = {
  view: 'read',
  read: 'read',
  write: 'write',
  edit: 'edit',
  bash: 'bash',
  glob: 'glob',
  grep: 'grep',
};

const OPENCODE_TO_WIRE: Readonly<Record<string, string>> = {
  list: 'ls',
  ls: 'ls',
  webfetch: 'webfetch',
  task: 'agent',
  agent: 'agent',
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
const runtime: RuntimeState = { toolNames: new Set() };
prependOpenCodeBinToPath({ bootstrapDir, env: procEnv });

mkdirSync(process.env.HOME ?? '/tmp/opencode-home', { recursive: true });

await runBridge<StartMessage>({
  bridgeType: 'opencode',
  bridgeStateDir,
  onStart: runTurn,
  onDetach: () =>
    runtime.sessionId ? { openCodeSessionId: runtime.sessionId } : {},
});

async function runTurn(start: StartMessage, turn: BridgeTurn): Promise<void> {
  const emit: Emit = msg => turn.emit(msg as BridgeEvent);
  let totalUsage: HarnessUsage | undefined;
  try {
    await ensureRuntime({ start, turn, emit });
    const client = runtime.client!;
    const sessionId = await ensureSession({ client, start, emit });

    if (start.operation === 'compact') {
      await runCompaction({ client, sessionId, start, turn, emit });
    } else {
      totalUsage = await runPrompt({ client, sessionId, start, turn, emit });
    }
  } catch (err) {
    turn.emitError({ error: err, message: 'OpenCode turn failed' });
  } finally {
    emit({
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'stop' },
      totalUsage: totalUsage ?? defaultUsage(),
    });
  }
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
  });
}

function buildOpenCodeConfig({
  start,
  relayPort,
}: {
  start: StartMessage;
  relayPort: number | undefined;
}): Record<string, unknown> {
  const config: Record<string, unknown> = {
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
  if (relayPort && start.tools && start.tools.length > 0) {
    config.mcp = {
      'harness-tools': {
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
      },
    };
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
            ? { headers: { 'x-client-app': HARNESS_CLIENT_APP } }
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
}: {
  client: OpenCodeClient;
  sessionId: string;
  start: StartMessage;
}): Promise<{ error?: unknown; data?: unknown }> {
  const session = (client as any).session;
  const prompt = session.promptAsync ?? session.prompt;
  return prompt.call(session, {
    sessionID: sessionId,
    ...(start.instructions ? { system: start.instructions } : {}),
    ...(start.variant ? { variant: start.variant } : {}),
    parts: [{ type: 'text', text: start.prompt }],
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
  const turnSettled = createDeferred<void>();
  let sawContent = false;
  let sawFinishStep = false;
  let sawBusy = false;
  let terminalError: string | undefined;
  const state = createTranslationState();
  const initialSessionTokens = await readSessionTokens({
    client,
    sessionId,
  }).catch(() => undefined);
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
      }
      if (event.type === 'session.updated') {
        latestSessionTokens =
          extractSessionTokens(event.properties) ?? latestSessionTokens;
      }
      if (isStepSettlementEvent(event)) {
        turnSettled.resolve();
        return true;
      }
      const status = legacyStatusType(event);
      if (status === 'busy') {
        sawBusy = true;
      } else if (status === 'retry') {
        sawBusy = true;
        turn.emitWarning({ message: legacyRetryStatusMessage(event) });
      } else if (sawBusy && status === 'idle') {
        turnSettled.resolve();
        return true;
      }
      if (event.type === 'session.error') {
        terminalError = formatError(event.properties?.error ?? event);
        turnSettled.resolve();
        return true;
      }
    },
  }).finally(() => {
    eventsReady.resolve(undefined);
    turnSettled.resolve();
  });
  await eventsReady.promise;
  const prompted = await legacySessionPrompt({
    client,
    sessionId,
    start,
  });
  if (prompted.error) {
    eventsAbort.abort();
    throw new Error(`OpenCode prompt failed: ${formatError(prompted.error)}`);
  }
  await turnSettled.promise;
  eventsAbort.abort();
  await eventLoop.catch(() => {});
  if (terminalError) throw new Error(terminalError);
  if (!sawFinishStep) {
    const emittedFallback = await emitContextFallback({
      client,
      sessionId,
      state,
      emit,
      emitContent: !sawContent,
    }).catch(() => false);
    if (!emittedFallback) {
      emit({
        type: 'finish-step',
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: defaultUsage(),
        harnessMetadata: { opencode: { fallback: true, missingContext: true } },
      });
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
  const emitStreamEvent = createEmitStreamEvent({
    state,
    emit,
    emitWarning: turn.emitWarning,
    emitError: turn.emitError,
    toWireToolName,
    nativeNameField,
    getHostToolName,
    authorizeHostToolCall: input => authorizeHostToolCall({ ...input, state }),
    stripWorkDir,
    formatError,
  });
  for await (const rawEvent of stream) {
    if (signal.aborted || turn.abortSignal.aborted) break;
    const event = unwrapOpenCodeEvent(rawEvent);
    const eventSessionId = event ? getOpenCodeEventSessionId(event) : undefined;
    if (!event || (eventSessionId && eventSessionId !== sessionId)) continue;
    if (event.type === 'permission.v2.asked') {
      await handlePermissionV2({
        client,
        sessionId,
        permissionMode,
        builtinToolFiltering,
        turn,
        emit,
        event,
      });
    } else if (event.type === 'permission.asked') {
      await handlePermission({
        client,
        sessionId,
        permissionMode,
        builtinToolFiltering,
        turn,
        emit,
        event,
      });
    } else {
      emitStreamEvent(event);
    }
    if (onEvent?.(event)) break;
  }
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
    toolCallId:
      typeof props.source === 'object' &&
      props.source !== null &&
      'callID' in props.source
        ? String((props.source as { callID?: unknown }).callID)
        : requestID,
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
  const reply = await selectPermissionReply({
    action: String(props.permission ?? ''),
    resources: Array.isArray(props.patterns) ? props.patterns.map(String) : [],
    requestID,
    toolCallId:
      typeof props.tool === 'object' &&
      props.tool !== null &&
      'callID' in props.tool
        ? String((props.tool as { callID?: unknown }).callID)
        : requestID,
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
  state,
  emit,
  emitContent,
}: {
  client: OpenCodeClient;
  sessionId: string;
  state: TranslationState;
  emit: Emit;
  emitContent: boolean;
}): Promise<boolean> {
  const assistant = await latestAssistantSnapshot({ client, sessionId });
  if (!assistant) return false;
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

  if (isRecord(assistant.metadata)) {
    return modelRefFromValue(assistant.metadata.assistant);
  }
  return undefined;
}

function modelRefFromSessionInfo(data: unknown): OpenCodeModelRef | undefined {
  if (!isRecord(data)) return undefined;
  return modelRefFromValue(data.model) ?? modelRefFromValue(data);
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
  if (!isRecord(value)) return undefined;
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
