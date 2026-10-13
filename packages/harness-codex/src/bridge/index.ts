/*
 * This long-running bridge process runs Codex app-server in the sandbox. The
 * shared bridge runtime owns the WebSocket transport, authentication,
 * reconnects, event replay, and lifecycle files; this entry point supplies the
 * Codex-specific turn implementation.
 */

import {
  runBridge,
  type BridgeEvent,
  type BridgeTurn,
} from '@ai-sdk/harness/bridge';
import type { StartMessage } from '../codex-bridge-protocol';
import { createCodexAppServerRuntime } from './codex-app-server-driver';
import { createCodexStepTracker, defaultUsage } from './codex-step-tracker';
import { createEmitStreamEvent } from './create-emit-stream-event';
import { argv, env as procEnv, stdout } from 'node:process';

const args = parseArgs(argv.slice(2));
const workdir = requireArg({ value: args.workdir, name: '--workdir' });
const bridgeStateDir = requireArg({
  value: args.bridgeStateDir,
  name: '--bridge-state-dir',
});
const HARNESS_CLIENT_APP = procEnv.AI_SDK_HARNESS_CLIENT_APP;

const threadState: { id: string | undefined } = { id: undefined };
const appServer = createCodexAppServerRuntime();

await runBridge<StartMessage>({
  bridgeType: 'codex',
  bridgeStateDir,
  onStart: runTurn,
  onStop: async () => {
    const data = threadState.id ? { threadId: threadState.id } : {};
    await appServer.close();
    return data;
  },
  onDestroy: () => appServer.close(),
});

type Emit = (msg: Record<string, unknown>) => void;

async function runTurn(start: StartMessage, turn: BridgeTurn): Promise<void> {
  const emit: Emit = msg => turn.emit(msg as BridgeEvent);

  if (start.restartThread) {
    threadState.id = undefined;
  } else if (
    typeof start.resumeThreadId === 'string' &&
    start.resumeThreadId.length > 0
  ) {
    threadState.id = start.resumeThreadId;
  }

  const runtime = resolveCodexRuntime({ start });
  let turnUsage: Record<string, unknown> = defaultUsage();
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
    await appServer.runTurn({
      start,
      turn,
      emit,
      workdir,
      threadId: threadState.id,
      codexModel: runtime.codexModel,
      codexConfig: runtime.codexConfig,
      stepTracker,
      emitStreamEvent,
    });
  } catch (error) {
    if (!turn.abortSignal.aborted) {
      turn.emitError({ error, message: 'codex turn failed' });
    }
    return;
  }

  emit({
    type: 'finish',
    finishReason: { unified: 'stop', raw: 'stop' },
    totalUsage: turnUsage,
  });
}

type CodexRuntime = {
  codexConfig: Record<string, unknown>;
  codexModel: string | undefined;
};

function resolveCodexRuntime({ start }: { start: StartMessage }): CodexRuntime {
  const codexConfig: Record<string, unknown> = {
    ...start.codexConfig,
    developer_instructions: [
      start.instructions,
      'Only respond with your `final` message once you have fully addressed the user request.',
    ]
      .filter((instruction): instruction is string => Boolean(instruction))
      .join('\n\n'),
    model_reasoning_summary: 'detailed',
  };

  const gatewayBaseUrl = procEnv.AI_GATEWAY_BASE_URL;
  const hasGatewayAuth = Boolean(procEnv.AI_GATEWAY_API_KEY || gatewayBaseUrl);
  if (hasGatewayAuth && !gatewayBaseUrl) {
    throw new Error(
      'AI Gateway auth was selected but AI_GATEWAY_BASE_URL is missing from the Codex bridge environment.',
    );
  }
  /*
   * The standalone app-server deliberately ignores CODEX_API_KEY for its
   * built-in OpenAI provider. A custom provider with an explicit env_key keeps
   * direct credentials process-local.
   */
  const apiBaseUrl = hasGatewayAuth
    ? gatewayBaseUrl
    : (procEnv.OPENAI_BASE_URL ??
      (procEnv.CODEX_API_KEY != null || start.headers != null
        ? 'https://api.openai.com/v1'
        : undefined));
  const codexModel =
    start.model && hasGatewayAuth && !start.model.includes('/')
      ? `openai/${start.model}`
      : start.model;
  /*
   * AI Gateway only returns populated reasoning summaries for its
   * creator-qualified model IDs. Codex treats qualified IDs as custom model
   * metadata, so its reasoning-summary capability must also be forced on for
   * the OpenAI Gateway route.
   */
  if (hasGatewayAuth && codexModel?.startsWith('openai/')) {
    codexConfig.model_supports_reasoning_summaries = true;
  }
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
        ...(start.headers != null || (hasGatewayAuth && HARNESS_CLIENT_APP)
          ? {
              http_headers: {
                ...start.headers,
                ...(hasGatewayAuth && HARNESS_CLIENT_APP
                  ? {
                      'User-Agent': HARNESS_CLIENT_APP,
                      'x-client-app': HARNESS_CLIENT_APP,
                    }
                  : {}),
              },
            }
          : {}),
      },
    };
  }
  if (start.mcpServers != null) {
    codexConfig.mcp_servers = start.mcpServers;
  }
  return { codexConfig, codexModel };
}

function parseArgs(args: string[]): {
  workdir?: string;
  bridgeStateDir?: string;
} {
  const out: {
    workdir?: string;
    bridgeStateDir?: string;
  } = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--workdir' && i + 1 < args.length) {
      out.workdir = args[++i];
    } else if (args[i] === '--bridge-state-dir' && i + 1 < args.length) {
      out.bridgeStateDir = args[++i];
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
