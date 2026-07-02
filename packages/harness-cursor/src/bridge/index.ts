// In-sandbox bridge that drives `@cursor/sdk` local agents. Generic transport
// lives in `@ai-sdk/harness/bridge`; this file supplies the Cursor-specific
// turn driver.

import {
  runBridge,
  type BridgeEvent,
  type BridgeTurn,
} from '@ai-sdk/harness/bridge';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { argv, env as procEnv } from 'node:process';
import type { StartMessage } from '../cursor-bridge-protocol';
import {
  createCursorTranslatorState,
  defaultCursorUsage,
  finalizeCursorTextBlocks,
  translateCursorStreamEvent,
  type CursorStreamEvent,
} from './cursor-events';

/*
 * CONSTRAINT — third-party imports below are NEVER bundled into `bridge.mjs`.
 * They resolve from sandbox `node_modules` installed from `src/bridge/package.json`.
 */
import {
  Agent,
  JsonlLocalAgentStore,
  type SDKCustomTool,
  type SDKCustomToolResult,
} from '@cursor/sdk';

type Emit = (msg: Record<string, unknown>) => void;
type SDKAgent = Awaited<ReturnType<typeof Agent.create>>;

const args = parseArgs(argv.slice(2));
const workdir = args.workdir;
const bridgeStateDir = args.bridgeStateDir;
if (!workdir) {
  emitFatal('Missing --workdir argument.');
}
if (!bridgeStateDir) {
  emitFatal('Missing --bridge-state-dir argument.');
}

const agentState: {
  agent: SDKAgent | undefined;
  agentId: string | undefined;
  autoReview: boolean | undefined;
} = {
  agent: undefined,
  agentId: undefined,
  autoReview: undefined,
};

await runBridge<StartMessage>({
  bridgeType: 'cursor',
  bridgeStateDir,
  onStart: runTurn,
  onDetach: () => (agentState.agentId ? { agentId: agentState.agentId } : {}),
});

async function runTurn(start: StartMessage, turn: BridgeTurn): Promise<void> {
  const emit: Emit = msg => turn.emit(msg as BridgeEvent);
  const apiKey = procEnv.CURSOR_API_KEY;
  if (!apiKey) {
    emit({
      type: 'error',
      error: 'CURSOR_API_KEY is required in the bridge environment.',
    });
    return;
  }

  const store = new JsonlLocalAgentStore(
    path.join(bridgeStateDir, 'cursor-store'),
  );

  let agent: SDKAgent;
  if (start.resumeAgentId) {
    agent = await Agent.resume(start.resumeAgentId, {
      apiKey,
      ...(start.model ? { model: { id: start.model } } : {}),
      local: {
        cwd: workdir,
        store,
        settingSources: ['user'],
        ...(start.autoReview != null ? { autoReview: start.autoReview } : {}),
      },
    });
    agentState.agent = agent;
    agentState.agentId = agent.agentId;
  } else if (agentState.agent) {
    agent = agentState.agent;
  } else {
    agent = await Agent.create({
      apiKey,
      model: start.model ? { id: start.model } : { id: 'composer-2.5' },
      local: {
        cwd: workdir,
        store,
        settingSources: ['user'],
        autoReview: start.autoReview ?? false,
      },
    });
    agentState.agent = agent;
    agentState.agentId = agent.agentId;
    agentState.autoReview = start.autoReview;
  }

  if (agent.agentId) {
    emit({ type: 'bridge-thread', threadId: agent.agentId });
  }

  const hostToolNames = (start.tools ?? []).map(t => t.name);
  const customTools = buildCustomTools(start.tools, turn, emit);
  const prompt = composePrompt(start.prompt, start.instructions);

  const translator = createCursorTranslatorState(
    hostToolNames,
    start.builtinToolFiltering,
  );

  try {
    const run = await agent.send(prompt, {
      local: { customTools },
    });

    for await (const event of run.stream()) {
      if (turn.abortSignal.aborted) break;
      translateCursorStreamEvent(event as CursorStreamEvent, translator, emit);
    }

    finalizeCursorTextBlocks(translator, emit);

    const result = await run.wait().catch(() => undefined);
    if (result?.status === 'error') {
      emit({
        type: 'error',
        error: result.result ?? 'cursor run failed',
      });
    }

    emit({
      type: 'finish-step',
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: defaultCursorUsage(),
    });
  } catch (err) {
    emit({ type: 'error', error: serialiseError(err) });
    return;
  }

  emit({
    type: 'finish',
    finishReason: { unified: 'stop', raw: 'stop' },
    totalUsage: defaultCursorUsage(),
  });
}

function buildCustomTools(
  tools: StartMessage['tools'] | undefined,
  turn: BridgeTurn,
  emit: Emit,
): Record<string, SDKCustomTool> {
  const customTools: Record<string, SDKCustomTool> = {};
  if (!tools?.length) return customTools;

  for (const tool of tools) {
    customTools[tool.name] = {
      description: tool.description,
      inputSchema: tool.inputSchema as SDKCustomTool['inputSchema'],
      execute: async (args, context) => {
        const toolCallId = context.toolCallId ?? randomUUID();
        emit({
          type: 'tool-call',
          toolCallId,
          toolName: tool.name,
          input: safeStringify(args),
          providerExecuted: false,
        });
        const { output, isError } = await turn.requestToolResult(toolCallId);
        if (isError) {
          return {
            content: [{ type: 'text', text: formatToolError(output) }],
            isError: true,
          };
        }
        return formatCustomToolResult(output);
      },
    };
  }

  return customTools;
}

function composePrompt(prompt: string, instructions?: string): string {
  if (!instructions) return prompt;
  return `${instructions}\n\n${prompt}`;
}

function formatCustomToolResult(output: unknown): SDKCustomToolResult {
  if (typeof output === 'string') return output;
  if (output != null && typeof output === 'object')
    return output as SDKCustomToolResult;
  return String(output);
}

function formatToolError(output: unknown): string {
  if (typeof output === 'string') return output;
  try {
    return JSON.stringify(output);
  } catch {
    return 'tool execution failed';
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '{}';
  }
}

function serialiseError(err: unknown): unknown {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return err;
}

function parseArgs(argvArgs: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argvArgs.length; i++) {
    const arg = argvArgs[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argvArgs[i + 1];
      if (next && !next.startsWith('--')) {
        out[key] = next;
        i++;
      } else {
        out[key] = 'true';
      }
    }
  }
  return out;
}

function emitFatal(message: string): never {
  // eslint-disable-next-line no-console
  console.error(message);
  process.exit(1);
}
