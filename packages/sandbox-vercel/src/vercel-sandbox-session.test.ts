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
import type { Sandbox } from '@vercel/sandbox';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

    it('resolves a relative workingDirectory against the session cwd', async () => {
      const { sandbox, spies } = makeMockSandbox({
        currentSession: () => ({ cwd: '/vercel/sandbox' }),
      } as unknown as Partial<Sandbox>);
      spies.runCommand.mockResolvedValueOnce(
        makeMockCommand({ logs: [], exitCode: 0 }).handle,
      );

      await new VercelSandboxSession(sandbox).run({
        command: 'ls',
        workingDirectory: 'project/src',
      });

      expect(spies.runCommand).toHaveBeenCalledWith(
        expect.objectContaining({ cwd: '/vercel/sandbox/project/src' }),
      );
    });

    it('does not normalize a relative workingDirectory', async () => {
      const { sandbox, spies } = makeMockSandbox({
        currentSession: () => ({ cwd: '/' }),
      } as unknown as Partial<Sandbox>);
      spies.runCommand.mockResolvedValueOnce(
        makeMockCommand({ logs: [], exitCode: 0 }).handle,
      );

      await new VercelSandboxSession(sandbox).run({
        command: 'ls',
        workingDirectory: 'link/..',
      });

      expect(spies.runCommand).toHaveBeenCalledWith(
        expect.objectContaining({ cwd: '/link/..' }),
      );
    });

    it('resumes a stopped sandbox before resolving a relative workingDirectory', async () => {
      let resumed = false;
      const { sandbox, spies } = makeMockSandbox({
        currentSession: () => {
          if (!resumed) throw new Error('No active session.');
          return { cwd: '/vercel/sandbox' };
        },
      } as unknown as Partial<Sandbox>);
      spies.runCommand.mockImplementation(async () => {
        resumed = true;
        return makeMockCommand({ logs: [], exitCode: 0 }).handle;
      });

      await new VercelSandboxSession(sandbox).run({
        command: 'ls',
        workingDirectory: 'project',
      });

      expect(spies.runCommand).toHaveBeenLastCalledWith(
        expect.objectContaining({ cwd: '/vercel/sandbox/project' }),
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

// Runs the adapter's path scripts with the local bash instead of a Vercel
// Sandbox, so the scripts themselves are tested.
function createLocalSandbox(
  directory: string,
  env: Record<string, string> = {},
): Sandbox {
  return {
    name: 'sbx_test',
    runCommand: async ({ cmd, args }: { cmd: string; args: string[] }) => {
      const result = spawnSync(cmd, args, {
        cwd: directory,
        env: { ...process.env, ...env },
        encoding: 'utf8',
      });
      return {
        exitCode: result.status ?? 1,
        stdout: async () => result.stdout,
        stderr: async () => result.stderr,
      };
    },
  } as unknown as Sandbox;
}

describe('VercelSandboxSession path methods', () => {
  let directory: string;
  let sandbox: VercelSandboxSession;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'vercel-sandbox-session-'));
    sandbox = new VercelSandboxSession(createLocalSandbox(directory));

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
      expect(await sandbox.stat({ path: 'file.txt' })).toEqual({
        type: 'file',
        size: 5,
      });
    });

    it('returns directory for a directory', async () => {
      expect(await sandbox.stat({ path: join(directory, 'dir') })).toEqual({
        type: 'directory',
        size: expect.any(Number),
      });
    });

    it('follows symbolic links', async () => {
      expect(await sandbox.stat({ path: 'file-link' })).toEqual({
        type: 'file',
        size: 5,
      });
    });

    it('returns null for a missing path', async () => {
      expect(await sandbox.stat({ path: 'missing.txt' })).toBeNull();
      expect(await sandbox.stat({ path: 'file.txt/child' })).toBeNull();
    });

    it('returns null for a broken symbolic link', async () => {
      expect(await sandbox.stat({ path: 'broken-link' })).toBeNull();
    });

    it('returns other for a named pipe', async () => {
      expect(await sandbox.stat({ path: 'fifo' })).toEqual({
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
            sandbox.stat({ path: 'locked/secret.txt' }),
          ).rejects.toThrow('Permission denied');
          await expect(
            sandbox.listDirectory({ path: 'locked/missing' }),
          ).rejects.toThrow('Permission denied');
          await expect(
            sandbox.deleteFile({ path: 'locked/secret.txt' }),
          ).rejects.toThrow('Permission denied');
        } finally {
          await chmod(join(directory, 'locked'), 0o755);
        }
      },
    );

    it.skipIf(process.getuid?.() === 0)(
      'rejects instead of returning null when a symbolic link target is not searchable',
      async () => {
        await mkdir(join(directory, 'locked', 'target'), { recursive: true });
        await symlink(
          join(directory, 'locked', 'target'),
          join(directory, 'locked-link'),
        );
        await chmod(join(directory, 'locked'), 0o000);
        try {
          await expect(sandbox.stat({ path: 'locked-link' })).rejects.toThrow(
            'Permission denied',
          );
          await expect(
            sandbox.listDirectory({ path: 'locked-link' }),
          ).rejects.toThrow('Permission denied');
        } finally {
          await chmod(join(directory, 'locked'), 0o755);
        }
      },
    );

    it('rejects for a symbolic link loop', async () => {
      await symlink(join(directory, 'loop'), join(directory, 'loop'));
      await expect(sandbox.stat({ path: 'loop' })).rejects.toThrow(
        'Too many levels of symbolic links',
      );
      await expect(sandbox.listDirectory({ path: 'loop' })).rejects.toThrow(
        'Too many levels of symbolic links',
      );
    });

    it('rejects when the signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();
      await expect(
        sandbox.stat({ path: 'file.txt', abortSignal: controller.signal }),
      ).rejects.toThrow();
    });
  });

  describe('listDirectory', () => {
    it('lists entries with their types, including hidden entries', async () => {
      const entries = await sandbox.listDirectory({ path: '.' });

      expect(entries?.sort((a, b) => a.name.localeCompare(b.name)))
        .toMatchInlineSnapshot(`
        [
          {
            "name": ".hidden",
            "type": "file",
          },
          {
            "name": "broken-link",
            "type": "symlink",
          },
          {
            "name": "dir",
            "type": "directory",
          },
          {
            "name": "dir-link",
            "type": "symlink",
          },
          {
            "name": "fifo",
            "type": "other",
          },
          {
            "name": "file-link",
            "type": "symlink",
          },
          {
            "name": "file.txt",
            "type": "file",
          },
          {
            "name": "with space
        and newline",
            "type": "file",
          },
        ]
      `);
    });

    it('resolves `..` after a symbolic link in the filesystem', async () => {
      await mkdir(join(directory, 'deep', 'inner'), { recursive: true });
      await symlink(
        join(directory, 'deep', 'inner'),
        join(directory, 'inner-link'),
      );

      expect(await sandbox.listDirectory({ path: 'inner-link/..' })).toEqual([
        { name: 'inner', type: 'directory' },
      ]);
    });

    it('returns an empty array for an empty directory', async () => {
      await mkdir(join(directory, 'empty'));
      expect(await sandbox.listDirectory({ path: 'empty' })).toEqual([]);
    });

    it('returns null for a missing directory', async () => {
      expect(await sandbox.listDirectory({ path: 'missing' })).toBeNull();
    });

    it('rejects for a file', async () => {
      await expect(sandbox.listDirectory({ path: 'file.txt' })).rejects.toThrow(
        'Not a directory',
      );
    });

    it('lists a directory through a symbolic link', async () => {
      expect(await sandbox.listDirectory({ path: 'dir-link' })).toEqual([
        { name: 'nested.txt', type: 'file' },
      ]);
    });

    it('returns null for a broken symbolic link', async () => {
      expect(await sandbox.listDirectory({ path: 'broken-link' })).toBeNull();
    });

    it.skipIf(process.getuid?.() === 0)(
      'rejects for a directory that can be entered but not read',
      async () => {
        await chmod(join(directory, 'dir'), 0o311);
        try {
          await expect(sandbox.listDirectory({ path: 'dir' })).rejects.toThrow(
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
      expect(await sandbox.listDirectory({ path: '-' })).toEqual([
        { name: 'inside.txt', type: 'file' },
      ]);
    });

    it('ignores CDPATH', async () => {
      await mkdir(join(directory, 'other', 'dir'), { recursive: true });
      await writeFile(join(directory, 'other', 'dir', 'wrong.txt'), '');
      const withCdpath = new VercelSandboxSession(
        createLocalSandbox(directory, { CDPATH: join(directory, 'other') }),
      );
      expect(await withCdpath.listDirectory({ path: 'dir' })).toEqual([
        { name: 'nested.txt', type: 'file' },
      ]);
    });
  });

  describe('deleteFile', () => {
    it('deletes a file', async () => {
      expect(await sandbox.deleteFile({ path: 'file.txt' })).toBe(true);
      expect(await sandbox.stat({ path: 'file.txt' })).toBeNull();
    });

    it('returns false for a missing file', async () => {
      expect(await sandbox.deleteFile({ path: 'missing.txt' })).toBe(false);
    });

    it('rejects for a directory', async () => {
      await expect(sandbox.deleteFile({ path: 'dir' })).rejects.toThrow(
        'it is a directory',
      );
      expect(await sandbox.stat({ path: 'dir' })).not.toBeNull();
    });

    it('deletes a symbolic link to a directory but not the directory', async () => {
      expect(await sandbox.deleteFile({ path: 'dir-link' })).toBe(true);
      expect(await sandbox.stat({ path: 'dir-link' })).toBeNull();
      expect(await sandbox.stat({ path: 'dir/nested.txt' })).not.toBeNull();
    });

    it('rejects for a symbolic link to a directory with a trailing slash', async () => {
      await expect(sandbox.deleteFile({ path: 'dir-link/' })).rejects.toThrow(
        'it is a directory',
      );
      expect(await sandbox.stat({ path: 'dir-link' })).not.toBeNull();
      expect(await sandbox.stat({ path: 'dir/nested.txt' })).not.toBeNull();
    });

    it('deletes a broken symbolic link', async () => {
      expect(await sandbox.deleteFile({ path: 'broken-link' })).toBe(true);
      expect(
        await sandbox
          .listDirectory({ path: '.' })
          .then(entries => entries?.map(entry => entry.name)),
      ).not.toContain('broken-link');
    });

    it('deletes a file in a symbolically linked directory', async () => {
      expect(await sandbox.deleteFile({ path: 'dir-link/nested.txt' })).toBe(
        true,
      );
      expect(await sandbox.stat({ path: 'dir/nested.txt' })).toBeNull();
    });
  });

  it('passes paths as arguments instead of interpolating them', async () => {
    const path = '$(touch injected)';

    expect(await sandbox.stat({ path })).toBeNull();
    expect(await sandbox.listDirectory({ path })).toBeNull();
    expect(await sandbox.deleteFile({ path })).toBe(false);
    expect(await sandbox.stat({ path: 'injected' })).toBeNull();
  });
});
