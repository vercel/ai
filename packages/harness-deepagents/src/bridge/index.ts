// In-sandbox turn driver on `@ai-sdk/harness/bridge`; third-party imports stay external (tsup) and install in-sandbox from src/bridge/package.json — keep import/externals/deps in sync.

import { randomUUID } from 'node:crypto';
import { argv, env as procEnv } from 'node:process';
import {
  runBridge,
  type BridgeEvent,
  type BridgeTurn,
} from '@ai-sdk/harness/bridge';
import { ChatAnthropic } from '@langchain/anthropic';
import { tool } from '@langchain/core/tools';
import { Command, MemorySaver, Overwrite } from '@langchain/langgraph';
import {
  MultiServerMCPClient,
  type ClientConfig,
} from '@langchain/mcp-adapters';
import { createDeepAgent } from 'deepagents';
import { createMiddleware, toolStrategy } from 'langchain';
import type { StartMessage } from '../deepagents-bridge-protocol';
import { buildInterruptOn, collectActionRequests } from './approvals';
import {
  createDeepAgentsStreamEventState,
  createEmitStreamEvent,
  endReasoningBlock,
  endTextBlock,
  flushStep,
  toCommonName,
  type DeepAgentsStreamEvent,
} from './create-emit-stream-event';
import { jsonSchemaToZodObject } from './json-schema-to-zod';
import { createLocalShellBackend } from './local-shell-backend';
import {
  loadMemorySaver,
  removeMemorySaverSnapshot,
  saveMemorySaver,
} from './persistent-memory-saver';
import { createBuiltinToolFilteringMiddleware } from './tool-filtering';

const HARNESS_CLIENT_APP = procEnv.AI_SDK_HARNESS_CLIENT_APP;

function parseArgs(rawArgs: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg.startsWith('--')) {
      const key = arg
        .slice(2)
        .replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
      out[key] = rawArgs[i + 1];
      i++;
    }
  }
  return out;
}

// Always drive the Anthropic client. Through the gateway, models keep their
// `creator/model` slug (gateway translates); direct Anthropic wants the bare id.
function buildModel({
  rawModel,
  thinking,
  effort,
  headers,
}: {
  rawModel: string | undefined;
  thinking: StartMessage['thinking'];
  effort: StartMessage['effort'];
  headers: StartMessage['headers'];
}) {
  if (!rawModel) return undefined;
  const baseUrl = procEnv.ANTHROPIC_BASE_URL;
  const model = baseUrl ? rawModel : rawModel.replace(/^anthropic[/:]/, '');
  return new ChatAnthropic({
    model,
    ...(thinking ? { thinking } : {}),
    ...(effort ? { outputConfig: { effort } } : {}),
    ...(procEnv.ANTHROPIC_API_KEY ? { apiKey: procEnv.ANTHROPIC_API_KEY } : {}),
    ...(baseUrl ? { anthropicApiUrl: baseUrl } : {}),
    ...(headers != null || procEnv.AI_GATEWAY_API_KEY
      ? {
          clientOptions: {
            defaultHeaders: {
              ...headers,
              ...(procEnv.AI_GATEWAY_API_KEY && HARNESS_CLIENT_APP
                ? {
                    'User-Agent': HARNESS_CLIENT_APP,
                    'x-client-app': HARNESS_CLIENT_APP,
                  }
                : {}),
            },
          },
        }
      : {}),
  });
}

function createModelMiddleware() {
  return createMiddleware({
    name: 'harnessModel',
    wrapModelCall: async (request, handler) => {
      if (!activeModel && !activeThinking && !activeEffort && !activeHeaders) {
        return handler(request);
      }

      if (activeModel) {
        const configuredModel = buildModel({
          rawModel: activeModel,
          thinking: activeThinking,
          effort: activeEffort,
          headers: activeHeaders,
        });
        if (!configuredModel) throw new Error('Deep Agents model is missing');
        return handler({ ...request, model: configuredModel });
      }

      let model = request.model;
      if (
        '_getModelInstance' in model &&
        typeof model._getModelInstance === 'function'
      ) {
        model = await model._getModelInstance();
      }

      if (!(model instanceof ChatAnthropic)) {
        throw new Error('Deep Agents reasoning requires ChatAnthropic');
      }

      const configuredModel = buildModel({
        rawModel: model.model,
        thinking: activeThinking,
        effort: activeEffort,
        headers: activeHeaders,
      });
      if (!configuredModel) throw new Error('Deep Agents model is missing');

      return handler({ ...request, model: configuredModel });
    },
  });
}

const args = parseArgs(argv.slice(2));
const workdir = args.workdir;
const bridgeStateDir = args.bridgeStateDir;
if (!workdir || !bridgeStateDir) {
  // eslint-disable-next-line no-console
  console.error('deepagents bridge: missing --workdir / --bridge-state-dir');
  process.exit(1);
}
const conversationCheckpointPath = `${bridgeStateDir}/conversation.checkpoint`;

// One agent per bridge process, reused across turns; host tools read the live turn via `currentTurn`.
let agent: ReturnType<typeof createDeepAgent> | undefined;
let currentTurn: BridgeTurn | undefined;
let mcpClient: MultiServerMCPClient | undefined;
let mcpToolNames = new Set<string>();
let currentResponseFormat: ReturnType<typeof toolStrategy> | undefined;
const checkpointer = new MemorySaver();
if (args.resume === 'true') {
  await loadMemorySaver({
    path: conversationCheckpointPath,
    saver: checkpointer,
  });
} else {
  await removeMemorySaverSnapshot(conversationCheckpointPath);
}
let agentConfigurationSignature: string | undefined;
let activeModel: string | undefined;
let activeThinking: StartMessage['thinking'];
let activeEffort: StartMessage['effort'];
let activeHeaders: StartMessage['headers'];
const modelMiddleware = createModelMiddleware();

type DeepAgentsJsonSchema = Record<string, unknown> & {
  type:
    | 'null'
    | 'boolean'
    | 'object'
    | 'array'
    | 'number'
    | 'string'
    | 'integer';
};

const responseFormatMiddleware = createMiddleware({
  name: 'HarnessResponseFormat',
  wrapModelCall(request, handler) {
    return handler({
      ...request,
      ...(currentResponseFormat == null
        ? {}
        : { responseFormat: currentResponseFormat }),
    });
  },
});

// Host tools become LangChain tools that emit a `tool-call` and block on the host's `tool-result`.
function buildHostTools(toolSchemas: StartMessage['tools']) {
  return (toolSchemas ?? []).map(schema =>
    tool(
      async (input: Record<string, unknown>) => {
        const turn = currentTurn;
        if (!turn) throw new Error('no active turn');
        const toolCallId = `${schema.name}-${randomUUID()}`;
        turn.emit({
          type: 'tool-call',
          toolCallId,
          toolName: schema.name,
          input: JSON.stringify(input),
          providerExecuted: false,
        } as BridgeEvent);
        const { output } = await turn.requestToolResult(toolCallId);
        return typeof output === 'string' ? output : JSON.stringify(output);
      },
      {
        name: schema.name,
        description: schema.description ?? '',
        schema: jsonSchemaToZodObject(schema.inputSchema),
      },
    ),
  );
}

async function runTurn(start: StartMessage, turn: BridgeTurn): Promise<void> {
  currentTurn = turn;
  if (start.model) activeModel = start.model;
  activeThinking = start.thinking;
  activeEffort = start.effort;
  activeHeaders = start.headers;
  currentResponseFormat =
    start.responseFormat?.type === 'json' && start.responseFormat.schema != null
      ? toolStrategy(start.responseFormat.schema as DeepAgentsJsonSchema)
      : undefined;
  const emit = (event: Record<string, unknown>) =>
    turn.emit(event as BridgeEvent);

  const interruptOn = buildInterruptOn(
    start.permissionMode,
    start.builtinToolFiltering,
  );
  const config = {
    version: 'v2' as const,
    configurable: { thread_id: 'bridge-session' },
    ...(start.recursionLimit != null
      ? { recursionLimit: start.recursionLimit }
      : {}),
    signal: turn.abortSignal,
  };
  const nextAgentConfigurationSignature = JSON.stringify({
    instructions: start.instructions,
    tools: start.tools,
    skillsPaths: start.skillsPaths,
  });
  const rebuildAgent =
    agent == null ||
    agentConfigurationSignature !== nextAgentConfigurationSignature ||
    start.skillsChanged === true;
  if (rebuildAgent) {
    if (agent != null && start.skillsChanged === true) {
      await agent.updateState(config, {
        skillsMetadata: new Overwrite([]),
      } as never);
    }
    await closeMcpClient();
    const builtinToolFilteringMiddleware = createBuiltinToolFilteringMiddleware(
      {
        builtinToolFiltering: start.builtinToolFiltering,
        emit: event => {
          const turn = currentTurn;
          if (!turn) throw new Error('no active turn');
          turn.emit(event as BridgeEvent);
        },
      },
    );
    const middleware = [
      responseFormatMiddleware,
      modelMiddleware,
      ...(builtinToolFilteringMiddleware
        ? [builtinToolFilteringMiddleware]
        : []),
    ];
    const hostTools = buildHostTools(start.tools);
    const hostToolNames = new Set(hostTools.map(hostTool => hostTool.name));
    const externalTools = await loadMcpTools({
      mcpServers: start.mcpServers,
    });
    const mcpTools = externalTools.filter(
      externalTool => !hostToolNames.has(externalTool.name),
    );
    mcpToolNames = new Set(mcpTools.map(mcpTool => mcpTool.name));
    agent = createDeepAgent({
      tools: [...mcpTools, ...hostTools],
      backend: createLocalShellBackend({ rootDir: workdir }),
      systemPrompt: start.instructions
        ? { suffix: start.instructions }
        : undefined,
      // Native skills loaded from the source dirs ($HOME-materialized + <workDir> for repo-provided skills).
      ...(start.skillsPaths?.length ? { skills: start.skillsPaths } : {}),
      ...(middleware.length > 0 ? { middleware } : {}),
      // Gate built-in tools behind HITL approval when the permission mode requires it.
      ...(interruptOn ? { interruptOn } : {}),
      // Real instance (LangGraph rejects `true` for root graphs); gives multi-turn memory.
      checkpointer,
    });
    agentConfigurationSignature = nextAgentConfigurationSignature;
  }
  const activeAgent = agent;
  if (activeAgent == null) {
    throw new Error('Deep Agents runtime was not initialized');
  }

  const hostToolNames = new Set((start.tools ?? []).map(t => t.name));
  const streamEventState = createDeepAgentsStreamEventState();
  const emitStreamEvent = createEmitStreamEvent({
    state: streamEventState,
    configuredModel: activeModel,
    hostToolNames,
    mcpToolNames,
    structuredOutputToolNames: new Set(
      currentResponseFormat?.map(format => format.name) ?? [],
    ),
    emit,
  });

  // After a stream segment ends, return the tool calls paused by HITL interrupts (empty when the turn is truly done).
  const readPendingApprovals = async () => {
    try {
      const state = (await activeAgent.getState({
        configurable: { thread_id: 'bridge-session' },
      })) as { tasks?: Array<{ interrupts?: Array<{ value?: unknown }> }> };
      return collectActionRequests(
        (state.tasks ?? []).flatMap(t => t.interrupts ?? []),
      );
    } catch {
      return [];
    }
  };

  let resumeInput: unknown = {
    messages: [{ role: 'user', content: start.prompt }],
  };
  let emittedStructuredOutput = false;

  while (true) {
    const stream = await activeAgent.streamEvents(resumeInput as never, config);

    for await (const event of stream) {
      emitStreamEvent(event as DeepAgentsStreamEvent);
      const streamEvent = event as DeepAgentsStreamEvent;
      const namespace = streamEvent.metadata?.langgraph_checkpoint_ns ?? '';
      const output = (streamEvent.data as { output?: unknown } | undefined)
        ?.output as { structuredResponse?: unknown } | undefined;
      if (
        !emittedStructuredOutput &&
        streamEvent.event === 'on_chain_end' &&
        !namespace.includes('|') &&
        output?.structuredResponse !== undefined
      ) {
        const id = `structured-output-${randomUUID()}`;
        emit({ type: 'text-start', id });
        emit({
          type: 'text-delta',
          id,
          delta: JSON.stringify(output.structuredResponse),
        });
        emit({ type: 'text-end', id });
        emittedStructuredOutput = true;
      }
    }

    const actionRequests = await readPendingApprovals();
    if (actionRequests.length === 0) break;

    // HITL paused the run: announce each gated call, collect host decisions, then resume.
    const decisions: Array<
      { type: 'approve' } | { type: 'reject'; message?: string }
    > = [];
    for (const action of actionRequests) {
      const approvalId = `approval-${randomUUID()}`;
      endTextBlock({ state: streamEventState, emit });
      endReasoningBlock({ state: streamEventState, emit });
      emit({
        type: 'tool-call',
        toolCallId: approvalId,
        toolName: toCommonName(action.name),
        input: JSON.stringify(action.args ?? {}),
        providerExecuted: true,
        nativeName: action.name,
      });
      emit({
        type: 'tool-approval-request',
        approvalId,
        toolCallId: approvalId,
      });
      flushStep({ state: streamEventState, emit });
      const decision = await turn.requestToolApproval(approvalId);
      if (decision.approved) {
        const queue = streamEventState.approvedToolQueue.get(action.name) ?? [];
        queue.push(approvalId);
        streamEventState.approvedToolQueue.set(action.name, queue);
        decisions.push({ type: 'approve' });
      } else {
        // Rejected tools never execute, so surface the outcome as the result now.
        emit({
          type: 'tool-result',
          toolCallId: approvalId,
          toolName: toCommonName(action.name),
          result: decision.reason ?? 'Rejected by user.',
        });
        decisions.push({
          type: 'reject',
          ...(decision.reason ? { message: decision.reason } : {}),
        });
      }
    }

    resumeInput = new Command({ resume: { decisions } });
  }

  endTextBlock({ state: streamEventState, emit });
  endReasoningBlock({ state: streamEventState, emit });
  flushStep({ state: streamEventState, emit });
  emit({
    type: 'finish',
    finishReason: { unified: 'stop' },
    totalUsage: {
      inputTokens: { total: streamEventState.inputTokens },
      outputTokens: { total: streamEventState.outputTokens },
    },
  });
}

await runBridge<StartMessage>({
  bridgeType: 'deepagents',
  bridgeStateDir: bridgeStateDir!,
  onStart: runTurn,
  onStop: async () => {
    await closeMcpClient();
    await saveMemorySaver({
      path: conversationCheckpointPath,
      saver: checkpointer,
    });
    return {};
  },
  onDestroy: async () => {
    await closeMcpClient();
    await removeMemorySaverSnapshot(conversationCheckpointPath);
  },
});

async function loadMcpTools({
  mcpServers,
}: {
  mcpServers: Record<string, unknown> | undefined;
}) {
  if (mcpServers == null || Object.keys(mcpServers).length === 0) return [];
  for (const [name, value] of Object.entries(mcpServers)) {
    if (value == null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(
        `DeepAgents MCP server ${JSON.stringify(name)} must be configured with an object value.`,
      );
    }
  }
  mcpClient = new MultiServerMCPClient({
    mcpServers: mcpServers as ClientConfig['mcpServers'],
    prefixToolNameWithServerName: true,
    additionalToolNamePrefix: 'mcp',
  });
  return mcpClient.getTools();
}

async function closeMcpClient(): Promise<void> {
  const client = mcpClient;
  mcpClient = undefined;
  mcpToolNames = new Set();
  await client?.close();
}
