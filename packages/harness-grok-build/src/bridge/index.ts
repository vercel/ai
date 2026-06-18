// Long-running process that runs alongside the `grok` CLI in the sandbox.
// The generic transport — WebSocket server, token auth, single-flight
// reconnect, the in-memory event log + `seq`, resume replay, and the
// lifecycle/meta files — lives in the shared `@ai-sdk/harness/bridge` runtime.
// This file supplies only the Grok-specific turn driver.
//
// Grok is CLI-driven: a fresh `grok -p <prompt> --output-format streaming-json`
// child is spawned per turn. Because the CLI runs with `--always-approve`, all
// tools execute *inside* grok in the sandbox — there is NO host tool dispatch in
// this mode (no relay, no MCP shim). `turn.requestToolResult` /
// `requestToolApproval` are therefore never used here.

import {
  runBridge,
  type BridgeEvent,
  type BridgeTurn,
} from '@ai-sdk/harness/bridge';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { argv, env as procEnv, stdout } from 'node:process';
import { createInterface } from 'node:readline';
import type { StartMessage } from '../grok-build-bridge-protocol';
import { createStreamMapState, mapStreamLine } from '../grok-build-stream-map';

const DEFAULT_GROK_MODEL = 'grok-build-0.1';

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

// The latest grok CLI session id, learned from the terminal `end` event's
// `sessionId`. Returned to the host on detach so a future process could resume
// the grok thread via `-r/--resume`.
const sessionState: { id: string | undefined } = { id: undefined };

await runBridge<StartMessage>({
  bridgeType: 'grok-build',
  bridgeStateDir,
  onStart: runTurn,
  onDetach: () => (sessionState.id ? { sessionId: sessionState.id } : {}),
});

async function runTurn(start: StartMessage, turn: BridgeTurn): Promise<void> {
  const emit = (event: BridgeEvent) => turn.emit(event);

  const grokBin = resolveGrokBinary(bootstrapDir);
  const cliArgs = [
    '-p',
    start.prompt,
    '-m',
    start.model ?? DEFAULT_GROK_MODEL,
    '--output-format',
    'streaming-json',
    // REQUIRED in headless mode: without it the CLI blocks on tool approval.
    // Tools therefore execute inside grok; no host dispatch happens here.
    '--always-approve',
    '--cwd',
    workdir,
  ];
  // Resume the prior CLI thread in this workdir instead of starting fresh.
  if (start.continue) cliArgs.push('-c');

  const child = spawn(grokBin, cliArgs, {
    cwd: workdir,
    env: procEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const childStdout = child.stdout;
  const childStderr = child.stderr;
  if (!childStdout || !childStderr) {
    throw new Error('grok child process did not expose stdout/stderr pipes.');
  }

  // Wire host abort to killing the child.
  const onAbort = () => {
    try {
      child.kill('SIGTERM');
    } catch {}
  };
  if (turn.abortSignal.aborted) {
    onAbort();
  } else {
    turn.abortSignal.addEventListener('abort', onAbort, { once: true });
  }

  // Per-turn stream-map state: each line of grok's streaming-json stdout maps
  // to zero or more HarnessV1StreamPart events.
  const state = createStreamMapState();

  const rl = createInterface({ input: childStdout, crlfDelay: Infinity });
  rl.on('line', line => {
    const trimmed = line.trim();
    if (trimmed.length === 0) return;
    // Capture the grok session id from the terminal `end` event before mapping
    // (mapStreamLine does not surface it).
    captureSessionId(trimmed);
    for (const part of mapStreamLine(trimmed, state)) {
      emit(part as BridgeEvent);
    }
  });

  // Forward stderr to this process's stderr so a CLI failure is inspectable
  // from the host's bridge-stderr forwarding.
  const stderrChunks: string[] = [];
  childStderr.setEncoding('utf8');
  childStderr.on('data', (chunk: string) => {
    stderrChunks.push(chunk);
    process.stderr.write(chunk);
  });

  await new Promise<void>((resolve, reject) => {
    child.on('error', err => {
      emit({ type: 'error', error: serialiseError(err) });
      reject(err);
    });
    child.on('close', code => {
      turn.abortSignal.removeEventListener('abort', onAbort);
      // Aborted: treat as a clean wind-down (host already settles the turn).
      if (turn.abortSignal.aborted) {
        resolve();
        return;
      }
      if (code === 0) {
        resolve();
        return;
      }
      const tail = stderrChunks.join('').trim().slice(-2000);
      const err = new Error(
        `grok CLI exited with code ${code}${tail ? `:\n${tail}` : ''}`,
      );
      emit({ type: 'error', error: serialiseError(err) });
      reject(err);
    });
  });

  void turn.pendingUserMessages; // accepted but unused: each turn is a fresh CLI invocation.
}

function captureSessionId(line: string): void {
  try {
    const msg = JSON.parse(line) as Record<string, unknown>;
    if (
      msg?.type === 'end' &&
      typeof msg.sessionId === 'string' &&
      msg.sessionId.length > 0
    ) {
      sessionState.id = msg.sessionId;
    }
  } catch {
    // Non-JSON / partial line — ignore. The stream-map handles malformed input.
  }
}

/**
 * Resolve the `grok` binary path. The bootstrap installs `@xai-official/grok`
 * into the bootstrap dir's node_modules, exposing `./node_modules/.bin/grok`.
 * Fall back to bare `grok` (PATH) when that shim is absent.
 */
function resolveGrokBinary(dir: string): string {
  const local = `${dir}/node_modules/.bin/grok`;
  return existsSync(local) ? local : 'grok';
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
