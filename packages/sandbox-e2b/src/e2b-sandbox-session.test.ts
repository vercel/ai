import { spawnSync } from 'node:child_process';
import {
  chmod,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CommandExitError, FileNotFoundError, type Sandbox } from 'e2b';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { E2BSandboxSession } from './e2b-sandbox-session';

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

type MockCommandOptions = {
  onStdout?: (data: string) => void;
  onStderr?: (data: string) => void;
};

/**
 * Mimics an `e2b` `CommandHandle`: output is delivered through the callbacks
 * passed to `commands.run`, and `wait()` throws `CommandExitError` for a
 * non-zero exit code.
 */
function makeMockCommand(
  options: {
    stdout?: string[];
    stderr?: string[];
    exitCode?: number;
    waitError?: unknown;
    pending?: boolean;
  } = {},
) {
  const stdout = options.stdout ?? [];
  const stderr = options.stderr ?? [];
  const result = {
    exitCode: options.exitCode ?? 0,
    stdout: stdout.join(''),
    stderr: stderr.join(''),
  };
  let settle: (() => void) | undefined;
  const settled = options.pending
    ? new Promise<void>(resolve => {
        settle = resolve;
      })
    : Promise.resolve();
  let killed = false;
  const kill = vi.fn(async () => {
    killed = true;
    settle?.();
    return true;
  });
  const wait = vi.fn(async () => {
    await settled;
    if (options.waitError !== undefined) throw options.waitError;
    if (killed) {
      throw new CommandExitError({ ...result, exitCode: 137 });
    }
    if (result.exitCode !== 0) throw new CommandExitError(result);
    return result;
  });
  const sendStdin = vi.fn(
    async (_data: Uint8Array, _options?: { signal?: AbortSignal }) => {},
  );
  const closeStdin = vi.fn(async (_options?: { signal?: AbortSignal }) => {});
  const start = (commandOptions: MockCommandOptions) => {
    for (const chunk of stdout) commandOptions.onStdout?.(chunk);
    for (const chunk of stderr) commandOptions.onStderr?.(chunk);
    return { pid: 1, wait, kill, sendStdin, closeStdin };
  };
  return { start, spies: { wait, kill, sendStdin, closeStdin } };
}

function makeMockSandbox(): {
  sandbox: Sandbox;
  spies: {
    run: ReturnType<typeof vi.fn>;
    read: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
  };
} {
  const run = vi.fn();
  const read = vi.fn();
  const write = vi.fn(async () => ({}));
  const sandbox = {
    sandboxId: 'sbx_test',
    commands: { run },
    files: { read, write },
  } as unknown as Sandbox;
  return { sandbox, spies: { run, read, write } };
}

function runWith(
  spies: { run: ReturnType<typeof vi.fn> },
  command: ReturnType<typeof makeMockCommand>,
) {
  spies.run.mockImplementationOnce(
    async (_command: string, options: MockCommandOptions) =>
      command.start(options),
  );
}

describe('E2BSandboxSession', () => {
  describe('description', () => {
    it('mentions the sandbox ID', () => {
      const { sandbox } = makeMockSandbox();
      expect(
        new E2BSandboxSession(sandbox, '/home/user').description,
      ).toContain('sbx_test');
    });
  });

  describe('run', () => {
    it('maps stdout, stderr, and the exit code', async () => {
      const { sandbox, spies } = makeMockSandbox();
      runWith(spies, makeMockCommand({ stdout: ['hi\n'], stderr: ['oops\n'] }));

      const result = await new E2BSandboxSession(sandbox, '/home/user').run({
        command: 'echo hi',
      });

      expect(result).toEqual({ exitCode: 0, stdout: 'hi\n', stderr: 'oops\n' });
      expect(spies.run).toHaveBeenCalledWith('echo hi', {
        background: true,
        timeoutMs: 0,
        cwd: '/home/user',
      });
    });

    it('returns a non-zero exit code instead of throwing', async () => {
      const { sandbox, spies } = makeMockSandbox();
      runWith(spies, makeMockCommand({ stderr: ['nope'], exitCode: 2 }));

      const result = await new E2BSandboxSession(sandbox, '/home/user').run({
        command: 'false',
      });

      expect(result).toEqual({ exitCode: 2, stdout: '', stderr: 'nope' });
    });

    it('returns capped prefixes and the full output lengths', async () => {
      const { sandbox, spies } = makeMockSandbox();
      runWith(
        spies,
        makeMockCommand({
          stdout: ['ab', 'cdef'],
          stderr: ['error!'],
          exitCode: 7,
        }),
      );

      const result = await new E2BSandboxSession(sandbox, '/home/user').run({
        command: 'noisy',
        maxOutputLength: 4,
      });

      expect(result).toEqual({
        exitCode: 7,
        stdout: 'abcd',
        stderr: 'erro',
        stdoutLength: 6,
        stderrLength: 6,
      });
      expect(spies.run).toHaveBeenCalledWith('noisy', {
        background: true,
        timeoutMs: 0,
        cwd: '/home/user',
        onStdout: expect.any(Function),
        onStderr: expect.any(Function),
      });
    });

    it('preserves Unicode code units and empty output with a cap', async () => {
      const { sandbox, spies } = makeMockSandbox();
      runWith(spies, makeMockCommand({ stdout: ['a😀b'] }));

      const result = await new E2BSandboxSession(sandbox, '/home/user').run({
        command: 'unicode',
        maxOutputLength: 2,
      });

      expect(result).toEqual({
        exitCode: 0,
        stdout: 'a\ud83d',
        stderr: '',
        stdoutLength: 4,
        stderrLength: 0,
      });
    });

    it('rejects an invalid cap without starting a command', async () => {
      const { sandbox, spies } = makeMockSandbox();

      await expect(
        new E2BSandboxSession(sandbox, '/home/user').run({
          command: 'ls',
          maxOutputLength: 0,
        }),
      ).rejects.toMatchObject({ name: 'AI_InvalidArgumentError' });
      expect(spies.run).not.toHaveBeenCalled();
    });

    it('forwards the working directory, environment, and signal', async () => {
      const { sandbox, spies } = makeMockSandbox();
      runWith(spies, makeMockCommand());
      const abortSignal = new AbortController().signal;

      await new E2BSandboxSession(sandbox, '/home/user').run({
        command: 'ls',
        workingDirectory: '/work',
        env: { A: '1' },
        abortSignal,
      });

      expect(spies.run).toHaveBeenCalledWith('ls', {
        background: true,
        timeoutMs: 0,
        cwd: '/work',
        envs: { A: '1' },
        signal: abortSignal,
      });
    });

    it('resolves a relative working directory against the session working directory', async () => {
      const { sandbox, spies } = makeMockSandbox();
      runWith(spies, makeMockCommand());
      const session = new E2BSandboxSession(sandbox, '/home/user');

      await session.run({ command: 'ls', workingDirectory: 'repo/src' });

      expect(spies.run.mock.calls[0][1]).toMatchObject({
        cwd: '/home/user/repo/src',
      });
    });

    it('runs in the session working directory by default', async () => {
      const { sandbox, spies } = makeMockSandbox();
      runWith(spies, makeMockCommand());
      runWith(spies, makeMockCommand());
      const session = new E2BSandboxSession(sandbox, '/home/user');

      await session.run({ command: 'ls' });
      await session.run({ command: 'ls', workingDirectory: '/tmp' });

      expect(spies.run.mock.calls[0][1]).toMatchObject({ cwd: '/home/user' });
      expect(spies.run.mock.calls[1][1]).toMatchObject({ cwd: '/tmp' });
    });

    it('rethrows failures that are not an exit code', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const failure = new Error('sandbox is gone');
      runWith(spies, makeMockCommand({ waitError: failure }));

      await expect(
        new E2BSandboxSession(sandbox, '/home/user').run({ command: 'ls' }),
      ).rejects.toBe(failure);
    });

    it('does not start a command when the signal is already aborted', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const controller = new AbortController();
      controller.abort();

      await expect(
        new E2BSandboxSession(sandbox, '/home/user').run({
          command: 'ls',
          abortSignal: controller.signal,
        }),
      ).rejects.toMatchObject({ name: 'AbortError' });
      expect(spies.run).not.toHaveBeenCalled();
    });

    it('kills the process and rejects with the abort reason on abort', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const command = makeMockCommand({ pending: true });
      runWith(spies, command);
      const controller = new AbortController();

      const running = new E2BSandboxSession(sandbox, '/home/user').run({
        command: 'sleep 60',
        abortSignal: controller.signal,
      });
      await vi.waitFor(() => expect(command.spies.wait).toHaveBeenCalled());
      controller.abort(new Error('stop now'));

      await expect(running).rejects.toThrow('stop now');
      expect(command.spies.kill).toHaveBeenCalledOnce();
    });
  });

  describe('spawn', () => {
    it('streams stdout and stderr and resolves the exit code', async () => {
      const { sandbox, spies } = makeMockSandbox();
      runWith(
        spies,
        makeMockCommand({ stdout: ['a', 'b'], stderr: ['e'], exitCode: 3 }),
      );

      const process = await new E2BSandboxSession(sandbox, '/home/user').spawn({
        command: 'node server.js',
        workingDirectory: '/work',
        env: { PORT: '4000' },
      });

      expect(await process.wait()).toEqual({ exitCode: 3 });
      expect(await collect(process.stdout)).toBe('ab');
      expect(await collect(process.stderr)).toBe('e');
      expect(spies.run).toHaveBeenCalledWith(
        'node server.js',
        expect.objectContaining({
          background: true,
          timeoutMs: 0,
          cwd: '/work',
          envs: { PORT: '4000' },
        }),
      );
    });

    it('resolves a relative working directory against the session working directory', async () => {
      const { sandbox, spies } = makeMockSandbox();
      runWith(spies, makeMockCommand());
      const session = new E2BSandboxSession(sandbox, '/home/user');

      await session.spawn({ command: 'ls', workingDirectory: 'repo' });

      expect(spies.run.mock.calls[0][1]).toMatchObject({
        cwd: '/home/user/repo',
      });
    });

    it('does not keep stdin open unless it is requested', async () => {
      const { sandbox, spies } = makeMockSandbox();
      runWith(spies, makeMockCommand());
      runWith(spies, makeMockCommand());
      const session = new E2BSandboxSession(sandbox, '/home/user');

      const omitted = await session.spawn({ command: 'cat' });
      const disabled = await session.spawn({ command: 'cat', stdin: false });

      expect(spies.run.mock.calls[0][1]).not.toHaveProperty('stdin');
      expect(spies.run.mock.calls[1][1]).not.toHaveProperty('stdin');
      expect(omitted).not.toHaveProperty('stdin');
      expect(disabled).not.toHaveProperty('stdin');
    });

    it('keeps stdin open and forwards bytes, EOF, and the abort signal', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const command = makeMockCommand({ pending: true });
      runWith(spies, command);
      const controller = new AbortController();
      const session = new E2BSandboxSession(sandbox, '/home/user');

      const process = await session.spawn({
        command: 'cat',
        stdin: true,
        abortSignal: controller.signal,
      });
      const writer = process.stdin.getWriter();
      await writer.write(new Uint8Array([104, 105]));
      await writer.close();

      expect(spies.run.mock.calls[0][1]).toMatchObject({ stdin: true });
      expect(command.spies.sendStdin).toHaveBeenCalledExactlyOnceWith(
        new Uint8Array([104, 105]),
        { signal: controller.signal },
      );
      expect(command.spies.closeStdin).toHaveBeenCalledExactlyOnceWith({
        signal: controller.signal,
      });
      expect(command.spies.kill).not.toHaveBeenCalled();
    });

    it('waits for pending writes before sending more bytes or EOF', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const command = makeMockCommand({ pending: true });
      runWith(spies, command);
      let finishFirstWrite = () => {};
      command.spies.sendStdin.mockImplementationOnce(
        () =>
          new Promise<void>(resolve => {
            finishFirstWrite = resolve;
          }),
      );
      const session = new E2BSandboxSession(sandbox, '/home/user');

      const process = await session.spawn({ command: 'cat', stdin: true });
      const writer = process.stdin.getWriter();
      const first = writer.write(new Uint8Array([1]));
      const second = writer.write(new Uint8Array([2]));
      const closed = writer.close();
      await vi.waitFor(() =>
        expect(command.spies.sendStdin).toHaveBeenCalledTimes(1),
      );
      expect(command.spies.closeStdin).not.toHaveBeenCalled();

      finishFirstWrite();
      await Promise.all([first, second, closed]);

      expect(
        command.spies.sendStdin.mock.calls.map(([chunk]) => chunk[0]),
      ).toEqual([1, 2]);
      expect(command.spies.closeStdin).toHaveBeenCalledTimes(1);
    });

    it('sends EOF without killing the process when stdin is aborted', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const command = makeMockCommand({ pending: true });
      runWith(spies, command);
      const session = new E2BSandboxSession(sandbox, '/home/user');

      const process = await session.spawn({ command: 'cat', stdin: true });
      await process.stdin.abort();

      expect(command.spies.closeStdin).toHaveBeenCalledTimes(1);
      expect(command.spies.kill).not.toHaveBeenCalled();
    });

    it('propagates write failures without sending EOF or queued writes', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const command = makeMockCommand({ pending: true });
      runWith(spies, command);
      command.spies.sendStdin.mockRejectedValueOnce(new Error('write failed'));
      const session = new E2BSandboxSession(sandbox, '/home/user');

      const process = await session.spawn({ command: 'cat', stdin: true });
      const writer = process.stdin.getWriter();
      const results = await Promise.allSettled([
        writer.write(new Uint8Array([1])),
        writer.write(new Uint8Array([2])),
      ]);

      expect(results.map(result => result.status)).toEqual([
        'rejected',
        'rejected',
      ]);
      await expect(writer.closed).rejects.toThrow('write failed');
      expect(command.spies.sendStdin).toHaveBeenCalledTimes(1);
      expect(command.spies.closeStdin).not.toHaveBeenCalled();
    });

    it('propagates close failures', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const command = makeMockCommand({ pending: true });
      runWith(spies, command);
      command.spies.closeStdin.mockRejectedValueOnce(new Error('close failed'));
      const session = new E2BSandboxSession(sandbox, '/home/user');

      const process = await session.spawn({ command: 'cat', stdin: true });

      await expect(process.stdin.close()).rejects.toThrow('close failed');
    });

    it('errors stdin with the abort reason when the signal aborts', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const command = makeMockCommand({ pending: true });
      runWith(spies, command);
      const controller = new AbortController();
      const session = new E2BSandboxSession(sandbox, '/home/user');

      const process = await session.spawn({
        command: 'cat',
        stdin: true,
        abortSignal: controller.signal,
      });
      const writer = process.stdin.getWriter();
      controller.abort(new Error('user cancelled'));

      await expect(writer.write(new Uint8Array([1]))).rejects.toThrow(
        'user cancelled',
      );
      expect(command.spies.sendStdin).not.toHaveBeenCalled();
      expect(command.spies.closeStdin).not.toHaveBeenCalled();
    });

    it('kills the process through the handle', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const command = makeMockCommand({ pending: true });
      runWith(spies, command);

      const process = await new E2BSandboxSession(sandbox, '/home/user').spawn({
        command: 'sleep 60',
      });
      await process.kill();

      expect(command.spies.kill).toHaveBeenCalledOnce();
      expect(await process.wait()).toEqual({ exitCode: 137 });
    });

    it('kills the process and rejects wait() with the abort reason on abort', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const command = makeMockCommand({ pending: true });
      runWith(spies, command);
      const controller = new AbortController();

      const process = await new E2BSandboxSession(sandbox, '/home/user').spawn({
        command: 'sleep 60',
        abortSignal: controller.signal,
      });
      controller.abort(new Error('stop now'));

      await expect(process.wait()).rejects.toThrow('stop now');
      await expect(collect(process.stdout)).rejects.toThrow('stop now');
      expect(command.spies.kill).toHaveBeenCalledOnce();
    });

    it('errors the output streams when the command connection fails', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const failure = new Error('connection lost');
      runWith(spies, makeMockCommand({ waitError: failure }));

      const process = await new E2BSandboxSession(sandbox, '/home/user').spawn({
        command: 'node server.js',
      });

      await expect(process.wait()).rejects.toBe(failure);
      await expect(collect(process.stderr)).rejects.toBe(failure);
    });

    it('keeps delivering output after a stream is cancelled', async () => {
      const { sandbox, spies } = makeMockSandbox();
      let emit: ((data: string) => void) | undefined;
      const command = makeMockCommand({ pending: true });
      spies.run.mockImplementationOnce(
        async (_command: string, options: MockCommandOptions) => {
          emit = options.onStdout;
          return command.start(options);
        },
      );

      const process = await new E2BSandboxSession(sandbox, '/home/user').spawn({
        command: 'node server.js',
      });
      await process.stdout.cancel();

      expect(() => emit?.('late output')).not.toThrow();
      await process.kill();
      await process.wait();
    });
  });

  describe('reading files', () => {
    it('reads bytes and returns null for a missing file', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const bytes = new TextEncoder().encode('hello');
      spies.read.mockResolvedValueOnce(bytes);
      spies.read.mockRejectedValueOnce(new FileNotFoundError('no such file'));
      const session = new E2BSandboxSession(sandbox, '/home/user');

      expect(await session.readBinaryFile({ path: '/a.txt' })).toBe(bytes);
      expect(await session.readBinaryFile({ path: '/missing' })).toBeNull();
      expect(spies.read).toHaveBeenCalledWith('/a.txt', { format: 'bytes' });
    });

    it('rethrows other read failures', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const failure = new Error('permission denied');
      spies.read.mockRejectedValueOnce(failure);

      await expect(
        new E2BSandboxSession(sandbox, '/home/user').readBinaryFile({
          path: '/a.txt',
        }),
      ).rejects.toBe(failure);
    });

    it('reads a stream and null for a missing file', async () => {
      const { sandbox, spies } = makeMockSandbox();
      spies.read.mockResolvedValueOnce(new TextEncoder().encode('hello'));
      spies.read.mockRejectedValueOnce(new FileNotFoundError('no such file'));
      const session = new E2BSandboxSession(sandbox, '/home/user');

      const stream = await session.readFile({ path: '/a.txt' });
      expect(await collect(stream!)).toBe('hello');
      expect(await session.readFile({ path: '/missing' })).toBeNull();
    });

    it('decodes text with an encoding and a line range', async () => {
      const { sandbox, spies } = makeMockSandbox();
      spies.read.mockResolvedValue(Buffer.from('one\ntwö\nthree\n', 'latin1'));
      const session = new E2BSandboxSession(sandbox, '/home/user');

      expect(
        await session.readTextFile({
          path: '/a.txt',
          encoding: 'latin1',
          startLine: 2,
          endLine: 2,
        }),
      ).toBe('twö');
    });

    it('passes the abort signal and respects an aborted one', async () => {
      const { sandbox, spies } = makeMockSandbox();
      spies.read.mockResolvedValueOnce(new Uint8Array());
      const session = new E2BSandboxSession(sandbox, '/home/user');
      const abortSignal = new AbortController().signal;

      await session.readBinaryFile({ path: '/a.txt', abortSignal });
      expect(spies.read).toHaveBeenCalledWith('/a.txt', {
        format: 'bytes',
        signal: abortSignal,
      });

      const controller = new AbortController();
      controller.abort();
      await expect(
        session.readBinaryFile({
          path: '/a.txt',
          abortSignal: controller.signal,
        }),
      ).rejects.toMatchObject({ name: 'AbortError' });
      expect(spies.read).toHaveBeenCalledOnce();
    });
  });

  describe('writing files', () => {
    it('passes a stream through to the SDK', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const content = new ReadableStream<Uint8Array>();

      await new E2BSandboxSession(sandbox, '/home/user').writeFile({
        path: '/dir/a.bin',
        content,
      });

      expect(spies.write).toHaveBeenCalledWith(
        '/dir/a.bin',
        content,
        undefined,
      );
    });

    it('writes exactly the bytes of a view', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const backing = new Uint8Array([9, 1, 2, 3, 9]);
      const abortSignal = new AbortController().signal;

      await new E2BSandboxSession(sandbox, '/home/user').writeBinaryFile({
        path: '/a.bin',
        content: backing.subarray(1, 4),
        abortSignal,
      });

      const [path, data, options] = spies.write.mock.calls[0];
      expect(path).toBe('/a.bin');
      expect(new Uint8Array(await (data as Blob).arrayBuffer())).toEqual(
        new Uint8Array([1, 2, 3]),
      );
      expect(options).toEqual({ signal: abortSignal });
    });

    it('encodes text with the requested encoding', async () => {
      const { sandbox, spies } = makeMockSandbox();

      await new E2BSandboxSession(sandbox, '/home/user').writeTextFile({
        path: '/a.txt',
        content: 'é',
        encoding: 'latin1',
      });

      const data = spies.write.mock.calls[0][1] as Blob;
      expect(new Uint8Array(await data.arrayBuffer())).toEqual(
        new Uint8Array([0xe9]),
      );
    });

    it('does not write when the signal is already aborted', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const controller = new AbortController();
      controller.abort();

      await expect(
        new E2BSandboxSession(sandbox, '/home/user').writeTextFile({
          path: '/a.txt',
          content: 'hi',
          abortSignal: controller.signal,
        }),
      ).rejects.toMatchObject({ name: 'AbortError' });
      expect(spies.write).not.toHaveBeenCalled();
    });
  });

  describe('paths', () => {
    it('resolves relative paths against the session working directory', async () => {
      const { sandbox, spies } = makeMockSandbox();
      spies.read.mockResolvedValue(new Uint8Array());
      const session = new E2BSandboxSession(sandbox, '/home/user');

      await session.readBinaryFile({ path: 'notes/a.txt' });
      await session.readBinaryFile({ path: '/etc/hosts' });
      await session.writeTextFile({ path: 'b.txt', content: 'hi' });

      expect(spies.read.mock.calls.map(call => call[0])).toEqual([
        '/home/user/notes/a.txt',
        '/etc/hosts',
      ]);
      expect(spies.write.mock.calls[0][0]).toBe('/home/user/b.txt');
    });

    it('leaves `..` and trailing slashes for the sandbox to resolve', async () => {
      const { sandbox, spies } = makeMockSandbox();
      spies.read.mockResolvedValue(new Uint8Array());
      const session = new E2BSandboxSession(sandbox, '/home/user');

      await session.readBinaryFile({ path: 'link/../a.txt' });
      await session.readBinaryFile({ path: '/etc/link/../hosts' });

      expect(spies.read.mock.calls.map(call => call[0])).toEqual([
        '/home/user/link/../a.txt',
        '/etc/link/../hosts',
      ]);
    });

    it('does not double the slash of a root working directory', async () => {
      const { sandbox, spies } = makeMockSandbox();
      spies.read.mockResolvedValue(new Uint8Array());
      const session = new E2BSandboxSession(sandbox, '/');

      await session.readBinaryFile({ path: 'a.txt' });

      expect(spies.read.mock.calls[0][0]).toBe('/a.txt');
    });
  });
});

// Runs the adapter's path scripts with the local bash instead of an E2B
// sandbox, so the scripts themselves are tested.
function createLocalSandbox(env: Record<string, string> = {}): Sandbox {
  return {
    sandboxId: 'sbx_test',
    commands: {
      run: async (
        command: string,
        options: { cwd: string; envs?: Record<string, string> },
      ) => {
        const result = spawnSync('bash', ['-c', command], {
          cwd: options.cwd,
          env: { ...process.env, ...env, ...options.envs },
          encoding: 'utf8',
        });
        const finished = {
          exitCode: result.status ?? 1,
          stdout: result.stdout,
          stderr: result.stderr,
        };
        return {
          pid: 1,
          kill: async () => true,
          wait: async () => {
            if (finished.exitCode !== 0) throw new CommandExitError(finished);
            return finished;
          },
        };
      },
    },
  } as unknown as Sandbox;
}

describe('E2BSandboxSession path methods', () => {
  let directory: string;
  let session: E2BSandboxSession;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'e2b-sandbox-session-'));
    session = new E2BSandboxSession(createLocalSandbox(), directory);

    await writeFile(join(directory, 'file.txt'), 'hello');
    await mkdir(join(directory, 'dir'));
    await writeFile(join(directory, 'dir', 'nested.txt'), '');
    await writeFile(join(directory, '.hidden'), '');
    await writeFile(join(directory, 'with space\nand newline'), '');
    await symlink(join(directory, 'file.txt'), join(directory, 'file-link'));
    await symlink(join(directory, 'dir'), join(directory, 'dir-link'));
    await symlink(join(directory, 'missing'), join(directory, 'broken-link'));
    spawnSync('mkfifo', [join(directory, 'fifo')]);
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  describe('stat', () => {
    it('returns the type and size of a file', async () => {
      expect(await session.stat({ path: 'file.txt' })).toEqual({
        type: 'file',
        size: 5,
      });
    });

    it('returns directory for a directory', async () => {
      expect(await session.stat({ path: join(directory, 'dir') })).toEqual({
        type: 'directory',
        size: expect.any(Number),
      });
    });

    it('follows symbolic links', async () => {
      expect(await session.stat({ path: 'file-link' })).toEqual({
        type: 'file',
        size: 5,
      });
    });

    it('returns null for a missing path', async () => {
      expect(await session.stat({ path: 'missing.txt' })).toBeNull();
      expect(await session.stat({ path: 'file.txt/child' })).toBeNull();
    });

    it('returns null for a broken symbolic link', async () => {
      expect(await session.stat({ path: 'broken-link' })).toBeNull();
    });

    it('returns other for a named pipe', async () => {
      expect(await session.stat({ path: 'fifo' })).toEqual({
        type: 'other',
        size: 0,
      });
    });

    // Root can search any directory, so the check cannot fail as root.
    it.skipIf(process.getuid?.() === 0)(
      'rejects instead of returning null when a parent directory is not searchable',
      async () => {
        await mkdir(join(directory, 'locked'));
        await writeFile(join(directory, 'locked', 'secret.txt'), '');
        await chmod(join(directory, 'locked'), 0o000);
        try {
          await expect(
            session.stat({ path: 'locked/secret.txt' }),
          ).rejects.toThrow('Permission denied');
          await expect(
            session.listDirectory({ path: 'locked/missing' }),
          ).rejects.toThrow('Permission denied');
          await expect(
            session.deleteFile({ path: 'locked/secret.txt' }),
          ).rejects.toThrow('Permission denied');
        } finally {
          await chmod(join(directory, 'locked'), 0o755);
        }
      },
    );

    it('rejects for a symbolic link loop', async () => {
      await symlink(join(directory, 'loop'), join(directory, 'loop'));
      await expect(session.stat({ path: 'loop' })).rejects.toThrow(
        'Too many levels of symbolic links',
      );
      await expect(session.listDirectory({ path: 'loop' })).rejects.toThrow(
        'Too many levels of symbolic links',
      );
    });

    it('rejects when the signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();
      await expect(
        session.stat({ path: 'file.txt', abortSignal: controller.signal }),
      ).rejects.toThrow();
    });
  });

  describe('listDirectory', () => {
    it('lists entries with their types, including hidden entries', async () => {
      const entries = await session.listDirectory({ path: '.' });

      expect(entries?.sort((a, b) => a.name.localeCompare(b.name))).toEqual([
        { name: '.hidden', type: 'file' },
        { name: 'broken-link', type: 'symlink' },
        { name: 'dir', type: 'directory' },
        { name: 'dir-link', type: 'symlink' },
        { name: 'fifo', type: 'other' },
        { name: 'file-link', type: 'symlink' },
        { name: 'file.txt', type: 'file' },
        { name: 'with space\nand newline', type: 'file' },
      ]);
    });

    it('resolves `..` after a symbolic link in the filesystem', async () => {
      await mkdir(join(directory, 'deep', 'inner'), { recursive: true });
      await symlink(
        join(directory, 'deep', 'inner'),
        join(directory, 'inner-link'),
      );

      expect(await session.listDirectory({ path: 'inner-link/..' })).toEqual([
        { name: 'inner', type: 'directory' },
      ]);
    });

    it('returns an empty array for an empty directory', async () => {
      await mkdir(join(directory, 'empty'));
      expect(await session.listDirectory({ path: 'empty' })).toEqual([]);
    });

    it('returns null for a missing directory', async () => {
      expect(await session.listDirectory({ path: 'missing' })).toBeNull();
    });

    it('rejects for a file', async () => {
      await expect(session.listDirectory({ path: 'file.txt' })).rejects.toThrow(
        'Not a directory',
      );
    });

    it('lists a directory through a symbolic link', async () => {
      expect(await session.listDirectory({ path: 'dir-link' })).toEqual([
        { name: 'nested.txt', type: 'file' },
      ]);
    });

    it('returns null for a broken symbolic link', async () => {
      expect(await session.listDirectory({ path: 'broken-link' })).toBeNull();
    });

    it.skipIf(process.getuid?.() === 0)(
      'rejects for a directory that can be entered but not read',
      async () => {
        await chmod(join(directory, 'dir'), 0o311);
        try {
          await expect(session.listDirectory({ path: 'dir' })).rejects.toThrow(
            'Permission denied',
          );
        } finally {
          await chmod(join(directory, 'dir'), 0o755);
        }
      },
    );

    it('lists a directory named `-`', async () => {
      await mkdir(join(directory, '-'));
      await writeFile(join(directory, '-', 'inside.txt'), '');
      expect(await session.listDirectory({ path: '-' })).toEqual([
        { name: 'inside.txt', type: 'file' },
      ]);
    });

    it('ignores CDPATH', async () => {
      await mkdir(join(directory, 'other', 'dir'), { recursive: true });
      await writeFile(join(directory, 'other', 'dir', 'wrong.txt'), '');
      const withCdpath = new E2BSandboxSession(
        createLocalSandbox({ CDPATH: join(directory, 'other') }),
        directory,
      );
      expect(await withCdpath.listDirectory({ path: 'dir' })).toEqual([
        { name: 'nested.txt', type: 'file' },
      ]);
    });
  });

  describe('deleteFile', () => {
    it('deletes a file', async () => {
      expect(await session.deleteFile({ path: 'file.txt' })).toBe(true);
      expect(await session.stat({ path: 'file.txt' })).toBeNull();
    });

    it('returns false for a missing file', async () => {
      expect(await session.deleteFile({ path: 'missing.txt' })).toBe(false);
    });

    it('rejects for a directory', async () => {
      await expect(session.deleteFile({ path: 'dir' })).rejects.toThrow(
        'it is a directory',
      );
      expect(await session.stat({ path: 'dir' })).not.toBeNull();
    });

    it('deletes a symbolic link to a directory but not the directory', async () => {
      expect(await session.deleteFile({ path: 'dir-link' })).toBe(true);
      expect(await session.stat({ path: 'dir-link' })).toBeNull();
      expect(await session.stat({ path: 'dir/nested.txt' })).not.toBeNull();
    });

    it('rejects for a symbolic link to a directory with a trailing slash', async () => {
      await expect(session.deleteFile({ path: 'dir-link/' })).rejects.toThrow(
        'it is a directory',
      );
      expect(await session.stat({ path: 'dir-link' })).not.toBeNull();
      expect(await session.stat({ path: 'dir/nested.txt' })).not.toBeNull();
    });

    it('deletes a broken symbolic link', async () => {
      expect(await session.deleteFile({ path: 'broken-link' })).toBe(true);
      expect(
        await session
          .listDirectory({ path: '.' })
          .then(entries => entries?.map(entry => entry.name)),
      ).not.toContain('broken-link');
    });

    it('deletes a file in a symbolically linked directory', async () => {
      expect(await session.deleteFile({ path: 'dir-link/nested.txt' })).toBe(
        true,
      );
      expect(await session.stat({ path: 'dir/nested.txt' })).toBeNull();
    });
  });

  it('keeps paths out of the script instead of interpolating them', async () => {
    const path = '$(touch injected)';

    expect(await session.stat({ path })).toBeNull();
    expect(await session.listDirectory({ path })).toBeNull();
    expect(await session.deleteFile({ path })).toBe(false);
    expect(await session.stat({ path: 'injected' })).toBeNull();
  });
});
