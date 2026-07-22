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
import { Command, MemorySaver } from '@langchain/langgraph';
import { createDeepAgent } from 'deepagents';
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
function buildModel(rawModel: string | undefined) {
  if (!rawModel) return undefined;
  const baseUrl = procEnv.ANTHROPIC_BASE_URL;
  const model = baseUrl ? rawModel : rawModel.replace(/^anthropic[/:]/, '');
  return new ChatAnthropic({
    model,
    ...(procEnv.ANTHROPIC_API_KEY ? { apiKey: procEnv.ANTHROPIC_API_KEY } : {}),
    ...(baseUrl ? { anthropicApiUrl: baseUrl } : {}),
    ...(procEnv.AI_GATEWAY_API_KEY && HARNESS_CLIENT_APP
      ? {
          clientOptions: {
            defaultHeaders: {
              'User-Agent': HARNESS_CLIENT_APP,
              'x-client-app': HARNESS_CLIENT_APP,
            },
          },
        }
      : {}),
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

// One agent per bridge process, reused across turns; host tools read the live turn via `currentTurn`.
let agent: ReturnType<typeof createDeepAgent> | undefined;
let currentTurn: BridgeTurn | undefined;

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
  const emit = (event: Record<string, unknown>) =>
    turn.emit(event as BridgeEvent);

  const interruptOn = buildInterruptOn(
    start.permissionMode,
    start.builtinToolFiltering,
  );
  if (!agent) {
    const model = buildModel(start.model);
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
    agent = createDeepAgent({
      // Defer to Deep Agents's own default when the host configured no model.
      ...(model ? { model } : {}),
      tools: buildHostTools(start.tools),
      backend: createLocalShellBackend({ rootDir: workdir }),
      systemPrompt: start.instructions || undefined,
      // Native skills loaded from the source dirs ($HOME-materialized + <workDir> for repo-provided skills).
      ...(start.skillsPaths?.length ? { skills: start.skillsPaths } : {}),
      ...(builtinToolFilteringMiddleware
        ? { middleware: [builtinToolFilteringMiddleware] }
        : {}),
      // Gate built-in tools behind HITL approval when the permission mode requires it.
      ...(interruptOn ? { interruptOn } : {}),
      // Real instance (LangGraph rejects `true` for root graphs); gives multi-turn memory.
      checkpointer: new MemorySaver(),
    });
  }

  const hostToolNames = new Set((start.tools ?? []).map(t => t.name));
  const streamEventState = createDeepAgentsStreamEventState();
  const emitStreamEvent = createEmitStreamEvent({
    state: streamEventState,
    configuredModel: start.model,
    hostToolNames,
    emit,
  });

  const config = {
    version: 'v2' as const,
    configurable: { thread_id: 'bridge-session' },
    recursionLimit: start.recursionLimit ?? 100,
    signal: turn.abortSignal,
  };

  // After a stream segment ends, return the tool calls paused by HITL interrupts (empty when the turn is truly done).
  const readPendingApprovals = async () => {
    try {
      const state = (await agent!.getState({
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

  while (true) {
    const stream = await agent.streamEvents(resumeInput as never, config);

    for await (const event of stream) {
      emitStreamEvent(event as DeepAgentsStreamEvent);
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
});
