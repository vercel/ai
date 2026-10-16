import { describe, expect, it, vi } from 'vitest';
import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import { createFxRemoteOps } from './fx-remote-ops';

describe('sandbox-only operations', () => {
  function setup(options: { canonical?: string } = {}) {
    const sandbox = {
      run: vi.fn(async ({ command }: { command: string }) => ({
        exitCode: 0,
        stdout: command.includes('realpath')
          ? Buffer.from(`${options.canonical ?? '/workspace'}\0`).toString(
              'base64',
            )
          : 'sandbox output',
        stderr: '',
      })),
      readTextFile: vi.fn(async () => 'sandbox file'),
      writeTextFile: vi.fn(async () => {}),
    };
    return {
      sandbox,
      remote: createFxRemoteOps({
        sandbox: sandbox as unknown as SandboxSession,
        workDir: '/workspace',
      }),
    };
  }
  it('rejects paths outside the workspace before any sandbox operation', async () => {
    const { sandbox, remote } = setup();
    await expect(remote.read({ file_path: '/etc/passwd' })).rejects.toThrow(
      'escapes the workspace',
    );
    await expect(
      remote.write({ file_path: '../outside', content: 'no' }),
    ).rejects.toThrow('escapes the workspace');
    expect(sandbox.run).not.toHaveBeenCalled();
    expect(sandbox.readTextFile).not.toHaveBeenCalled();
    expect(sandbox.writeTextFile).not.toHaveBeenCalled();
  });
  it('rejects symlinks escaping the canonical workspace', async () => {
    const { sandbox, remote } = setup();
    sandbox.run.mockResolvedValueOnce({
      exitCode: 0,
      stdout: Buffer.from('/workspace\0').toString('base64'),
      stderr: '',
    });
    sandbox.run.mockResolvedValueOnce({
      exitCode: 0,
      stdout: Buffer.from('/outside/secret\0').toString('base64'),
      stderr: '',
    });
    await expect(remote.read({ file_path: 'link/secret' })).rejects.toThrow(
      'escapes the workspace',
    );
    expect(sandbox.readTextFile).not.toHaveBeenCalled();
  });
  it('runs shell commands only through the supplied sandbox and forwards cancellation', async () => {
    const { sandbox, remote } = setup();
    const signal = new AbortController().signal;
    await remote.bash({ command: 'printf sandbox', signal });
    expect(sandbox.run).toHaveBeenCalledWith({
      command: 'printf sandbox',
      workingDirectory: '/workspace',
      abortSignal: signal,
    });
  });
  it('does not mask canonicalization errors', async () => {
    const { sandbox, remote } = setup();
    sandbox.run.mockResolvedValue({
      exitCode: 1,
      stdout: '',
      stderr: 'failed',
    });
    await expect(remote.read({ file_path: 'file' })).rejects.toThrow(
      'Unable to resolve sandbox path',
    );
  });
});
