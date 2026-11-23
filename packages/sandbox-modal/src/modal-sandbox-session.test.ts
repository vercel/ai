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
import type { Sandbox } from 'modal';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModalSandboxSession } from './modal-sandbox-session';

const decoder = new TextDecoder();
const encoder = new TextEncoder();

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

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function toStream(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (text.length > 0) controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

function makeMockStdin(
  options: {
    write?: (chunk: Uint8Array) => Promise<void>;
    close?: () => Promise<void>;
  } = {},
) {
  const chunks: string[] = [];
  const write = vi.fn(
    options.write ??
      (async (chunk: Uint8Array) => {
        chunks.push(decoder.decode(chunk));
      }),
  );
  const close = vi.fn(options.close ?? (async () => {}));
  return {
    stream: new WritableStream<Uint8Array>({
      write: chunk => write(chunk),
      close: () => close(),
    }),
    chunks,
    spies: { write, close },
  };
}

function makeMockProcess(
  options: {
    stdout?: string;
    stderr?: string;
    exitCode?: number;
    exit?: Promise<number>;
    stdin?: WritableStream<Uint8Array>;
  } = {},
) {
  const wait = vi.fn(
    () => options.exit ?? Promise.resolve(options.exitCode ?? 0),
  );
  return {
    handle: {
      stdout: toStream(options.stdout ?? ''),
      stderr: toStream(options.stderr ?? ''),
      stdin: options.stdin,
      wait,
    },
    spies: { wait },
  };
}

function makeMockSandbox(): {
  sandbox: Sandbox;
  spies: {
    exec: ReturnType<typeof vi.fn>;
    readBytes: ReturnType<typeof vi.fn>;
    writeBytes: ReturnType<typeof vi.fn>;
  };
} {
  const exec = vi.fn();
  const readBytes = vi.fn();
  const writeBytes = vi.fn(async () => {});
  const sandbox = {
    sandboxId: 'sb-test',
    exec,
    filesystem: { readBytes, writeBytes },
  } as unknown as Sandbox;
  return { sandbox, spies: { exec, readBytes, writeBytes } };
}

function createSession(sandbox: Sandbox) {
  return new ModalSandboxSession(sandbox, '/workspace');
}

function makeModalError(name: string): Error {
  return Object.assign(new Error(name), { name });
}

describe('ModalSandboxSession', () => {
  describe('description', () => {
    it('mentions the sandbox ID and the working directory', () => {
      const { sandbox } = makeMockSandbox();
      const description = createSession(sandbox).description;
      expect(description).toContain('sb-test');
      expect(description).toContain('/workspace');
    });
  });

  describe('run', () => {
    it('runs the command through bash and maps stdout/stderr/exitCode', async () => {
      const { sandbox, spies } = makeMockSandbox();
      spies.exec.mockResolvedValueOnce(
        makeMockProcess({ stdout: 'hi\n', stderr: 'oops\n', exitCode: 3 })
          .handle,
      );

      const result = await createSession(sandbox).run({ command: 'echo hi' });

      const [argv, params] = spies.exec.mock.calls[0];
      expect(argv.slice(0, 2)).toEqual(['bash', '-c']);
      expect(argv[2]).toContain('bash -c "$2" < /dev/null &');
      expect(argv.slice(3)).toEqual([
        'bash',
        expect.stringMatching(/^\/tmp\/\.ai-sdk-sandbox-[\w-]+\.pid$/),
        'echo hi',
      ]);
      expect(params).toEqual({ mode: 'binary', workdir: '/workspace' });
      expect(result).toEqual({ exitCode: 3, stdout: 'hi\n', stderr: 'oops\n' });
    });

    it('forwards the working directory and environment', async () => {
      const { sandbox, spies } = makeMockSandbox();
      spies.exec.mockImplementation(async () => makeMockProcess().handle);
      const session = createSession(sandbox);

      await session.run({
        command: 'ls',
        workingDirectory: '/work',
        env: { TOKEN: 'secret' },
      });
      await session.run({ command: 'ls', workingDirectory: 'project' });

      expect(spies.exec.mock.calls[0][1]).toEqual({
        mode: 'binary',
        workdir: '/work',
        env: { TOKEN: 'secret' },
      });
      expect(spies.exec.mock.calls[1][1]).toEqual({
        mode: 'binary',
        workdir: '/workspace/project',
      });
    });

    it('throws on pre-aborted signal', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const controller = new AbortController();
      controller.abort();
      await expect(
        createSession(sandbox).run({
          command: 'echo',
          abortSignal: controller.signal,
        }),
      ).rejects.toMatchObject({ name: 'AbortError' });
      expect(spies.exec).not.toHaveBeenCalled();
    });

    it('drains capped output to completion and reports the full lengths', async () => {
      const { sandbox, spies } = makeMockSandbox();
      let completed = false;
      let chunksLeft = 512;
      const stdout = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('ab'));
        },
        pull(controller) {
          if (chunksLeft === 0) {
            completed = true;
            controller.close();
            return;
          }
          chunksLeft--;
          controller.enqueue(encoder.encode('x'.repeat(64 * 1024)));
        },
      });
      spies.exec.mockResolvedValueOnce({
        ...makeMockProcess({ stderr: 'error!', exitCode: 7 }).handle,
        stdout,
      });

      expect(
        await createSession(sandbox).run({
          command: 'noisy command; exit 7',
          maxOutputLength: 4,
        }),
      ).toEqual({
        exitCode: 7,
        stdout: 'abxx',
        stderr: 'erro',
        stdoutLength: 2 + 32 * 1024 * 1024,
        stderrLength: 6,
      });
      expect(completed).toBe(true);
    });

    it('counts UTF-16 code units across chunk boundaries with a cap', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const bytes = encoder.encode('a😀b');
      spies.exec.mockResolvedValueOnce({
        ...makeMockProcess().handle,
        stdout: new ReadableStream<Uint8Array>({
          start(controller) {
            // Splits the emoji's four UTF-8 bytes across two chunks.
            controller.enqueue(bytes.slice(0, 3));
            controller.enqueue(bytes.slice(3));
            controller.close();
          },
        }),
      });

      expect(
        await createSession(sandbox).run({
          command: 'unicode',
          maxOutputLength: 2,
        }),
      ).toEqual({
        exitCode: 0,
        stdout: 'a\ud83d',
        stderr: '',
        stdoutLength: 4,
        stderrLength: 0,
      });
    });

    it('rejects an invalid cap before starting the command', async () => {
      const { sandbox, spies } = makeMockSandbox();

      await expect(
        createSession(sandbox).run({ command: 'echo', maxOutputLength: 0 }),
      ).rejects.toMatchObject({ name: 'AI_InvalidArgumentError' });
      expect(spies.exec).not.toHaveBeenCalled();
    });
  });

  describe('file I/O', () => {
    it('writeBinaryFile writes the bytes to the absolute path', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const bytes = new Uint8Array([0, 1, 2, 255]);

      await createSession(sandbox).writeBinaryFile({
        path: '/work/sub/file.bin',
        content: bytes,
      });

      expect(spies.writeBytes).toHaveBeenCalledWith(
        bytes,
        '/work/sub/file.bin',
      );
    });

    it('resolves relative paths against the working directory', async () => {
      const { sandbox, spies } = makeMockSandbox();
      spies.readBytes.mockResolvedValueOnce(new Uint8Array([1]));
      const session = createSession(sandbox);

      await session.writeTextFile({ path: 'notes/hello.txt', content: 'hi' });
      await session.readBinaryFile({ path: 'notes/hello.txt' });

      expect(spies.writeBytes.mock.calls[0][1]).toBe(
        '/workspace/notes/hello.txt',
      );
      expect(spies.readBytes).toHaveBeenCalledWith(
        '/workspace/notes/hello.txt',
      );
    });

    it('uses absolute paths as is and does not normalize relative paths', async () => {
      const { sandbox, spies } = makeMockSandbox();
      spies.readBytes.mockResolvedValue(new Uint8Array([1]));
      spies.exec.mockImplementation(async () => makeMockProcess().handle);
      const session = createSession(sandbox);

      await session.readBinaryFile({ path: '/data/link/../hello.txt' });
      await session.readBinaryFile({ path: 'link/../hello.txt' });
      await session.run({ command: 'ls', workingDirectory: 'link/..' });

      expect(spies.readBytes.mock.calls).toEqual([
        ['/data/link/../hello.txt'],
        ['/workspace/link/../hello.txt'],
      ]);
      expect(spies.exec.mock.calls[0][1].workdir).toBe('/workspace/link/..');
    });

    it('resolves relative paths against a root working directory', async () => {
      const { sandbox, spies } = makeMockSandbox();
      spies.exec.mockImplementation(async () => makeMockProcess().handle);
      const session = new ModalSandboxSession(sandbox, '/');

      await session.writeTextFile({ path: 'hello.txt', content: 'hi' });
      await session.run({ command: 'ls' });
      await session.run({ command: 'ls', workingDirectory: 'tmp' });

      expect(spies.writeBytes.mock.calls[0][1]).toBe('/hello.txt');
      expect(spies.exec.mock.calls[0][1].workdir).toBe('/');
      expect(spies.exec.mock.calls[1][1].workdir).toBe('/tmp');
    });

    it('rejects writing to a directory', async () => {
      const { sandbox, spies } = makeMockSandbox();
      spies.writeBytes.mockRejectedValueOnce(
        makeModalError('SandboxFilesystemIsADirectoryError'),
      );

      await expect(
        createSession(sandbox).writeTextFile({ path: 'dir', content: 'hi' }),
      ).rejects.toThrow('SandboxFilesystemIsADirectoryError');
    });

    it('writeTextFile encodes utf-8 and delegates', async () => {
      const { sandbox, spies } = makeMockSandbox();

      await createSession(sandbox).writeTextFile({
        path: '/work/hello.txt',
        content: 'hi',
      });

      const [content, path] = spies.writeBytes.mock.calls[0];
      expect(path).toBe('/work/hello.txt');
      expect(Buffer.from(content).toString('utf8')).toBe('hi');
    });

    it('readBinaryFile returns the file bytes', async () => {
      const { sandbox, spies } = makeMockSandbox();
      spies.readBytes.mockResolvedValueOnce(new Uint8Array([1, 2, 3]));

      expect(
        await createSession(sandbox).readBinaryFile({ path: '/work/x' }),
      ).toEqual(new Uint8Array([1, 2, 3]));
    });

    it('readBinaryFile maps a missing file to null', async () => {
      const { sandbox, spies } = makeMockSandbox();
      spies.readBytes.mockRejectedValueOnce(
        makeModalError('SandboxFilesystemNotFoundError'),
      );

      expect(
        await createSession(sandbox).readBinaryFile({ path: '/missing' }),
      ).toBeNull();
    });

    it('readBinaryFile rethrows other filesystem errors', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const denied = makeModalError('SandboxFilesystemPermissionError');
      spies.readBytes.mockRejectedValueOnce(denied);

      await expect(
        createSession(sandbox).readBinaryFile({ path: '/root/secret' }),
      ).rejects.toBe(denied);
    });

    it('readTextFile honours startLine/endLine', async () => {
      const { sandbox, spies } = makeMockSandbox();
      spies.readBytes.mockResolvedValueOnce(encoder.encode('a\nb\nc\nd\n'));

      expect(
        await createSession(sandbox).readTextFile({
          path: '/x',
          startLine: 2,
          endLine: 3,
        }),
      ).toBe('b\nc');
    });

    it('readFile/writeFile round-trip through Web streams', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const session = createSession(sandbox);

      await session.writeFile({
        path: '/work/streamed.txt',
        content: toStream('streamed'),
      });
      expect(spies.writeBytes.mock.calls[0][0]).toEqual(
        encoder.encode('streamed'),
      );

      spies.readBytes.mockResolvedValueOnce(encoder.encode('streamed'));
      const stream = await session.readFile({ path: '/work/streamed.txt' });
      expect(stream).not.toBeNull();
      expect(await collect(stream!)).toBe('streamed');
    });

    it('readFile resolves to null when the file does not exist', async () => {
      const { sandbox, spies } = makeMockSandbox();
      spies.readBytes.mockRejectedValueOnce(
        makeModalError('SandboxFilesystemNotFoundError'),
      );

      expect(await createSession(sandbox).readFile({ path: '/missing' })).toBe(
        null,
      );
    });
  });

  describe('spawn', () => {
    it('streams stdout and stderr and resolves wait()', async () => {
      const { sandbox, spies } = makeMockSandbox();
      spies.exec.mockResolvedValueOnce(
        makeMockProcess({ stdout: 'out\n', stderr: 'err\n' }).handle,
      );

      const process = await createSession(sandbox).spawn({
        command: 'node x.js',
      });
      const [stdout, stderr, { exitCode }] = await Promise.all([
        collect(process.stdout),
        collect(process.stderr),
        process.wait(),
      ]);

      expect(stdout).toBe('out\n');
      expect(stderr).toBe('err\n');
      expect(exitCode).toBe(0);
    });

    it('surfaces non-zero exit codes via wait()', async () => {
      const { sandbox, spies } = makeMockSandbox();
      spies.exec.mockResolvedValueOnce(makeMockProcess({ exitCode: 7 }).handle);

      const process = await createSession(sandbox).spawn({ command: 'exit 7' });

      expect((await process.wait()).exitCode).toBe(7);
    });

    it('kill() signals the process recorded by the spawn', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const exit = createDeferred<number>();
      spies.exec
        .mockResolvedValueOnce(makeMockProcess({ exit: exit.promise }).handle)
        .mockResolvedValueOnce(makeMockProcess().handle);

      const process = await createSession(sandbox).spawn({
        command: 'sleep 10',
      });
      await process.kill();

      const processIdFile = spies.exec.mock.calls[0][0][4];
      const [argv, params] = spies.exec.mock.calls[1];
      expect(argv.slice(0, 2)).toEqual(['bash', '-c']);
      expect(argv[2]).toContain('kill -TERM');
      expect(argv.slice(3)).toEqual(['bash', processIdFile]);
      expect(params).toEqual({ stdout: 'ignore', stderr: 'ignore' });

      exit.resolve(143);
      expect((await process.wait()).exitCode).toBe(143);
    });

    it('kill() does nothing once the process has exited', async () => {
      const { sandbox, spies } = makeMockSandbox();
      spies.exec.mockResolvedValueOnce(makeMockProcess().handle);

      const process = await createSession(sandbox).spawn({ command: 'true' });
      await process.wait();
      await process.kill();

      expect(spies.exec).toHaveBeenCalledOnce();
    });

    it('aborting kills the process and causes wait() to reject', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const exit = createDeferred<number>();
      const killed = createDeferred<void>();
      spies.exec
        .mockResolvedValueOnce(makeMockProcess({ exit: exit.promise }).handle)
        .mockImplementationOnce(async () => {
          killed.resolve();
          return makeMockProcess().handle;
        });
      const controller = new AbortController();

      const process = await createSession(sandbox).spawn({
        command: 'sleep 10',
        abortSignal: controller.signal,
      });
      controller.abort(new Error('user cancelled'));
      await killed.promise;
      exit.resolve(143);

      await expect(process.wait()).rejects.toThrow('user cancelled');
      expect(spies.exec).toHaveBeenCalledTimes(2);
    });

    it('closes standard input unless stdin is true', async () => {
      const { sandbox, spies } = makeMockSandbox();
      spies.exec.mockImplementation(async () => makeMockProcess().handle);
      const session = createSession(sandbox);

      const omitted = await session.spawn({ command: 'cat' });
      const disabled = await session.spawn({ command: 'cat', stdin: false });

      for (const [argv] of spies.exec.mock.calls) {
        expect(argv[2]).toContain('bash -c "$2" < /dev/null &');
      }
      expect(omitted).not.toHaveProperty('stdin');
      expect(disabled).not.toHaveProperty('stdin');
    });

    it('keeps standard input open and forwards bytes and EOF when stdin is true', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const stdin = makeMockStdin();
      spies.exec.mockResolvedValueOnce(
        makeMockProcess({ stdin: stdin.stream }).handle,
      );

      const process = await createSession(sandbox).spawn({
        command: 'cat',
        stdin: true,
      });
      const writer = process.stdin.getWriter();
      await writer.write(encoder.encode('hello '));
      await writer.write(encoder.encode('world'));
      await writer.close();

      expect(spies.exec.mock.calls[0][0][2]).toContain('bash -c "$2" &');
      expect(spies.exec.mock.calls[0][1].mode).toBe('binary');
      expect(stdin.chunks).toEqual(['hello ', 'world']);
      expect(stdin.spies.close).toHaveBeenCalledTimes(1);
    });

    it('waits for pending writes before sending more bytes or EOF', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const firstWrite = createDeferred<void>();
      const stdin = makeMockStdin({
        write: vi
          .fn(async () => {})
          .mockImplementationOnce(() => firstWrite.promise),
      });
      spies.exec.mockResolvedValueOnce(
        makeMockProcess({ stdin: stdin.stream }).handle,
      );

      const process = await createSession(sandbox).spawn({
        command: 'cat',
        stdin: true,
      });
      const writer = process.stdin.getWriter();
      const first = writer.write(encoder.encode('first'));
      const second = writer.write(encoder.encode('second'));
      const closed = writer.close();
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(stdin.spies.write).toHaveBeenCalledTimes(1);
      expect(stdin.spies.close).not.toHaveBeenCalled();

      firstWrite.resolve();
      await Promise.all([first, second, closed]);

      expect(stdin.spies.write).toHaveBeenCalledTimes(2);
      expect(stdin.spies.close).toHaveBeenCalledTimes(1);
    });

    it('aborting stdin sends EOF without killing the process', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const stdin = makeMockStdin();
      const exit = createDeferred<number>();
      spies.exec.mockResolvedValueOnce(
        makeMockProcess({ stdin: stdin.stream, exit: exit.promise }).handle,
      );

      const process = await createSession(sandbox).spawn({
        command: 'cat',
        stdin: true,
      });
      await process.stdin.abort(new Error('done writing'));

      expect(stdin.spies.close).toHaveBeenCalledTimes(1);
      expect(spies.exec).toHaveBeenCalledTimes(1);

      exit.resolve(0);
      await expect(process.wait()).resolves.toEqual({ exitCode: 0 });
    });

    it('rejects stdin writes once the signal aborts, without sending EOF', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const stdin = makeMockStdin();
      const exit = createDeferred<number>();
      spies.exec.mockImplementation(async () =>
        spies.exec.mock.calls.length === 1
          ? makeMockProcess({ stdin: stdin.stream, exit: exit.promise }).handle
          : makeMockProcess().handle,
      );
      const controller = new AbortController();

      const process = await createSession(sandbox).spawn({
        command: 'cat',
        stdin: true,
        abortSignal: controller.signal,
      });
      const writer = process.stdin.getWriter();
      controller.abort(new Error('user cancelled'));

      await expect(writer.write(encoder.encode('late'))).rejects.toThrow(
        'user cancelled',
      );
      expect(stdin.spies.write).not.toHaveBeenCalled();
      expect(stdin.spies.close).not.toHaveBeenCalled();

      exit.resolve(143);
      await expect(process.wait()).rejects.toThrow('user cancelled');
    });

    it('handles a signal that aborts while the command is starting', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const stdin = makeMockStdin();
      const started = createDeferred<ReturnType<typeof makeMockProcess>>();
      const exit = createDeferred<number>();
      spies.exec
        .mockImplementationOnce(() =>
          started.promise.then(({ handle }) => handle),
        )
        .mockImplementation(async () => {
          exit.resolve(143);
          return makeMockProcess().handle;
        });
      const controller = new AbortController();

      const spawned = createSession(sandbox).spawn({
        command: 'cat',
        stdin: true,
        abortSignal: controller.signal,
      });
      controller.abort(new Error('user cancelled'));
      started.resolve(
        makeMockProcess({ stdin: stdin.stream, exit: exit.promise }),
      );
      const process = await spawned;

      await expect(
        process.stdin.getWriter().write(encoder.encode('late')),
      ).rejects.toThrow('user cancelled');
      await expect(process.wait()).rejects.toThrow('user cancelled');
      expect(spies.exec).toHaveBeenCalledTimes(2);
    });

    it('propagates write failures without sending queued writes or EOF', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const stdin = makeMockStdin({
        write: async () => {
          throw new Error('write failed');
        },
      });
      spies.exec.mockResolvedValueOnce(
        makeMockProcess({ stdin: stdin.stream }).handle,
      );

      const process = await createSession(sandbox).spawn({
        command: 'cat',
        stdin: true,
      });
      const writer = process.stdin.getWriter();
      const first = writer.write(encoder.encode('first'));
      const second = writer.write(encoder.encode('second'));

      await expect(first).rejects.toThrow('write failed');
      await expect(second).rejects.toThrow('write failed');
      // Closing an errored stream rejects with a TypeError, per the Streams
      // standard, and must not reach the native stdin.
      await expect(writer.close()).rejects.toThrow(TypeError);
      expect(stdin.spies.write).toHaveBeenCalledTimes(1);
      expect(stdin.spies.close).not.toHaveBeenCalled();
    });

    it('propagates close failures', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const stdin = makeMockStdin({
        close: async () => {
          throw new Error('close failed');
        },
      });
      spies.exec.mockResolvedValueOnce(
        makeMockProcess({ stdin: stdin.stream }).handle,
      );

      const process = await createSession(sandbox).spawn({
        command: 'cat',
        stdin: true,
      });

      await expect(process.stdin.getWriter().close()).rejects.toThrow(
        'close failed',
      );
    });

    it('does not start a command when the signal is already aborted', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const controller = new AbortController();
      controller.abort(new Error('user cancelled'));

      await expect(
        createSession(sandbox).spawn({
          command: 'cat',
          stdin: true,
          abortSignal: controller.signal,
        }),
      ).rejects.toThrow('user cancelled');
      expect(spies.exec).not.toHaveBeenCalled();
    });
  });
});

// Runs the session's path scripts with the local bash instead of a Modal
// sandbox, so the scripts themselves are tested. The scripts receive absolute
// paths, so they run outside the session's working directory.
function createLocalSandbox(env: Record<string, string> = {}): Sandbox {
  return {
    sandboxId: 'sb-test',
    exec: async ([command, ...args]: string[]) => {
      const result = spawnSync(command, args, {
        cwd: tmpdir(),
        env: { ...process.env, ...env },
        encoding: 'utf8',
      });
      return {
        stdout: toStream(result.stdout),
        stderr: toStream(result.stderr),
        wait: async () => result.status ?? 1,
      };
    },
  } as unknown as Sandbox;
}

describe('ModalSandboxSession path methods', () => {
  let directory: string;
  let session: ModalSandboxSession;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'modal-sandbox-session-'));
    session = new ModalSandboxSession(createLocalSandbox(), directory);

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
      controller.abort(new Error('user cancelled'));
      await expect(
        session.stat({ path: 'file.txt', abortSignal: controller.signal }),
      ).rejects.toThrow('user cancelled');
    });

    it('rejects when the signal aborts during the call', async () => {
      const controller = new AbortController();
      const stat = session.stat({
        path: 'file.txt',
        abortSignal: controller.signal,
      });
      controller.abort(new Error('user cancelled'));
      await expect(stat).rejects.toThrow('user cancelled');
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
      const withCdpath = new ModalSandboxSession(
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

    it('rejects for a directory, even an empty one', async () => {
      await mkdir(join(directory, 'empty'));
      await expect(session.deleteFile({ path: 'empty' })).rejects.toThrow(
        'it is a directory',
      );
      expect(await session.stat({ path: 'empty' })).not.toBeNull();
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

  it('passes paths as arguments instead of interpolating them', async () => {
    const path = '$(touch injected)';

    expect(await session.stat({ path })).toBeNull();
    expect(await session.listDirectory({ path })).toBeNull();
    expect(await session.deleteFile({ path })).toBe(false);
    expect(await session.stat({ path: 'injected' })).toBeNull();
  });
});
