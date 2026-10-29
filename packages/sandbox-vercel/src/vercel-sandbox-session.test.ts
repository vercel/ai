import type { Sandbox } from '@vercel/sandbox';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VercelSandboxSession } from './vercel-sandbox-session';

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

type MockLogEntry = { stream: 'stdout' | 'stderr'; data: string };

function makeMockCommand(options: {
  logs?: MockLogEntry[];
  exitCode?: number;
}) {
  const entries = options.logs ?? [];
  const wait = vi.fn(async (waitOptions?: { signal?: AbortSignal }) => {
    waitOptions?.signal?.throwIfAborted();
    return { exitCode: options.exitCode ?? 0 };
  });
  const kill = vi.fn(async () => {});
  const writeStdin = vi.fn(
    async (_data: Uint8Array, _options?: { abortSignal?: AbortSignal }) => {},
  );
  const closeStdin = vi.fn(
    async (_options?: { abortSignal?: AbortSignal }) => {},
  );
  const stdout = vi.fn(async () =>
    entries
      .filter(e => e.stream === 'stdout')
      .map(e => e.data)
      .join(''),
  );
  const stderr = vi.fn(async () =>
    entries
      .filter(e => e.stream === 'stderr')
      .map(e => e.data)
      .join(''),
  );
  const logs = vi.fn(async function* () {
    for (const entry of entries) yield entry;
  });
  return {
    handle: {
      wait,
      kill,
      writeStdin,
      closeStdin,
      stdout,
      stderr,
      logs,
      exitCode: options.exitCode,
    },
    spies: { wait, kill, logs, writeStdin, closeStdin },
  };
}

function makeMockSandbox(overrides: Partial<Sandbox> = {}): {
  sandbox: Sandbox;
  spies: {
    runCommand: ReturnType<typeof vi.fn>;
    writeFiles: ReturnType<typeof vi.fn>;
    readFileToBuffer: ReturnType<typeof vi.fn>;
  };
} {
  const runCommand = vi.fn();
  const writeFiles = vi.fn(async () => {});
  const readFileToBuffer = vi.fn();
  const sandbox = {
    name: 'sbx_test',
    runCommand,
    writeFiles,
    readFileToBuffer,
    ...overrides,
  } as unknown as Sandbox;
  return { sandbox, spies: { runCommand, writeFiles, readFileToBuffer } };
}

describe('VercelSandboxSession', () => {
  describe('description', () => {
    it('mentions the sandbox name', () => {
      const { sandbox } = makeMockSandbox();
      expect(new VercelSandboxSession(sandbox).description).toContain(
        'sbx_test',
      );
    });
  });

  describe('run', () => {
    it('wraps the command in bash -c and maps stdout/stderr/exitCode', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const { handle } = makeMockCommand({
        logs: [
          { stream: 'stdout', data: 'hi\n' },
          { stream: 'stderr', data: 'oops\n' },
        ],
        exitCode: 0,
      });
      spies.runCommand.mockResolvedValueOnce(handle);

      const vsbx = new VercelSandboxSession(sandbox);
      const result = await vsbx.run({ command: 'echo hi' });

      expect(spies.runCommand).toHaveBeenCalledWith(
        expect.objectContaining({ cmd: 'bash', args: ['-c', 'echo hi'] }),
      );
      expect(result).toEqual({ exitCode: 0, stdout: 'hi\n', stderr: 'oops\n' });
    });

    it('forwards workingDirectory as cwd', async () => {
      const { sandbox, spies } = makeMockSandbox();
      spies.runCommand.mockResolvedValueOnce(
        makeMockCommand({ logs: [], exitCode: 0 }).handle,
      );

      await new VercelSandboxSession(sandbox).run({
        command: 'ls',
        workingDirectory: '/work',
      });

      expect(spies.runCommand).toHaveBeenCalledWith(
        expect.objectContaining({ cwd: '/work' }),
      );
    });

    it('throws on pre-aborted signal', async () => {
      const { sandbox } = makeMockSandbox();
      const ac = new AbortController();
      ac.abort();
      await expect(
        new VercelSandboxSession(sandbox).run({
          command: 'echo',
          abortSignal: ac.signal,
        }),
      ).rejects.toThrow();
    });
  });

  describe('file I/O', () => {
    it('writeBinaryFile creates parent dirs and writes Uint8Array', async () => {
      const { sandbox, spies } = makeMockSandbox();
      spies.runCommand.mockResolvedValue(
        makeMockCommand({ logs: [], exitCode: 0 }).handle,
      );

      const bytes = new Uint8Array([0, 1, 2, 255]);
      await new VercelSandboxSession(sandbox).writeBinaryFile({
        path: '/work/sub/file.bin',
        content: bytes,
      });

      expect(spies.runCommand).toHaveBeenCalledWith(
        expect.objectContaining({ cmd: 'mkdir', args: ['-p', '/work/sub'] }),
      );
      expect(spies.writeFiles).toHaveBeenCalledWith(
        [{ path: '/work/sub/file.bin', content: bytes }],
        undefined,
      );
    });

    it('writeTextFile encodes utf-8 and delegates', async () => {
      const { sandbox, spies } = makeMockSandbox();
      spies.runCommand.mockResolvedValue(
        makeMockCommand({ logs: [], exitCode: 0 }).handle,
      );

      await new VercelSandboxSession(sandbox).writeTextFile({
        path: '/work/hello.txt',
        content: 'hi',
      });

      expect(spies.writeFiles).toHaveBeenCalled();
      const [files] = spies.writeFiles.mock.calls[0];
      expect(files[0].path).toBe('/work/hello.txt');
      expect(Buffer.from(files[0].content).toString('utf8')).toBe('hi');
    });

    it('writeTextFiles creates unique parent dirs and writes files together', async () => {
      const { sandbox, spies } = makeMockSandbox();
      spies.runCommand.mockResolvedValue(
        makeMockCommand({ logs: [], exitCode: 0 }).handle,
      );

      await new VercelSandboxSession(sandbox).writeTextFiles({
        files: [
          { path: '/work/skills/one/SKILL.md', content: 'first' },
          { path: '/work/skills/one/reference.md', content: 'second' },
          { path: '/work/skills/two/reference.md', content: 'third' },
        ],
      });

      expect(spies.runCommand).toHaveBeenCalledTimes(1);
      expect(spies.runCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          cmd: 'mkdir',
          args: ['-p', '/work/skills/one', '/work/skills/two'],
        }),
      );
      expect(spies.writeFiles).toHaveBeenCalledTimes(1);
      const [files] = spies.writeFiles.mock.calls[0];
      expect(
        files.map((file: { path: string; content: Uint8Array }) => ({
          path: file.path,
          content: Buffer.from(file.content).toString('utf8'),
        })),
      ).toEqual([
        { path: '/work/skills/one/SKILL.md', content: 'first' },
        { path: '/work/skills/one/reference.md', content: 'second' },
        { path: '/work/skills/two/reference.md', content: 'third' },
      ]);
    });

    it('writeTextFiles rejects when parent directory creation fails', async () => {
      const { sandbox, spies } = makeMockSandbox();
      spies.runCommand.mockResolvedValue(
        makeMockCommand({
          logs: [{ stream: 'stderr', data: 'permission denied' }],
          exitCode: 1,
        }).handle,
      );

      await expect(
        new VercelSandboxSession(sandbox).writeTextFiles({
          files: [{ path: '/work/skills/demo/SKILL.md', content: 'skill' }],
        }),
      ).rejects.toThrow(
        'Failed to create parent directories for sandbox files (exit 1): permission denied',
      );
      expect(spies.writeFiles).not.toHaveBeenCalled();
    });

    it('writeTextFiles propagates SDK batch write failures', async () => {
      const { sandbox, spies } = makeMockSandbox();
      spies.runCommand.mockResolvedValue(
        makeMockCommand({ logs: [], exitCode: 0 }).handle,
      );
      const failure = new Error('batch upload failed');
      spies.writeFiles.mockRejectedValueOnce(failure);

      await expect(
        new VercelSandboxSession(sandbox).writeTextFiles({
          files: [{ path: '/work/skills/demo/SKILL.md', content: 'skill' }],
        }),
      ).rejects.toBe(failure);
      expect(spies.writeFiles).toHaveBeenCalledOnce();
    });

    it('readBinaryFile returns the buffer bytes', async () => {
      const { sandbox, spies } = makeMockSandbox();
      spies.readFileToBuffer.mockResolvedValueOnce(Buffer.from([1, 2, 3]));

      const out = await new VercelSandboxSession(sandbox).readBinaryFile({
        path: '/work/x',
      });
      expect(out).toEqual(new Uint8Array([1, 2, 3]));
    });

    it('readBinaryFile returns null when SDK returns null', async () => {
      const { sandbox, spies } = makeMockSandbox();
      spies.readFileToBuffer.mockResolvedValueOnce(null);
      expect(
        await new VercelSandboxSession(sandbox).readBinaryFile({
          path: '/missing',
        }),
      ).toBeNull();
    });

    it('readBinaryFile maps ENOENT-shaped errors to null', async () => {
      const { sandbox, spies } = makeMockSandbox();
      spies.readFileToBuffer.mockRejectedValueOnce(
        Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' }),
      );
      expect(
        await new VercelSandboxSession(sandbox).readBinaryFile({
          path: '/missing',
        }),
      ).toBeNull();
    });

    it('readTextFile honours startLine/endLine', async () => {
      const { sandbox, spies } = makeMockSandbox();
      spies.readFileToBuffer.mockResolvedValueOnce(Buffer.from('a\nb\nc\nd\n'));

      const out = await new VercelSandboxSession(sandbox).readTextFile({
        path: '/x',
        startLine: 2,
        endLine: 3,
      });
      expect(out).toBe('b\nc');
    });

    it('readFile/writeFile round-trip through Web streams', async () => {
      const { sandbox, spies } = makeMockSandbox();
      spies.runCommand.mockResolvedValue(
        makeMockCommand({ logs: [], exitCode: 0 }).handle,
      );

      const payload = new TextEncoder().encode('streamed');
      await new VercelSandboxSession(sandbox).writeFile({
        path: '/work/streamed.txt',
        content: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(payload);
            controller.close();
          },
        }),
      });
      const [files] = spies.writeFiles.mock.calls[0];
      expect(files[0].content).toEqual(payload);

      spies.readFileToBuffer.mockResolvedValueOnce(Buffer.from(payload));
      const stream = await new VercelSandboxSession(sandbox).readFile({
        path: '/work/streamed.txt',
      });
      expect(stream).not.toBeNull();
      expect(await collect(stream!)).toBe('streamed');
    });
  });

  describe('spawn', () => {
    let baseSandbox: ReturnType<typeof makeMockSandbox>;

    beforeEach(() => {
      baseSandbox = makeMockSandbox();
    });

    it('enables writable stdin and forwards bytes and the abort signal', async () => {
      const { handle, spies } = makeMockCommand({});
      baseSandbox.spies.runCommand.mockResolvedValueOnce(handle);
      const { signal } = new AbortController();
      const proc = await new VercelSandboxSession(baseSandbox.sandbox).spawn({
        command: 'cat',
        stdin: true,
        workingDirectory: '/work',
        env: { EXAMPLE: 'value' },
        abortSignal: signal,
      });

      expect(baseSandbox.spies.runCommand).toHaveBeenCalledWith({
        cmd: 'bash',
        args: ['-c', 'cat'],
        detached: true,
        stdin: true,
        cwd: '/work',
        env: { EXAMPLE: 'value' },
        signal,
      });

      const writer = proc.stdin.getWriter();
      const chunks = [new Uint8Array([0, 255, 128]), new Uint8Array([10])];
      for (const chunk of chunks) await writer.write(chunk);
      await writer.close();

      expect(spies.writeStdin.mock.calls).toEqual([
        [chunks[0], { abortSignal: signal }],
        [chunks[1], { abortSignal: signal }],
      ]);
      expect(spies.closeStdin).toHaveBeenCalledExactlyOnceWith({
        abortSignal: signal,
      });
      expect(spies.kill).not.toHaveBeenCalled();
      expect(spies.wait).not.toHaveBeenCalled();

      await expect(writer.write(new Uint8Array([1]))).rejects.toThrow();
      expect(spies.writeStdin).toHaveBeenCalledTimes(2);
    });

    it('waits for pending writes before sending more bytes or EOF', async () => {
      const { handle, spies } = makeMockCommand({});
      let finishFirstWrite!: () => void;
      let finishSecondWrite!: () => void;
      spies.writeStdin
        .mockImplementationOnce(
          () => new Promise<void>(resolve => (finishFirstWrite = resolve)),
        )
        .mockImplementationOnce(
          () => new Promise<void>(resolve => (finishSecondWrite = resolve)),
        );
      baseSandbox.spies.runCommand.mockResolvedValueOnce(handle);
      const proc = await new VercelSandboxSession(baseSandbox.sandbox).spawn({
        command: 'cat',
        stdin: true,
      });
      const writer = proc.stdin.getWriter();
      const firstWrite = writer.write(new Uint8Array([1]));
      const secondWrite = writer.write(new Uint8Array([2]));
      const close = writer.close();

      await vi.waitFor(() => expect(spies.writeStdin).toHaveBeenCalledTimes(1));
      expect(spies.closeStdin).not.toHaveBeenCalled();

      finishFirstWrite();
      await firstWrite;
      await vi.waitFor(() => expect(spies.writeStdin).toHaveBeenCalledTimes(2));
      expect(spies.closeStdin).not.toHaveBeenCalled();

      finishSecondWrite();
      await secondWrite;
      await close;
      expect(spies.writeStdin.mock.calls.map(([chunk]) => [...chunk])).toEqual([
        [1],
        [2],
      ]);
      expect(spies.closeStdin).toHaveBeenCalledExactlyOnceWith({
        abortSignal: undefined,
      });
    });

    it('aborting stdin sends EOF without killing or waiting for the process', async () => {
      const { handle, spies } = makeMockCommand({});
      baseSandbox.spies.runCommand.mockResolvedValueOnce(handle);
      const ac = new AbortController();
      const proc = await new VercelSandboxSession(baseSandbox.sandbox).spawn({
        command: 'cat',
        stdin: true,
        abortSignal: ac.signal,
      });
      const writer = proc.stdin.getWriter();
      const reason = new Error('input cancelled');
      const closed = expect(writer.closed).rejects.toBe(reason);
      await writer.abort(reason);
      await closed;

      expect(spies.closeStdin).toHaveBeenCalledExactlyOnceWith();
      expect(spies.kill).not.toHaveBeenCalled();
      expect(spies.wait).not.toHaveBeenCalled();
    });

    it.each([false, true])(
      'aborting the signal errors idle stdin when locked is %s',
      async locked => {
        const { handle, spies } = makeMockCommand({});
        baseSandbox.spies.runCommand.mockResolvedValueOnce(handle);
        const ac = new AbortController();
        const proc = await new VercelSandboxSession(baseSandbox.sandbox).spawn({
          command: 'cat',
          stdin: true,
          abortSignal: ac.signal,
        });
        const writer = locked ? proc.stdin.getWriter() : undefined;
        const reason = new Error('input cancelled');
        const closed = writer && expect(writer.closed).rejects.toBe(reason);

        ac.abort(reason);

        const activeWriter = writer ?? proc.stdin.getWriter();
        await (closed ?? expect(activeWriter.closed).rejects.toBe(reason));
        await expect(activeWriter.write(new Uint8Array([1]))).rejects.toBe(
          reason,
        );
        await activeWriter.abort(reason);

        expect(spies.writeStdin).not.toHaveBeenCalled();
        expect(spies.closeStdin).not.toHaveBeenCalled();
        expect(spies.kill).toHaveBeenCalledExactlyOnceWith();
        expect(spies.wait).not.toHaveBeenCalled();
      },
    );

    it('cancels an in-flight write and rejects queued writes on signal abortion', async () => {
      const { handle, spies } = makeMockCommand({});
      spies.writeStdin.mockImplementationOnce(
        (_chunk, options) =>
          new Promise<void>((_resolve, reject) => {
            const signal = options!.abortSignal!;
            signal.addEventListener('abort', () => reject(signal.reason), {
              once: true,
            });
          }),
      );
      baseSandbox.spies.runCommand.mockResolvedValueOnce(handle);
      const ac = new AbortController();
      const proc = await new VercelSandboxSession(baseSandbox.sandbox).spawn({
        command: 'cat',
        stdin: true,
        abortSignal: ac.signal,
      });
      const writer = proc.stdin.getWriter();
      const reason = new Error('input cancelled');
      const closed = expect(writer.closed).rejects.toBe(reason);
      const first = expect(writer.write(new Uint8Array([1]))).rejects.toBe(
        reason,
      );
      const second = expect(writer.write(new Uint8Array([2]))).rejects.toBe(
        reason,
      );
      await vi.waitFor(() => expect(spies.writeStdin).toHaveBeenCalledOnce());

      ac.abort(reason);

      await Promise.all([first, second, closed]);
      expect(spies.writeStdin).toHaveBeenCalledExactlyOnceWith(
        new Uint8Array([1]),
        { abortSignal: ac.signal },
      );
      expect(spies.closeStdin).not.toHaveBeenCalled();
      expect(spies.kill).toHaveBeenCalledExactlyOnceWith();
    });

    it('cancels an in-flight close on signal abortion without retrying EOF', async () => {
      const { handle, spies } = makeMockCommand({});
      spies.closeStdin.mockImplementationOnce(
        options =>
          new Promise<void>((_resolve, reject) => {
            const signal = options!.abortSignal!;
            signal.addEventListener('abort', () => reject(signal.reason), {
              once: true,
            });
          }),
      );
      baseSandbox.spies.runCommand.mockResolvedValueOnce(handle);
      const ac = new AbortController();
      const proc = await new VercelSandboxSession(baseSandbox.sandbox).spawn({
        command: 'cat',
        stdin: true,
        abortSignal: ac.signal,
      });
      const writer = proc.stdin.getWriter();
      const reason = new Error('input cancelled');
      const closed = expect(writer.closed).rejects.toBe(reason);
      const close = expect(writer.close()).rejects.toBe(reason);
      await vi.waitFor(() => expect(spies.closeStdin).toHaveBeenCalledOnce());

      ac.abort(reason);

      await Promise.all([close, closed]);
      expect(spies.closeStdin).toHaveBeenCalledExactlyOnceWith({
        abortSignal: ac.signal,
      });
      expect(spies.kill).toHaveBeenCalledExactlyOnceWith();
    });

    it('handles signal abortion while the command is starting', async () => {
      const { handle, spies } = makeMockCommand({});
      const ac = new AbortController();
      const reason = new Error('input cancelled');
      baseSandbox.spies.runCommand.mockImplementationOnce(async () => {
        ac.abort(reason);
        return handle;
      });
      const proc = await new VercelSandboxSession(baseSandbox.sandbox).spawn({
        command: 'cat',
        stdin: true,
        abortSignal: ac.signal,
      });

      await expect(proc.stdin.getWriter().closed).rejects.toBe(reason);
      expect(spies.closeStdin).not.toHaveBeenCalled();
      expect(spies.kill).toHaveBeenCalledExactlyOnceWith();
    });

    it('preserves the abort reason if killing fails and allows an explicit retry', async () => {
      const { handle, spies } = makeMockCommand({});
      spies.kill.mockRejectedValueOnce(new Error('kill failed'));
      spies.wait.mockImplementationOnce(
        options =>
          new Promise((_resolve, reject) => {
            options!.signal!.addEventListener(
              'abort',
              () => reject(new Error('wait cancelled')),
              { once: true },
            );
          }),
      );
      baseSandbox.spies.runCommand.mockResolvedValueOnce(handle);
      const ac = new AbortController();
      const proc = await new VercelSandboxSession(baseSandbox.sandbox).spawn({
        command: 'cat',
        stdin: true,
        abortSignal: ac.signal,
      });
      const writer = proc.stdin.getWriter();
      const reason = new Error('input cancelled');
      const closed = expect(writer.closed).rejects.toBe(reason);
      const finished = expect(proc.wait()).rejects.toBe(reason);

      ac.abort(reason);

      await Promise.all([closed, finished]);
      await expect(writer.write(new Uint8Array([1]))).rejects.toBe(reason);
      expect(spies.closeStdin).not.toHaveBeenCalled();
      expect(spies.wait).toHaveBeenCalledExactlyOnceWith({ signal: ac.signal });
      expect(spies.kill).toHaveBeenCalledExactlyOnceWith();
      await proc.kill();
      expect(spies.kill).toHaveBeenCalledTimes(2);
    });

    it.each(['close', 'abort', 'write failure', 'close failure'])(
      'removes only the stdin abort listener after %s',
      async operation => {
        const { handle, spies } = makeMockCommand({});
        baseSandbox.spies.runCommand.mockResolvedValueOnce(handle);
        const ac = new AbortController();
        const addEventListener = vi.spyOn(ac.signal, 'addEventListener');
        const removeEventListener = vi.spyOn(ac.signal, 'removeEventListener');
        const proc = await new VercelSandboxSession(baseSandbox.sandbox).spawn({
          command: 'cat',
          stdin: true,
          abortSignal: ac.signal,
        });
        const writer = proc.stdin.getWriter();
        if (operation === 'close') {
          await writer.close();
        } else {
          const reason = new Error('input failed');
          const closed = expect(writer.closed).rejects.toBe(reason);
          if (operation === 'abort') {
            await writer.abort(reason);
          } else if (operation === 'write failure') {
            spies.writeStdin.mockRejectedValueOnce(reason);
            await expect(writer.write(new Uint8Array([1]))).rejects.toBe(
              reason,
            );
          } else {
            spies.closeStdin.mockRejectedValueOnce(reason);
            await expect(writer.close()).rejects.toBe(reason);
          }
          await closed;
        }

        expect(addEventListener).toHaveBeenCalledTimes(2);
        const [processListener, stdinListener] =
          addEventListener.mock.calls.map(([, listener]) => listener);
        expect(removeEventListener).toHaveBeenCalledWith(
          'abort',
          stdinListener,
        );
        expect(removeEventListener).not.toHaveBeenCalledWith(
          'abort',
          processListener,
        );
        const closeCalls = spies.closeStdin.mock.calls.length;
        ac.abort();
        expect(spies.closeStdin).toHaveBeenCalledTimes(closeCalls);
        expect(spies.kill).toHaveBeenCalledExactlyOnceWith();
        expect(removeEventListener).toHaveBeenCalledWith(
          'abort',
          processListener,
        );
      },
    );

    it('propagates write failures without retrying or sending queued writes', async () => {
      const { handle, spies } = makeMockCommand({});
      const error = new Error('write failed');
      spies.writeStdin.mockRejectedValueOnce(error);
      baseSandbox.spies.runCommand.mockResolvedValueOnce(handle);
      const proc = await new VercelSandboxSession(baseSandbox.sandbox).spawn({
        command: 'cat',
        stdin: true,
      });
      const writer = proc.stdin.getWriter();
      const closed = expect(writer.closed).rejects.toBe(error);

      await Promise.all([
        expect(writer.write(new Uint8Array([1]))).rejects.toBe(error),
        expect(writer.write(new Uint8Array([2]))).rejects.toBe(error),
      ]);
      await closed;

      expect(spies.writeStdin).toHaveBeenCalledTimes(1);
      expect(spies.closeStdin).not.toHaveBeenCalled();
      expect(spies.kill).not.toHaveBeenCalled();
    });

    it('propagates close failures', async () => {
      const { handle, spies } = makeMockCommand({});
      const error = new Error('close failed');
      spies.closeStdin.mockRejectedValueOnce(error);
      baseSandbox.spies.runCommand.mockResolvedValueOnce(handle);
      const proc = await new VercelSandboxSession(baseSandbox.sandbox).spawn({
        command: 'cat',
        stdin: true,
      });
      const writer = proc.stdin.getWriter();
      const closed = expect(writer.closed).rejects.toBe(error);

      await expect(writer.close()).rejects.toBe(error);
      await closed;
      expect(spies.closeStdin).toHaveBeenCalledExactlyOnceWith({
        abortSignal: undefined,
      });
      expect(spies.kill).not.toHaveBeenCalled();
    });

    it.each(['write', 'close'])(
      'preserves a %s failure after signal abortion without sending EOF again',
      async operation => {
        const { handle, spies } = makeMockCommand({});
        const error = new Error(`${operation} failed`);
        if (operation === 'write') {
          spies.writeStdin.mockRejectedValueOnce(error);
        } else {
          spies.closeStdin.mockRejectedValueOnce(error);
        }
        baseSandbox.spies.runCommand.mockResolvedValueOnce(handle);
        const ac = new AbortController();
        const proc = await new VercelSandboxSession(baseSandbox.sandbox).spawn({
          command: 'cat',
          stdin: true,
          abortSignal: ac.signal,
        });
        const writer = proc.stdin.getWriter();
        const closed = expect(writer.closed).rejects.toBe(error);

        await expect(
          operation === 'write'
            ? writer.write(new Uint8Array([1]))
            : writer.close(),
        ).rejects.toBe(error);
        await closed;

        const expectedCalls = operation === 'write' ? 0 : 1;
        expect(spies.closeStdin).toHaveBeenCalledTimes(expectedCalls);
        expect(spies.kill).not.toHaveBeenCalled();
        ac.abort();
        await expect(writer.write(new Uint8Array([2]))).rejects.toBe(error);
        expect(spies.closeStdin).toHaveBeenCalledTimes(expectedCalls);
        expect(spies.kill).toHaveBeenCalledExactlyOnceWith();
      },
    );

    it('propagates EOF failures from explicit stdin abortion', async () => {
      const { handle, spies } = makeMockCommand({});
      const error = new Error('EOF cleanup failed');
      spies.closeStdin.mockRejectedValueOnce(error);
      baseSandbox.spies.runCommand.mockResolvedValueOnce(handle);
      const proc = await new VercelSandboxSession(baseSandbox.sandbox).spawn({
        command: 'cat',
        stdin: true,
      });
      const writer = proc.stdin.getWriter();
      const reason = new Error('input cancelled');
      const closed = expect(writer.closed).rejects.toBe(reason);

      await expect(writer.abort(reason)).rejects.toBe(error);
      await closed;
      expect(spies.closeStdin).toHaveBeenCalledExactlyOnceWith();
    });

    it.each([undefined, false])(
      'omits stdin when the option is %s',
      async stdin => {
        const { handle, spies } = makeMockCommand({});
        baseSandbox.spies.runCommand.mockResolvedValueOnce(handle);
        const proc = await new VercelSandboxSession(baseSandbox.sandbox).spawn({
          command: 'echo hello',
          ...(stdin === undefined ? {} : { stdin }),
        });

        expect(proc).not.toHaveProperty('stdin');
        expect(
          baseSandbox.spies.runCommand.mock.calls[0][0],
        ).not.toHaveProperty('stdin');
        expect(spies.writeStdin).not.toHaveBeenCalled();
        expect(spies.closeStdin).not.toHaveBeenCalled();
        expect(await proc.wait()).toEqual({ exitCode: 0 });
      },
    );

    it('does not start a command when the signal is already aborted', async () => {
      const ac = new AbortController();
      const error = new Error('already cancelled');
      ac.abort(error);

      await expect(
        new VercelSandboxSession(baseSandbox.sandbox).spawn({
          command: 'cat',
          stdin: true,
          abortSignal: ac.signal,
        }),
      ).rejects.toBe(error);
      expect(baseSandbox.spies.runCommand).not.toHaveBeenCalled();
    });

    it('streams stdout and stderr from logs() and resolves wait()', async () => {
      const { handle } = makeMockCommand({
        logs: [
          { stream: 'stdout', data: 'out\n' },
          { stream: 'stderr', data: 'err\n' },
        ],
        exitCode: 0,
      });
      baseSandbox.spies.runCommand.mockResolvedValueOnce(handle);

      const proc = await new VercelSandboxSession(baseSandbox.sandbox).spawn({
        command: 'node x.js',
      });

      expect(baseSandbox.spies.runCommand).toHaveBeenCalledWith(
        expect.objectContaining({ detached: true }),
      );

      const [stdout, stderr, { exitCode }] = await Promise.all([
        collect(proc.stdout),
        collect(proc.stderr),
        proc.wait(),
      ]);

      expect(stdout).toBe('out\n');
      expect(stderr).toBe('err\n');
      expect(exitCode).toBe(0);
    });

    it('surfaces non-zero exit codes via wait()', async () => {
      const { handle } = makeMockCommand({ exitCode: 7 });
      baseSandbox.spies.runCommand.mockResolvedValueOnce(handle);
      const proc = await new VercelSandboxSession(baseSandbox.sandbox).spawn({
        command: 'exit 7',
      });
      expect((await proc.wait()).exitCode).toBe(7);
    });

    it('kill() delegates to the underlying command', async () => {
      const { handle, spies } = makeMockCommand({});
      baseSandbox.spies.runCommand.mockResolvedValueOnce(handle);
      const proc = await new VercelSandboxSession(baseSandbox.sandbox).spawn({
        command: 'sleep 10',
      });
      await proc.kill();
      expect(spies.kill).toHaveBeenCalledOnce();
    });

    it.each([undefined, false, true])(
      'kills the running process and cancels wait and logs when stdin is %s',
      async stdin => {
        const { handle, spies } = makeMockCommand({});
        const ac = new AbortController();
        spies.wait.mockImplementationOnce(
          options =>
            new Promise((_resolve, reject) => {
              options!.signal!.addEventListener(
                'abort',
                () => reject(new Error('wait cancelled')),
                { once: true },
              );
            }),
        );
        spies.logs.mockImplementationOnce(async function* () {
          yield await new Promise<MockLogEntry>((_resolve, reject) => {
            ac.signal.addEventListener(
              'abort',
              () => reject(ac.signal.reason),
              {
                once: true,
              },
            );
          });
        });
        baseSandbox.spies.runCommand.mockResolvedValueOnce(handle);
        const proc = await new VercelSandboxSession(baseSandbox.sandbox).spawn({
          command: 'cat',
          ...(stdin === undefined ? {} : { stdin }),
          abortSignal: ac.signal,
        });
        const reason = new Error('process cancelled');
        const stdout = expect(collect(proc.stdout)).rejects.toBe(reason);
        const stderr = expect(collect(proc.stderr)).rejects.toBe(reason);
        const closed =
          'stdin' in proc
            ? expect(proc.stdin.getWriter().closed).rejects.toBe(reason)
            : undefined;
        expect(spies.wait).not.toHaveBeenCalled();
        const finished = expect(proc.wait()).rejects.toBe(reason);

        ac.abort(reason);

        await Promise.all([stdout, stderr, closed, finished]);
        expect(spies.kill).toHaveBeenCalledExactlyOnceWith();
        expect(spies.closeStdin).not.toHaveBeenCalled();
        expect(spies.wait).toHaveBeenCalledExactlyOnceWith({
          signal: ac.signal,
        });
      },
    );

    it.each([undefined, false])(
      'kills a command aborted during startup when stdin is %s',
      async stdin => {
        const { handle, spies } = makeMockCommand({});
        const ac = new AbortController();
        const reason = new Error('startup cancelled');
        baseSandbox.spies.runCommand.mockImplementationOnce(async () => {
          ac.abort(reason);
          return handle;
        });
        const proc = await new VercelSandboxSession(baseSandbox.sandbox).spawn({
          command: 'sleep 10',
          ...(stdin === undefined ? {} : { stdin }),
          abortSignal: ac.signal,
        });

        expect(spies.kill).toHaveBeenCalledExactlyOnceWith();
        expect(spies.closeStdin).not.toHaveBeenCalled();
        await expect(proc.wait()).rejects.toBe(reason);
      },
    );

    it.each<'wait' | 'kill'>(['wait', 'kill'])(
      'removes the process abort listener after successful %s',
      async operation => {
        const { handle, spies } = makeMockCommand({});
        baseSandbox.spies.runCommand.mockResolvedValueOnce(handle);
        const ac = new AbortController();
        const addEventListener = vi.spyOn(ac.signal, 'addEventListener');
        const removeEventListener = vi.spyOn(ac.signal, 'removeEventListener');
        const proc = await new VercelSandboxSession(baseSandbox.sandbox).spawn({
          command: 'sleep 10',
          abortSignal: ac.signal,
        });
        const [[, listener]] = addEventListener.mock.calls;

        await proc[operation]();

        expect(removeEventListener).toHaveBeenCalledWith('abort', listener);
        const killCalls = spies.kill.mock.calls.length;
        ac.abort();
        expect(spies.kill).toHaveBeenCalledTimes(killCalls);
      },
    );

    it.each<'wait' | 'kill'>(['wait', 'kill'])(
      'keeps process cancellation active after failed %s',
      async operation => {
        const { handle, spies } = makeMockCommand({});
        const error = new Error(`${operation} failed`);
        spies[operation].mockRejectedValueOnce(error);
        baseSandbox.spies.runCommand.mockResolvedValueOnce(handle);
        const ac = new AbortController();
        const addEventListener = vi.spyOn(ac.signal, 'addEventListener');
        const removeEventListener = vi.spyOn(ac.signal, 'removeEventListener');
        const proc = await new VercelSandboxSession(baseSandbox.sandbox).spawn({
          command: 'sleep 10',
          abortSignal: ac.signal,
        });
        const [[, listener]] = addEventListener.mock.calls;

        await expect(proc[operation]()).rejects.toBe(error);

        expect(removeEventListener).not.toHaveBeenCalledWith('abort', listener);
        const killCalls = spies.kill.mock.calls.length;
        ac.abort();
        expect(spies.kill).toHaveBeenCalledTimes(killCalls + 1);
        expect(spies.kill).toHaveBeenLastCalledWith();
        expect(removeEventListener).toHaveBeenCalledWith('abort', listener);
      },
    );

    it('pre-aborted signal causes wait() to reject', async () => {
      const { handle } = makeMockCommand({});
      baseSandbox.spies.runCommand.mockResolvedValueOnce(handle);
      const ac = new AbortController();

      const proc = await new VercelSandboxSession(baseSandbox.sandbox).spawn({
        command: 'sleep 10',
        abortSignal: ac.signal,
      });
      ac.abort(new Error('user cancelled'));
      await expect(proc.wait()).rejects.toThrow('user cancelled');
    });
  });
});
