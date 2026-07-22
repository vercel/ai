// Long-running process that runs alongside the `codex` CLI in the sandbox.
// The generic transport — WebSocket server, token auth, single-flight
// reconnect, the in-memory event log + `seq`, resume replay, and the
// lifecycle/meta files — lives in the shared `@ai-sdk/harness/bridge` runtime.
// This file supplies only the Codex-specific turn driver.
//
// Host-defined tools are routed through an HTTP relay bound to
// `127.0.0.1:0`. The bridge writes a CLI shim into the per-session runtime
// directory; the shim POSTs each tool call to the relay, which emits
// `tool-call` to the host and waits for the matching `tool-result`.

import {
  runBridge,
  type BridgeEvent,
  type BridgeTurn,
} from '@ai-sdk/harness/bridge';
import type { HarnessV1BuiltinToolName } from '@ai-sdk/harness';
import type { StartMessage } from '../codex-bridge-protocol';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
// Temporary workaround for upstream codex MCP-tool bug — see ./cli-relay.ts
import {
  CLI_SHIM_FILENAME,
  buildCliShimScript,
  parseToolRelayCommands,
} from './cli-relay';
import {
  createCodexStepTracker,
  defaultUsage,
  type CodexStepTracker,
} from './codex-step-tracker';
import { startAuthorizedToolRelay, type ToolRelay } from './tool-relay';
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
const workdir = requireArg({ value: args.workdir, name: '--workdir' });
const bridgeStateDir = requireArg({
  value: args.bridgeStateDir,
  name: '--bridge-state-dir',
});
const cliShimDir = requireArg({
  value: args.cliShimDir,
  name: '--cli-shim-dir',
});
const HARNESS_CLIENT_APP = procEnv.AI_SDK_HARNESS_CLIENT_APP;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const codexSdk = codexSdkModule as any;

// Codex thread id — survives across turns within this bridge process and is
// returned to the host on `detach` so a future process can resume the thread.
const threadState: { id: string | undefined } = { id: undefined };

await runBridge<StartMessage>({
  bridgeType: 'codex',
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
   * Known limitation: codex CLI does not reliably surface MCP tools to the
   * model in `codex exec --experimental-json` mode (the path the
   * `@openai/codex-sdk` uses). Some versions do not register MCP tools at all;
   * others expose the tool names but pass empty arguments.
   *
   * Until that's fixed, host tools are made available to the model via a
   * separate CLI-relay workaround (see `./cli-relay.ts`). Writing the shim
   * here, adding matching prompt guidance in the host adapter, and filtering
   * the shim command below implement the workaround and can be removed once the
   * upstream bug is fixed.
   */
  let relay: ToolRelay | undefined;
  let cliShimPath: string | undefined;
  if (start.tools && start.tools.length > 0) {
    cliShimPath = `${cliShimDir}/${CLI_SHIM_FILENAME}`;
    relay = await startToolRelay({
      tools: start.tools,
      emit,
      requestToolResult: turn.requestToolResult,
    });
    // Temporary workaround for upstream codex MCP-tool bug — see ./cli-relay.ts
    await mkdir(cliShimDir, { recursive: true });
    await writeFile(
      cliShimPath,
      buildCliShimScript({ relayPort: relay.port }),
      'utf8',
    );
  }

  const codexConfig: Record<string, unknown> = {};

  const gatewayBaseUrl = procEnv.AI_GATEWAY_BASE_URL;
  const hasGatewayAuth = Boolean(procEnv.AI_GATEWAY_API_KEY || gatewayBaseUrl);
  if (hasGatewayAuth && !gatewayBaseUrl) {
    throw new Error(
      'AI Gateway auth was selected but AI_GATEWAY_BASE_URL is missing from the Codex bridge environment.',
    );
  }
  const apiBaseUrl = hasGatewayAuth ? gatewayBaseUrl : procEnv.OPENAI_BASE_URL;
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
        ...(hasGatewayAuth && HARNESS_CLIENT_APP
          ? {
              http_headers: {
                'User-Agent': HARNESS_CLIENT_APP,
                'x-client-app': HARNESS_CLIENT_APP,
              },
            }
          : {}),
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

  const userMessage = start.prompt;
  let turnUsage: Record<string, unknown> | undefined;
  const textByItem = new Map<string, string>();
  const reasoningByItem = new Map<string, string>();
  const stepTracker = createCodexStepTracker({ send: emit });

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
        // Announce to the host so it can include the id in resume state.
        emit({ type: 'bridge-thread', threadId: event.thread_id });
      }
      // Temporary workaround for upstream codex MCP-tool bug — see ./cli-relay.ts
      if (cliShimPath && event.item?.type === 'command_execution') {
        const relayCalls =
          typeof event.item.command === 'string'
            ? parseToolRelayCommands({
                command: event.item.command,
                cliShimPath,
              })
            : undefined;
        if (event.type === 'item.started' && relay && relayCalls) {
          for (const relayCall of relayCalls) {
            relay.authorizeToolCall(relayCall);
          }
        }
        if (relayCalls) {
          stepTracker.observeEvent({ event, itemId: event.item.id });
          continue;
        }
      }
      translateAndEmit(event, {
        send: emit,
        textByItem,
        reasoningByItem,
        stepTracker,
        setTurnUsage: u => (turnUsage = u),
        emitWarning: turn.emitWarning,
        emitError: turn.emitError,
      });
    }
  } catch (err) {
    turn.emitError({ error: err, message: 'codex turn failed' });
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
    stepTracker: CodexStepTracker;
    setTurnUsage: (u: Record<string, unknown>) => void;
    emitWarning: BridgeTurn['emitWarning'];
    emitError: BridgeTurn['emitError'];
  },
): void {
  if (event.type === 'turn.completed') {
    if (event.usage) ctx.setTurnUsage(mapUsage(event.usage));
    ctx.stepTracker.finishStep();
    return;
  }
  if (event.type === 'turn.failed') {
    ctx.emitError({
      error: event.error?.message ?? 'codex turn failed',
      message: 'codex turn failed',
    });
    return;
  }
  if (event.type === 'error') {
    ctx.emitError({
      error: event.message ?? 'codex error',
      message: 'codex stream error',
    });
    return;
  }
  if (!event.item) return;
  const item = event.item;
  const id = item.id ?? randomUUID();
  const observeStep = (): void => {
    ctx.stepTracker.observeEvent({ event, itemId: id });
  };

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
    observeStep();
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
    observeStep();
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
    observeStep();
    return;
  }

  if (item.type === 'mcp_tool_call') {
    if (event.type === 'item.started') {
      ctx.send({
        type: 'tool-call',
        toolCallId: id,
        toolName: item.tool ?? 'unknown',
        nativeName: item.tool ?? 'unknown',
        input: JSON.stringify(item.arguments ?? {}),
        providerExecuted: true,
      });
    } else if (event.type === 'item.completed') {
      ctx.send({
        type: 'tool-result',
        toolCallId: id,
        toolName: item.tool ?? 'unknown',
        result: extractMcpToolCallResult(item),
      });
    }
    observeStep();
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
    observeStep();
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
    observeStep();
    return;
  }

  if (item.type === 'error' && event.type === 'item.completed') {
    const message =
      typeof item.message === 'string' && item.message.trim()
        ? item.message
        : 'codex reported a non-fatal error item';
    ctx.emitWarning({ message });
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

/**
 * Tool relay — HTTP server on 127.0.0.1:0. The CLI shim invoked by Codex POSTs
 * each tool invocation here; the relay forwards the call to the host (via the
 * shared runtime's `emit`), awaits the matching `tool-result` (via
 * `requestToolResult`), and responds with `{ result }`.
 */
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

function parseArgs(args: string[]): {
  workdir?: string;
  bridgeStateDir?: string;
  cliShimDir?: string;
} {
  const out: {
    workdir?: string;
    bridgeStateDir?: string;
    cliShimDir?: string;
  } = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--workdir' && i + 1 < args.length) {
      out.workdir = args[++i];
    } else if (args[i] === '--bridge-state-dir' && i + 1 < args.length) {
      out.bridgeStateDir = args[++i];
    } else if (args[i] === '--cli-shim-dir' && i + 1 < args.length) {
      out.cliShimDir = args[++i];
    }
  }
  return out;
}

function emitFatal(message: string): never {
  stdout.write(JSON.stringify({ type: 'bridge-fatal', message }) + '\n');
  process.exit(1);
}

function requireArg({
  value,
  name,
}: {
  value: string | undefined;
  name: string;
}): string {
  if (!value) {
    emitFatal(`Missing ${name} argument.`);
  }
  return value;
}
