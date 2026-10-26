import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createConnection, createServer, type Socket } from 'node:net';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { runBridge } from '@ai-sdk/harness/bridge';
import { SandboxChannel } from '@ai-sdk/harness/utils';
import { WebSocket } from 'ws';
import { z } from 'zod/v4';

// Real shared transport/runtime, no model, harness adapter, or provider required.
type Timing =
  | 'after-detected-close'
  | 'after-reconnect'
  | 'before-close-event'
  | 'remote-fin';
type Incoming =
  | { type: 'start' }
  | { type: 'resume'; lastSeenEventId: number }
  | { type: 'tool-result'; toolCallId: string; output: number };
type Outgoing =
  | { type: 'bridge-hello' }
  | { type: 'tool-call'; toolCallId: string }
  | { type: 'tool-result'; output: unknown }
  | { type: 'finish' };

async function waitUntil(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 3000;
  while (!predicate()) {
    assert.ok(
      Date.now() < deadline,
      'Scenario setup/downstream wait timed out',
    );
    await sleep(5);
  }
}

async function scenario(timing: Timing): Promise<boolean> {
  const stateDir = await mkdtemp(resolve('.issue-23317-'));
  let release!: () => void;
  const completed = new Promise<void>(r => (release = r));
  let starts = 0;
  let waiterResolved = false;
  const bridge = await runBridge<{ type: 'start' }>({
    bridgeType: 'test',
    bridgeStateDir: stateDir,
    port: 0,
    token: 'issue-23317',
    onStart: async (_start, turn) => {
      starts++;
      turn.emit({ type: 'tool-call', toolCallId: 'host-1' });
      const result = await turn.requestToolResult('host-1');
      waiterResolved = true;
      turn.emit({ type: 'tool-result', output: result.output });
      turn.emit({ type: 'finish' });
    },
    onExit: () => {},
  });

  // Transparent byte relay: forwards all bytes in both directions; never
  // interprets, filters, or drops tool-result frames. Used only for remote FIN.
  const relaySockets: Socket[] = [];
  const peers: Socket[] = [];
  const relay = createServer(peer => {
    const upstream = createConnection({ host: '127.0.0.1', port: bridge.port });
    peers.push(peer);
    relaySockets.push(peer, upstream);
    peer.on('error', () => upstream.destroy());
    upstream.on('error', () => peer.destroy());
    peer.pipe(upstream);
    upstream.pipe(peer);
  });
  let port = bridge.port;
  if (timing === 'remote-fin') {
    await new Promise<void>(r => relay.listen(0, '127.0.0.1', r));
    const address = relay.address();
    assert.ok(address && typeof address !== 'string');
    port = address.port;
  }
  const sockets: WebSocket[] = [];
  const debug: string[] = [];
  const channel = new SandboxChannel<Outgoing, Incoming>({
    connect: () =>
      new Promise<WebSocket>((accept, reject) => {
        const ws = new WebSocket(
          `ws://127.0.0.1:${port}/?agent_bridge_token=issue-23317`,
        );
        sockets.push(ws);
        ws.once('open', () => accept(ws));
        ws.once('error', reject);
      }),
    outboundSchema: z.discriminatedUnion('type', [
      z.object({ type: z.literal('bridge-hello') }),
      z.object({ type: z.literal('tool-call'), toolCallId: z.string() }),
      z.object({ type: z.literal('tool-result'), output: z.unknown() }),
      z.object({ type: z.literal('finish') }),
    ]),
    reconnect: { initialDelayMs: 5, maxDelayMs: 20, maxElapsedMs: 2000 },
    onDebug: event => debug.push(event.event),
  });
  try {
    let callSeen = false;
    let executions = 0;
    let stateAtSend: number | undefined;
    let closeDetected = false;
    let closeDetectedAtSend = false;
    let closedCode: number | undefined;
    let finished = false;
    const received: unknown[] = [];
    const sendErrors: unknown[] = [];
    const result: Incoming = {
      type: 'tool-result',
      toolCallId: 'host-1',
      output: 42,
    };
    channel.onClose(code => (closedCode = code));
    channel.on('tool-result', event => received.push(event.output));
    channel.on('finish', () => (finished = true));
    channel.on('tool-call', () => {
      callSeen = true;
      void completed.then(() => {
        executions++;
        stateAtSend = sockets[0].readyState;
        closeDetectedAtSend = closeDetected;
        try {
          channel.send(result);
        } catch (error) {
          sendErrors.push(error);
        }
      });
    });
    await channel.open();
    channel.send({ type: 'start' });
    await waitUntil(() => callSeen);
    const closed = new Promise<void>(r =>
      sockets[0].once('close', () => {
        closeDetected = true;
        r();
      }),
    );
    if (timing === 'remote-fin') {
      // ws installs its socket end handler first. At this callback it has
      // entered CLOSING, but has not emitted the asynchronous close event.
      const tcp = (sockets[0] as WebSocket & { _socket: Socket })._socket;
      tcp.once('end', release);
      peers[0].end();
    } else {
      sockets[0].terminate();
      if (timing === 'after-detected-close') await closed;
      if (timing === 'after-reconnect') {
        await waitUntil(() => debug.includes('reconnected'));
      }
      release();
    }
    await waitUntil(() => debug.includes('reconnected'));
    await sleep(1000);
    assert.equal(executions, 1);
    assert.equal(starts, 1);
    assert.ok(sockets.length >= 2, 'Expected a replacement connection');
    assert.equal(closedCode, undefined);
    // The preferred contract is automatic delivery. The report also permits
    // an explicit rejection instead of silently accepting and discarding.
    assert.ok(sendErrors.length <= 1);
    // Explicit rejection is permitted for the closing window; its error type
    // and wording are not part of the reported delivery contract.
    if (timing === 'after-detected-close' || timing === 'after-reconnect') {
      assert.deepEqual(sendErrors, []);
    }
    if (timing === 'before-close-event' || timing === 'remote-fin') {
      assert.equal(stateAtSend, WebSocket.CLOSING);
      assert.equal(closeDetectedAtSend, false);
    }
    const delivered =
      waiterResolved && finished && received.length === 1 && received[0] === 42;
    console.log(
      JSON.stringify({
        timing,
        stateAtSend,
        closeDetectedAtSend,
        executions,
        starts,
        connections: sockets.length,
        submissionRejected: sendErrors.length > 0,
        waiterResolved,
        received,
        finished,
      }),
    );
    if (!waiterResolved) {
      // Confirm the original waiter is live, without re-executing host work
      // or starting a new turn. Capture the pre-resend outcome above.
      channel.send(result);
      await waitUntil(() => finished);
      console.log(`${timing}: manual resend resolved the original waiter`);
    }
    // Assert terminal delivery after any diagnostic resend, not the stale
    // pending state captured above. These also pass with automatic delivery
    // or an explicit rejection followed by a caller retry.
    await waitUntil(() => finished);
    assert.equal(waiterResolved, true);
    assert.deepEqual(received, [42]);
    assert.equal(executions, 1);
    assert.equal(starts, 1);
    channel.close();
    await waitUntil(() => channel.isClosed());
    assert.throws(() => channel.send(result), /channel is closed/);
    return delivered || sendErrors.length === 1;
  } finally {
    channel.close();
    for (const ws of sockets) ws.terminate();
    for (const socket of relaySockets) socket.destroy();
    if (relay.listening) {
      await new Promise<void>((accept, reject) => {
        relay.close(error => {
          if (error) {
            reject(error);
            return;
          }
          accept();
        });
      });
    }
    await bridge.close();
    await rm(stateDir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const failures: Timing[] = [];
  for (const timing of [
    'after-detected-close',
    'after-reconnect',
    'before-close-event',
    'remote-fin',
  ] as const) {
    if (!(await scenario(timing))) failures.push(timing);
  }
  assert.deepEqual(
    failures,
    [],
    'ISSUE-23317: completed host tool result lost after successful reconnect',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
