import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import {
  clineResumeStateSchema,
  persistHistoryToSandbox,
  pullHistoryFromSandbox,
  resolveClinePrivateSessionDirectory,
  safeClineHistoryFileName,
} from './cline-resume-state';

function createFakeSandbox(files: Map<string, string>) {
  return {
    writeTextFile: async ({
      path,
      content,
    }: {
      path: string;
      content: string;
    }) => {
      files.set(path, content);
    },
    readTextFile: async ({ path }: { path: string }) => files.get(path) ?? null,
  } as unknown as Experimental_SandboxSession;
}

describe('safeClineHistoryFileName', () => {
  it('accepts plain .json basenames', () => {
    expect(safeClineHistoryFileName('history.json')).toBe('history.json');
  });

  it.each(['../evil.json', 'a/b.json', '.hidden.json', 'nope.txt', ''])(
    'rejects %j',
    name => {
      expect(() => safeClineHistoryFileName(name)).toThrow(
        /Invalid Cline history file name/,
      );
    },
  );
});

describe('clineResumeStateSchema', () => {
  it('accepts a valid payload', () => {
    expect(
      clineResumeStateSchema.parse({ historyFileName: 'history.json' }),
    ).toEqual({ historyFileName: 'history.json' });
  });

  it('accepts an empty payload', () => {
    expect(clineResumeStateSchema.parse({})).toEqual({});
  });

  it('rejects unsafe file names', () => {
    expect(() =>
      clineResumeStateSchema.parse({ historyFileName: '../evil.json' }),
    ).toThrow();
  });
});

describe('resolveClinePrivateSessionDirectory', () => {
  it.each([
    { sessionId: 'session-1', segment: 'session-1' },
    { sessionId: '../unsafe/session-id', segment: '..%2Funsafe%2Fsession-id' },
    { sessionId: 'a/b', segment: 'a%2Fb' },
    { sessionId: 'a%2Fb', segment: 'a%252Fb' },
    { sessionId: '..', segment: '%2E%2E' },
    { sessionId: '', segment: '%' },
  ])(
    'keeps $sessionId in one stable session directory',
    ({ sessionId, segment }) => {
      const privateSessionDir = resolveClinePrivateSessionDirectory({
        sandboxHomeDir: '/sandbox/home',
        sessionWorkDir: '/sandbox/work/cline-s1',
        sessionId,
      });

      expect(privateSessionDir).toBe(
        `/sandbox/home/.ai-sdk-harness/.agent-runs/${segment}/cline`,
      );
      expect(privateSessionDir).toBe(
        resolveClinePrivateSessionDirectory({
          sandboxHomeDir: '/sandbox/home',
          sessionWorkDir: '/sandbox/work/cline-s1',
          sessionId,
        }),
      );
    },
  );

  it.each([
    '/sandbox/home',
    '/sandbox/home/.ai-sdk-harness/.agent-runs/session-1',
    '/sandbox/home/.ai-sdk-harness/.agent-runs/session-1/cline',
  ])(
    'rejects private state inside or equal to workspace %s',
    sessionWorkDir => {
      expect(() =>
        resolveClinePrivateSessionDirectory({
          sandboxHomeDir: '/sandbox/home',
          sessionWorkDir,
          sessionId: 'session-1',
        }),
      ).toThrow(/must be outside sessionWorkDir/);
    },
  );
});

describe('persist/pull history round trip', () => {
  const privateSessionDir = resolveClinePrivateSessionDirectory({
    sandboxHomeDir: '/sandbox/home',
    sessionWorkDir: '/sandbox/work/cline-s1',
    sessionId: 'session-1',
  });
  const messages = [
    {
      id: 'm1',
      role: 'user' as const,
      content: [{ type: 'text' as const, text: 'hello' }],
      createdAt: 1,
    },
  ];

  it('round-trips history through the sandbox', async () => {
    const files = new Map<string, string>();
    const sandbox = createFakeSandbox(files);

    await persistHistoryToSandbox({
      sandbox,
      privateSessionDir,
      historyFileName: 'history.json',
      messages,
    });
    expect([...files.keys()]).toEqual([
      '/sandbox/home/.ai-sdk-harness/.agent-runs/session-1/cline/history.json',
    ]);

    const restored = await pullHistoryFromSandbox({
      sandbox,
      privateSessionDir,
      historyFileName: 'history.json',
    });
    expect(restored).toEqual(messages);
  });

  it('returns undefined for a missing history file', async () => {
    const sandbox = createFakeSandbox(new Map());
    expect(
      await pullHistoryFromSandbox({
        sandbox,
        privateSessionDir,
        historyFileName: 'history.json',
      }),
    ).toBeUndefined();
  });

  it('returns undefined for corrupt history content', async () => {
    const files = new Map([
      [
        '/sandbox/home/.ai-sdk-harness/.agent-runs/session-1/cline/history.json',
        'not json',
      ],
    ]);
    const sandbox = createFakeSandbox(files);
    expect(
      await pullHistoryFromSandbox({
        sandbox,
        privateSessionDir,
        historyFileName: 'history.json',
      }),
    ).toBeUndefined();
  });

  it('returns undefined for history with unsafe prototype properties', async () => {
    const files = new Map([
      [
        '/sandbox/home/.ai-sdk-harness/.agent-runs/session-1/cline/history.json',
        '[{"__proto__":{"polluted":true}}]',
      ],
    ]);
    const sandbox = createFakeSandbox(files);

    expect(
      await pullHistoryFromSandbox({
        sandbox,
        privateSessionDir,
        historyFileName: 'history.json',
      }),
    ).toBeUndefined();
  });
});
