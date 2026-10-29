import { posix } from 'node:path';
import {
  extractLines,
  type Experimental_SandboxRunOptions as RunOptions,
  type Experimental_SandboxReadFileOptions as ReadFileOptions,
  type Experimental_SandboxReadBinaryFileOptions as ReadBinaryFileOptions,
  type Experimental_SandboxReadTextFileOptions as ReadTextFileOptions,
  type Experimental_SandboxWriteFileOptions as WriteFileOptions,
  type Experimental_SandboxWriteBinaryFileOptions as WriteBinaryFileOptions,
  type Experimental_SandboxWriteTextFileOptions as WriteTextFileOptions,
  type Experimental_SandboxSession as SandboxSession,
  type Experimental_SandboxProcess as SandboxProcess,
  type Experimental_SandboxSpawnOptions as SpawnOptions,
  type Experimental_SandboxSpawnOptionsWithStdin as SpawnOptionsWithStdin,
  type Experimental_SandboxSpawnOptionsWithoutStdin as SpawnOptionsWithoutStdin,
  type Experimental_WritableSandboxProcess as WritableSandboxProcess,
} from '@ai-sdk/provider-utils';
import type { Sandbox, Command } from '@vercel/sandbox';

/**
 * `Experimental_SandboxSession` implementation backed by a `@vercel/sandbox`
 * `Sandbox` instance. This is the tool-safe surface (file I/O, exec, spawn);
 * it is what `VercelNetworkSandboxSession.restricted()` returns and is not
 * constructed directly by consumers. The network sandbox session owns the
 * lifetime of the underlying sandbox.
 */
export class VercelSandboxSession implements SandboxSession {
  constructor(protected readonly sandbox: Sandbox) {}

  get description(): string {
    return [
      `Vercel Sandbox (name: ${this.sandbox.name}).`,
      'Filesystem changes persist for the lifetime of the sandbox.',
    ].join('\n');
  }

  async run({
    command,
    workingDirectory,
    env,
    abortSignal,
  }: RunOptions): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }> {
    abortSignal?.throwIfAborted();

    const finished = await this.sandbox.runCommand({
      cmd: 'bash',
      args: ['-c', command],
      ...(workingDirectory !== undefined ? { cwd: workingDirectory } : {}),
      ...(env !== undefined ? { env } : {}),
      ...(abortSignal !== undefined ? { signal: abortSignal } : {}),
    });

    const [stdout, stderr] = await Promise.all([
      finished.stdout(),
      finished.stderr(),
    ]);

    return {
      exitCode: finished.exitCode,
      stdout,
      stderr,
    };
  }

  spawn(options: SpawnOptionsWithStdin): Promise<WritableSandboxProcess>;
  spawn(options: SpawnOptionsWithoutStdin): Promise<SandboxProcess>;
  spawn(
    options: SpawnOptions,
  ): Promise<SandboxProcess | WritableSandboxProcess>;
  async spawn({
    command,
    workingDirectory,
    env,
    abortSignal,
    stdin,
  }: SpawnOptions): Promise<SandboxProcess | WritableSandboxProcess> {
    abortSignal?.throwIfAborted();

    const live = await this.sandbox.runCommand({
      cmd: 'bash',
      args: ['-c', command],
      detached: true,
      ...(stdin === true ? { stdin: true } : {}),
      ...(workingDirectory !== undefined ? { cwd: workingDirectory } : {}),
      ...(env !== undefined ? { env } : {}),
      ...(abortSignal !== undefined ? { signal: abortSignal } : {}),
    });

    const process = createSandboxProcess({ command: live, abortSignal });
    return stdin === true
      ? {
          ...process,
          stdin: createStdinStream({ command: live, abortSignal }),
        }
      : process;
  }

  async readFile({
    path,
    abortSignal,
  }: ReadFileOptions): Promise<ReadableStream<Uint8Array> | null> {
    const bytes = await this.readBinaryFile({ path, abortSignal });
    if (bytes == null) return null;
    return bytesToStream(bytes);
  }

  async readBinaryFile({
    path,
    abortSignal,
  }: ReadBinaryFileOptions): Promise<Uint8Array | null> {
    abortSignal?.throwIfAborted();
    try {
      const buffer = await this.sandbox.readFileToBuffer(
        { path },
        abortSignal ? { signal: abortSignal } : undefined,
      );
      if (buffer == null) return null;
      return new Uint8Array(
        buffer.buffer,
        buffer.byteOffset,
        buffer.byteLength,
      );
    } catch (error) {
      if (isFileNotFoundError(error)) return null;
      throw error;
    }
  }

  async readTextFile({
    path,
    encoding = 'utf-8',
    startLine,
    endLine,
    abortSignal,
  }: ReadTextFileOptions): Promise<string | null> {
    const bytes = await this.readBinaryFile({ path, abortSignal });
    if (bytes == null) return null;
    const text = Buffer.from(bytes).toString(encoding as BufferEncoding);
    return extractLines({ text, startLine, endLine });
  }

  async writeFile({
    path,
    content,
    abortSignal,
  }: WriteFileOptions): Promise<void> {
    const bytes = await collectStream(content);
    await this.writeBinaryFile({ path, content: bytes, abortSignal });
  }

  async writeBinaryFile({
    path,
    content,
    abortSignal,
  }: WriteBinaryFileOptions): Promise<void> {
    abortSignal?.throwIfAborted();
    const parent = posix.dirname(path);
    if (parent && parent !== '.' && parent !== '/') {
      await this.sandbox.runCommand({
        cmd: 'mkdir',
        args: ['-p', parent],
        ...(abortSignal !== undefined ? { signal: abortSignal } : {}),
      });
    }
    await this.sandbox.writeFiles(
      [{ path, content }],
      abortSignal ? { signal: abortSignal } : undefined,
    );
  }

  async writeTextFile({
    path,
    content,
    encoding = 'utf-8',
    abortSignal,
  }: WriteTextFileOptions): Promise<void> {
    const buffer = Buffer.from(content, encoding as BufferEncoding);
    await this.writeBinaryFile({
      path,
      content: new Uint8Array(
        buffer.buffer,
        buffer.byteOffset,
        buffer.byteLength,
      ),
      abortSignal,
    });
  }
}

function createSandboxProcess({
  command,
  abortSignal,
}: {
  command: Command;
  abortSignal?: AbortSignal;
}): SandboxProcess {
  const encoder = new TextEncoder();
  const controllers: {
    stdout?: ReadableStreamDefaultController<Uint8Array>;
    stderr?: ReadableStreamDefaultController<Uint8Array>;
  } = {};

  const stdout = new ReadableStream<Uint8Array>({
    start(controller) {
      controllers.stdout = controller;
    },
  });

  const stderr = new ReadableStream<Uint8Array>({
    start(controller) {
      controllers.stderr = controller;
    },
  });

  const removeAbortListener = () =>
    abortSignal?.removeEventListener('abort', onAbort);
  const onAbort = () => {
    removeAbortListener();
    void command.kill().catch(() => {});
  };
  if (abortSignal?.aborted) {
    onAbort();
  } else {
    abortSignal?.addEventListener('abort', onAbort, { once: true });
  }

  const drained = (async () => {
    try {
      const iterator = abortSignal
        ? command.logs({ signal: abortSignal })
        : command.logs();
      for await (const message of iterator) {
        const target =
          message.stream === 'stdout' ? controllers.stdout : controllers.stderr;
        target?.enqueue(encoder.encode(message.data));
      }
      controllers.stdout?.close();
      controllers.stderr?.close();
    } catch (error) {
      controllers.stdout?.error(error);
      controllers.stderr?.error(error);
    }
  })();

  return {
    stdout,
    stderr,
    async wait(): Promise<{ exitCode: number }> {
      try {
        const finished = await (abortSignal
          ? command.wait({ signal: abortSignal })
          : command.wait());
        removeAbortListener();
        await drained;
        abortSignal?.throwIfAborted();
        return { exitCode: finished.exitCode };
      } catch (error) {
        abortSignal?.throwIfAborted();
        throw error;
      }
    },
    async kill(): Promise<void> {
      await command.kill();
      removeAbortListener();
    },
  };
}

function createStdinStream({
  command,
  abortSignal,
}: {
  command: Command;
  abortSignal?: AbortSignal;
}): WritableStream<Uint8Array> {
  let removeAbortListener = () => {};

  return new WritableStream<Uint8Array>({
    start(controller) {
      const onAbort = () => {
        removeAbortListener();
        controller.error(abortSignal?.reason);
      };
      removeAbortListener = () =>
        abortSignal?.removeEventListener('abort', onAbort);
      if (abortSignal?.aborted) {
        onAbort();
      } else {
        abortSignal?.addEventListener('abort', onAbort, { once: true });
      }
    },
    async write(chunk) {
      try {
        await command.writeStdin(chunk, { abortSignal });
      } catch (error) {
        /*
         * A failed write may have delivered only part of the input. Sending
         * EOF could make the process treat that truncated input as complete.
         */
        removeAbortListener();
        throw error;
      }
    },
    async close() {
      try {
        await command.closeStdin({ abortSignal });
      } finally {
        removeAbortListener();
      }
    },
    abort() {
      removeAbortListener();
      return command.closeStdin();
    },
  });
}

function bytesToStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

async function collectStream(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.byteLength;
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function isFileNotFoundError(error: unknown): boolean {
  if (error == null || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  if (code === 'ENOENT') return true;
  const message = (error as { message?: unknown }).message;
  return (
    typeof message === 'string' &&
    /no such file|not found|does not exist|ENOENT/i.test(message)
  );
}
