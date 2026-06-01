// Long-running process that runs alongside the `codex` CLI in the sandbox.
// The generic transport — WebSocket server, token auth, single-flight
// reconnect, the in-memory event log + `seq`, resume replay, and the
// lifecycle/meta files — lives in the shared `@ai-sdk/harness/bridge` runtime.
// This file supplies only the Codex-specific turn driver.
//
// Host-defined tools are routed through an HTTP relay bound to
// `127.0.0.1:0` with bearer-token auth. The codex CLI spawns
// `host-tool-mcp.mjs` (shipped alongside this file) as a stdio MCP server;
// the shim POSTs each tool call to the relay, which emits `tool-call` to
// the host and waits for the matching `tool-result`.

import {
  runBridge,
  type BridgeEvent,
  type BridgeTurn,
} from '@ai-sdk/harness/bridge';
import type { HarnessV1BuiltinToolName } from '@ai-sdk/harness';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
// Temporary workaround for upstream codex MCP-tool bug — see ./cli-relay.ts
import {
  CLI_SHIM_FILENAME,
  buildCliShimScript,
  composeToolUsageInstructions,
  isToolRelayCommand,
} from './cli-relay';
import { argv, env as procEnv, stdout } from 'node:process';

/*
 * CONSTRAINT — the third-party imports below are NEVER bundled into the
 * compiled `bridge/index.mjs`. They are declared `external` in
 * tsup.config.ts and resolved at runtime from the node_modules that this
 * bridge installs *inside the sandbox* from `src/bridge/package.json` (and
 * its pinned `pnpm-lock.yaml`). That bridge package.json — NOT this host
 * package — is the single source of truth for these packages and their
 * versions; the published `@ai-sdk/harness-codex` package does not provide
 * them at runtime.
 *
 * When adding or changing a third-party import here you MUST keep all three
 * in sync, or the bridge will either get the dependency bundled in or fail
 * to resolve it in the sandbox:
 *   1. the import statement below,
 *   2. the `external` array in tsup.config.ts, and
 *   3. the dependency entry in `src/bridge/package.json`.
 */
import * as codexSdkModule from '@openai/codex-sdk';

const PROTOCOL_VERSION = 1;

/*
 * Native Codex tool name → cross-harness common name. Tools outside this map
 * (e.g. MCP tools the model invokes by name) have no common equivalent; their
 * native name is forwarded as-is on `tool-call` events.
 */
const NATIVE_TO_COMMON: Readonly<Record<string, HarnessV1BuiltinToolName>> = {
  shell: 'bash',
  web_search: 'webSearch',
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
const bootstrapDir = args.bootstrapDir ?? workdir;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const codexSdk = codexSdkModule as any;

// Codex thread id — survives across turns within this bridge process and is
// returned to the host on `detach` so a future process can resume the thread.
const threadState: { id: string | undefined } = { id: undefined };

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
  reasoningEffort?: 'low' | 'medium' | 'high';
  webSearch?: boolean;
  skills?: ReadonlyArray<{
    name: string;
    description: string;
    content: string;
  }>;
  resumeThreadId?: string;
};

await runBridge<StartMessage>({
  bridgeType: 'codex',
  protocolVersion: PROTOCOL_VERSION,
  bridgeStateDir,
  onStart: runTurn,
  onDetach: () => (threadState.id ? { threadId: threadState.id } : {}),
});

type Emit = (msg: Record<string, unknown>) => void;

async function runTurn(start: StartMessage, turn: BridgeTurn): Promise<void> {
  const emit: Emit = msg => turn.emit(msg as BridgeEvent);

  // Cross-process resume: the host carries the threadId we returned on detach.
  // Seed `threadState.id` so the codex SDK call below takes the `resumeThread`
  // branch.
  if (
    typeof start.resumeThreadId === 'string' &&
    start.resumeThreadId.length > 0
  ) {
    threadState.id = start.resumeThreadId;
  }

  /*
   * Known limitation: codex CLI does not currently surface MCP tools to the
   * model in `codex exec --experimental-json` mode (the path the
   * `@openai/codex-sdk` uses). The MCP handshake completes and `tools/list`
   * returns the host tool, but codex never registers it as a model-callable
   * function. Built-in MCP-resource accessors (`list_mcp_resources` etc.) are
   * exposed; tools are not. Tracked upstream at
   * https://github.com/openai/codex/issues/19425.
   *
   * Until that's fixed, host tools are made available to the model via a
   * separate CLI-relay workaround (see `./cli-relay.ts`). The MCP server
   * config below is kept so that the day codex starts exposing MCP tools
   * properly, host tools work both ways. Three hookpoints in this file
   * (writeFile for the shim, composeUserMessage's toolUsageBlock, and the
   * isToolRelayCommand filter in the event loop) implement the workaround
   * and can be removed once the upstream bug is fixed.
   */
  const mcpServers: Record<string, unknown> = {};
  let relay: { port: number; close(): void } | undefined;
  let cliShimPath: string | undefined;
  if (start.tools && start.tools.length > 0) {
    const relayToken = randomUUID();
    relay = await startToolRelay({
      relayToken,
      tools: start.tools,
      emit,
      requestToolResult: turn.requestToolResult,
    });
    mcpServers['harness-tools'] = {
      enabled: true,
      command: 'node',
      args: [`${bootstrapDir}/host-tool-mcp.mjs`],
      env: {
        TOOL_SCHEMAS: JSON.stringify(
          start.tools.map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        ),
        TOOL_RELAY_URL: `http://127.0.0.1:${relay.port}`,
        TOOL_RELAY_TOKEN: relayToken,
      },
    };
    // Temporary workaround for upstream codex MCP-tool bug — see ./cli-relay.ts
    cliShimPath = `${workdir}/${CLI_SHIM_FILENAME}`;
    await writeFile(
      cliShimPath,
      buildCliShimScript({ relayPort: relay.port, relayToken }),
      'utf8',
    );
  }

  const codexConfig: Record<string, unknown> = {};
  if (Object.keys(mcpServers).length > 0) codexConfig.mcp_servers = mcpServers;

  const apiBaseUrl = procEnv.AI_GATEWAY_API_KEY
    ? procEnv.AI_GATEWAY_BASE_URL || 'https://ai-gateway.vercel.sh/v1'
    : procEnv.OPENAI_BASE_URL;
  if (apiBaseUrl) {
    codexConfig.preferred_auth_method = 'apikey';
    codexConfig.model_provider = 'agent_bridge_openai';
    codexConfig.model_providers = {
      agent_bridge_openai: {
        name: procEnv.CODEX_MODEL_PROVIDER_NAME || 'Agent Bridge OpenAI',
        base_url: apiBaseUrl,
        env_key: 'CODEX_API_KEY',
        wire_api: 'responses',
        supports_websockets: false,
      },
    };
  }
  const usesConfiguredModelProvider =
    typeof codexConfig.model_provider === 'string';

  const codex = new codexSdk.Codex({
    ...(procEnv.CODEX_API_KEY ? { apiKey: procEnv.CODEX_API_KEY } : {}),
    ...(!usesConfiguredModelProvider && apiBaseUrl
      ? { baseUrl: apiBaseUrl }
      : {}),
    env: Object.fromEntries(
      Object.entries(procEnv).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    ),
    ...(Object.keys(codexConfig).length > 0 ? { config: codexConfig } : {}),
  });

  const threadOptions = {
    ...(start.model ? { model: start.model } : {}),
    sandboxMode: 'danger-full-access',
    approvalPolicy: 'never',
    workingDirectory: workdir,
    skipGitRepoCheck: true,
    ...(start.reasoningEffort
      ? { modelReasoningEffort: start.reasoningEffort }
      : {}),
    webSearchMode: start.webSearch ? 'live' : 'disabled',
  };
  const thread = threadState.id
    ? codex.resumeThread(threadState.id, threadOptions)
    : codex.startThread(threadOptions);

  emit({ type: 'stream-start' });

  const userMessage = composeUserMessage({
    text: start.prompt,
    instructions: start.instructions,
    skills: start.skills,
    // Temporary workaround for upstream codex MCP-tool bug — see ./cli-relay.ts
    toolUsageBlock:
      cliShimPath && start.tools && start.tools.length > 0
        ? composeToolUsageInstructions({
            tools: start.tools,
            cliShimPath,
          })
        : undefined,
  });
  let turnUsage: Record<string, unknown> | undefined;
  const textByItem = new Map<string, string>();
  const reasoningByItem = new Map<string, string>();

  try {
    const { events } = await thread.runStreamed(userMessage, {
      signal: turn.abortSignal,
    });
    for await (const event of events as AsyncIterable<CodexEvent>) {
      if (turn.abortSignal.aborted) break;
      if (
        event.type === 'thread.started' &&
        typeof event.thread_id === 'string'
      ) {
        threadState.id = event.thread_id;
        // Announce to the host so it can cache the id for getResumeHandle.
        emit({ type: 'bridge-thread', threadId: event.thread_id });
      }
      // Temporary workaround for upstream codex MCP-tool bug — see ./cli-relay.ts
      if (
        cliShimPath &&
        event.item?.type === 'command_execution' &&
        typeof event.item.command === 'string' &&
        isToolRelayCommand({ command: event.item.command, cliShimPath })
      ) {
        continue;
      }
      translateAndEmit(event, {
        send: emit,
        textByItem,
        reasoningByItem,
        setTurnUsage: u => (turnUsage = u),
      });
    }
  } catch (err) {
    emit({ type: 'error', error: serialiseError(err) });
    return;
  } finally {
    relay?.close();
  }

  emit({
    type: 'finish',
    finishReason: { unified: 'stop', raw: 'stop' },
    totalUsage: turnUsage ?? defaultUsage(),
  });

  void turn.pendingUserMessages; // accepted but only consumed when codex supports streamed user input
}

type CodexItem = {
  type: string;
  id?: string;
  text?: string;
  command?: string;
  exit_code?: number;
  aggregated_output?: string;
  status?: 'in_progress' | 'completed' | 'failed';
  server?: string;
  tool?: string;
  arguments?: unknown;
  result?: { content?: unknown; structured_content?: unknown } | unknown;
  error?: { message?: string };
  query?: string;
  message?: string;
  changes?: ReadonlyArray<{
    path: string;
    kind: 'add' | 'delete' | 'update';
  }>;
};

function extractMcpToolCallResult(item: CodexItem): unknown {
  if (
    item.result === undefined ||
    item.result === null ||
    typeof item.result !== 'object'
  ) {
    return item.error?.message ? { error: item.error.message } : null;
  }
  const result = item.result as {
    content?: unknown;
    structured_content?: unknown;
  };
  if (
    result.structured_content !== undefined &&
    result.structured_content !== null
  ) {
    return result.structured_content;
  }
  return result.content ?? null;
}

type CodexEvent = {
  type:
    | 'thread.started'
    | 'turn.completed'
    | 'turn.failed'
    | 'error'
    | 'item.started'
    | 'item.updated'
    | 'item.completed';
  item?: CodexItem;
  usage?: Record<string, number>;
  error?: { message: string };
  message?: string;
  thread_id?: string;
};

function translateAndEmit(
  event: CodexEvent,
  ctx: {
    send: Emit;
    textByItem: Map<string, string>;
    reasoningByItem: Map<string, string>;
    setTurnUsage: (u: Record<string, unknown>) => void;
  },
): void {
  if (event.type === 'turn.completed') {
    if (event.usage) ctx.setTurnUsage(mapUsage(event.usage));
    ctx.send({
      type: 'finish-step',
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: event.usage ? mapUsage(event.usage) : defaultUsage(),
    });
    return;
  }
  if (event.type === 'turn.failed') {
    ctx.send({
      type: 'error',
      error: event.error?.message ?? 'codex turn failed',
    });
    return;
  }
  if (event.type === 'error') {
    ctx.send({ type: 'error', error: event.message ?? 'codex error' });
    return;
  }
  if (!event.item) return;
  const item = event.item;
  const id = item.id ?? randomUUID();

  if (item.type === 'agent_message' && typeof item.text === 'string') {
    /*
     * The presence of `id` in `textByItem` — not the `item.started` event —
     * marks the text part as opened. Codex does not guarantee an
     * `item.started` event carrying text precedes the first `item.updated`
     * with text, so keying the `text-start` off the event type can emit a
     * `text-delta` for a part that was never opened. Opening lazily on the
     * first event with text keeps `text-start` before any `text-delta`.
     */
    if (!ctx.textByItem.has(id)) {
      ctx.send({ type: 'text-start', id });
      ctx.textByItem.set(id, '');
    }
    const last = ctx.textByItem.get(id) ?? '';
    const next = item.text;
    if (next.length > last.length) {
      ctx.send({ type: 'text-delta', id, delta: next.slice(last.length) });
      ctx.textByItem.set(id, next);
    }
    if (event.type === 'item.completed') ctx.send({ type: 'text-end', id });
    return;
  }

  if (item.type === 'reasoning' && typeof item.text === 'string') {
    if (!ctx.reasoningByItem.has(id)) {
      ctx.send({ type: 'reasoning-start', id });
      ctx.reasoningByItem.set(id, '');
    }
    const last = ctx.reasoningByItem.get(id) ?? '';
    const next = item.text;
    if (next.length > last.length) {
      ctx.send({ type: 'reasoning-delta', id, delta: next.slice(last.length) });
      ctx.reasoningByItem.set(id, next);
    }
    if (event.type === 'item.completed')
      ctx.send({ type: 'reasoning-end', id });
    return;
  }

  if (item.type === 'command_execution') {
    const nativeName = 'shell';
    if (event.type === 'item.started') {
      ctx.send({
        type: 'tool-call',
        toolCallId: id,
        toolName: toCommonName(nativeName),
        nativeName,
        input: JSON.stringify({ command: item.command ?? '' }),
        providerExecuted: true,
      });
    } else if (event.type === 'item.completed') {
      ctx.send({
        type: 'tool-result',
        toolCallId: id,
        toolName: toCommonName(nativeName),
        result: {
          exitCode: item.exit_code ?? null,
          output: item.aggregated_output ?? '',
          status: item.status ?? 'completed',
        },
      });
    }
    return;
  }

  if (item.type === 'mcp_tool_call') {
    const isHostTool = item.server === 'harness-tools';
    if (event.type === 'item.started') {
      ctx.send({
        type: 'tool-call',
        toolCallId: id,
        toolName: item.tool ?? 'unknown',
        ...(isHostTool ? {} : { nativeName: item.tool ?? 'unknown' }),
        input: JSON.stringify(item.arguments ?? {}),
        providerExecuted: !isHostTool,
      });
    } else if (event.type === 'item.completed') {
      ctx.send({
        type: 'tool-result',
        toolCallId: id,
        toolName: item.tool ?? 'unknown',
        result: extractMcpToolCallResult(item),
      });
    }
    return;
  }

  if (item.type === 'web_search') {
    const nativeName = 'web_search';
    if (event.type === 'item.started') {
      ctx.send({
        type: 'tool-call',
        toolCallId: id,
        toolName: toCommonName(nativeName),
        nativeName,
        input: JSON.stringify({ query: item.query ?? '' }),
        providerExecuted: true,
      });
    } else if (event.type === 'item.completed') {
      ctx.send({
        type: 'tool-result',
        toolCallId: id,
        toolName: toCommonName(nativeName),
        result: item.result ?? null,
      });
    }
    return;
  }

  if (item.type === 'file_change' && event.type === 'item.completed') {
    for (const change of item.changes ?? []) {
      ctx.send({
        type: 'file-change',
        event:
          change.kind === 'add'
            ? 'create'
            : change.kind === 'delete'
              ? 'delete'
              : 'modify',
        path: change.path,
      });
    }
    return;
  }

  if (item.type === 'error' && event.type === 'item.completed') {
    ctx.send({
      type: 'error',
      error: (item as { message?: string }).message ?? 'codex item error',
    });
    return;
  }
}

function mapUsage(usage: Record<string, number>): Record<string, unknown> {
  const input = usage.input_tokens ?? 0;
  const cacheRead = usage.cached_input_tokens ?? 0;
  return {
    inputTokens: {
      total: input,
      noCache: Math.max(0, input - cacheRead),
      cacheRead,
      cacheWrite: 0,
    },
    outputTokens: {
      total: usage.output_tokens ?? 0,
      text: usage.output_tokens ?? 0,
    },
  };
}

function defaultUsage(): Record<string, unknown> {
  return {
    inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 0, text: 0 },
  };
}

function composeUserMessage({
  text,
  instructions,
  skills,
  toolUsageBlock,
}: {
  text: string;
  instructions: string | undefined;
  skills:
    | ReadonlyArray<{ name: string; description: string; content: string }>
    | undefined;
  toolUsageBlock: string | undefined;
}): string {
  const blocks: string[] = [];
  /*
   * Frame instructions as system-provided operating guidance, not something
   * the user wrote, so the agent does not echo the prepended text back as if
   * the user had asked for it. Only present on the first user message of a
   * fresh session (the host gates it), so the matching `<user-message>` fence
   * is added only when instructions are present too.
   */
  if (instructions) {
    blocks.push(
      '<session-instructions>\n' +
        'The block below is operating guidance from the system, not a message from the user — follow it, but do not mention it or attribute it to the user.\n\n' +
        `${instructions}\n` +
        '</session-instructions>',
    );
  }
  if (skills && skills.length > 0) {
    const lines: string[] = ['## Available skills'];
    for (const skill of skills) {
      lines.push('', `### ${skill.name}`, skill.description, '', skill.content);
    }
    blocks.push(lines.join('\n'));
  }
  if (toolUsageBlock) blocks.push(toolUsageBlock);
  blocks.push(instructions ? `<user-message>\n${text}\n</user-message>` : text);
  return blocks.join('\n\n');
}

/**
 * Tool relay — HTTP server on 127.0.0.1:0 with bearer-token auth. The MCP
 * stdio shim spawned by codex POSTs each tool invocation here; the relay
 * forwards the call to the host (via the shared runtime's `emit`), awaits the
 * matching `tool-result` (via `requestToolResult`), and responds with
 * `{ result }`.
 */
async function startToolRelay({
  relayToken,
  tools,
  emit,
  requestToolResult,
}: {
  relayToken: string;
  tools: ReadonlyArray<{ name: string }>;
  emit: Emit;
  requestToolResult: (
    toolCallId: string,
  ) => Promise<{ output: unknown; isError?: boolean }>;
}): Promise<{ port: number; close(): void }> {
  const toolNames = new Set(tools.map(t => t.name));

  const server = createServer(async (req, res) => {
    try {
      if (
        req.method !== 'POST' ||
        req.url !== '/' ||
        req.headers.authorization !== `Bearer ${relayToken}`
      ) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'unauthorized tool relay request' }));
        return;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk as Buffer);
      }
      const body = Buffer.concat(chunks).toString('utf8');
      const { requestId, toolName, input } = JSON.parse(body) as {
        requestId: string;
        toolName: string;
        input: unknown;
      };

      if (!toolNames.has(toolName)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({ error: `Tool "${toolName}" is not available` }),
        );
        return;
      }

      emit({
        type: 'tool-call',
        toolCallId: requestId,
        toolName,
        input: JSON.stringify(input ?? {}),
        providerExecuted: false,
      });

      const { output, isError } = await requestToolResult(requestId);
      emit({
        type: 'tool-result',
        toolCallId: requestId,
        toolName,
        result: output ?? null,
        isError: !!isError,
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ result: output }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  });

  await new Promise<void>(resolve =>
    server.listen(0, '127.0.0.1', () => resolve()),
  );
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('tool relay did not expose a numeric port');
  }
  return {
    port: address.port,
    close: () => closeServer(server),
  };
}

function closeServer(server: Server): void {
  try {
    server.close();
  } catch {}
}

function parseArgs(args: string[]): {
  workdir?: string;
  bridgeStateDir?: string;
  bootstrapDir?: string;
} {
  const out: {
    workdir?: string;
    bridgeStateDir?: string;
    bootstrapDir?: string;
  } = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--workdir' && i + 1 < args.length) {
      out.workdir = args[++i];
    } else if (args[i] === '--bridge-state-dir' && i + 1 < args.length) {
      out.bridgeStateDir = args[++i];
    } else if (args[i] === '--bootstrap-dir' && i + 1 < args.length) {
      out.bootstrapDir = args[++i];
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
