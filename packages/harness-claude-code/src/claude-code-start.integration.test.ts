import { once } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocketServer } from 'ws';
import { createClaudeCode } from './claude-code-harness';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()!();
});

async function startTurn({
  drop,
  acceptBeforeDrop = false,
  finishBeforeReconnect = false,
  idempotentStart = true,
  startDuringReconnect = false,
  submitDuringReconnect = false,
}: {
  drop: boolean;
  acceptBeforeDrop?: boolean;
  finishBeforeReconnect?: boolean;
  idempotentStart?: boolean;
  startDuringReconnect?: boolean;
  submitDuringReconnect?: boolean;
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
            experimental_userMessageResponses: submitDuringReconnect,
          },
        }),
      );
    };
    if (leg === 1) disconnectIdle = () => socket.close(1001, 'idle drop');
    if (startDuringReconnect && leg === 2) {
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
      if (!submitDuringReconnect) finish();
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
  if (submitDuringReconnect) {
    const submission = control.submitUserMessage!('Follow-up');
    sendReconnectHello!();
    await Promise.all([submission, control.done]);
  } else if (startDuringReconnect) {
    sendReconnectHello!();
  }
  return { control, frames, acceptedIds, events };
}

describe('Claude Code turn start delivery', () => {
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
      expect(frames.filter(frame => frame.type === 'start')).toHaveLength(1);
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
