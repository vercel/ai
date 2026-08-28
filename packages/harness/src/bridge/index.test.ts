import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { runBridge, type BridgeHandle, type BridgeTurn } from './index';

const TOKEN = 'test-token';
const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

/** Start a bridge whose `onStart` is driven by the test. */
async function startBridge({
  onStart,
  onStop,
  turnTeardownGraceMs,
}: {
  onStart: (start: { type: 'start' }, turn: BridgeTurn) => Promise<void>;
  onStop?: () => unknown;
  turnTeardownGraceMs?: number;
}): Promise<BridgeHandle> {
  const handle = await runBridge<{ type: 'start' }>({
    bridgeType: 'test',
    bridgeStateDir: `${process.env.TMPDIR ?? '/tmp'}/harness-bridge-test-${Math.floor(performance.now())}`,
    port: 0,
    token: TOKEN,
    onStart,
    ...(onStop ? { onStop } : {}),
    ...(turnTeardownGraceMs != null ? { turnTeardownGraceMs } : {}),
    // Never call process.exit from a test.
    onExit: () => {},
  });
  cleanups.push(() => handle.close());
  return handle;
}

type Client = {
  ws: WebSocket;
  frames: Array<Record<string, unknown>>;
  /** Resolve once a frame matching `pred` arrives (checks backlog first). */
  waitFor(
    pred: (f: Record<string, unknown>) => boolean,
  ): Promise<Record<string, unknown>>;
  send(msg: object): void;
  /** Send a frame the protocol cannot parse. */
  sendRaw(text: string): void;
  /** `seq` of every event frame received, in arrival order. */
  seqs(): number[];
  close(): void;
};

function connect(port: number): Promise<Client> {
  const ws = new WebSocket(
    `ws://127.0.0.1:${port}/?agent_bridge_token=${TOKEN}`,
  );
  const frames: Array<Record<string, unknown>> = [];
  const waiters: Array<{
    pred: (f: Record<string, unknown>) => boolean;
    resolve: (f: Record<string, unknown>) => void;
  }> = [];
  ws.on('message', raw => {
    const frame = JSON.parse(raw.toString('utf8')) as Record<string, unknown>;
    frames.push(frame);
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].pred(frame)) {
        waiters[i].resolve(frame);
        waiters.splice(i, 1);
      }
    }
  });
  const client: Client = {
    ws,
    frames,
    waitFor(pred) {
      const existing = frames.find(pred);
      if (existing) return Promise.resolve(existing);
      return new Promise(resolve => waiters.push({ pred, resolve }));
    },
    send(msg) {
      ws.send(JSON.stringify(msg));
    },
    sendRaw(text) {
      ws.send(text);
    },
    seqs() {
      return frames
        .map(f => f.seq)
        .filter((seq): seq is number => typeof seq === 'number');
    },
    close() {
      ws.close();
    },
  };
  cleanups.push(() => ws.close());
  return new Promise(resolve => ws.on('open', () => resolve(client)));
}

describe('runBridge', () => {
  it('rejects when the requested port is already in use', async () => {
    const handle = await startBridge({ onStart: async () => {} });

    await expect(
      runBridge<{ type: 'start' }>({
        bridgeType: 'test',
        bridgeStateDir: `${process.env.TMPDIR ?? '/tmp'}/harness-bridge-port-conflict`,
        port: handle.port,
        token: TOKEN,
        onStart: async () => {},
        onExit: () => {},
      }),
    ).rejects.toMatchObject({ code: 'EADDRINUSE' });
  });

  it('greets with bridge-hello and stamps a monotonic seq on emitted events', async () => {
    const handle = await startBridge({
      onStart: async (_start, turn) => {
        turn.emit({ type: 'text-delta', delta: 'a' });
        turn.emit({ type: 'text-delta', delta: 'b' });
        turn.emit({ type: 'finish' });
      },
    });
    const client = await connect(handle.port);

    const hello = await client.waitFor(f => f.type === 'bridge-hello');
    expect(hello).toMatchObject({
      type: 'bridge-hello',
      state: 'waiting',
      capabilities: { experimental_userMessageResponses: true },
    });

    client.send({ type: 'start' });
    await client.waitFor(f => f.type === 'finish');

    const events = client.frames.filter(
      f => f.type === 'text-delta' || f.type === 'finish',
    );
    expect(events.map(e => e.seq)).toEqual([1, 2, 3]);
  });

  it('withholds live events from a replacement connection until replay completes', async () => {
    let release!: () => void;
    const gate = new Promise<void>(r => (release = r));
    let resolveTurnFinished!: () => void;
    const turnFinished = new Promise<void>(resolve => {
      resolveTurnFinished = resolve;
    });
    const handle = await startBridge({
      onStart: async (_start, turn) => {
        turn.emit({ type: 'text-delta', delta: 'one' }); // seq 1
        turn.emit({ type: 'text-delta', delta: 'two' }); // seq 2
        await gate;
        // Emitted AFTER the first client dropped — proves the turn was not
        // aborted by the disconnect.
        turn.emit({ type: 'text-delta', delta: 'three' }); // seq 3
        turn.emit({ type: 'finish' }); // seq 4
        resolveTurnFinished();
      },
    });

    const a = await connect(handle.port);
    await a.waitFor(f => f.type === 'bridge-hello');
    a.send({ type: 'start' });
    await a.waitFor(f => f.seq === 2);

    // Drop A mid-turn, reconnect as B, resume from cursor 2.
    a.close();
    const b = await connect(handle.port);
    await b.waitFor(f => f.type === 'bridge-hello');

    // Let the turn finish; B must receive only seq > 2 (no replay of 1/2).
    release();
    await turnFinished;

    b.send({ type: 'resume', lastSeenEventId: 2 });
    await b.waitFor(f => f.seq === 4);

    const events = b.frames.filter(f => typeof f.seq === 'number');
    expect(events).toEqual([
      expect.objectContaining({
        type: 'text-delta',
        delta: 'three',
        seq: 3,
      }),
      expect.objectContaining({ type: 'finish', seq: 4 }),
    ]);
  });

  it('routes a host tool result back to the awaiting requestToolResult', async () => {
    const handle = await startBridge({
      onStart: async (_start, turn) => {
        turn.emit({
          type: 'tool-call',
          toolCallId: 'tc1',
          toolName: 'foo',
          input: '{}',
        });
        const result = await turn.requestToolResult('tc1');
        turn.emit({ type: 'tool-observed', output: result.output });
        turn.emit({ type: 'finish' });
      },
    });
    const client = await connect(handle.port);
    await client.waitFor(f => f.type === 'bridge-hello');
    client.send({ type: 'start' });
    await client.waitFor(f => f.type === 'tool-call');
    client.send({ type: 'tool-result', toolCallId: 'tc1', output: 'OK' });
    const observed = await client.waitFor(f => f.type === 'tool-observed');
    expect(observed.output).toBe('OK');
  });

  it('acknowledges a user message after the adapter accepts it', async () => {
    let releaseTurn!: () => void;
    const turnReleased = new Promise<void>(resolve => {
      releaseTurn = resolve;
    });
    const pendingCounts: number[] = [];
    const handle = await startBridge({
      onStart: async (_start, turn) => {
        pendingCounts.push(turn.experimental_userMessages.pendingCount);
        for await (const message of turn.experimental_userMessages) {
          pendingCounts.push(turn.experimental_userMessages.pendingCount);
          turn.emit({ type: 'user-message-observed', text: message.text });
          message.accept();
          pendingCounts.push(turn.experimental_userMessages.pendingCount);
          await turnReleased;
          return;
        }
      },
    });
    const client = await connect(handle.port);
    await client.waitFor(f => f.type === 'bridge-hello');
    client.send({ type: 'start' });
    client.send({
      type: 'user-message',
      messageId: 'message-1',
      text: 'Change course.',
    });

    await expect(
      client.waitFor(f => f.type === 'user-message-response'),
    ).resolves.toMatchObject({
      type: 'user-message-response',
      messageId: 'message-1',
      accepted: true,
    });
    await expect(
      client.waitFor(f => f.type === 'user-message-observed'),
    ).resolves.toMatchObject({ text: 'Change course.' });
    expect(pendingCounts).toEqual([0, 1, 0]);
    releaseTurn();
  });

  it('accepts the original user-message payload without a messageId', async () => {
    const handle = await startBridge({
      onStart: async (_start, turn) => {
        for await (const message of turn.experimental_userMessages) {
          message.accept();
          return;
        }
      },
    });
    const client = await connect(handle.port);
    await client.waitFor(f => f.type === 'bridge-hello');
    client.send({ type: 'start' });
    client.send({ type: 'user-message', text: '/compact' });

    await expect(
      client.waitFor(f => f.type === 'user-message-response'),
    ).resolves.toMatchObject({
      messageId: expect.any(String),
      accepted: true,
    });
  });

  it('rejects user messages from a connection that does not own the turn', async () => {
    let releaseTurn!: () => void;
    const turnReleased = new Promise<void>(resolve => {
      releaseTurn = resolve;
    });
    let userMessages: BridgeTurn['experimental_userMessages'] | undefined;
    const handle = await startBridge({
      onStart: async (_start, turn) => {
        userMessages = turn.experimental_userMessages;
        await turnReleased;
      },
    });
    const owner = await connect(handle.port);
    await owner.waitFor(f => f.type === 'bridge-hello');
    owner.send({ type: 'start' });
    await vi.waitFor(() => expect(userMessages).toBeDefined());

    const other = await connect(handle.port);
    await other.waitFor(f => f.type === 'bridge-hello');
    other.send({
      type: 'user-message',
      messageId: 'message-1',
      text: 'Change course.',
    });

    await expect(
      other.waitFor(f => f.type === 'user-message-response'),
    ).resolves.toMatchObject({
      messageId: 'message-1',
      accepted: false,
      error: {
        message: 'The connection does not own the active bridge turn.',
      },
    });
    expect(userMessages?.pendingCount).toBe(0);
    releaseTurn();
  });

  it('deduplicates retried user messages by messageId', async () => {
    let releaseTurn!: () => void;
    const turnReleased = new Promise<void>(resolve => {
      releaseTurn = resolve;
    });
    let observedCount = 0;
    const handle = await startBridge({
      onStart: async (_start, turn) => {
        for await (const message of turn.experimental_userMessages) {
          observedCount++;
          message.accept();
          await turnReleased;
          return;
        }
      },
    });
    const client = await connect(handle.port);
    await client.waitFor(f => f.type === 'bridge-hello');
    client.send({ type: 'start' });
    const request = {
      type: 'user-message',
      messageId: 'message-1',
      text: 'Change course.',
    };
    client.send(request);
    await client.waitFor(f => f.type === 'user-message-response');
    client.send(request);

    await vi.waitFor(() => {
      expect(
        client.frames.filter(f => f.type === 'user-message-response'),
      ).toHaveLength(2);
    });
    expect(observedCount).toBe(1);
    releaseTurn();
  });

  it('rejects a user message when no turn is active', async () => {
    const handle = await startBridge({ onStart: async () => {} });
    const client = await connect(handle.port);
    await client.waitFor(f => f.type === 'bridge-hello');
    client.send({
      type: 'user-message',
      messageId: 'message-1',
      text: 'Too late.',
    });

    await expect(
      client.waitFor(f => f.type === 'user-message-response'),
    ).resolves.toMatchObject({
      messageId: 'message-1',
      accepted: false,
      error: { message: 'The bridge has no active turn to steer.' },
    });
  });

  it('reports non-fatal bridge warnings to stderr without emitting stream errors', async () => {
    const stderrLines: string[] = [];
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(((
      chunk: string | Uint8Array,
      encodingOrCallback?:
        | BufferEncoding
        | ((err?: Error | null | undefined) => void),
      callback?: (err?: Error | null | undefined) => void,
    ) => {
      stderrLines.push(
        typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString(),
      );
      const cb =
        typeof encodingOrCallback === 'function'
          ? encodingOrCallback
          : callback;
      cb?.();
      return true;
    }) as typeof process.stderr.write);

    try {
      const handle = await startBridge({
        onStart: async (_start, turn) => {
          turn.emitWarning({ message: 'watch this' });
          turn.emit({ type: 'finish' });
        },
      });
      const client = await connect(handle.port);
      await client.waitFor(f => f.type === 'bridge-hello');
      client.send({ type: 'start' });
      await client.waitFor(f => f.type === 'finish');

      expect(stderrLines).toContain('[harness:test:warn] watch this\n');
      expect(client.frames.some(f => f.type === 'error')).toBe(false);
    } finally {
      writeSpy.mockRestore();
    }
  });

  it('reports bridge errors to stderr without stringifying the stream error value', async () => {
    const stderrLines: string[] = [];
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(((
      chunk: string | Uint8Array,
      encodingOrCallback?:
        | BufferEncoding
        | ((err?: Error | null | undefined) => void),
      callback?: (err?: Error | null | undefined) => void,
    ) => {
      stderrLines.push(
        typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString(),
      );
      const cb =
        typeof encodingOrCallback === 'function'
          ? encodingOrCallback
          : callback;
      cb?.();
      return true;
    }) as typeof process.stderr.write);

    try {
      const error = { name: 'AdapterError', data: { message: 'boom' } };
      const handle = await startBridge({
        onStart: async (_start, turn) => {
          turn.emitError({ error, message: 'adapter failed' });
          turn.emit({ type: 'finish' });
        },
      });
      const client = await connect(handle.port);
      await client.waitFor(f => f.type === 'bridge-hello');
      client.send({ type: 'start' });
      const errorFrame = await client.waitFor(f => f.type === 'error');
      await client.waitFor(f => f.type === 'finish');

      expect(errorFrame.error).toEqual(error);
      expect(stderrLines).toContain(
        '[harness:test:error] adapter failed: {"name":"AdapterError","data":{"message":"boom"}}\n',
      );
    } finally {
      writeSpy.mockRestore();
    }
  });

  it('clears the log per turn but keeps seq monotonic across turns', async () => {
    let turnNo = 0;
    const handle = await startBridge({
      onStart: async (_start, turn) => {
        turnNo++;
        turn.emit({ type: 'text-delta', delta: `t${turnNo}` });
        turn.emit({ type: 'finish' });
      },
    });
    const a = await connect(handle.port);
    await a.waitFor(f => f.type === 'bridge-hello');

    a.send({ type: 'start' });
    await a.waitFor(f => f.type === 'finish'); // seq 1,2

    a.send({ type: 'start' });
    await a.waitFor(f => f.seq === 4); // turn 2: seq 3,4 (monotonic, not reset)

    // A fresh connection that resumes from 0 sees ONLY the current turn's log
    // (turn 1's seq 1,2 were cleared at turn 2's start); seq stayed monotonic.
    const b = await connect(handle.port);
    await b.waitFor(f => f.type === 'bridge-hello');
    b.send({ type: 'resume', lastSeenEventId: 0 });
    await b.waitFor(f => f.seq === 4);

    const replayedSeqs = b.frames
      .filter(f => typeof f.seq === 'number')
      .map(f => f.seq);
    expect(replayedSeqs).toEqual([3, 4]);
  });

  it('serializes a start racing a slow turn teardown behind the old turn', async () => {
    // Reproduces the abort-then-immediate-retry race: the host settles an
    // aborted turn instantly, but the bridge's teardown (e.g. a graceful
    // interrupt) is still running when the caller's next `start` arrives.
    // Without a fence, the two turns overlap: the old turn keeps emitting
    // into the new turn's cleared event log while two runtime processes run
    // side by side.
    let active = 0;
    let maxActive = 0;
    let releaseTeardown!: () => void;
    const teardownGate = new Promise<void>(resolve => {
      releaseTeardown = resolve;
    });
    let turnNo = 0;
    const handle = await startBridge({
      onStart: async (_start, turn) => {
        active++;
        maxActive = Math.max(maxActive, active);
        if (++turnNo === 1) {
          // Wind down only after the host abort AND a further delay — the
          // window in which the replacement `start` arrives.
          await new Promise<void>(resolve => {
            if (turn.abortSignal.aborted) return resolve();
            turn.abortSignal.addEventListener('abort', () => resolve(), {
              once: true,
            });
          });
          await teardownGate;
          turn.emit({ type: 'text-delta', delta: 'late-from-old-turn' });
        } else {
          turn.emit({ type: 'text-delta', delta: 'new-turn' });
          turn.emit({ type: 'finish' });
        }
        active--;
      },
    });
    const client = await connect(handle.port);
    await client.waitFor(f => f.type === 'bridge-hello');

    client.send({ type: 'start' }); // turn 1
    client.send({ type: 'abort' }); // host settles the abort instantly…
    client.send({ type: 'start' }); // …and retries while teardown still runs
    setTimeout(releaseTeardown, 50);

    await client.waitFor(f => f.type === 'finish');

    // The turns never overlapped…
    expect(maxActive).toBe(1);
    // …and the old turn's late event was emitted before the new turn began,
    // so the new turn's log holds only its own events.
    const deltas = client.frames
      .filter(f => f.type === 'text-delta')
      .map(f => f.delta);
    expect(deltas.indexOf('late-from-old-turn')).toBeLessThan(
      deltas.indexOf('new-turn'),
    );
  });

  it('proceeds past a teardown that never settles instead of hanging', async () => {
    // The fence is best-effort: an adapter that ignores its abort signal
    // must not block the replacement turn forever. After the teardown grace
    // period the new turn proceeds anyway — the pre-fence overlapping
    // behavior — and the stale turn's eventual completion must not mark the
    // bridge waiting underneath the running replacement.
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>(resolve => {
      releaseFirst = resolve;
    });
    let releaseSecond!: () => void;
    const secondGate = new Promise<void>(resolve => {
      releaseSecond = resolve;
    });
    let turnNo = 0;
    const handle = await startBridge({
      turnTeardownGraceMs: 50,
      onStart: async (_start, turn) => {
        if (++turnNo === 1) {
          await firstGate; // ignores the abort entirely
        } else {
          turn.emit({ type: 'text-delta', delta: 'second-turn-live' });
          await secondGate;
          turn.emit({ type: 'finish' });
        }
      },
    });
    const client = await connect(handle.port);
    await client.waitFor(f => f.type === 'bridge-hello');

    client.send({ type: 'start' }); // turn 1: never settles
    client.send({ type: 'abort' });
    client.send({ type: 'start' }); // must not wait forever

    await client.waitFor(f => f.delta === 'second-turn-live');

    // The stale turn settles mid-replacement; the bridge must still report
    // the replacement turn as running.
    releaseFirst();
    await new Promise(resolve => setTimeout(resolve, 20));
    const probe = await connect(handle.port);
    const hello = await probe.waitFor(f => f.type === 'bridge-hello');
    expect(hello.state).toBe('running');

    releaseSecond();
    await client.waitFor(f => f.type === 'finish');
  });

  it('emits bridge-stop runtime resume data from onStop', async () => {
    let exited = false;
    const handle = await runBridge<{ type: 'start' }>({
      bridgeType: 'test',
      bridgeStateDir: `${process.env.TMPDIR ?? '/tmp'}/harness-bridge-stop`,
      port: 0,
      token: TOKEN,
      onStart: async () => {},
      onStop: () => ({ threadId: 'th_42' }),
      onExit: () => {
        exited = true;
      },
    });
    cleanups.push(() => handle.close());
    const client = await connect(handle.port);
    await client.waitFor(f => f.type === 'bridge-hello');
    client.send({ type: 'stop' });
    const stop = await client.waitFor(f => f.type === 'bridge-stop');
    expect(stop.data).toEqual({ threadId: 'th_42' });
    await new Promise(r => setTimeout(r, 50));
    expect(exited).toBe(true);
  });

  it('keeps streaming to the running turn when a second client connects to abort it', async () => {
    let aborted!: () => void;
    const abortObserved = new Promise<void>(r => (aborted = r));
    const handle = await startBridge({
      onStart: async (_start, turn) => {
        turn.emit({ type: 'text-delta', delta: 'one' }); // seq 1
        turn.abortSignal.addEventListener('abort', () => aborted(), {
          once: true,
        });
        await abortObserved;
        turn.emit({ type: 'aborted' }); // seq 2
        turn.emit({ type: 'finish' }); // seq 3
      },
    });

    const a = await connect(handle.port);
    await a.waitFor(f => f.type === 'bridge-hello');
    a.send({ type: 'start' });
    await a.waitFor(f => f.seq === 1);

    // The regression: a second client that connected only to abort used to
    // claim the stream on connect, so the turn's remaining events went to it
    // instead — and, with live delivery disabled there, nowhere at all.
    const b = await connect(handle.port);
    await b.waitFor(f => f.type === 'bridge-hello');
    b.send({ type: 'abort' });

    await a.waitFor(f => f.type === 'finish');
    expect(a.frames.map(f => f.type)).toEqual([
      'bridge-hello',
      'text-delta',
      'aborted',
      'finish',
    ]);
    expect(b.seqs()).toEqual([]);
  });

  it('hands the stream to whichever socket asks for the next turn', async () => {
    const handle = await startBridge({
      onStart: async (_start, turn) => turn.emit({ type: 'finish' }),
    });

    const a = await connect(handle.port);
    await a.waitFor(f => f.type === 'bridge-hello');
    a.send({ type: 'start' });
    await a.waitFor(f => f.type === 'finish');

    const b = await connect(handle.port);
    await b.waitFor(f => f.type === 'bridge-hello');
    b.send({ type: 'start' });
    await b.waitFor(f => f.type === 'finish');

    // The second turn streamed to B; A kept only the turn it asked for.
    expect(a.seqs()).toEqual([1]);
    expect(b.seqs()).toEqual([2]);
  });

  it('replies to the sending socket when it cannot parse a frame', async () => {
    const handle = await startBridge({
      onStart: async (_start, turn) => turn.emit({ type: 'finish' }),
    });

    const a = await connect(handle.port);
    await a.waitFor(f => f.type === 'bridge-hello');
    a.send({ type: 'start' });
    await a.waitFor(f => f.type === 'finish'); // A now owns the stream

    const b = await connect(handle.port);
    await b.waitFor(f => f.type === 'bridge-hello');
    b.sendRaw('not json');

    const error = await b.waitFor(f => f.type === 'error');
    expect(error.error).toContain('protocol parse error');
    expect(a.frames.some(f => f.type === 'error')).toBe(false);
  });

  it('runs onDestroy before exiting', async () => {
    let exited = false;
    const onDestroy = vi.fn(async () => {});
    const handle = await runBridge<{ type: 'start' }>({
      bridgeType: 'test',
      bridgeStateDir: `${process.env.TMPDIR ?? '/tmp'}/harness-bridge-destroy`,
      port: 0,
      token: TOKEN,
      onStart: async () => {},
      onDestroy,
      onExit: () => {
        exited = true;
      },
    });
    cleanups.push(() => handle.close());
    const client = await connect(handle.port);
    await client.waitFor(f => f.type === 'bridge-hello');
    client.send({ type: 'destroy' });
    await vi.waitFor(() => {
      expect(onDestroy).toHaveBeenCalledTimes(1);
      expect(exited).toBe(true);
    });
  });
});
