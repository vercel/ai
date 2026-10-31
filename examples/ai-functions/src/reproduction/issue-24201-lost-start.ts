import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createClaudeCode } from '@ai-sdk/harness-claude-code';
import { WebSocketServer } from 'ws';

// Transport-only adaptation of #24201. The server acts as the proxy/bridge
// boundary: it sees the first start but drops that leg before the bridge
// application accepts it. No Claude process, provider call, or key is needed.
async function turn(drop: boolean) {
  const server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const frames: string[] = [];
  let legs = 0;
  let accepted = false;
  let acceptStart: () => void = () => {};
  const receivedStart = new Promise<'accepted'>(resolve => {
    acceptStart = () => {
      accepted = true;
      resolve('accepted');
    };
  });
  server.on('connection', ws => {
    const leg = ++legs;
    ws.send(
      JSON.stringify({
        type: 'bridge-hello',
        state: 'waiting',
        lastSeq: 0,
        capabilities: {},
      }),
    );
    ws.on('message', raw => {
      const { type } = JSON.parse(String(raw)) as { type: string };
      frames.push(`${leg}:${type}`);
      if (type !== 'start') return;
      if (drop && leg === 1) {
        ws.close(1001, 'leg dropped');
      } else {
        acceptStart();
      }
    });
  });

  const sandboxSession = {
    run: async ({ command }: { command: string }) => ({
      exitCode: 0,
      stdout: command.includes('$HOME') ? '/home/user' : '',
      stderr: '',
    }),
    readTextFile: async () => null,
    writeTextFile: async () => {},
    spawn: async () => ({
      stdout: new Response('{"type":"bridge-ready","port":4000}\n').body,
      stderr: new Response('').body,
      kill: async () => {},
      wait: async () => ({ exitCode: 0 }),
    }),
    getPortEndpoint: async () => ({
      url: `ws://127.0.0.1:${address.port}/`,
    }),
  };
  const abort = new AbortController();
  const harness = createClaudeCode({
    auth: { ANTHROPIC_API_KEY: 'test' },
    port: 4000,
  });
  let started: Awaited<ReturnType<typeof harness.doStart>> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const events: string[] = [];
  try {
    started = await harness.doStart({
      sandboxSession,
      sessionId: 's',
      sessionWorkDir: '/w',
    } as unknown as Parameters<typeof harness.doStart>[0]);
    const control = await started.doPromptTurn({
      prompt: 'Hello',
      model: 'm',
      skills: [],
      tools: [],
      abortSignal: abort.signal,
      emit: event => {
        events.push(event.type);
      },
    });
    // Observe settlement before cleanup aborts the turn. No endless polling
    // task survives this race. Match the issue's three-second observation.
    const outcome = await Promise.race([
      receivedStart,
      Promise.resolve(control.done).then(
        () => 'ended' as const,
        () => 'failed' as const,
      ),
      new Promise<'timeout'>(resolve => {
        timer = setTimeout(() => resolve('timeout'), 3000);
      }),
    ]);
    const result = { outcome, accepted, legs, frames: [...frames], events };
    console.log(
      `${drop ? 'dropped leg' : 'control'}: ${JSON.stringify(result)}`,
    );
    return result;
  } finally {
    if (timer) clearTimeout(timer);
    abort.abort();
    try {
      await started?.doDestroy?.();
    } finally {
      for (const client of server.clients) client.terminate();
      await new Promise<void>((resolve, reject) => {
        server.close(error => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  }
}

async function main() {
  const control = await turn(false);
  assert.equal(control.outcome, 'accepted', 'Control bridge must accept start');
  const dropped = await turn(true);
  // A valid fix may resend start OR terminate the turn. Do not prescribe
  // reconnect counts, exact frame ordering, or how recovery is implemented.
  assert.ok(
    dropped.accepted ||
      dropped.outcome === 'ended' ||
      dropped.outcome === 'failed',
    'ISSUE-24201: bridge still waiting for start and turn still pending after reconnect',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
