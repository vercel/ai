import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';
import type * as NodeFsPromises from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { persistSessionFileToSandbox } from './pi-resume-state';

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof NodeFsPromises>();
  return {
    ...actual,
    readFile: vi.fn(async () => new Uint8Array([1, 2, 3])),
  };
});

describe('persistSessionFileToSandbox', () => {
  it('quotes the sandbox session directory in shell commands', async () => {
    const runs: string[] = [];
    const writes: Array<{ path: string; content: Uint8Array }> = [];
    const sandbox = {
      run: async ({ command }: { command: string }) => {
        runs.push(command);
        return { exitCode: 0, stdout: '', stderr: '' };
      },
      writeBinaryFile: async ({
        path,
        content,
      }: {
        path: string;
        content: Uint8Array;
      }) => {
        writes.push({ path, content });
      },
    } as unknown as Experimental_SandboxSession;

    await persistSessionFileToSandbox({
      sandbox,
      sessionWorkDir: '/vercel/sandbox/pi-s1; env > /tmp/leak #',
      hostSessionDir: '/tmp/pi-sessions',
      sessionFileName: 'session.jsonl',
    });

    expect(runs).toEqual([
      "mkdir -p '/vercel/sandbox/pi-s1; env > /tmp/leak #/.pi-sessions'",
    ]);
    expect(writes).toEqual([
      {
        path: '/vercel/sandbox/pi-s1; env > /tmp/leak #/.pi-sessions/session.jsonl',
        content: new Uint8Array([1, 2, 3]),
      },
    ]);
  });
});
