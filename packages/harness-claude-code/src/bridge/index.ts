// Long-running bridge that runs inside a sandbox alongside the `claude` CLI.
// Talks to the host over WebSocket on a sandbox-proxied loopback port. The
// host injects auth env (and a one-shot `BRIDGE_CHANNEL_TOKEN`) via the
// sandbox's spawn env; this process reads them straight from `process.env`.
// The bridge enforces the token on every WS connection.

import type { HarnessV1BuiltinToolName } from '@ai-sdk/harness';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { argv, env as procEnv, pid, stdout } from 'node:process';

/*
 * CONSTRAINT — the third-party imports below are NEVER bundled into the
 * compiled `bridge/index.mjs`. They are declared `external` in
 * tsup.config.ts and resolved at runtime from the node_modules that this
 * bridge installs *inside the sandbox* from `src/bridge/package.json` (and
 * its pinned `pnpm-lock.yaml`). That bridge package.json — NOT this host
 * package — is the single source of truth for these packages and their
 * versions; the published `@ai-sdk/harness-claude-code` package does not
 * provide them at runtime.
 *
 * When adding or changing a third-party import here you MUST keep all three
 * in sync, or the bridge will either get the dependency bundled in or fail
 * to resolve it in the sandbox:
 *   1. the import statement below,
 *   2. the `external` array in tsup.config.ts, and
 *   3. the dependency entry in `src/bridge/package.json`.
 */
import * as claudeAgentSdk from '@anthropic-ai/claude-agent-sdk';
import * as mcpServerModule from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebSocketServer } from 'ws';
import { z } from 'zod';

const PROTOCOL_VERSION = 1;

/*
 * Native Claude Code tool name → cross-harness common name. Tools outside this
 * map (e.g. `WebFetch`, `NotebookEdit`) have no common equivalent; their
 * native name is forwarded as-is on `tool-call` events.
 */
const NATIVE_TO_COMMON: Readonly<Record<string, HarnessV1BuiltinToolName>> = {
  Read: 'read',
  Write: 'write',
  Edit: 'edit',
  Bash: 'bash',
  Glob: 'glob',
  Grep: 'grep',
  WebSearch: 'webSearch',
};

function toCommonName(nativeName: string): HarnessV1BuiltinToolName | string {
  return NATIVE_TO_COMMON[nativeName] ?? nativeName;
}

const args = parseArgs(argv.slice(2));
const workdir = args.workdir;
const bridgeStateDir = args.bridgeStateDir;
if (!workdir) {
  emitFatal('Missing --workdir argument.');
}
if (!bridgeStateDir) {
  emitFatal('Missing --bridge-state-dir argument.');
}

const startConfigPath = `${bridgeStateDir}/start-config.json`;
const rerunStartConfigPath = `${bridgeStateDir}/rerun-start-config.json`;
const bridgeMetaPath = `${bridgeStateDir}/bridge-meta.json`;

try {
  await mkdir(bridgeStateDir, { recursive: true });
} catch {
  // Best-effort; if we can't write state files the bridge still runs.
}

const expectedToken = procEnv.BRIDGE_CHANNEL_TOKEN ?? '';

type BridgeState = 'init' | 'waiting' | 'running' | 'draining' | 'done';
let currentBoundPort = 0;

async function writeBridgeMeta(state: BridgeState): Promise<void> {
  const meta = {
    type: 'claude-code',
    protocolVersion: PROTOCOL_VERSION,
    port: currentBoundPort,
    state,
    pid,
  };
  try {
    await writeFile(bridgeMetaPath, JSON.stringify(meta));
  } catch {
    // Best-effort — resilience metadata, not load-bearing for the active turn.
  }
}

async function writeStartConfig(start: unknown): Promise<void> {
  try {
    const serialized = JSON.stringify(start);
    await writeFile(startConfigPath, serialized);
    // `rerun-start-config.json` is the frozen copy: written once on the
    // first start, never overwritten. Future `rerun`-mode recovery
    // restores it back over `start-config.json` to re-run the original
    // turn from scratch when a bridge died mid-stream.
    if (!existsSync(rerunStartConfigPath)) {
      await writeFile(rerunStartConfigPath, serialized);
    }
  } catch {
    // Best-effort.
  }
}

void writeBridgeMeta('init');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const claudeSdk = claudeAgentSdk as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mcpModule = mcpServerModule as any;

const bridgeWsPort = parseInt(procEnv.BRIDGE_WS_PORT ?? '0', 10);
const wss = new WebSocketServer({ port: bridgeWsPort, host: '0.0.0.0' });

let activeSocket: WSConnection | undefined;

wss.on('listening', () => {
  const addr = wss.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  currentBoundPort = port;
  void writeBridgeMeta('waiting');
  stdout.write(
    JSON.stringify({
      type: 'bridge-ready',
      protocolVersion: PROTOCOL_VERSION,
      port,
    }) + '\n',
  );
});

wss.on('connection', (ws: WSConnection, req: { url?: string }) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.searchParams.get('agent_bridge_token') !== expectedToken) {
    ws.close(1008, 'unauthorized');
    return;
  }
  if (activeSocket) {
    ws.close(1013, 'bridge already has an active host connection');
    return;
  }
  activeSocket = ws;
  // Hello-then-listen: tell the host that the end-to-end WS connection
  // is actually live before it tries to send `start`. Required because
  // some sandbox runtimes complete the host-side handshake before the
  // connection is forwarded to us.
  try {
    ws.send(JSON.stringify({ type: 'bridge-hello' }));
  } catch {
    // Best-effort. If the hello cannot be sent the host will eventually
    // time out waiting for it and report a clear error.
  }
  wireSocket(ws);
});

type WSConnection = {
  on(event: 'message', listener: (data: ArrayBufferLike) => void): void;
  on(event: 'close', listener: () => void): void;
  send(data: string): void;
  close(code?: number, reason?: string): void;
};

type StartMessage = {
  type: 'start';
  prompt: string;
  instructions?: string;
  tools?: ReadonlyArray<{
    name: string;
    description?: string;
    inputSchema?: unknown;
  }>;
  model?: string;
  maxTurns?: number;
  thinking?: 'off' | 'on' | 'adaptive';
  continue?: boolean;
};

type InboundMessage =
  | StartMessage
  | {
      type: 'tool-result';
      toolCallId: string;
      output: unknown;
      isError?: boolean;
    }
  | { type: 'user-message'; text: string }
  | { type: 'abort' }
  | { type: 'shutdown' }
  | { type: 'detach' };

function wireSocket(ws: WSConnection): void {
  const pendingToolResults = new Map<
    string,
    (output: { output: unknown; isError?: boolean }) => void
  >();
  const pendingUserMessages: string[] = [];
  let turnAbort: AbortController | undefined;
  let isFirstTurn = true;

  const send = (msg: Record<string, unknown>) => {
    try {
      ws.send(JSON.stringify(msg));
    } catch {}
  };

  ws.on('message', async raw => {
    const text = Buffer.from(raw).toString('utf8');
    let parsed: InboundMessage;
    try {
      parsed = JSON.parse(text) as InboundMessage;
    } catch (err) {
      send({
        type: 'error',
        error: `protocol parse error: ${(err as Error).message}`,
      });
      return;
    }
    switch (parsed.type) {
      case 'start': {
        const firstTurn = isFirstTurn;
        isFirstTurn = false;
        void writeStartConfig(parsed);
        void writeBridgeMeta('running');
        runTurn({
          start: parsed,
          send,
          pendingToolResults,
          pendingUserMessages,
          firstTurn,
          onAbortCtl: ctl => {
            turnAbort = ctl;
          },
        })
          .catch(err => {
            send({ type: 'error', error: serialiseError(err) });
          })
          .finally(() => {
            void writeBridgeMeta('waiting');
          });
        return;
      }
      case 'tool-result': {
        const resolver = pendingToolResults.get(parsed.toolCallId);
        if (resolver) {
          pendingToolResults.delete(parsed.toolCallId);
          resolver({ output: parsed.output, isError: parsed.isError });
        }
        return;
      }
      case 'user-message':
        pendingUserMessages.push(parsed.text);
        return;
      case 'abort':
        turnAbort?.abort();
        return;
      case 'shutdown':
        void writeBridgeMeta('done');
        try {
          ws.close(1000, 'shutdown');
        } finally {
          wss.close(() => process.exit(0));
          setTimeout(() => process.exit(0), 1000).unref();
        }
        return;
      case 'detach':
        // Claude Code's session state lives in the workdir on the sandbox
        // filesystem (the Claude SDK reads/writes it via `cwd`); the
        // `{ continue: true }` flag on resume rehydrates the thread. So
        // the detach payload is structurally empty — the framework still
        // wraps it in `HarnessV1ResumeState` for transport.
        void writeBridgeMeta('done');
        send({ type: 'detach-state', data: {} });
        // Allow the message to flush before tearing down.
        setTimeout(() => {
          try {
            ws.close(1000, 'detach');
          } finally {
            wss.close(() => process.exit(0));
            setTimeout(() => process.exit(0), 1000).unref();
          }
        }, 50).unref?.();
        return;
    }
  });

  ws.on('close', () => {
    activeSocket = undefined;
    // TODO(§9): keep the bridge process alive across WS disconnects so a
    // future host process can reattach via §9's `{type:'resume',
    // lastSeenEventId}` wire message and replay buffered events from the
    // in-memory event log. Today we abort the active turn — mid-turn state
    // is lost on disconnect; only between-turn cross-process resume works.
    turnAbort?.abort();
  });
}

// TODO(§9): event log persistence. The bridge does not yet write
// `${bridgeStateDir}/event-log.ndjson` with monotonic event IDs. When that
// lands, paired with the bridge-side `{type:'resume', lastSeenEventId}`
// handler, the host can recover mid-turn state without re-running the
// prompt. Until then, recovery from a dead bridge means a full rerun from
// `rerun-start-config.json`.

// TODO(§9): event IDs on every outbound message. Pair with the event log
// above so `replayEventsToClient(ws, afterId)` can slice the log on resume.

// TODO(§9): `BRIDGE_REPLAY_FROM_DISK=1` startup mode. When the host
// respawns the bridge for disk-replay recovery, the bridge should read
// `start-config.json` from disk and skip waiting for a WS `start`, then
// reload the event log into memory so the resume message can replay it.

type Emit = (msg: Record<string, unknown>) => void;

async function runTurn({
  start,
  send,
  pendingToolResults,
  pendingUserMessages,
  firstTurn,
  onAbortCtl,
}: {
  start: StartMessage;
  send: Emit;
  pendingToolResults: Map<
    string,
    (output: { output: unknown; isError?: boolean }) => void
  >;
  pendingUserMessages: string[];
  firstTurn: boolean;
  onAbortCtl: (ctl: AbortController) => void;
}): Promise<void> {
  const abortCtl = new AbortController();
  onAbortCtl(abortCtl);

  /*
   * Map of native tool-use id → tool name. Claude assistant messages emit
   * `tool_use` blocks with both `id` and `name`; the matching `tool_result`
   * block on a later user message carries only `tool_use_id`, so without this
   * map the tool-result event would have to emit `toolName: 'unknown'`.
   */
  const nativeToolCallNames = new Map<string, string>();

  /*
   * Tool-use ids that originated from the MCP server hosting user-supplied
   * tools. The MCP handler emits its own `tool-call`/`tool-result` pair with
   * the user-facing tool name and a synthetic id, so the duplicate
   * `tool_result` block Claude reports for the underlying native id must be
   * suppressed.
   */
  const mcpToolUseIds = new Set<string>();

  const mcpServers: Record<string, unknown> = {};
  if (start.tools && start.tools.length > 0) {
    const server = new mcpModule.McpServer({
      name: 'harness-tools',
      version: '1.0.0',
    });
    for (const tool of start.tools) {
      const shape = jsonSchemaToZodShape(tool.inputSchema, z);
      server.tool(
        tool.name,
        tool.description ?? '',
        shape,
        async (input: Record<string, unknown>) => {
          const toolCallId = randomUUID();
          const pending = new Promise<{ output: unknown; isError?: boolean }>(
            resolve => {
              pendingToolResults.set(toolCallId, resolve);
            },
          );
          send({
            type: 'tool-call',
            toolCallId,
            toolName: tool.name,
            input: JSON.stringify(input),
            providerExecuted: false,
          });
          const { output, isError } = await pending;
          send({
            type: 'tool-result',
            toolCallId,
            toolName: tool.name,
            result: output ?? null,
            isError: !!isError,
          });
          return {
            content: [{ type: 'text', text: JSON.stringify(output ?? null) }],
            isError,
          };
        },
      );
    }
    mcpServers['harness-tools'] = {
      type: 'sdk',
      name: 'harness-tools',
      instance: server,
    };
  }

  send({ type: 'stream-start' });

  const queryInput = makeQueryInput({
    initialUserMessage: start.prompt,
    pendingUserMessages,
    abortSignal: abortCtl.signal,
  });

  const q = claudeSdk.query({
    prompt: queryInput,
    options: {
      ...(start.instructions ? { customSystemPrompt: start.instructions } : {}),
      ...(start.model ? { model: start.model } : {}),
      ...(start.maxTurns !== undefined ? { maxTurns: start.maxTurns } : {}),
      ...(start.thinking ? { thinking: start.thinking } : {}),
      includePartialMessages: true,
      // Continuation rule: the host can force-continue (resume after a
      // cross-process detach) by setting `start.continue: true`; otherwise
      // we continue every subsequent turn after the first one in this
      // bridge process.
      ...(start.continue === true || !firstTurn ? { continue: true } : {}),
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      mcpServers,
      cwd: workdir,
      abortSignal: abortCtl.signal,
    },
  });

  let stepUsage: Record<string, unknown> | undefined;
  let totalCostUsd: number | undefined;
  let observedTerminalError: string | undefined;
  let emittedTerminalError = false;
  let emittedTerminalFinish = false;
  const partialBlocks = new Map<
    number,
    { id: string; kind: 'text' | 'thinking' }
  >();

  const emitTerminalError = (message: string | undefined): void => {
    const normalized = message?.trim();
    if (!normalized || emittedTerminalError || emittedTerminalFinish) return;
    observedTerminalError = normalized;
    emittedTerminalError = true;
    send({ type: 'error', error: normalized });
    abortCtl.abort();
  };

  try {
    for await (const msg of q as AsyncIterable<ClaudeMessage>) {
      if (abortCtl.signal.aborted) break;

      if (typeof msg.error === 'string' && msg.error.trim()) {
        observedTerminalError = msg.error.trim();
      }

      const type = msg.type;

      if (
        type === 'auth_status' &&
        typeof msg.error === 'string' &&
        msg.error.trim()
      ) {
        emitTerminalError(msg.error);
        continue;
      }

      if (
        type === 'system' &&
        msg.subtype === 'api_retry' &&
        typeof msg.error_status === 'number' &&
        [401, 403, 404].includes(msg.error_status)
      ) {
        emitTerminalError(
          `HTTP ${msg.error_status}: ${msg.error ?? 'provider request failed'}`,
        );
        continue;
      }

      if (
        type === 'system' &&
        msg.subtype === 'task_updated' &&
        msg.patch?.status === 'failed' &&
        typeof msg.patch.error === 'string'
      ) {
        emitTerminalError(msg.patch.error);
        continue;
      }

      if (type === 'stream_event') {
        handleStreamEvent(msg.event, partialBlocks, send);
        continue;
      }

      if (type === 'assistant' && msg.message?.content) {
        for (const block of msg.message.content) {
          if (
            block.type === 'tool_use' &&
            typeof block.id === 'string' &&
            typeof block.name === 'string'
          ) {
            const mcpPrefix = 'mcp__harness-tools__';
            if (block.name.startsWith(mcpPrefix)) {
              mcpToolUseIds.add(block.id);
              continue;
            }
            nativeToolCallNames.set(block.id, block.name);
            send({
              type: 'tool-call',
              toolCallId: block.id,
              toolName: toCommonName(block.name),
              nativeName: block.name,
              input: JSON.stringify(block.input ?? {}),
              providerExecuted: true,
            });
          }
        }
        continue;
      }

      if (type === 'user' && msg.message?.content) {
        for (const block of msg.message.content) {
          if (
            block.type === 'tool_result' &&
            typeof block.tool_use_id === 'string'
          ) {
            if (mcpToolUseIds.has(block.tool_use_id)) {
              mcpToolUseIds.delete(block.tool_use_id);
              continue;
            }
            const nativeName =
              nativeToolCallNames.get(block.tool_use_id) ?? 'unknown';
            nativeToolCallNames.delete(block.tool_use_id);
            const toolName = toCommonName(nativeName);
            const isError = !!block.is_error;
            const content = stringifyContent(block.content);
            /*
             * Claude Code's Bash tool does not report the command's real
             * numeric exit code — the SDK exposes only stdout/stderr text and
             * an is_error flag. Consumers (and the example UI) render bash
             * failures from an `exitCode` field on a structured result, the
             * shape Codex's shell tool provides natively. To match it, derive
             * a binary code from is_error: 1 on failure, 0 on success. This is
             * a stand-in for failed/succeeded, not the process's true exit
             * status.
             */
            const result =
              toolName === 'bash'
                ? { exitCode: isError ? 1 : 0, stdout: content }
                : content;
            send({
              type: 'tool-result',
              toolCallId: block.tool_use_id,
              toolName,
              result,
              isError,
            });
          }
        }
        continue;
      }

      if (type === 'result') {
        if (msg.subtype === 'success') {
          const emptyResult = !msg.result?.trim?.();
          if (emptyResult && observedTerminalError) {
            emitTerminalError(observedTerminalError);
            continue;
          }
          const usage = msg.usage ?? msg.message?.usage;
          const harnessUsage = mapUsage(usage);
          if (harnessUsage) stepUsage = harnessUsage;
          if (typeof msg.total_cost_usd === 'number') {
            totalCostUsd = (totalCostUsd ?? 0) + msg.total_cost_usd;
          }
          const metadata =
            typeof msg.total_cost_usd === 'number'
              ? { 'claude-code': { costUsd: msg.total_cost_usd } }
              : undefined;
          send({
            type: 'finish-step',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: harnessUsage ?? defaultUsage(),
            ...(metadata ? { harnessMetadata: metadata } : {}),
          });
        } else {
          emitTerminalError(
            (Array.isArray(msg.errors) ? msg.errors.join('\n') : undefined) ||
              observedTerminalError ||
              msg.result ||
              'Unknown error',
          );
        }
        continue;
      }
    }
  } catch (err) {
    if (!(abortCtl.signal.aborted && emittedTerminalError)) {
      send({ type: 'error', error: serialiseError(err) });
    }
    return;
  }

  if (emittedTerminalError) return;
  emittedTerminalFinish = true;
  void emittedTerminalFinish;
  send({
    type: 'finish',
    finishReason: { unified: 'stop', raw: 'stop' },
    totalUsage: stepUsage ?? defaultUsage(),
    ...(totalCostUsd !== undefined
      ? { harnessMetadata: { 'claude-code': { costUsd: totalCostUsd } } }
      : {}),
  });
}

type ClaudeMessage = {
  type?: string;
  subtype?: string;
  error?: string;
  error_status?: number;
  patch?: { status?: string; error?: string };
  event?: {
    type?: string;
    index?: number;
    content_block?: { type?: string };
    delta?: { type?: string; text?: string; thinking?: string };
  };
  message?: {
    content?: ReadonlyArray<MessageBlock>;
    usage?: Record<string, unknown>;
  };
  result?: string;
  errors?: ReadonlyArray<string>;
  usage?: Record<string, unknown>;
  total_cost_usd?: number;
};

function handleStreamEvent(
  event: ClaudeMessage['event'] | undefined,
  partialBlocks: Map<number, { id: string; kind: 'text' | 'thinking' }>,
  send: Emit,
): void {
  if (!event || typeof event.index !== 'number') return;
  const index = event.index;

  if (event.type === 'content_block_start') {
    const blockType = event.content_block?.type;
    if (blockType === 'text') {
      const id = randomUUID();
      partialBlocks.set(index, { id, kind: 'text' });
      send({ type: 'text-start', id });
    } else if (blockType === 'thinking') {
      const id = randomUUID();
      partialBlocks.set(index, { id, kind: 'thinking' });
      send({ type: 'reasoning-start', id });
    }
    return;
  }

  if (event.type === 'content_block_delta') {
    const block = partialBlocks.get(index);
    if (!block) return;
    if (
      block.kind === 'text' &&
      event.delta?.type === 'text_delta' &&
      typeof event.delta.text === 'string'
    ) {
      send({ type: 'text-delta', id: block.id, delta: event.delta.text });
    } else if (
      block.kind === 'thinking' &&
      event.delta?.type === 'thinking_delta' &&
      typeof event.delta.thinking === 'string'
    ) {
      send({
        type: 'reasoning-delta',
        id: block.id,
        delta: event.delta.thinking,
      });
    }
    return;
  }

  if (event.type === 'content_block_stop') {
    const block = partialBlocks.get(index);
    if (!block) return;
    partialBlocks.delete(index);
    if (block.kind === 'text') {
      send({ type: 'text-end', id: block.id });
    } else {
      send({ type: 'reasoning-end', id: block.id });
    }
  }
}

function makeQueryInput({
  initialUserMessage,
  pendingUserMessages,
  abortSignal,
}: {
  initialUserMessage: string;
  pendingUserMessages: string[];
  abortSignal: AbortSignal;
}): AsyncIterable<unknown> {
  return {
    [Symbol.asyncIterator]() {
      let sentInitial = false;
      return {
        async next() {
          if (abortSignal.aborted) {
            return { value: undefined, done: true } as IteratorResult<unknown>;
          }
          if (!sentInitial) {
            sentInitial = true;
            return {
              value: {
                type: 'user',
                message: {
                  role: 'user',
                  content: [{ type: 'text', text: initialUserMessage }],
                },
              },
              done: false,
            };
          }
          if (pendingUserMessages.length > 0) {
            const text = pendingUserMessages.shift()!;
            return {
              value: {
                type: 'user',
                message: { role: 'user', content: [{ type: 'text', text }] },
              },
              done: false,
            };
          }
          return { value: undefined, done: true } as IteratorResult<unknown>;
        },
      };
    },
  };
}

type MessageBlock = {
  type: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
};

function stringifyContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map(entry =>
        entry && typeof entry === 'object' && 'text' in entry
          ? String((entry as { text?: unknown }).text ?? '')
          : JSON.stringify(entry),
      )
      .join('');
  }
  return JSON.stringify(content);
}

function mapUsage(usage: unknown): Record<string, unknown> | undefined {
  if (!usage || typeof usage !== 'object') return undefined;
  const u = usage as {
    input_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
    output_tokens?: number;
  };
  return {
    inputTokens: {
      total:
        (u.input_tokens ?? 0) +
        (u.cache_creation_input_tokens ?? 0) +
        (u.cache_read_input_tokens ?? 0),
      noCache: u.input_tokens ?? 0,
      cacheRead: u.cache_read_input_tokens ?? 0,
      cacheWrite: u.cache_creation_input_tokens ?? 0,
    },
    outputTokens: {
      total: u.output_tokens ?? 0,
      text: u.output_tokens ?? 0,
    },
  };
}

function defaultUsage(): Record<string, unknown> {
  return {
    inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 0, text: 0 },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function jsonSchemaToZodShape(
  schema: unknown,
  z: any,
): Record<string, unknown> {
  if (!schema || typeof schema !== 'object') return {};
  const s = schema as {
    properties?: Record<string, { type?: string; description?: string }>;
    required?: string[];
  };
  const shape: Record<string, unknown> = {};
  const required = new Set(s.required ?? []);
  for (const [key, val] of Object.entries(s.properties ?? {})) {
    let z_: unknown;
    switch (val.type) {
      case 'string':
        z_ = z.string();
        break;
      case 'number':
      case 'integer':
        z_ = z.number();
        break;
      case 'boolean':
        z_ = z.boolean();
        break;
      case 'array':
        z_ = z.array(z.any());
        break;
      default:
        z_ = z.any();
    }
    if (val.description)
      z_ = (z_ as { describe: (s: string) => unknown }).describe(
        val.description,
      );
    shape[key] = required.has(key)
      ? z_
      : (z_ as { optional: () => unknown }).optional();
  }
  return shape;
}

function parseArgs(args: string[]): {
  workdir?: string;
  bridgeStateDir?: string;
} {
  const out: { workdir?: string; bridgeStateDir?: string } = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--workdir' && i + 1 < args.length) {
      out.workdir = args[++i];
    } else if (args[i] === '--bridge-state-dir' && i + 1 < args.length) {
      out.bridgeStateDir = args[++i];
    }
  }
  return out;
}

function serialiseError(err: unknown): unknown {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return err;
}

function emitFatal(message: string): never {
  stdout.write(JSON.stringify({ type: 'bridge-fatal', message }) + '\n');
  process.exit(1);
}
