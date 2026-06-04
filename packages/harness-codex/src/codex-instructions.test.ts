import type {
  HarnessV1ResumeState,
  HarnessV1SandboxHandle,
  HarnessV1Session,
} from '@ai-sdk/harness';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The codex adapter sends `instructions` over the channel inside the `start`
 * message. We stub `SandboxChannel` so `send()` records the messages instead
 * of opening a real WebSocket, then drive `doStart` → `doPromptTurn` against a
 * fake sandbox handle. This isolates the "prepend to the first user message
 * only" gating without standing up the in-sandbox bridge.
 */
const sentMessages: Array<Record<string, unknown>> = [];

vi.mock('@ai-sdk/harness/channel', () => {
  class FakeSandboxChannel {
    async open(): Promise<void> {}
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
    close(): void {}
  }
  return { SandboxChannel: FakeSandboxChannel };
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

function fakeHandle(): HarnessV1SandboxHandle {
  const port = 4317;
  return {
    id: 'sbx',
    defaultWorkingDirectory: '/wd',
    ports: [port],
    getPortUrl: async () => `ws://127.0.0.1:${port}`,
    stop: async () => {},
    session: {
      run: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
      readTextFile: async () => null,
      spawn: async () => ({
        stdout: readyStream(port),
        stderr: emptyStream(),
        kill: async () => {},
        wait: async () => ({ exitCode: 0 }),
      }),
    },
  } as unknown as HarnessV1SandboxHandle;
}

async function startSession(options?: {
  resumeFrom?: HarnessV1ResumeState;
}): Promise<HarnessV1Session> {
  const harness = createCodex();
  return harness.doStart({
    sessionId: 's1',
    sandboxHandle: fakeHandle(),
    sessionWorkDir: '/wd/codex-s1',
    ...(options?.resumeFrom ? { resumeFrom: options.resumeFrom } : {}),
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
