import type { Sandbox } from 'modal';
import { describe, expect, it, vi } from 'vitest';
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
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function toStream(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (text.length > 0) controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

function makeMockProcess(
  options: {
    stdout?: string;
    stderr?: string;
    exitCode?: number;
    exit?: Promise<number>;
  } = {},
) {
  const wait = vi.fn(
    () => options.exit ?? Promise.resolve(options.exitCode ?? 0),
  );
  return {
    handle: {
      stdout: toStream(options.stdout ?? ''),
      stderr: toStream(options.stderr ?? ''),
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
  });
});
