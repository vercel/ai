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
import type { StartMessage } from '../codex-bridge-protocol';
import { mkdir, writeFile } from 'node:fs/promises';
// Temporary workaround for upstream codex MCP-tool bug — see ./cli-relay.ts
import {
  CLI_SHIM_FILENAME,
  buildCliShimScript,
  parseToolRelayCommands,
} from './cli-relay';
import { createCodexStepTracker, defaultUsage } from './codex-step-tracker';
import {
  createEmitStreamEvent,
  type CodexEvent,
} from './create-emit-stream-event';
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
  const stepTracker = createCodexStepTracker({ send: emit });
  const emitStreamEvent = createEmitStreamEvent({
    send: emit,
    stepTracker,
    setTurnUsage: usage => (turnUsage = usage),
    setThreadId: threadId => (threadState.id = threadId),
    emitWarning: turn.emitWarning,
    emitError: turn.emitError,
  });

  try {
    const { events } = await thread.runStreamed(userMessage, {
      signal: turn.abortSignal,
    });
    for await (const event of events as AsyncIterable<CodexEvent>) {
      if (turn.abortSignal.aborted) break;
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
      emitStreamEvent(event);
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
