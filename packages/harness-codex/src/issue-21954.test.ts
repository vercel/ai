import type {
  HarnessV1NetworkSandboxSession,
  HarnessV1ToolSpec,
} from '@ai-sdk/harness';
import type * as HarnessUtils from '@ai-sdk/harness/utils';
import { beforeEach, expect, it, vi } from 'vitest';

const channelMocks = vi.hoisted(() => {
  const sentMessages: Array<Record<string, unknown>> = [];
  const channels: FakeSandboxChannel[] = [];

  class FakeSandboxChannel {
    private readonly listeners = new Map<
      string,
      Array<(message: Record<string, unknown>) => void>
    >();

    constructor() {
      channels.push(this);
    }

    async open(): Promise<void> {}

    on(
      type: string,
      listener: (message: Record<string, unknown>) => void,
    ): () => void {
      const listeners = this.listeners.get(type) ?? [];
      listeners.push(listener);
      this.listeners.set(type, listeners);
      return () => {};
    }

    emit(type: string, message: Record<string, unknown>): void {
      for (const listener of this.listeners.get(type) ?? []) {
        listener(message);
      }
    }

    onReconnect(): () => void {
      return () => {};
    }

    onClose(): void {}

    send(message: Record<string, unknown>): void {
      sentMessages.push(message);
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

  return { channels, FakeSandboxChannel, sentMessages };
});

vi.mock('@ai-sdk/harness/utils', async importOriginal => {
  const actual = await importOriginal<typeof HarnessUtils>();
  return { ...actual, SandboxChannel: channelMocks.FakeSandboxChannel };
});

// eslint-disable-next-line import/first
import { createCodex } from './codex-harness';

function textStream(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (text.length > 0) {
        controller.enqueue(new TextEncoder().encode(text));
      }
      controller.close();
    },
  });
}

function fakeNetworkSandboxSession(): HarnessV1NetworkSandboxSession {
  const port = 4317;
  const restrictedSession = {
    run: async ({ command }: { command: string }) => ({
      exitCode: 0,
      stdout: command === 'printf "%s" "$HOME"' ? '/home/vercel-sandbox' : '',
      stderr: '',
    }),
    readTextFile: async () => null,
    writeTextFile: async () => {},
    spawn: async () => ({
      stdout: textStream(`{"type":"bridge-ready","port":${port}}\n`),
      stderr: textStream(''),
      kill: async () => {},
      wait: async () => ({ exitCode: 0 }),
    }),
  };

  return {
    id: 'issue-21954-sandbox',
    defaultWorkingDirectory: '/workdir',
    ports: [port],
    getPortEndpoint: async () => ({ url: `ws://127.0.0.1:${port}` }),
    getPortUrl: async () => `ws://127.0.0.1:${port}`,
    stop: async () => {},
    restricted: () => restrictedSession,
    ...restrictedSession,
  } as unknown as HarnessV1NetworkSandboxSession;
}

async function waitForStart(count: number): Promise<Record<string, unknown>> {
  await vi.waitFor(() => {
    expect(
      channelMocks.sentMessages.filter(message => message.type === 'start'),
    ).toHaveLength(count);
  });
  return channelMocks.sentMessages
    .filter(message => message.type === 'start')
    .at(-1)!;
}

beforeEach(() => {
  channelMocks.sentMessages.length = 0;
  channelMocks.channels.length = 0;
});

it('preserves the Codex thread when persisted tool keys are reordered', async () => {
  const toolsBefore: ReadonlyArray<HarnessV1ToolSpec> = [
    {
      name: 't',
      description: 'd',
      inputSchema: {
        type: 'object',
        properties: { a: { type: 'string' } },
        required: ['a'],
      },
    },
  ];
  const toolsAfter: ReadonlyArray<HarnessV1ToolSpec> = [
    {
      inputSchema: {
        required: ['a'],
        properties: { a: { type: 'string' } },
        type: 'object',
      },
      description: 'd',
      name: 't',
    },
  ];
  const harness = createCodex({
    auth: { OPENAI_API_KEY: 'not-used-by-reproduction' },
  });
  const sandboxSession = fakeNetworkSandboxSession();

  const firstSession = await harness.doStart({
    sessionId: 'issue-21954',
    sandboxSession,
    sessionWorkDir: '/workdir/issue-21954',
  });
  await firstSession.doPromptTurn({
    skills: [],
    tools: toolsBefore,
    prompt: 'first turn',
    instructions: 'x',
    emit: () => {},
  });
  await waitForStart(1);
  channelMocks.channels.at(-1)!.emit('bridge-thread', {
    type: 'bridge-thread',
    threadId: 'thread-with-history',
  });
  const persistedState = await firstSession.doDetach();

  const resumedSession = await harness.doStart({
    sessionId: 'issue-21954',
    sandboxSession,
    sessionWorkDir: '/workdir/issue-21954',
    resumeFrom: persistedState,
  });
  await resumedSession.doPromptTurn({
    skills: [],
    tools: toolsAfter,
    prompt: 'second turn',
    instructions: 'x',
    emit: () => {},
  });
  const resumedStart = await waitForStart(2);

  expect(
    resumedStart.restartThread,
    'ISSUE_21954: reordered value-equivalent tools spuriously restarted the Codex thread',
  ).toBeUndefined();
});

it('still restarts the Codex thread for a real configuration value change', async () => {
  const harness = createCodex({
    auth: { OPENAI_API_KEY: 'not-used-by-reproduction' },
  });
  const sandboxSession = fakeNetworkSandboxSession();
  const firstSession = await harness.doStart({
    sessionId: 'issue-21954-real-change',
    sandboxSession,
    sessionWorkDir: '/workdir/issue-21954-real-change',
  });

  await firstSession.doPromptTurn({
    skills: [],
    tools: [],
    prompt: 'first turn',
    instructions: 'before',
    emit: () => {},
  });
  await waitForStart(1);
  channelMocks.channels.at(-1)!.emit('bridge-thread', {
    type: 'bridge-thread',
    threadId: 'thread-with-history',
  });
  const persistedState = await firstSession.doDetach();
  const resumedSession = await harness.doStart({
    sessionId: 'issue-21954-real-change',
    sandboxSession,
    sessionWorkDir: '/workdir/issue-21954-real-change',
    resumeFrom: persistedState,
  });

  await resumedSession.doPromptTurn({
    skills: [],
    tools: [],
    prompt: 'second turn',
    instructions: 'after',
    emit: () => {},
  });
  const resumedStart = await waitForStart(2);

  expect(resumedStart.restartThread).toBe(true);
});
