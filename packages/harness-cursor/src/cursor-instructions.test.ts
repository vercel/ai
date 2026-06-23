import type {
  HarnessV1ContinueTurnState,
  HarnessV1NetworkSandboxSession,
  HarnessV1ResumeSessionState,
  HarnessV1Session,
  HarnessV1Skill,
} from '@ai-sdk/harness';
import type * as HarnessUtils from '@ai-sdk/harness/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sentMessages: Array<Record<string, unknown>> = [];
const openCalls: Array<{ resume?: boolean } | undefined> = [];
const runCommands: Array<string> = [];
const spawnEnvs: Array<Record<string, string | undefined>> = [];
const writes: Array<{ path: string; content: string }> = [];

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
import { createCursor } from './cursor-harness';

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
    run: async (input: { command: string }) => {
      runCommands.push(input.command);
      if (input.command === 'printf "%s" "$HOME"') {
        return { exitCode: 0, stdout: '/home/vercel-sandbox', stderr: '' };
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    },
    readTextFile: async () => null,
    writeTextFile: async (input: { path: string; content: string }) => {
      writes.push({ path: input.path, content: input.content });
    },
    spawn: async (input: { env?: Record<string, string | undefined> }) => {
      spawnEnvs.push(input.env ?? {});
      return {
        stdout: readyStream(port),
        stderr: emptyStream(),
        kill: async () => {},
        wait: async () => ({ exitCode: 0 }),
      };
    },
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
  skills?: ReadonlyArray<HarnessV1Skill>;
  permissionMode?: 'allow-all' | 'allow-reads' | 'allow-edits';
}): Promise<HarnessV1Session> {
  const harness = createCursor();
  return harness.doStart({
    sessionId: 's1',
    sandboxSession: fakeNetworkSandboxSession(),
    sessionWorkDir: '/wd/cursor-s1',
    ...(options?.resumeFrom ? { resumeFrom: options.resumeFrom } : {}),
    ...(options?.continueFrom ? { continueFrom: options.continueFrom } : {}),
    ...(options?.skills ? { skills: options.skills } : {}),
    ...(options?.permissionMode
      ? { permissionMode: options.permissionMode }
      : {}),
  });
}

function lastStart(): Record<string, unknown> {
  const start = [...sentMessages].reverse().find(m => m.type === 'start');
  if (!start) throw new Error('no start message was sent');
  return start;
}

describe('cursor adapter — instructions gating', () => {
  beforeEach(() => {
    sentMessages.length = 0;
    openCalls.length = 0;
    runCommands.length = 0;
    spawnEnvs.length = 0;
    writes.length = 0;
    process.env.CURSOR_API_KEY = 'test-key';
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
        harnessId: 'cursor',
        specificationVersion: 'harness-v1',
        data: { agentId: 'agent-abc' },
      },
    });

    await session.doPromptTurn({
      prompt: 'resumed turn',
      instructions: 'Use turbo build --concurrency=4.',
      emit: () => {},
    });
    expect(lastStart().instructions).toBeUndefined();
  });

  it('maps permissionMode to autoReview on start', async () => {
    const session = await startSession({ permissionMode: 'allow-edits' });
    await session.doPromptTurn({
      prompt: 'hi',
      emit: () => {},
    });
    expect(lastStart().autoReview).toBe(true);
  });
});

describe('cursor adapter — attach replay mode', () => {
  beforeEach(() => {
    sentMessages.length = 0;
    openCalls.length = 0;
    runCommands.length = 0;
    spawnEnvs.length = 0;
    writes.length = 0;
    process.env.CURSOR_API_KEY = 'test-key';
  });

  it('attaches a parked session without replaying old turn events', async () => {
    const session = await startSession({
      resumeFrom: {
        type: 'resume-session',
        harnessId: 'cursor',
        specificationVersion: 'harness-v1',
        data: {
          agentId: 'agent-abc',
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
    expect(lastStart().resumeAgentId).toBeUndefined();
  });

  it('attaches a suspended turn by requesting replay from the cursor', async () => {
    await startSession({
      continueFrom: {
        type: 'continue-turn',
        harnessId: 'cursor',
        specificationVersion: 'harness-v1',
        data: {
          agentId: 'agent-abc',
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

describe('cursor adapter — skills', () => {
  beforeEach(() => {
    sentMessages.length = 0;
    openCalls.length = 0;
    runCommands.length = 0;
    spawnEnvs.length = 0;
    writes.length = 0;
    process.env.CURSOR_API_KEY = 'test-key';
  });

  it('writes skills to sandbox HOME .cursor/skills without sending skill metadata', async () => {
    const session = await startSession({
      skills: [
        {
          name: 'demo',
          description: 'Demo skill.',
          content: 'Use reference.md.',
          files: [{ path: 'reference.md', content: '# Reference' }],
        },
      ],
    });

    await session.doPromptTurn({
      prompt: 'use demo',
      emit: () => {},
    });

    expect(runCommands).toContain(
      "mkdir -p '/home/vercel-sandbox/.cursor/skills'",
    );
    const skillWrites = writes.filter(
      write => !write.path.endsWith('/bridge-meta.json'),
    );
    expect(skillWrites).toEqual([
      {
        path: '/home/vercel-sandbox/.cursor/skills/demo/SKILL.md',
        content:
          '---\nname: demo\ndescription: Demo skill.\n---\n\nUse reference.md.',
      },
      {
        path: '/home/vercel-sandbox/.cursor/skills/demo/reference.md',
        content: '# Reference',
      },
    ]);
    expect(spawnEnvs.at(-1)?.HOME).toBe('/home/vercel-sandbox');
    expect(lastStart().skills).toBeUndefined();
  });

  it('rejects unsafe skill file paths before writing files', async () => {
    await expect(
      startSession({
        skills: [
          {
            name: 'demo',
            description: 'Demo skill.',
            content: 'Use reference.md.',
            files: [{ path: '../reference.md', content: '# Reference' }],
          },
        ],
      }),
    ).rejects.toThrow('Invalid Cursor skill file path');
    expect(writes).toEqual([]);
  });
});
