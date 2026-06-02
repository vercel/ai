import type {
  HarnessV1ResumeState,
  HarnessV1SandboxHandle,
  HarnessV1Session,
} from '@ai-sdk/harness';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The claude-code adapter prepends `instructions` to the user text it puts in
 * the `start` message's `prompt`. We stub `SandboxChannel` so `send()` records
 * the messages instead of opening a real WebSocket, then drive `doStart` →
 * `doPrompt` against a fake sandbox handle. This isolates the "prepend to the
 * first user message only" gating without standing up the in-sandbox bridge.
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
import { createClaudeCode } from './claude-code-harness';

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
  const port = 4319;
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
  const harness = createClaudeCode();
  return harness.doStart({
    sessionId: 's1',
    sandboxHandle: fakeHandle(),
    sessionWorkDir: '/wd/claude-code-s1',
    ...(options?.resumeFrom ? { resumeFrom: options.resumeFrom } : {}),
  });
}

function lastStart(): Record<string, unknown> {
  const start = [...sentMessages].reverse().find(m => m.type === 'start');
  if (!start) throw new Error('no start message was sent');
  return start;
}

const INSTRUCTIONS = 'Use turbo build --concurrency=4.';

describe('claude-code adapter — instructions gating', () => {
  beforeEach(() => {
    sentMessages.length = 0;
  });

  it('frames instructions into the first user message only', async () => {
    const session = await startSession();

    await session.doPrompt({
      prompt: 'first turn',
      instructions: INSTRUCTIONS,
      emit: () => {},
    });
    const framed = lastStart().prompt as string;
    expect(framed).toContain('<session-instructions>');
    expect(framed).toContain(INSTRUCTIONS);
    expect(framed).toContain('<user-message>\nfirst turn\n</user-message>');
    // The instructions must be marked as system guidance, not user-authored.
    expect(framed).toMatch(/not a message from the user/i);

    await session.doPrompt({
      prompt: 'second turn',
      instructions: INSTRUCTIONS,
      emit: () => {},
    });
    expect(lastStart().prompt).toBe('second turn');
  });

  it('does not apply instructions when resuming a session', async () => {
    const session = await startSession({
      resumeFrom: {
        harnessId: 'claude-code',
        specificationVersion: 'harness-v1',
        data: {},
      },
    });

    await session.doPrompt({
      prompt: 'resumed turn',
      instructions: INSTRUCTIONS,
      emit: () => {},
    });
    expect(lastStart().prompt).toBe('resumed turn');
  });
});
