import { describe, expect, it, vi } from 'vitest';
import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import { runSandboxBootstrap } from './sandbox-bootstrap';

describe('onBootstrap marker', () => {
  it('uses sandbox HOME and only the hash, writing after success', async () => {
    const files = new Map<string, string>();
    const session = {
      run: vi.fn(async ({ command }: { command: string }) => ({
        exitCode: 0,
        stdout:
          command === 'pwd'
            ? '/work\n'
            : command === 'printf "%s" "$HOME"'
              ? '/home/agent'
              : '',
        stderr: '',
      })),
      readTextFile: vi.fn(
        async ({ path }: { path: string }) => files.get(path) ?? null,
      ),
      writeTextFile: vi.fn(
        async ({ path, content }: { path: string; content: string }) => {
          files.set(path, content);
        },
      ),
    } as unknown as SandboxSession;
    const hook = vi.fn(async () => {});
    for (const workDir of ['one', 'two']) {
      await runSandboxBootstrap({
        session,
        workDir,
        bootstrapHash: 'v1',
        onBootstrap: hook,
        skipOnBootstrapIfMarked: true,
      });
    }
    expect(hook).toHaveBeenCalledOnce();
    const paths = [...files.keys()];
    expect(paths).toHaveLength(1);
    expect(paths[0]).toMatch(
      /^\/home\/agent\/\.ai-sdk-harness\/\.on-bootstrap\/[0-9a-f]{64}\.ok$/,
    );
  });

  it('does not mark failed hooks', async () => {
    const writeTextFile = vi.fn(async () => {});
    const session = {
      run: vi.fn(async ({ command }: { command: string }) => ({
        exitCode: 0,
        stdout:
          command === 'pwd'
            ? '/work\n'
            : command === 'printf "%s" "$HOME"'
              ? '/home/agent'
              : '',
        stderr: '',
      })),
      readTextFile: vi.fn(async () => null),
      writeTextFile,
    } as unknown as SandboxSession;
    await expect(
      runSandboxBootstrap({
        session,
        bootstrapHash: 'v1',
        onBootstrap: async () => {
          throw new Error('failed');
        },
        skipOnBootstrapIfMarked: true,
      }),
    ).rejects.toThrow('failed');
    expect(writeTextFile).not.toHaveBeenCalled();
  });
});
