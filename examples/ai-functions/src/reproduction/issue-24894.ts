import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createConnection, createServer, type Socket } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { runBridge, type BridgeTurn } from '@ai-sdk/harness/bridge';
import { createBridgeAuthKeyPair } from '@ai-sdk/harness/utils';
import { createClaudeCode } from '@ai-sdk/harness-claude-code';
import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';

// Transport-only reproduction: the real Claude Code host adapter attaches to
// the real shared bridge runtime. onStart substitutes a silent native command;
// no Anthropic request, Vercel Sandbox, or GKE node is involved.
// Keep the production heartbeat timescale: the proposed default is 20 seconds.
async function scenario(mode: 'idle-recovery' | 'idle-outage' | 'blackhole') {
  const directory = await mkdtemp(
    join(fileURLToPath(new URL('.', import.meta.url)), '.issue-24894-'),
  );
  const keys = createBridgeAuthKeyPair();
  let finishTurn: (() => void) | undefined;
  const bridge = await runBridge<{ type: 'start' }>({
    bridgeType: 'claude-code',
    bridgeStateDir: directory,
    publicKey: keys.publicKey,
    port: 0,
    onExit: () => {},
    onStart: async (_start, turn: BridgeTurn) => {
      turn.emit({ type: 'stream-start' });
      await new Promise<void>(resolve => {
        finishTurn = resolve;
      });
      turn.emit({
        type: 'finish',
        finishReason: { unified: 'stop' },
        totalUsage: { inputTokens: {}, outputTokens: {} },
      });
    },
  });
  const sockets = new Set<Socket>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let blackhole = false;
  let denyReconnect = false;
  let connections = 0;
  let idleDrops = 0;
  const proxy = createServer(host => {
    connections++;
    sockets.add(host);
    host.on('error', () => {});
    if (denyReconnect) {
      host.destroy();
      return;
    }
    const remote = createConnection(bridge.port, '127.0.0.1');
    sockets.add(remote);
    remote.on('error', () => host.destroy());
    let timer: ReturnType<typeof setTimeout> | undefined;
    const activity = () => {
      if (timer) {
        clearTimeout(timer);
        timers.delete(timer);
      }
      if (mode === 'blackhole') return;
      timer = setTimeout(
        () => {
          idleDrops++;
          // Explicitly model the separately reported reconnect outage.
          // Idle TCP expiry by itself does not imply that reconnect must fail.
          if (mode === 'idle-outage') denyReconnect = true;
          host.destroy();
          remote.destroy();
        },
        mode === 'idle-recovery' ? 300 : 22_000,
      );
      timers.add(timer);
    };
    host.on('data', data => {
      if (blackhole) return;
      activity();
      remote.write(data);
    });
    remote.on('data', data => {
      if (blackhole) return;
      activity();
      host.write(data);
    });
    host.on('close', () => {
      if (timer) {
        clearTimeout(timer);
        timers.delete(timer);
      }
      remote.destroy();
    });
    remote.on('close', () => host.destroy());
  });
  await new Promise<void>(resolve => proxy.listen(0, '127.0.0.1', resolve));
  const address = proxy.address();
  assert.ok(address && typeof address !== 'string');
  // Local facade for HOME resolution and the adapter's empty skill manifest.
  const unused = async (): Promise<never> => {
    throw new Error('Unexpected sandbox operation');
  };
  const sandbox: SandboxSession = {
    description: 'Transport reproduction sandbox facade',
    run: async ({ command }) => {
      if (command === 'printf "%s" "$HOME"') {
        return { exitCode: 0, stdout: directory, stderr: '' };
      }
      const { stdout, stderr } = await promisify(execFile)(
        '/bin/sh',
        ['-c', command],
        {
          cwd: directory,
        },
      );
      return { exitCode: 0, stdout, stderr };
    },
    readTextFile: async ({ path }) =>
      readFile(path, 'utf8').catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return null;
        throw error;
      }),
    writeTextFile: async ({ path, content }) => writeFile(path, content),
    readFile: unused,
    readBinaryFile: unused,
    writeFile: unused,
    writeBinaryFile: unused,
    stat: unused,
    listDirectory: unused,
    deleteFile: unused,
    spawn: unused,
  };
  const debug: string[] = [];
  const harness = createClaudeCode({
    // Explicit inert auth configuration; no provider request is made.
    auth: { ANTHROPIC_API_KEY: 'transport-test-not-a-credential' },
    port: bridge.port,
    portEndpoint: { url: `ws://127.0.0.1:${address.port}` },
    reconnect: { maxElapsedMs: 2_000, initialDelayMs: 50, maxDelayMs: 100 },
    onDebug: event => debug.push(event.event),
  });
  const abort = new AbortController();
  let session: Awaited<ReturnType<typeof harness.doStart>> | undefined;
  try {
    session = await harness.doStart({
      sessionId: mode,
      sandboxSession: sandbox,
      sessionWorkDir: directory,
      resumeFrom: {
        type: 'resume-session',
        harnessId: 'claude-code',
        specificationVersion: 'harness-v1',
        data: {
          bridge: {
            port: bridge.port,
            privateKey: keys.privateKey,
            lastSeenEventId: 0,
          },
        },
      },
    });
    let started = false;
    const control = await session.doPromptTurn({
      prompt: 'Run a silent foreground command',
      skills: [],
      tools: [],
      abortSignal: abort.signal,
      emit: event => {
        if (event.type === 'stream-start') started = true;
      },
    });
    const settled = control.done.then(
      () => ({ state: 'finished' as const }),
      (error: unknown) => ({ state: 'failed' as const, error }),
    );
    for (let i = 0; i < 200; i++) {
      if (started) break;
      await delay(10);
    }
    assert.ok(started, 'Harness never received the initial bridge turn event');
    if (mode === 'blackhole') {
      // Neither FIN nor RST reaches the established host socket. New
      // connections fail, as with an unavailable node/route.
      blackhole = true;
      denyReconnect = true;
    }
    const observation = await Promise.race([
      settled,
      delay(
        mode === 'blackhole' ? 65_000 : mode === 'idle-outage' ? 25_000 : 750,
      ).then(() => ({ state: 'pending' as const })),
    ]);
    let result = observation;
    if (mode !== 'blackhole') {
      finishTurn?.();
      result = await Promise.race([
        settled,
        delay(3_000).then(() => ({ state: 'pending' as const })),
      ]);
    }
    console.log(
      JSON.stringify({
        mode,
        state: result.state,
        error:
          result.state === 'failed' && result.error instanceof Error
            ? result.error.message
            : undefined,
        connections,
        idleDrops,
        debug,
      }),
    );
    if (mode === 'idle-recovery') {
      assert.equal(
        result.state,
        'finished',
        'Replay failed to deliver the completed turn',
      );
      return undefined;
    }
    if (mode === 'idle-outage') {
      if (result.state === 'finished') return undefined;
      assert.equal(
        result.state,
        'failed',
        'Silent command completion was not delivered',
      );
      if (result.state === 'failed') {
        assert.ok(result.error instanceof Error);
        assert.equal(
          result.error.message,
          'claude-code bridge closed before the turn finished.',
        );
      }
      return 'silent healthy bridge turn failed after idle expiry and reconnect outage';
    }
    if (result.state === 'pending') {
      return 'dead peer left Claude Code turn pending beyond heartbeat and reconnect budgets';
    }
    assert.equal(
      result.state,
      'failed',
      'Dead-peer scenario unexpectedly completed',
    );
    if (result.state === 'failed') {
      assert.ok(result.error instanceof Error);
      assert.equal(
        result.error.message,
        'claude-code bridge closed before the turn finished.',
      );
    }
    return undefined;
  } finally {
    // Capture the terminal observation above before cancellation cleans it up.
    abort.abort();
    finishTurn?.();
    await session?.doDestroy();
    for (const timer of timers) clearTimeout(timer);
    for (const socket of sockets) socket.destroy();
    await new Promise<void>(resolve => proxy.close(() => resolve()));
    await bridge.close();
    await rm(directory, { recursive: true, force: true });
  }
}

async function main() {
  const results = await Promise.all([
    scenario('idle-recovery'),
    scenario('idle-outage'),
    scenario('blackhole'),
  ]);
  const failures = results.filter(result => result !== undefined);
  assert.equal(failures.length, 0, `ISSUE_24894: ${failures.join('; ')}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
