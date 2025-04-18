import { beforeEach, vi } from 'vitest';
import * as getEnvironmentModule from './get-environment';

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

    await new Promise<void>((resolve) => {
      childProcess.on("spawn", () => {
        expect(childProcess.pid).toBeDefined();
        resolve();
      });
    });

    expect(mockGetEnvironment).toHaveBeenCalledWith(undefined);
    childProcess.kill();
  });

  it('should spawn a child process with custom env', async () => {
    const customEnv = { FOO: 'bar' };
    const childProcessWithCustomEnv = createChildProcess(
      { command: process.execPath, env: customEnv },
      new AbortController().signal,
    );

    await new Promise<void>((resolve) => {
      childProcessWithCustomEnv.on("spawn", () => {
        expect(childProcessWithCustomEnv.pid).toBeDefined();
        resolve();
      });
    });

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

    await new Promise<void>((resolve) => {
      childProcessWithArgs.on("spawn", () => {
        expect(childProcessWithArgs.pid).toBeDefined();
        expect(childProcessWithArgs.spawnargs).toContain(process.execPath);
        expect(childProcessWithArgs.spawnargs).toEqual([
          process.execPath,
          '-c',
          'echo',
          'test',
        ]);
        resolve();
      });
    });

    childProcessWithArgs.kill();
  });

  it('should spawn a child process with cwd', async () => {
    const childProcessWithCwd = createChildProcess(
      { command: process.execPath, cwd: '/tmp' },
      new AbortController().signal,
    );

    await new Promise<void>((resolve) => {
      childProcessWithCwd.on("spawn", () => {
        expect(childProcessWithCwd.pid).toBeDefined();
        resolve();
      });
    });

    childProcessWithCwd.kill();
  });

  it('should spawn a child process with stderr', async () => {
    const childProcessWithStderr = createChildProcess(
      { command: process.execPath, stderr: 'pipe' },
      new AbortController().signal,
    );

    await new Promise<void>((resolve) => {
      childProcessWithStderr.on("spawn", () => {
        expect(childProcessWithStderr.pid).toBeDefined();
        expect(childProcessWithStderr.stderr).toBeDefined();
        resolve();
      });
    });

    childProcessWithStderr.kill();
  });
});
