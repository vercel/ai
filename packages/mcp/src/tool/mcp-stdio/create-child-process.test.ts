import { beforeEach, describe, expect, it, vi } from 'vitest';
import { once } from 'node:events';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import * as getEnvironmentModule from './get-environment';
import os from 'node:os';

const DEFAULT_ENV = {
  PATH: 'path',
};

const mockGetEnvironment = vi
  .fn()
  .mockImplementation((customEnv?: Record<string, string>) => {
    return {
      ...DEFAULT_ENV,
      ...customEnv,
    };
  });
vi.spyOn(getEnvironmentModule, 'getEnvironment').mockImplementation(
  mockGetEnvironment,
);

// important: import after mocking getEnv
const { createChildProcess } = await import('./create-child-process');

describe('createChildProcess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should spawn a child process', async () => {
    const childProcess = createChildProcess(
      { command: process.execPath },
      new AbortController().signal,
    );

    expect(childProcess.pid).toBeDefined();
    expect(mockGetEnvironment).toHaveBeenCalledWith(undefined);
    childProcess.kill();
  });

  it('should spawn a child process with custom env', async () => {
    const customEnv = { FOO: 'bar' };
    const childProcessWithCustomEnv = createChildProcess(
      { command: process.execPath, env: customEnv },
      new AbortController().signal,
    );

    expect(childProcessWithCustomEnv.pid).toBeDefined();
    expect(mockGetEnvironment).toHaveBeenCalledWith(customEnv);
    expect(mockGetEnvironment).toHaveReturnedWith({
      ...DEFAULT_ENV,
      ...customEnv,
    });
    childProcessWithCustomEnv.kill();
  });

  it('should spawn a child process with args', async () => {
    const childProcessWithArgs = createChildProcess(
      { command: process.execPath, args: ['-c', 'echo', 'test'] },
      new AbortController().signal,
    );

    expect(childProcessWithArgs.pid).toBeDefined();
    expect(childProcessWithArgs.spawnargs).toContain(process.execPath);
    expect(childProcessWithArgs.spawnargs).toEqual([
      process.execPath,
      '-c',
      'echo',
      'test',
    ]);

    childProcessWithArgs.kill();
  });

  it('should spawn a child process with cwd', async () => {
    const childProcessWithCwd = createChildProcess(
      { command: process.execPath, cwd: os.tmpdir() },
      new AbortController().signal,
    );

    expect(childProcessWithCwd.pid).toBeDefined();
    childProcessWithCwd.kill();
  });

  it('should spawn a child process with stderr', async () => {
    const childProcessWithStderr = createChildProcess(
      { command: process.execPath, stderr: 'pipe' },
      new AbortController().signal,
    );

    expect(childProcessWithStderr.pid).toBeDefined();
    expect(childProcessWithStderr.stderr).toBeDefined();
    childProcessWithStderr.kill();
  });

  it.runIf(process.platform === 'win32')(
    'should spawn npx on Windows',
    async () => {
      const childProcess = createChildProcess(
        {
          command: 'npx',
          args: ['--version'],
          env: { PATH: process.env.PATH! },
          stderr: 'pipe',
        },
        new AbortController().signal,
      );
      const stdout: Buffer[] = [];
      childProcess.stdout?.on('data', chunk => stdout.push(chunk));

      const [exitCode] = await once(childProcess, 'close');

      expect(exitCode).toBe(0);
      expect(Buffer.concat(stdout).toString().trim()).toMatch(/^\d+\.\d+\.\d+/);
    },
  );

  it.runIf(process.platform === 'win32')(
    'should escape command shim arguments on Windows',
    async () => {
      const cwd = mkdtempSync(join(os.tmpdir(), 'ai-sdk-mcp-'));
      const markerPath = join(cwd, 'injected.txt');

      try {
        const childProcess = createChildProcess(
          {
            command: fileURLToPath(
              new URL('./__fixtures__/exit.cmd', import.meta.url),
            ),
            args: [`safe & type nul > "${markerPath}"`],
            cwd,
            stderr: 'pipe',
          },
          new AbortController().signal,
        );

        const [exitCode] = await once(childProcess, 'close');

        expect(exitCode).toBe(0);
        expect(existsSync(markerPath)).toBe(false);
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    },
  );

  it.runIf(process.platform === 'win32')(
    'should reject line breaks in arguments on Windows',
    () => {
      expect(() =>
        createChildProcess(
          { command: 'npx', args: ['safe\r\necho unsafe'] },
          new AbortController().signal,
        ),
      ).toThrow(
        'Stdio MCP commands and arguments must not contain line breaks on Windows.',
      );
    },
  );
});
