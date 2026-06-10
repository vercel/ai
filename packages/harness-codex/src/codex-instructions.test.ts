import type {
  HarnessV1ContinueTurnState,
  HarnessV1NetworkSandboxSession,
  HarnessV1ResumeSessionState,
  HarnessV1Session,
} from '@ai-sdk/harness';
import type * as HarnessUtils from '@ai-sdk/harness/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The codex adapter sends `instructions` over the channel inside the `start`
 * message. We stub `SandboxChannel` so `send()` records the messages instead
 * of opening a real WebSocket, then drive `doStart` → `doPromptTurn` against a
 * fake network sandbox session. This isolates the "prepend to the first user
 * message only" gating without standing up the in-sandbox bridge.
 */
const sentMessages: Array<Record<string, unknown>> = [];
const openCalls: Array<{ resume?: boolean } | undefined> = [];

vi.mock('@ai-sdk/harness/utils', async importOriginal => {
  const actual = await importOriginal<typeof HarnessUtils>();
  class FakeSandboxChannel {
    async open(opts?: { resume?: boolean }): Promise<void> {
      openCalls.push(opts);
    }
    on(): () => void {
      return () => {};
    }
    onClose(): void {}
    send(msg: Record<string, unknown>): void {
      sentMessages.push(msg);
    }
    beginClose(): void {}
    isClosed(): boolean {
      return false;
    }
    async suspend(): Promise<number> {
      return 7;
    }
    close(): void {}
  }
  return { ...actual, SandboxChannel: FakeSandboxChannel };
});

// eslint-disable-next-line import/first
import { createCodex } from './codex-harness';

function readyStream(port: number): ReadableStream<Uint8Array> {
  const line =
    JSON.stringify({
      type: 'bridge-ready',
      port,
    }) + '\n';
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(line));
      controller.close();
    },
  });
}

function emptyStream(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.close();
    },
  });
}

function fakeNetworkSandboxSession(): HarnessV1NetworkSandboxSession {
  const port = 4317;
  const session = {
    run: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    readTextFile: async () => null,
    spawn: async () => ({
      stdout: readyStream(port),
      stderr: emptyStream(),
      kill: async () => {},
      wait: async () => ({ exitCode: 0 }),
    }),
  };
  return {
    id: 'sbx',
    defaultWorkingDirectory: '/wd',
    ports: [port],
    getPortUrl: async () => `ws://127.0.0.1:${port}`,
    stop: async () => {},
    restricted: () => session,
    ...session,
  } as unknown as HarnessV1NetworkSandboxSession;
}

async function startSession(options?: {
  resumeFrom?: HarnessV1ResumeSessionState;
  continueFrom?: HarnessV1ContinueTurnState;
}): Promise<HarnessV1Session> {
  const harness = createCodex();
  return harness.doStart({
    sessionId: 's1',
    sandboxSession: fakeNetworkSandboxSession(),
    sessionWorkDir: '/wd/codex-s1',
    ...(options?.resumeFrom ? { resumeFrom: options.resumeFrom } : {}),
    ...(options?.continueFrom ? { continueFrom: options.continueFrom } : {}),
  });
}

function lastStart(): Record<string, unknown> {
  const start = [...sentMessages].reverse().find(m => m.type === 'start');
  if (!start) throw new Error('no start message was sent');
  return start;
}

describe('codex adapter — instructions gating', () => {
  beforeEach(() => {
    sentMessages.length = 0;
    openCalls.length = 0;
  });

  it('prepends instructions on the first user message only', async () => {
    const session = await startSession();

    await session.doPromptTurn({
      prompt: 'first turn',
      instructions: 'Use turbo build --concurrency=4.',
      emit: () => {},
    });
    expect(lastStart().instructions).toBe('Use turbo build --concurrency=4.');

    await session.doPromptTurn({
      prompt: 'second turn',
      instructions: 'Use turbo build --concurrency=4.',
      emit: () => {},
    });
    expect(lastStart().instructions).toBeUndefined();
  });

  it('does not apply instructions when resuming a session', async () => {
    const session = await startSession({
      resumeFrom: {
        type: 'resume-session',
        harnessId: 'codex',
        specificationVersion: 'harness-v1',
        data: { threadId: 'thread-abc' },
      },
    });

    await session.doPromptTurn({
      prompt: 'resumed turn',
      instructions: 'Use turbo build --concurrency=4.',
      emit: () => {},
    });
    expect(lastStart().instructions).toBeUndefined();
  });
});

describe('codex adapter — attach replay mode', () => {
  beforeEach(() => {
    sentMessages.length = 0;
    openCalls.length = 0;
  });

  it('attaches a parked session without replaying old turn events', async () => {
    const session = await startSession({
      resumeFrom: {
        type: 'resume-session',
        harnessId: 'codex',
        specificationVersion: 'harness-v1',
        data: {
          threadId: 'thread-abc',
          bridge: {
            port: 4317,
            token: 'token',
            lastSeenEventId: 7,
          },
        },
      },
    });

    expect(openCalls.at(-1)).toBeUndefined();

    await session.doPromptTurn({
      prompt: 'next user turn',
      emit: () => {},
    });
    expect(lastStart()).toMatchObject({
      type: 'start',
      prompt: 'next user turn',
    });
    expect(lastStart().resumeThreadId).toBeUndefined();
  });

  it('attaches a suspended turn by requesting replay from the cursor', async () => {
    await startSession({
      continueFrom: {
        type: 'continue-turn',
        harnessId: 'codex',
        specificationVersion: 'harness-v1',
        data: {
          threadId: 'thread-abc',
          bridge: {
            port: 4317,
            token: 'token',
            lastSeenEventId: 7,
          },
        },
      },
    });

    expect(openCalls.at(-1)).toEqual({ resume: true });
  });

  it('marks detach as parked and suspend as replayable', async () => {
    const detached = await (await startSession()).doDetach();
    expect(detached.type).toBe('resume-session');
    expect(
      (
        detached.data as {
          bridge?: {
            lastSeenEventId?: number;
          };
        }
      ).bridge,
    ).toMatchObject({ lastSeenEventId: 7 });

    const suspended = await (await startSession()).doSuspendTurn();
    expect(suspended.type).toBe('continue-turn');
    expect(
      (
        suspended.data as {
          bridge?: {
            lastSeenEventId?: number;
          };
        }
      ).bridge,
    ).toMatchObject({ lastSeenEventId: 7 });
  });
});
