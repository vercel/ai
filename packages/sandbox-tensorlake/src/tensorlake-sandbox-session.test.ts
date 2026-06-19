import { ProcessStatus, type Sandbox } from 'tensorlake';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TensorlakeSandboxSession } from './tensorlake-sandbox-session';

const decoder = new TextDecoder();

async function collect(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  let text = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return text;
}

function makeMockSandbox(overrides: Partial<Sandbox> = {}): {
  sandbox: Sandbox;
  spies: {
    run: ReturnType<typeof vi.fn>;
    startProcess: ReturnType<typeof vi.fn>;
    getProcess: ReturnType<typeof vi.fn>;
    killProcess: ReturnType<typeof vi.fn>;
    writeFile: ReturnType<typeof vi.fn>;
    readFile: ReturnType<typeof vi.fn>;
    followStdout: ReturnType<typeof vi.fn>;
    followStderr: ReturnType<typeof vi.fn>;
  };
} {
  const run = vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '' }));
  const startProcess = vi.fn(async () => ({ pid: 42 }));
  const getProcess = vi.fn(async () => ({
    pid: 42,
    status: ProcessStatus.EXITED,
    exitCode: 0,
  }));
  const killProcess = vi.fn(async () => {});
  const writeFile = vi.fn(async () => {});
  const readFile = vi.fn();
  const followStdout = vi.fn(async function* () {});
  const followStderr = vi.fn(async function* () {});
  const sandbox = {
    sandboxId: 'sbx_test',
    name: 'sbx_test',
    run,
    startProcess,
    getProcess,
    killProcess,
    writeFile,
    readFile,
    followStdout,
    followStderr,
  } as unknown as Sandbox;
  Object.assign(sandbox, overrides);
  return {
    sandbox,
    spies: {
      run,
      startProcess,
      getProcess,
      killProcess,
      writeFile,
      readFile,
      followStdout,
      followStderr,
    },
  };
}

describe('TensorlakeSandboxSession', () => {
  describe('description', () => {
    it('mentions the sandbox id', () => {
      const { sandbox } = makeMockSandbox();
      expect(new TensorlakeSandboxSession(sandbox).description).toContain(
        'sbx_test',
      );
    });
  });

  describe('run', () => {
    it('runs the command via bash -c and returns the result', async () => {
      const { sandbox, spies } = makeMockSandbox();
      spies.run.mockResolvedValueOnce({
        exitCode: 3,
        stdout: 'out',
        stderr: 'err',
      });

      const result = await new TensorlakeSandboxSession(sandbox).run({
        command: 'echo hi',
        workingDirectory: '/tmp',
        env: { FOO: 'bar' },
      });

      expect(spies.run).toHaveBeenCalledWith('bash', {
        args: ['-c', 'echo hi'],
        workingDir: '/tmp',
        env: { FOO: 'bar' },
      });
      expect(result).toEqual({ exitCode: 3, stdout: 'out', stderr: 'err' });
    });

    it('throws if already aborted', async () => {
      const { sandbox } = makeMockSandbox();
      await expect(
        new TensorlakeSandboxSession(sandbox).run({
          command: 'echo hi',
          abortSignal: AbortSignal.abort(),
        }),
      ).rejects.toThrow();
    });
  });

  describe('readBinaryFile', () => {
    it('returns the file bytes', async () => {
      const { sandbox, spies } = makeMockSandbox();
      spies.readFile.mockResolvedValueOnce(
        new TextEncoder().encode('contents'),
      );

      const bytes = await new TensorlakeSandboxSession(sandbox).readBinaryFile({
        path: '/home/tl-user/file.txt',
      });

      expect(spies.readFile).toHaveBeenCalledWith('/home/tl-user/file.txt');
      expect(decoder.decode(bytes!)).toBe('contents');
    });

    it('returns null when the file does not exist', async () => {
      const { sandbox, spies } = makeMockSandbox();
      spies.readFile.mockRejectedValueOnce(
        Object.assign(new Error('file not found'), { status: 404 }),
      );

      const bytes = await new TensorlakeSandboxSession(sandbox).readBinaryFile({
        path: '/home/tl-user/missing.txt',
      });

      expect(bytes).toBeNull();
    });

    it('returns null for an ENOENT error code', async () => {
      const { sandbox, spies } = makeMockSandbox();
      spies.readFile.mockRejectedValueOnce(
        Object.assign(new Error('boom'), { code: 'ENOENT' }),
      );

      const bytes = await new TensorlakeSandboxSession(sandbox).readBinaryFile({
        path: '/home/tl-user/missing.txt',
      });

      expect(bytes).toBeNull();
    });

    it('re-throws errors that are not file-not-found', async () => {
      const { sandbox, spies } = makeMockSandbox();
      // A genuine failure (e.g. a 500 / permission error) must propagate rather
      // than be swallowed as a missing file.
      spies.readFile.mockRejectedValueOnce(
        Object.assign(new Error('internal error'), { status: 500 }),
      );

      await expect(
        new TensorlakeSandboxSession(sandbox).readBinaryFile({
          path: '/home/tl-user/file.txt',
        }),
      ).rejects.toThrow(/internal error/);
    });
  });

  describe('writeBinaryFile', () => {
    it('creates parent directories then writes', async () => {
      const { sandbox, spies } = makeMockSandbox();

      await new TensorlakeSandboxSession(sandbox).writeBinaryFile({
        path: '/home/tl-user/nested/dir/file.txt',
        content: new TextEncoder().encode('data'),
      });

      expect(spies.run).toHaveBeenCalledWith('mkdir', {
        args: ['-p', '/home/tl-user/nested/dir'],
      });
      expect(spies.writeFile).toHaveBeenCalledWith(
        '/home/tl-user/nested/dir/file.txt',
        expect.any(Uint8Array),
      );
    });
  });

  describe('spawn', () => {
    it('streams stdout/stderr and resolves the exit code', async () => {
      const { sandbox, spies } = makeMockSandbox();
      spies.followStdout.mockImplementation(async function* () {
        yield { line: 'line one' };
        yield { line: 'line two' };
      });
      spies.followStderr.mockImplementation(async function* () {
        yield { line: 'oops' };
      });
      spies.getProcess.mockResolvedValue({
        pid: 42,
        status: ProcessStatus.EXITED,
        exitCode: 7,
      });

      const process = await new TensorlakeSandboxSession(sandbox).spawn({
        command: 'run-server',
      });

      expect(spies.startProcess).toHaveBeenCalledWith(
        'bash',
        expect.objectContaining({ args: ['-c', 'run-server'] }),
      );

      const [stdout, stderr, result] = await Promise.all([
        collect(process.stdout),
        collect(process.stderr),
        process.wait(),
      ]);

      expect(stdout).toBe('line one\nline two\n');
      expect(stderr).toBe('oops\n');
      expect(result).toEqual({ exitCode: 7 });
    });

    it('reports an OOM-killed process as a non-zero failure', async () => {
      const { sandbox, spies } = makeMockSandbox();
      // OOM kills can arrive with neither exitCode nor signal populated.
      spies.getProcess.mockResolvedValue({
        pid: 42,
        status: ProcessStatus.OOM_KILLED,
      });

      const process = await new TensorlakeSandboxSession(sandbox).spawn({
        command: 'memory-hog',
      });
      const result = await process.wait();

      // 128 + SIGKILL(9): a killed command must not be reported as success (0).
      expect(result).toEqual({ exitCode: 137 });
    });

    it('maps a signalled process to 128 + signal', async () => {
      const { sandbox, spies } = makeMockSandbox();
      spies.getProcess.mockResolvedValue({
        pid: 42,
        status: ProcessStatus.SIGNALED,
        signal: 15,
      });

      const process = await new TensorlakeSandboxSession(sandbox).spawn({
        command: 'run-server',
      });
      const result = await process.wait();

      expect(result).toEqual({ exitCode: 143 });
    });

    it('treats a terminal status with no exit info as a generic failure', async () => {
      const { sandbox, spies } = makeMockSandbox();
      spies.getProcess.mockResolvedValue({
        pid: 42,
        status: ProcessStatus.SIGNALED,
      });

      const process = await new TensorlakeSandboxSession(sandbox).spawn({
        command: 'run-server',
      });
      const result = await process.wait();

      expect(result).toEqual({ exitCode: 1 });
    });

    it('kills the process by pid', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const process = await new TensorlakeSandboxSession(sandbox).spawn({
        command: 'sleep 100',
      });
      await process.kill();
      expect(spies.killProcess).toHaveBeenCalledWith(42);
    });

    it('kills the process when wait() is aborted', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const controller = new AbortController();
      // The process never exits on its own, so the only way wait() resolves is
      // via the abort path.
      spies.getProcess.mockResolvedValue({
        pid: 42,
        status: ProcessStatus.RUNNING,
      });

      const process = await new TensorlakeSandboxSession(sandbox).spawn({
        command: 'sleep 100',
        abortSignal: controller.signal,
      });

      const waited = process.wait();
      controller.abort();

      await expect(waited).rejects.toThrow();
      // Honor the abort contract: the spawned process must not be left running.
      expect(spies.killProcess).toHaveBeenCalledWith(42);
    });
  });

  describe('writeTextFile / readTextFile', () => {
    let session: TensorlakeSandboxSession;
    let store: Map<string, Uint8Array>;

    beforeEach(() => {
      store = new Map();
      const { sandbox } = makeMockSandbox({
        writeFile: vi.fn(async (path: string, content: Uint8Array) => {
          store.set(path, content);
        }),
        readFile: vi.fn(async (path: string) => {
          const v = store.get(path);
          if (v == null)
            throw Object.assign(new Error('not found'), { status: 404 });
          return v;
        }),
      } as unknown as Partial<Sandbox>);
      session = new TensorlakeSandboxSession(sandbox);
    });

    it('round-trips text content', async () => {
      await session.writeTextFile({
        path: '/home/tl-user/a.txt',
        content: 'hello',
      });
      const text = await session.readTextFile({ path: '/home/tl-user/a.txt' });
      expect(text).toBe('hello');
    });

    it('returns null reading a missing file', async () => {
      expect(
        await session.readTextFile({ path: '/home/tl-user/none.txt' }),
      ).toBeNull();
    });
  });
});
