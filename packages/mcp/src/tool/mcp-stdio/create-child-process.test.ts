import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as childProcessModule from 'node:child_process';
import { EventEmitter } from 'node:events';
import * as getEnvironmentModule from './get-environment';
import os from 'node:os';

// Wrap node:child_process.spawn so tests can override per-call.
// Existing tests still receive a real ChildProcess via the wrapper;
// platform-shell tests below override with mockReturnValueOnce.
vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal<typeof childProcessModule>();
  return {
    ...actual,
    spawn: vi.fn((...args: Parameters<typeof actual.spawn>) =>
      actual.spawn(...args),
    ),
  };
});

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
    // On Windows the spawn call is shell-wrapped via cmd.exe (see #10732)
    // so spawnargs reflects the wrapped invocation rather than the raw args.
    if (process.platform !== 'win32') {
      expect(childProcessWithArgs.spawnargs).toContain(process.execPath);
      expect(childProcessWithArgs.spawnargs).toEqual([
        process.execPath,
        '-c',
        'echo',
        'test',
      ]);
    }

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
});

describe('createChildProcess shell option per platform', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true,
    });
  });

  const makeFakeChildProcess = () => {
    const fakeCp = new EventEmitter() as ReturnType<
      typeof childProcessModule.spawn
    >;
    (fakeCp as { pid?: number }).pid = 12345;
    (fakeCp as { kill?: () => boolean }).kill = () => true;
    return fakeCp;
  };

  it('passes shell: true on Windows so npx/uv .cmd shims resolve via PATH', () => {
    const spawnMock = vi.mocked(childProcessModule.spawn);
    spawnMock.mockReturnValueOnce(makeFakeChildProcess());

    Object.defineProperty(process, 'platform', {
      value: 'win32',
      configurable: true,
    });

    createChildProcess(
      { command: 'npx', args: ['-v'] },
      new AbortController().signal,
    );

    expect(spawnMock).toHaveBeenLastCalledWith(
      'npx',
      ['-v'],
      expect.objectContaining({ shell: true }),
    );
  });

  it('passes shell: false on non-Windows platforms', () => {
    const spawnMock = vi.mocked(childProcessModule.spawn);
    spawnMock.mockReturnValueOnce(makeFakeChildProcess());

    Object.defineProperty(process, 'platform', {
      value: 'linux',
      configurable: true,
    });

    createChildProcess(
      { command: 'npx', args: ['-v'] },
      new AbortController().signal,
    );

    expect(spawnMock).toHaveBeenLastCalledWith(
      'npx',
      ['-v'],
      expect.objectContaining({ shell: false }),
    );
  });
});
