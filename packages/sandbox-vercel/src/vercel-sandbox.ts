import { posix } from 'node:path';
import {
  extractLines,
  type Experimental_Sandbox,
  type Experimental_SandboxProcess,
} from '@ai-sdk/provider-utils';
import type { Command, Sandbox } from '@vercel/sandbox';

/**
 * `Experimental_Sandbox` backed by a `@vercel/sandbox` `Sandbox`. The caller
 * supplies an already-created `Sandbox` instance; lifecycle, auth, and network
 * configuration stay with the caller.
 */
export class VercelSandbox implements Experimental_Sandbox {
  constructor(protected readonly sandbox: Sandbox) {}

  get description(): string {
    return [
      `Vercel Sandbox (name: ${this.sandbox.name}).`,
      'Filesystem changes persist for the lifetime of the sandbox.',
    ].join('\n');
  }

  async runCommand({
    command,
    workingDirectory,
    abortSignal,
  }: {
    command: string;
    workingDirectory?: string;
    abortSignal?: AbortSignal;
  }): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    abortSignal?.throwIfAborted();

    const finished = await this.sandbox.runCommand({
      cmd: 'bash',
      args: ['-c', command],
      ...(workingDirectory !== undefined ? { cwd: workingDirectory } : {}),
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

  async spawnCommand({
    command,
    workingDirectory,
    abortSignal,
  }: {
    command: string;
    workingDirectory?: string;
    abortSignal?: AbortSignal;
  }): Promise<Experimental_SandboxProcess> {
    abortSignal?.throwIfAborted();

    const live = await this.sandbox.runCommand({
      cmd: 'bash',
      args: ['-c', command],
      detached: true,
      ...(workingDirectory !== undefined ? { cwd: workingDirectory } : {}),
      ...(abortSignal !== undefined ? { signal: abortSignal } : {}),
    });

    return createSandboxProcess(live, abortSignal);
  }

  async readFile({
    path,
    abortSignal,
  }: {
    path: string;
    abortSignal?: AbortSignal;
  }): Promise<ReadableStream<Uint8Array> | null> {
    const bytes = await this.readBinaryFile({ path, abortSignal });
    if (bytes == null) return null;
    return bytesToStream(bytes);
  }

  async readBinaryFile({
    path,
    abortSignal,
  }: {
    path: string;
    abortSignal?: AbortSignal;
  }): Promise<Uint8Array | null> {
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
  }: {
    path: string;
    encoding?: string;
    startLine?: number;
    endLine?: number;
    abortSignal?: AbortSignal;
  }): Promise<string | null> {
    const bytes = await this.readBinaryFile({ path, abortSignal });
    if (bytes == null) return null;
    const text = Buffer.from(bytes).toString(encoding as BufferEncoding);
    return extractLines({ text, startLine, endLine });
  }

  async writeFile({
    path,
    content,
    abortSignal,
  }: {
    path: string;
    content: ReadableStream<Uint8Array>;
    abortSignal?: AbortSignal;
  }): Promise<void> {
    const bytes = await collectStream(content);
    await this.writeBinaryFile({ path, content: bytes, abortSignal });
  }

  async writeBinaryFile({
    path,
    content,
    abortSignal,
  }: {
    path: string;
    content: Uint8Array;
    abortSignal?: AbortSignal;
  }): Promise<void> {
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
  }: {
    path: string;
    content: string;
    encoding?: string;
    abortSignal?: AbortSignal;
  }): Promise<void> {
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

  /**
   * Stop the underlying Vercel Sandbox. Callers own the sandbox lifecycle;
   * this method releases the remote VM and the local HTTP-client resources
   * that otherwise keep the host process alive until the sandbox times out.
   */
  async stop(): Promise<void> {
    await this.sandbox.stop();
  }
}

function createSandboxProcess(
  command: Command,
  abortSignal: AbortSignal | undefined,
): Experimental_SandboxProcess {
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
      const finished = await command.wait();
      await drained;
      if (abortSignal?.aborted) {
        throw abortSignal.reason ?? new DOMException('Aborted', 'AbortError');
      }
      return { exitCode: finished.exitCode };
    },
    async kill(): Promise<void> {
      await command.kill();
    },
  };
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
