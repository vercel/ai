import { once } from 'node:events';
import type { HarnessV1Diagnostic, HarnessV1StreamPart } from '@ai-sdk/harness';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocketServer, type WebSocket } from 'ws';
import { createClaudeCode } from './claude-code-harness';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()!();
});

async function createBridgeSession({
  onConnection,
  report,
  readTextFile = async () => null,
}: {
  onConnection: (socket: WebSocket) => void;
  report?: (event: HarnessV1Diagnostic) => void;
  readTextFile?: (options: { path: string }) => Promise<string | null>;
}) {
  const server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await once(server, 'listening');
  const address = server.address();
  if (address == null || typeof address === 'string')
    throw new Error('Expected a local port');
  server.on('connection', onConnection);
  cleanups.push(async () => {
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
  });
  const harness = createClaudeCode({
    auth: { ANTHROPIC_API_KEY: 'test' },
    port: 4000,
    turnStartTimeoutMs: 2_000,
  });
  const startOptions = {
    sandboxSession: {
      run: async ({ command }: { command: string }) => ({
        exitCode: 0,
        stdout: command.includes('$HOME') ? '/home/user' : '',
        stderr: '',
      }),
      readTextFile,
      writeTextFile: async () => {},
      spawn: async () => ({
        stdout: new Response('{"type":"bridge-ready","port":4000}\n').body,
        stderr: new Response('').body,
        kill: async () => {},
        wait: async () => ({ exitCode: 0 }),
      }),
      getPortEndpoint: async () => ({ url: `ws://127.0.0.1:${address.port}/` }),
    },
    sessionId: 's',
    sessionWorkDir: '/w',
    observability: { report },
  } as unknown as Parameters<typeof harness.doStart>[0];
  const session = await harness.doStart(startOptions);
  cleanups.push(async () => {
    await session.doDestroy();
  });
  return { session, harness, startOptions };
}

async function startTurn({
  drop,
  acceptBeforeDrop = false,
  finishBeforeReconnect = false,
  idempotentStart = true,
  startDuringReconnect = false,
  submitDuringReconnect = false,
  submitBeforeFirstEvent = false,
}: {
  drop: boolean;
  acceptBeforeDrop?: boolean;
  finishBeforeReconnect?: boolean;
  idempotentStart?: boolean;
  startDuringReconnect?: boolean;
  submitDuringReconnect?: boolean;
  submitBeforeFirstEvent?: boolean;
}) {
  const server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await once(server, 'listening');
  const address = server.address();
  if (address == null || typeof address === 'string') {
    throw new Error('Expected a local WebSocket port');
  }
  const frames: Array<{ leg: number; type: string; startId?: string }> = [];
  const acceptedIds = new Set<string>();
  let legs = 0;
  let state = 'waiting';
  let lastSeq = 0;
  let disconnectIdle: () => void;
  let sendReconnectHello: () => void;
  let resolveReconnect: () => void;
  const reconnecting = new Promise<void>(resolve => {
    resolveReconnect = resolve;
  });
  server.on('connection', socket => {
    const leg = ++legs;
    const sendHello = () => {
      socket.send(
        JSON.stringify({
          type: 'bridge-hello',
          state,
          lastSeq,
          capabilities: {
            idempotentStart,
            experimental_userMessageResponses:
              submitDuringReconnect || submitBeforeFirstEvent,
          },
        }),
      );
    };
    if (leg === 1) disconnectIdle = () => socket.close(1001, 'idle drop');
    if ((startDuringReconnect || submitDuringReconnect) && leg === 2) {
      sendReconnectHello = sendHello;
      resolveReconnect();
    } else {
      sendHello();
    }
    const finish = () => {
      state = 'waiting';
      lastSeq = 1;
      socket.send(
        JSON.stringify({
          type: 'finish',
          seq: 1,
          finishReason: { unified: 'stop', raw: 'stop' },
          totalUsage: { inputTokens: {}, outputTokens: {} },
        }),
      );
    };
    socket.on('message', raw => {
      const message = JSON.parse(String(raw)) as {
        type: string;
        startId?: string;
        messageId?: string;
      };
      frames.push({ leg, ...message });
      if (message.type === 'resume' && acceptedIds.size > 0) finish();
      if (message.type === 'user-message') {
        if (submitBeforeFirstEvent && leg === 1) return;
        const accepted = acceptedIds.size > 0;
        socket.send(
          JSON.stringify({
            type: 'user-message-response',
            messageId: message.messageId,
            accepted,
          }),
        );
        if (accepted && state === 'running') finish();
      }
      if (message.type !== 'start') return;
      if (drop && leg === (startDuringReconnect ? 2 : 1)) {
        if (acceptBeforeDrop) {
          acceptedIds.add(message.startId!);
          state = finishBeforeReconnect ? 'waiting' : 'running';
          lastSeq = finishBeforeReconnect ? 1 : 0;
        }
        socket.close(1001, 'leg dropped');
        return;
      }
      if (acceptedIds.has(message.startId!)) return;
      acceptedIds.add(message.startId!);
      state = 'running';
      if (!submitDuringReconnect && !submitBeforeFirstEvent) finish();
    });
  });
  const abort = new AbortController();
  cleanups.push(async () => {
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
  });
  const harness = createClaudeCode({
    auth: { ANTHROPIC_API_KEY: 'test' },
    port: 4000,
    turnStartTimeoutMs: 2_000,
  });
  const session = await harness.doStart({
    sandboxSession: {
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
      getPortEndpoint: async () => ({ url: `ws://127.0.0.1:${address.port}/` }),
    },
    sessionId: 's',
    sessionWorkDir: '/w',
  } as unknown as Parameters<typeof harness.doStart>[0]);
  cleanups.push(async () => {
    abort.abort();
    await session.doDestroy?.();
  });
  if (startDuringReconnect) {
    disconnectIdle!();
    await reconnecting;
  }
  const events: string[] = [];
  const control = await session.doPromptTurn({
    prompt: 'Hello',
    model: 'm',
    skills: [],
    tools: [],
    abortSignal: abort.signal,
    emit: event => events.push(event.type),
  });
  if (submitBeforeFirstEvent) {
    await Promise.all([control.submitUserMessage!('Follow-up'), control.done]);
  } else if (submitDuringReconnect) {
    await reconnecting;
    const submission = control.submitUserMessage!('Follow-up');
    sendReconnectHello!();
    await Promise.all([submission, control.done]);
  } else if (startDuringReconnect) {
    sendReconnectHello!();
  }
  return { control, frames, acceptedIds, events };
}

describe('Claude Code turn start delivery', () => {
  it.each([false, true])(
    'preserves turn identity and replay checkpoints across suspension (legacy state: %s)',
    async legacy => {
      let startId: string | undefined;
      let starts = 0;
      let resolveTail!: () => void;
      const tailReceived = new Promise<void>(resolve => {
        resolveTail = resolve;
      });
      const { session, harness, startOptions } = await createBridgeSession({
        report: event => {
          if (event.message === 'tail delivered') resolveTail();
        },
        onConnection: socket => {
          socket.send(
            JSON.stringify({
              type: 'bridge-hello',
              state: 'running',
              lastSeq: 6,
            }),
          );
          socket.on('message', raw => {
            const message = JSON.parse(String(raw)) as {
              type: string;
              startId?: string;
              lastSeenEventId?: number;
            };
            if (message.type === 'start') {
              starts++;
              startId = message.startId;
              for (const [index, event] of [
                { type: 'stream-start' },
                { type: 'text-start', id: 'text' },
                { type: 'text-delta', id: 'text', delta: 'first' },
                {
                  type: 'finish-step',
                  finishReason: { unified: 'stop' },
                  usage: { inputTokens: {}, outputTokens: {} },
                },
                { type: 'text-delta', id: 'text', delta: 'tail' },
                {
                  type: 'sandbox-log',
                  source: 'test',
                  stream: 'stdout',
                  line: 'tail delivered',
                },
              ].entries())
                socket.send(
                  JSON.stringify({ ...event, seq: index + 1, startId }),
                );
            }
            if (message.type === 'resume') {
              expect(message.lastSeenEventId).toBe(4);
              for (const [index, event] of [
                { type: 'text-delta', id: 'text', delta: 'tail' },
                { type: 'text-end', id: 'text' },
                {
                  type: 'finish',
                  finishReason: { unified: 'stop' },
                  totalUsage: { inputTokens: {}, outputTokens: {} },
                },
              ].entries())
                socket.send(
                  JSON.stringify({ ...event, seq: index + 5, startId }),
                );
            }
          });
        },
      });
      const first = await session.doPromptTurn({
        skills: [],
        tools: [],
        prompt: 'Work.',
        emit: event => {
          if (event.type === 'finish-step') {
            const checkpoint = Reflect.get(
              event,
              Symbol.for('vercel.ai.harness.sandboxChannelEventCheckpoint'),
            ) as { pin(): () => void };
            expect(checkpoint).toBeDefined();
            checkpoint.pin();
          }
        },
      });
      await tailReceived;
      const continueFrom = await session.doSuspendTurn!();
      await first.done;
      const bridge = (continueFrom.data as { bridge: { startId?: string } })
        .bridge;
      expect(bridge).toEqual(
        expect.objectContaining({ startId, lastSeenEventId: 4 }),
      );
      if (legacy) delete bridge.startId;
      const resumed = await harness.doStart({ ...startOptions, continueFrom });
      cleanups.push(async () => {
        await resumed.doDestroy();
      });
      const events: HarnessV1StreamPart[] = [];
      const continued = await resumed.doContinueTurn!({
        skills: [],
        tools: [],
        emit: event => events.push(event),
      });
      await continued.done;
      expect(starts).toBe(1);
      expect(events.map(event => event.type)).toEqual([
        'text-delta',
        'text-end',
        'finish',
      ]);
      expect(events.every(event => !('startId' in event))).toBe(true);
      const detached = await resumed.doDetach();
      expect(detached.data).toEqual(
        expect.objectContaining({
          bridge: expect.objectContaining({ startId }),
        }),
      );
    },
  );

  it.each(['replay', 'rerun'] as const)(
    'keeps the correct identifier during %s recovery',
    async recovery => {
      let leg = 0;
      const starts: string[] = [];
      const { harness, startOptions } = await createBridgeSession({
        readTextFile: async ({ path }) =>
          recovery === 'replay' && path.endsWith('/event-log.ndjson')
            ? '{"type":"finish"}\n'
            : null,
        onConnection: socket => {
          if (++leg === 2) {
            socket.close();
            return;
          }
          socket.send(
            JSON.stringify({
              type: 'bridge-hello',
              state: 'waiting',
              lastSeq: 3,
            }),
          );
          socket.on('message', raw => {
            const message = JSON.parse(String(raw)) as {
              type: string;
              startId?: string;
            };
            if (message.type === 'start') starts.push(message.startId!);
            if (message.type === 'start' || message.type === 'resume') {
              socket.send(
                JSON.stringify({
                  type: 'finish',
                  seq: 3,
                  startId: message.startId ?? 'suspended-turn',
                  finishReason: { unified: 'stop' },
                  totalUsage: { inputTokens: {}, outputTokens: {} },
                }),
              );
            }
          });
        },
      });
      const resumed = await harness.doStart({
        ...startOptions,
        continueFrom: {
          type: 'continue-turn',
          harnessId: 'claude-code',
          specificationVersion: 'harness-v1',
          data: {
            bridge: {
              port: 4000,
              token: 'test',
              lastSeenEventId: 1,
              startId: 'suspended-turn',
            },
          },
        },
      });
      cleanups.push(async () => {
        await resumed.doDestroy();
      });
      const events: HarnessV1StreamPart[] = [];
      const control = await resumed.doContinueTurn!({
        skills: [],
        tools: [],
        emit: event => events.push(event),
      });
      await control.done;
      expect(events.map(event => event.type)).toEqual(['finish']);
      if (recovery === 'replay') expect(starts).toEqual([]);
      else {
        expect(starts).toHaveLength(1);
        expect(starts[0]).not.toBe('suspended-turn');
      }
    },
  );

  it.each(['in-transit', 'buffered', 'replayed'] as const)(
    'isolates the next turn from %s events of an aborted turn',
    async delivery => {
      let firstId: string | undefined;
      let secondId: string | undefined;
      const starts: string[] = [];
      let sequence = 0;
      let leg = 0;
      let sendAnswer!: () => void;
      let resolveAnswerReady!: () => void;
      const answerReady = new Promise<void>(resolve => {
        resolveAnswerReady = resolve;
      });
      let resolveText!: () => void;
      const textReceived = new Promise<void>(resolve => {
        resolveText = resolve;
      });
      let resolveTail!: () => void;
      const tailReceived = new Promise<void>(resolve => {
        resolveTail = resolve;
      });
      const { session } = await createBridgeSession({
        report: event => {
          if (event.kind === 'log' && event.message === 'tail delivered')
            resolveTail();
        },
        onConnection: socket => {
          const currentLeg = ++leg;
          socket.send(
            JSON.stringify({
              type: 'bridge-hello',
              state: 'waiting',
              lastSeq: sequence,
              capabilities: { idempotentStart: true },
            }),
          );
          const send = (event: Record<string, unknown>) =>
            socket.send(JSON.stringify({ ...event, seq: ++sequence }));
          const sendTail = () => {
            for (const event of [
              { type: 'text-delta', id: 'old', delta: 'two' },
              { type: 'text-end', id: 'old' },
              { type: 'raw', rawValue: 'old' },
              {
                type: 'finish-step',
                finishReason: { unified: 'stop' },
                usage: { inputTokens: {}, outputTokens: {} },
              },
              {
                type: 'finish',
                finishReason: { unified: 'stop' },
                totalUsage: { inputTokens: {}, outputTokens: {} },
              },
              { type: 'error', error: 'old failure' },
            ])
              send({ ...event, startId: firstId });
            send({
              type: 'sandbox-log',
              source: 'test',
              stream: 'stdout',
              line: 'tail delivered',
            });
          };
          socket.on('message', raw => {
            const message = JSON.parse(String(raw)) as {
              type: string;
              startId: string;
            };
            if (message.type === 'abort' && delivery === 'buffered') sendTail();
            if (message.type === 'resume' && currentLeg === 2) sendTail();
            if (message.type !== 'start') return;
            starts.push(message.startId);
            if (firstId == null) {
              firstId = message.startId;
              send({ type: 'stream-start', startId: firstId });
              send({ type: 'text-start', id: 'old', startId: firstId });
              send({
                type: 'text-delta',
                id: 'old',
                delta: 'one',
                startId: firstId,
              });
              return;
            }
            secondId = message.startId;
            if (delivery === 'replayed' && currentLeg === 1) {
              sequence += 10;
              socket.close(1001, 'lost new start');
              return;
            }
            sendAnswer = () => {
              for (const event of [
                { type: 'stream-start' },
                { type: 'text-start', id: 'new' },
                { type: 'text-delta', id: 'new', delta: 'pineapple' },
                { type: 'text-end', id: 'new' },
                {
                  type: 'finish',
                  finishReason: { unified: 'stop' },
                  totalUsage: { inputTokens: {}, outputTokens: {} },
                },
              ])
                send({ ...event, startId: secondId });
            };
            resolveAnswerReady();
            if (delivery === 'in-transit') sendTail();
          });
        },
      });
      const abort = new AbortController();
      const first = await session.doPromptTurn({
        skills: [],
        tools: [],
        prompt: 'Count.',
        abortSignal: abort.signal,
        emit: event => {
          if (event.type === 'text-delta') resolveText();
        },
      });
      await textReceived;
      const aborted = expect(first.done).rejects.toThrow('cancelled');
      abort.abort(new Error('cancelled'));
      await aborted;
      if (delivery === 'buffered') await tailReceived;
      const events: HarnessV1StreamPart[] = [];
      const second = await session.doPromptTurn({
        skills: [],
        tools: [],
        prompt: 'Answer pineapple.',
        emit: event => events.push(event),
      });
      const settled = vi.fn();
      void Promise.resolve(second.done).then(settled, settled);
      await tailReceived;
      await answerReady;
      expect(events).toEqual([]);
      expect(settled).not.toHaveBeenCalled();
      sendAnswer();
      await second.done;
      expect(events.map(event => event.type)).toEqual([
        'stream-start',
        'text-start',
        'text-delta',
        'text-end',
        'finish',
      ]);
      expect(
        events
          .filter(event => event.type === 'text-delta')
          .map(event => event.delta),
      ).toEqual(['pineapple']);
      expect(events.every(event => !('startId' in event))).toBe(true);
      expect(secondId).not.toBe(firstId);
      expect(starts).toEqual(
        delivery === 'replayed'
          ? [firstId, secondId, secondId]
          : [firstId, secondId],
      );
    },
  );

  it('retries a lost start before resending a pending user message', async () => {
    const { control, frames, acceptedIds, events } = await startTurn({
      drop: true,
      submitBeforeFirstEvent: true,
    });
    await control.done;
    expect(
      frames.filter(frame => frame.leg === 2).map(frame => frame.type),
    ).toEqual(['resume', 'start', 'user-message']);
    expect(acceptedIds.size).toBe(1);
    expect(events).toEqual(['finish']);
  });

  it('retries a lost start before steering queued during reconnect', async () => {
    const { control, frames, acceptedIds, events } = await startTurn({
      drop: true,
      submitDuringReconnect: true,
    });
    await control.done;
    expect(
      frames.filter(frame => frame.leg === 2).map(frame => frame.type),
    ).toEqual(['resume', 'start', 'user-message']);
    expect(acceptedIds.size).toBe(1);
    expect(events).toEqual(['finish']);
  });

  it('starts a turn without a dropped connection', async () => {
    const { control, frames, acceptedIds, events } = await startTurn({
      drop: false,
    });
    await control.done;
    expect(acceptedIds.size).toBe(1);
    expect(frames.map(frame => frame.type)).toEqual(['start']);
    expect(events).toEqual(['finish']);
  });

  it('resends a lost start with the same identifier after reconnect', async () => {
    const { control, frames, acceptedIds, events } = await startTurn({
      drop: true,
    });
    await control.done;
    const starts = frames.filter(frame => frame.type === 'start');
    expect(starts.map(frame => frame.leg)).toEqual([1, 2]);
    expect(starts[0].startId).toBeTypeOf('string');
    expect(starts[1].startId).toBe(starts[0].startId);
    expect(acceptedIds.size).toBe(1);
    expect(events).toEqual(['finish']);
  });

  it.each([false, true])(
    'starts a turn submitted during an idle reconnect (idempotent starts: %s)',
    async idempotentStart => {
      const { control, frames, acceptedIds, events } = await startTurn({
        drop: false,
        startDuringReconnect: true,
        idempotentStart,
      });
      await control.done;
      expect(frames.map(frame => frame.type)).toEqual(['resume', 'start']);
      expect(frames.filter(frame => frame.type === 'start')[0].leg).toBe(2);
      expect(acceptedIds.size).toBe(1);
      expect(events).toEqual(['finish']);
    },
  );

  it.each([false, true])(
    'preserves queued start ordering before user messages (idempotent starts: %s)',
    async idempotentStart => {
      const { control, frames, events } = await startTurn({
        drop: false,
        startDuringReconnect: true,
        submitDuringReconnect: true,
        idempotentStart,
      });
      await control.done;
      expect(frames.slice(0, 3).map(frame => frame.type)).toEqual([
        'resume',
        'start',
        'user-message',
      ]);
      expect(frames.filter(frame => frame.type === 'start')).toHaveLength(1);
      expect(frames.some(frame => frame.type === 'abort')).toBe(false);
      expect(events).toEqual(['finish']);
    },
  );

  it.each([false, true])(
    'recovers a start first sent after an idle reconnect and then lost (idempotent starts: %s)',
    async idempotentStart => {
      const { control, frames, acceptedIds, events } = await startTurn({
        drop: true,
        startDuringReconnect: true,
        idempotentStart,
      });
      if (idempotentStart) {
        await control.done;
        const starts = frames.filter(frame => frame.type === 'start');
        expect(starts.map(frame => frame.leg)).toEqual([2, 3]);
        expect(starts[1].startId).toBe(starts[0].startId);
        expect(acceptedIds.size).toBe(1);
        expect(events).toEqual(['finish']);
      } else {
        await expect(control.done).rejects.toThrow(
          'does not support safe start retries',
        );
        expect(
          frames
            .filter(frame => frame.type === 'start')
            .map(frame => frame.leg),
        ).toEqual([2]);
      }
    },
  );

  it.each([
    { finishBeforeReconnect: false, idempotentStart: true },
    { finishBeforeReconnect: true, idempotentStart: true },
    { finishBeforeReconnect: false, idempotentStart: false },
    { finishBeforeReconnect: true, idempotentStart: false },
  ])(
    'does not duplicate an accepted turn (finished: $finishBeforeReconnect, idempotent starts: $idempotentStart)',
    async ({ finishBeforeReconnect, idempotentStart }) => {
      const { control, frames, acceptedIds, events } = await startTurn({
        drop: true,
        acceptBeforeDrop: true,
        finishBeforeReconnect,
        idempotentStart,
      });
      await control.done;
      expect(acceptedIds.size).toBe(1);
      expect(frames.filter(frame => frame.type === 'start')).toHaveLength(
        idempotentStart ? 2 : 1,
      );
      expect(
        new Set(
          frames
            .filter(frame => frame.type === 'start')
            .map(frame => frame.startId),
        ).size,
      ).toBe(1);
      expect(events).toEqual(['finish']);
    },
  );

  it('fails rather than hanging or retrying unsafely with an older waiting bridge', async () => {
    const { control, frames } = await startTurn({
      drop: true,
      idempotentStart: false,
    });
    await expect(control.done).rejects.toThrow(
      'does not support safe start retries',
    );
    expect(frames.filter(frame => frame.type === 'start')).toHaveLength(1);
  });
});
