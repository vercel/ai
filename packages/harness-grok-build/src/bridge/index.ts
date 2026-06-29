// Grok-build turn driver for the shared @ai-sdk/harness/bridge runtime.
// Drives `grok agent -m <model> stdio` over ACP/JSON-RPC: ONE persistent child +
// ONE ACP session reused across turns (so multi-turn history is preserved).
// First turn spawns + initialize -> session/new; every turn does session/prompt,
// mapping session/update to stream parts and routing session/request_permission
// to host approval against the active turn.

import {
  runBridge,
  type BridgeEvent,
  type BridgeTurn,
} from '@ai-sdk/harness/bridge';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { argv, env as procEnv, stdout } from 'node:process';
import { createInterface } from 'node:readline';
import type { StartMessage } from '../grok-build-bridge-protocol';
import {
  createAcpStreamState,
  finishFromResult,
  mapAcpUpdate,
  type AcpStreamState,
} from '../grok-build-stream-map';
import { createAcpClient, type AcpClient } from './acp-client';
import { prependGrokBuildBinToPath } from './grok-build-path';

const DEFAULT_GROK_MODEL = 'grok-build-0.1';
const ACP_PROTOCOL_VERSION = 1;

const args = parseArgs(argv.slice(2));
if (!args.workdir) {
  emitFatal('Missing --workdir argument.');
}
if (!args.bridgeStateDir) {
  emitFatal('Missing --bridge-state-dir argument.');
}
const workdir: string = args.workdir;
const bridgeStateDir: string = args.bridgeStateDir;
const bootstrapDir: string = args.bootstrapDir ?? workdir;

// Make the bootstrap-installed `grok` binary resolve ahead of any system copy.
prependGrokBuildBinToPath({ bootstrapDir, env: procEnv });

// The latest grok ACP session id, captured from session/new. Returned to the
// host on detach so a future process could resume the thread.
const sessionState: { id: string | undefined } = { id: undefined };

// Persistent grok child + ACP client, spawned once on the first turn and reused
// across every turn so conversation history is preserved. `undefined` until the
// first turn, and reset to `undefined` if the child dies so the next turn can
// re-spawn.
interface LiveProcess {
  child: ChildProcess;
  acp: AcpClient;
  stdin: NodeJS.WritableStream;
  stderrChunks: string[];
  failed?: Error;
}
let live: LiveProcess | undefined;

// The host-tool relay is started once (first turn, if tools were supplied) and
// closed only on bridge shutdown. It routes through `currentTurn`.
let relay: { port: number; close(): void } | undefined;

// Mutable handle to the active turn. The persistent session/update notification,
// session/request_permission, and tool-relay handlers are registered once but
// route through this ref so they always target the in-flight turn.
interface CurrentTurn {
  state: AcpStreamState;
  emit: (event: BridgeEvent) => void;
  turn: BridgeTurn;
}
let currentTurn: CurrentTurn | undefined;

const killChild = (): void => {
  if (!live) return;
  try {
    live.child.kill('SIGTERM');
  } catch {}
  live = undefined;
};

const shutdown = (): void => {
  try {
    relay?.close();
  } catch {}
  relay = undefined;
  killChild();
};

// runBridge exits the process directly after shutdown/detach (no cleanup hook),
// so kill the persistent child on process teardown to avoid orphaned grok procs.
process.on('exit', shutdown);
process.on('SIGTERM', () => {
  shutdown();
  process.exit(0);
});
process.on('SIGINT', () => {
  shutdown();
  process.exit(0);
});

await runBridge<StartMessage>({
  bridgeType: 'grok-build',
  bridgeStateDir,
  onStart: runTurn,
  onDetach: () => (sessionState.id ? { sessionId: sessionState.id } : {}),
});

// Spawn the grok child + ACP client and register the persistent handlers ONCE.
// Handlers route through `currentTurn`, so a turn must set `currentTurn` before
// prompting. Returns the live handle; throws if stdio pipes are unavailable.
function spawnLive(start: StartMessage): LiveProcess {
  const allowAll = start.permissionMode === 'allow-all';

  // `-m <model>` MUST precede `stdio`. For allow-all, run frictionless via
  // `--always-approve` so grok auto-approves and no session/request_permission
  // round-trip occurs; otherwise approvals route back to the host.
  const cliArgs = ['agent', '-m', start.model ?? DEFAULT_GROK_MODEL];
  if (start.reasoningEffort) {
    cliArgs.push('--reasoning-effort', start.reasoningEffort);
  }
  if (allowAll) {
    cliArgs.push('--always-approve');
  }
  cliArgs.push('stdio');

  const child = spawn('grok', cliArgs, {
    cwd: workdir,
    env: procEnv,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const childStdin = child.stdin;
  const childStdout = child.stdout;
  const childStderr = child.stderr;
  if (!childStdin || !childStdout || !childStderr) {
    throw new Error('grok child process did not expose stdio pipes.');
  }

  const acp = createAcpClient({
    writeLine: line => childStdin.write(line + '\n'),
  });

  // Map session/update notifications to stream parts for the active turn.
  acp.onNotification('session/update', (params: unknown) => {
    const active = currentTurn;
    if (!active) return;
    const rec = asRecord(params);
    if (rec === null || !('update' in rec)) return;
    for (const part of mapAcpUpdate(rec['update'], active.state)) {
      active.emit(part as BridgeEvent);
    }
  });

  // Host-driven tool approval against the active turn. Skipped under allow-all,
  // where grok auto-approves via `--always-approve`.
  if (start.permissionMode !== 'allow-all') {
    acp.onRequest('session/request_permission', async (params: unknown) => {
      const active = currentTurn;
      if (!active) return { outcome: { outcome: 'cancelled' } };
      return handlePermissionRequest(
        params,
        active.turn,
        active.emit,
        active.state,
      );
    });
  }

  const stderrChunks: string[] = [];
  childStderr.setEncoding('utf8');
  childStderr.on('data', (chunk: string) => {
    stderrChunks.push(chunk);
    process.stderr.write(chunk);
  });

  const handle: LiveProcess = { child, acp, stdin: childStdin, stderrChunks };

  const rl = createInterface({ input: childStdout, crlfDelay: Infinity });
  rl.on('line', line => {
    const trimmed = line.trim();
    if (trimmed.length === 0) return;
    acp.handleLine(trimmed);
  });

  // The persistent child dying is unexpected mid-turn: surface an error to the
  // active turn and drop `live` so the next turn re-spawns a fresh session.
  const onDeath = (err: Error): void => {
    if (live === handle) live = undefined;
    handle.failed = err;
    currentTurn?.emit({ type: 'error', error: serialiseError(err) });
  };
  child.on('error', err => onDeath(err));
  child.on('close', code => {
    if (handle.failed) return;
    if (code === 0 || code === null) {
      if (live === handle) live = undefined;
      return;
    }
    const tail = stderrChunks.join('').trim().slice(-2000);
    onDeath(
      new Error(`grok CLI exited with code ${code}${tail ? `:\n${tail}` : ''}`),
    );
  });

  return handle;
}

async function runTurn(start: StartMessage, turn: BridgeTurn): Promise<void> {
  const emit = (event: BridgeEvent) => turn.emit(event);
  const hostToolNames = new Set((start.tools ?? []).map(t => t.name));
  const state = createAcpStreamState(hostToolNames);

  // Route this turn's abort to session/cancel only; the persistent child must
  // survive so later turns reuse it. The child is killed only on shutdown.
  const onAbort = () => {
    if (live && sessionState.id) {
      try {
        live.acp.notify('session/cancel', { sessionId: sessionState.id });
      } catch {}
    }
  };
  if (turn.abortSignal.aborted) {
    onAbort();
  } else {
    turn.abortSignal.addEventListener('abort', onAbort, { once: true });
  }

  // First turn (or after the child died): spawn, initialize, create the session,
  // and start the host-tool relay once.
  const isFreshSession = live === undefined;
  if (isFreshSession) {
    live = spawnLive(start);
    const acp = live.acp;

    // Start the relay once. `start.tools` is only known on the first turn; tools
    // are stable across turns in a session (same agent), so build mcpServers
    // from the first turn's tools.
    const mcpServers: unknown[] = [];
    if (start.tools && start.tools.length > 0 && !relay) {
      const relayToken = randomUUID();
      relay = await startToolRelay({
        relayToken,
        tools: start.tools,
        getCurrentTurn: () => currentTurn,
      });
      mcpServers.push({
        name: 'harness-tools',
        command: 'node',
        args: [`${bootstrapDir}/host-tool-mcp.mjs`],
        env: [
          {
            name: 'TOOL_SCHEMAS',
            value: JSON.stringify(
              start.tools.map(t => ({
                name: t.name,
                description: t.description,
                inputSchema: t.inputSchema,
              })),
            ),
          },
          { name: 'TOOL_RELAY_URL', value: `http://127.0.0.1:${relay.port}` },
          { name: 'TOOL_RELAY_TOKEN', value: relayToken },
        ],
      });
    }

    await acp.request('initialize', {
      protocolVersion: ACP_PROTOCOL_VERSION,
      clientCapabilities: {},
    });

    // session/load is unverified for grok; always create a fresh session here.
    // Same-process multi-turn memory is preserved by reusing this session id.
    const newSession = asRecord(
      await acp.request('session/new', { cwd: workdir, mcpServers }),
    );
    if (newSession && typeof newSession['sessionId'] === 'string') {
      sessionState.id = newSession['sessionId'];
    }
  }

  const activeLive = live;
  if (!activeLive) {
    throw new Error('grok child process is not available.');
  }

  currentTurn = { state, emit, turn };
  try {
    const result = await activeLive.acp.request('session/prompt', {
      sessionId: sessionState.id,
      prompt: [{ type: 'text', text: start.prompt }],
    });
    for (const part of finishFromResult(
      (asRecord(result) ?? {}) as { stopReason?: string; _meta?: unknown },
      state,
    )) {
      emit(part as BridgeEvent);
    }
  } catch (err) {
    if (!turn.abortSignal.aborted) throw err;
  } finally {
    turn.abortSignal.removeEventListener('abort', onAbort);
    currentTurn = undefined;
  }

  void turn.pendingUserMessages; // accepted but unused.
}

// Reply to session/request_permission by selecting an allow/reject optionId.
async function handlePermissionRequest(
  params: unknown,
  turn: BridgeTurn,
  emit: (event: BridgeEvent) => void,
  state: AcpStreamState,
): Promise<unknown> {
  const rec = asRecord(params);
  const options = Array.isArray(rec?.['options'])
    ? (rec!['options'] as unknown[])
    : [];
  const pick = (kinds: string[]): string | undefined => {
    for (const kind of kinds) {
      const found = options
        .map(asRecord)
        .find(o => o?.['kind'] === kind && typeof o['optionId'] === 'string');
      if (found) return found['optionId'] as string;
    }
    return undefined;
  };
  const allowId = pick(['allow_once', 'allow_always']);
  const rejectId = pick(['reject_once', 'reject_always']);

  const toolCall = asRecord(rec?.['toolCall']);
  const toolCallId =
    toolCall && typeof toolCall['toolCallId'] === 'string'
      ? (toolCall['toolCallId'] as string)
      : 'grok-build-approval';

  const allow = () =>
    allowId
      ? { outcome: { outcome: 'selected', optionId: allowId } }
      : { outcome: { outcome: 'cancelled' } };

  // Only tool-calls surfaced to the host (builtins) can be approved there.
  // Host tools are gated by the relay / the host's own tool approval, and
  // grok-internal tools (search_tool/use_tool) are never surfaced — auto-allow
  // both so grok proceeds without orphaning an approval the host can't match.
  if (!state.toolNamesById.has(toolCallId)) {
    return allow();
  }

  // Some BridgeTurn versions may lack requestToolApproval; auto-allow then.
  if (typeof turn.requestToolApproval !== 'function') {
    return allow();
  }

  emit({ type: 'tool-approval-request', approvalId: toolCallId, toolCallId });
  const decision = await turn.requestToolApproval(toolCallId);

  if (turn.abortSignal.aborted) return { outcome: { outcome: 'cancelled' } };
  const chosen = decision.approved ? allowId : rejectId;
  return chosen
    ? { outcome: { outcome: 'selected', optionId: chosen } }
    : { outcome: { outcome: 'cancelled' } };
}

// Tool relay — HTTP server on 127.0.0.1:0 with bearer-token auth. Started once;
// each invocation routes through the active turn (via `getCurrentTurn`) so a
// relay started on the first turn still resolves against the current turn's
// `requestToolResult` / `emit`. The in-sandbox MCP stdio server POSTs each
// host-tool invocation here; the relay emits a `tool-call`, awaits the matching
// `tool-result`, and responds with `{ result }`.
async function startToolRelay({
  relayToken,
  tools,
  getCurrentTurn,
}: {
  relayToken: string;
  tools: ReadonlyArray<{ name: string }>;
  getCurrentTurn: () => CurrentTurn | undefined;
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

      const active = getCurrentTurn();
      if (!active) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'no active turn for tool relay' }));
        return;
      }
      const emit = active.emit;

      emit({
        type: 'tool-call',
        toolCallId: requestId,
        toolName,
        input: JSON.stringify(input ?? {}),
        providerExecuted: false,
      } as BridgeEvent);

      const { output, isError } =
        await active.turn.requestToolResult(requestId);
      emit({
        type: 'tool-result',
        toolCallId: requestId,
        toolName,
        result: output ?? null,
        isError: !!isError,
      } as BridgeEvent);

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
  return { port: address.port, close: () => closeServer(server) };
}

function closeServer(server: Server): void {
  try {
    server.close();
  } catch {}
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function parseArgs(rawArgs: string[]): {
  workdir?: string;
  bridgeStateDir?: string;
  bootstrapDir?: string;
} {
  const out: {
    workdir?: string;
    bridgeStateDir?: string;
    bootstrapDir?: string;
  } = {};
  for (let i = 0; i < rawArgs.length; i++) {
    if (rawArgs[i] === '--workdir' && i + 1 < rawArgs.length) {
      out.workdir = rawArgs[++i];
    } else if (rawArgs[i] === '--bridge-state-dir' && i + 1 < rawArgs.length) {
      out.bridgeStateDir = rawArgs[++i];
    } else if (rawArgs[i] === '--bootstrap-dir' && i + 1 < rawArgs.length) {
      out.bootstrapDir = rawArgs[++i];
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
