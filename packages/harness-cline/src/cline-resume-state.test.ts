import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import {
  clineResumeStateSchema,
  persistHistoryToSandbox,
  pullHistoryFromSandbox,
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

describe('persist/pull history round trip', () => {
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
      sessionWorkDir: '/sandbox/work/cline-s1',
      historyFileName: 'history.json',
      messages,
    });
    expect([...files.keys()]).toEqual([
      '/sandbox/work/cline-s1/.cline-harness/history.json',
    ]);

    const restored = await pullHistoryFromSandbox({
      sandbox,
      sessionWorkDir: '/sandbox/work/cline-s1',
      historyFileName: 'history.json',
    });
    expect(restored).toEqual(messages);
  });

  it('returns undefined for a missing history file', async () => {
    const sandbox = createFakeSandbox(new Map());
    expect(
      await pullHistoryFromSandbox({
        sandbox,
        sessionWorkDir: '/sandbox/work/cline-s1',
        historyFileName: 'history.json',
      }),
    ).toBeUndefined();
  });

  it('returns undefined for corrupt history content', async () => {
    const files = new Map([
      ['/sandbox/work/cline-s1/.cline-harness/history.json', 'not json'],
    ]);
    const sandbox = createFakeSandbox(files);
    expect(
      await pullHistoryFromSandbox({
        sandbox,
        sessionWorkDir: '/sandbox/work/cline-s1',
        historyFileName: 'history.json',
      }),
    ).toBeUndefined();
  });
});
