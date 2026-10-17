import { CommandExitError, FileNotFoundError, type Sandbox } from 'e2b';
import { describe, expect, it, vi } from 'vitest';
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
  const start = (commandOptions: MockCommandOptions) => {
    for (const chunk of stdout) commandOptions.onStdout?.(chunk);
    for (const chunk of stderr) commandOptions.onStderr?.(chunk);
    return { pid: 1, wait, kill };
  };
  return { start, spies: { wait, kill } };
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
  });
});
