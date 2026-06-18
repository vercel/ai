// Long-running process that runs alongside the DeepAgents (LangGraph JS)
// runtime inside the sandbox. The generic transport — WebSocket server, token
// auth, single-flight reconnect, the in-memory event log + `seq`, resume
// replay, and the lifecycle/meta files — lives in the shared
// `@ai-sdk/harness/bridge` runtime. This file supplies only the
// DeepAgents-specific turn driver: it builds an agent with `createDeepAgent()`
// and translates its `streamEvents` output into harness-v1 stream parts.
//
// CONSTRAINT — the third-party imports below are NEVER bundled into the
// compiled `bridge/index.mjs`. They are declared `external` in tsup.config.ts
// and resolved at runtime from the node_modules this bridge installs *inside
// the sandbox* from `src/bridge/package.json` (and its pinned
// `pnpm-lock.yaml`). When adding/changing a third-party import here you MUST
// keep all three in sync: the import below, the `external` array in
// tsup.config.ts, and the dependency in `src/bridge/package.json`.

import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { argv } from 'node:process';
import {
  runBridge,
  type BridgeEvent,
  type BridgeTurn,
} from '@ai-sdk/harness/bridge';
import { tool } from '@langchain/core/tools';
import { createDeepAgent, LocalShellBackend } from 'deepagents';
import { z } from 'zod/v4';
import type { StartMessage } from '../deepagents-bridge-protocol';

// Native LangGraph tool name -> harness-v1 common name.
const NATIVE_TO_COMMON: Readonly<Record<string, string>> = {
  read_file: 'read',
  write_file: 'write',
  shell: 'bash',
  search: 'grep',
};

function toCommonName(nativeName: string): string {
  return NATIVE_TO_COMMON[nativeName] ?? nativeName;
}

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

// LangChain resolves model strings as `provider:model`; the host sends
// `provider/model`.
function parseModelName(raw: string): string {
  return raw.includes('/') ? raw.replace('/', ':') : raw;
}

const args = parseArgs(argv.slice(2));
const workdir = args.workdir;
const bridgeStateDir = args.bridgeStateDir;
if (!workdir || !bridgeStateDir) {
  // eslint-disable-next-line no-console
  console.error('deepagents bridge: missing --workdir / --bridge-state-dir');
  process.exit(1);
}

// One agent per bridge process, reused across turns so the LangGraph
// checkpointer accumulates conversation state. Host tools close over a getter
// for the live turn rather than a fixed one.
let agent: ReturnType<typeof createDeepAgent> | undefined;
let currentTurn: BridgeTurn | undefined;

const jsonTypeToZod: Record<string, () => z.ZodTypeAny> = {
  string: () => z.string(),
  integer: () => z.number(),
  number: () => z.number(),
  boolean: () => z.boolean(),
  object: () => z.record(z.string(), z.unknown()),
  array: () => z.array(z.unknown()),
};

function schemaFromJson(input: unknown) {
  const obj =
    input && typeof input === 'object'
      ? (input as {
          properties?: Record<string, { type?: string }>;
          required?: string[];
        })
      : {};
  const properties = obj.properties ?? {};
  const required = new Set(obj.required ?? []);
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [name, def] of Object.entries(properties)) {
    const base = (
      jsonTypeToZod[def?.type ?? 'string'] ?? jsonTypeToZod.string
    )();
    shape[name] = required.has(name) ? base : base.optional();
  }
  return z.object(shape);
}

// Host-defined tools become LangChain tools that round-trip through the host:
// emit a `tool-call` (providerExecuted=false), then block on the host's
// `tool-result` before returning to LangGraph.
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
        schema: schemaFromJson(schema.inputSchema),
      },
    ),
  );
}

async function readSkillsBlock(): Promise<string> {
  try {
    const content = await readFile(`${workdir}/.skills.md`, 'utf8');
    return content.trim() ? `## Available Skills\n\n${content}` : '';
  } catch {
    return '';
  }
}

function buildSystemPrompt(start: StartMessage, skillsBlock: string): string {
  return [start.instructions ?? '', skillsBlock].filter(Boolean).join('\n\n');
}

async function runTurn(start: StartMessage, turn: BridgeTurn): Promise<void> {
  currentTurn = turn;
  const emit = (event: Record<string, unknown>) =>
    turn.emit(event as BridgeEvent);

  if (!agent) {
    const skillsBlock = await readSkillsBlock();
    agent = createDeepAgent({
      model: parseModelName(start.model ?? 'claude-sonnet-4'),
      tools: buildHostTools(start.tools),
      backend: new LocalShellBackend({ rootDir: workdir }),
      systemPrompt: buildSystemPrompt(start, skillsBlock) || undefined,
      checkpointer: true,
    });
  }

  emit({
    type: 'stream-start',
    ...(start.model ? { modelId: start.model } : {}),
  });

  const hostToolNames = new Set((start.tools ?? []).map(t => t.name));
  let textBlockId: string | undefined;
  let reasoningBlockId: string | undefined;
  let inputTokens = 0;
  let outputTokens = 0;
  const activeToolRunIds = new Set<string>();

  const ensureTextBlock = (): string => {
    if (!textBlockId) {
      textBlockId = `text-${randomUUID()}`;
      emit({ type: 'text-start', id: textBlockId });
    }
    return textBlockId;
  };
  const endTextBlock = () => {
    if (textBlockId) {
      emit({ type: 'text-end', id: textBlockId });
      textBlockId = undefined;
    }
  };
  const emitText = (delta: string) =>
    emit({ type: 'text-delta', id: ensureTextBlock(), delta });
  const emitReasoning = (delta: string) => {
    if (!reasoningBlockId) {
      reasoningBlockId = `reasoning-${randomUUID()}`;
      emit({ type: 'reasoning-start', id: reasoningBlockId });
    }
    emit({ type: 'reasoning-delta', id: reasoningBlockId, delta });
  };

  const stream = await agent.streamEvents(
    { messages: [{ role: 'user', content: start.prompt }] },
    {
      version: 'v2',
      configurable: { thread_id: 'bridge-session' },
      recursionLimit: 50,
      signal: turn.abortSignal,
    },
  );

  for await (const event of stream) {
    const kind = event.event;
    const data = (event.data ?? {}) as Record<string, unknown>;

    if (kind === 'on_chat_model_stream') {
      const parentIds = (event as { parent_ids?: string[] }).parent_ids ?? [];
      if (parentIds.some(id => activeToolRunIds.has(id))) continue;
      const chunk = data.chunk as
        | {
            content?: unknown;
            usage_metadata?: { input_tokens?: number; output_tokens?: number };
          }
        | undefined;
      if (!chunk) continue;
      const content = chunk.content;
      if (typeof content === 'string' && content) {
        emitText(content);
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (block && typeof block === 'object') {
            const b = block as {
              type?: string;
              text?: string;
              thinking?: string;
            };
            if (b.type === 'text' && b.text) emitText(b.text);
            else if (b.type === 'thinking' && b.thinking)
              emitReasoning(b.thinking);
          }
        }
      }
      const usage = chunk.usage_metadata;
      if (usage) {
        inputTokens = Math.max(inputTokens, usage.input_tokens ?? 0);
        outputTokens = Math.max(outputTokens, usage.output_tokens ?? 0);
      }
    } else if (kind === 'on_tool_start') {
      const toolName = (event.name as string) ?? 'unknown';
      const runId = (event.run_id as string) ?? '';
      if (runId) activeToolRunIds.add(runId);
      // Host tools emit their own tool-call inside the tool fn; only the
      // runtime's built-in tools are surfaced here (providerExecuted).
      if (!hostToolNames.has(toolName)) {
        endTextBlock();
        emit({
          type: 'tool-call',
          toolCallId: runId,
          toolName: toCommonName(toolName),
          input: JSON.stringify(data.input ?? {}),
          providerExecuted: true,
          nativeName: toolName,
        });
      }
    } else if (kind === 'on_tool_end') {
      const toolName = (event.name as string) ?? 'unknown';
      const runId = (event.run_id as string) ?? '';
      if (!hostToolNames.has(toolName)) {
        let output: unknown = data.output ?? '';
        if (output && typeof output === 'object' && 'content' in output) {
          output = (output as { content: unknown }).content;
        }
        emit({
          type: 'tool-result',
          toolCallId: runId,
          toolName: toCommonName(toolName),
          result: output ?? null,
        });
      }
      if (runId) activeToolRunIds.delete(runId);
    } else if (kind === 'on_chain_end' && event.name === 'agent') {
      endTextBlock();
      emit({
        type: 'finish-step',
        finishReason: { unified: 'stop' },
        usage: {
          inputTokens: { total: inputTokens },
          outputTokens: { total: outputTokens },
        },
      });
    }
  }

  endTextBlock();
  if (reasoningBlockId) emit({ type: 'reasoning-end', id: reasoningBlockId });
  emit({
    type: 'finish',
    finishReason: { unified: 'stop' },
    totalUsage: {
      inputTokens: { total: inputTokens },
      outputTokens: { total: outputTokens },
    },
  });
}

await runBridge<StartMessage>({
  bridgeType: 'deepagents',
  bridgeStateDir: bridgeStateDir!,
  onStart: runTurn,
});
