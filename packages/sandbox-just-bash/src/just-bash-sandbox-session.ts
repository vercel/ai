import { isAbsolute, posix } from 'node:path';
import {
  extractLines,
  type Experimental_SandboxDirectoryEntry as SandboxDirectoryEntry,
  type Experimental_SandboxFileStat as SandboxFileStat,
  type Experimental_SandboxRunOptions as RunOptions,
  type Experimental_SandboxReadFileOptions as ReadFileOptions,
  type Experimental_SandboxReadBinaryFileOptions as ReadBinaryFileOptions,
  type Experimental_SandboxReadTextFileOptions as ReadTextFileOptions,
  type Experimental_SandboxWriteFileOptions as WriteFileOptions,
  type Experimental_SandboxWriteBinaryFileOptions as WriteBinaryFileOptions,
  type Experimental_SandboxWriteTextFileOptions as WriteTextFileOptions,
  type Experimental_SandboxStatOptions as StatOptions,
  type Experimental_SandboxListDirectoryOptions as ListDirectoryOptions,
  type Experimental_SandboxDeleteFileOptions as DeleteFileOptions,
  type Experimental_SandboxSession as SandboxSession,
  type Experimental_SandboxProcess as SandboxProcess,
  type Experimental_SandboxSpawnOptions as SpawnOptions,
  type Experimental_SandboxSpawnOptionsWithStdin as SpawnOptionsWithStdin,
  type Experimental_SandboxSpawnOptionsWithoutStdin as SpawnOptionsWithoutStdin,
} from '@ai-sdk/provider-utils';
import type { Sandbox, SandboxCommand } from 'just-bash';
import { ensureRealpath } from './utils';

/**
 * `Experimental_SandboxSession` implementation backed by a `just-bash`
 * `Sandbox`. File operations and spawned processes share the same in-memory
 * filesystem, so a bridge process spawned via `spawn` can read files the host
 * wrote via `writeTextFile` (and vice versa).
 *
 * This is the tool-safe surface returned by
 * `JustBashNetworkSandboxSession.restricted()` — not constructed directly by
 * consumers.
 */
export class JustBashSandboxSession implements SandboxSession {
  constructor(protected readonly sandbox: Sandbox) {}

  get description(): string {
    return [
      'just-bash JavaScript bash environment with a virtual filesystem.',
      'Filesystem changes and spawned processes share the same in-memory state.',
      `Current working directory: ${this.sandbox.bashEnvInstance.getCwd()}`,
    ].join('\n');
  }

  private resolvePath(path: string): string {
    return isAbsolute(path)
      ? path
      : posix.join(this.sandbox.bashEnvInstance.getCwd(), path);
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
    await ensureRealpath(this.sandbox);
    abortSignal?.throwIfAborted();

    const finished = await this.sandbox.runCommand({
      cmd: 'bash',
      args: createBashArgs(command, env),
      ...(workingDirectory !== undefined
        ? { cwd: this.resolvePath(workingDirectory) }
        : {}),
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

  spawn(options: SpawnOptionsWithStdin): Promise<never>;
  spawn(options: SpawnOptionsWithoutStdin): Promise<SandboxProcess>;
  spawn(options: SpawnOptions): Promise<SandboxProcess>;
  async spawn({
    command,
    workingDirectory,
    env,
    abortSignal,
    stdin,
  }: SpawnOptions): Promise<SandboxProcess> {
    abortSignal?.throwIfAborted();
    if (stdin === true) {
      throw new Error('just-bash does not support writable stdin.');
    }
    await ensureRealpath(this.sandbox);
    abortSignal?.throwIfAborted();

    const live = await this.sandbox.runCommand({
      cmd: 'bash',
      args: createBashArgs(command, env),
      detached: true,
      ...(workingDirectory !== undefined
        ? { cwd: this.resolvePath(workingDirectory) }
        : {}),
      ...(abortSignal !== undefined ? { signal: abortSignal } : {}),
    });

    return createSandboxProcess(live, abortSignal);
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
    const resolved = this.resolvePath(path);
    try {
      const bytes =
        await this.sandbox.bashEnvInstance.fs.readFileBuffer(resolved);
      return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
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
    const fs = this.sandbox.bashEnvInstance.fs;
    const resolved = this.resolvePath(path);
    // The just-bash filesystem replaces a directory with the file instead of
    // rejecting the write.
    if ((await fs.exists(resolved)) && (await fs.stat(resolved)).isDirectory) {
      throw new Error(`Cannot write ${path}: it is a directory.`);
    }
    await fs.writeFile(resolved, content);
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

  async stat({
    path,
    abortSignal,
  }: StatOptions): Promise<SandboxFileStat | null> {
    abortSignal?.throwIfAborted();
    const resolved = this.resolvePath(path);
    try {
      const stat = await this.sandbox.bashEnvInstance.fs.stat(resolved);
      return {
        type: stat.isFile ? 'file' : stat.isDirectory ? 'directory' : 'other',
        size: stat.size,
      };
    } catch (error) {
      if (isFileNotFoundError(error) || isNotDirectoryError(error)) {
        return null;
      }
      throw error;
    }
  }

  async listDirectory({
    path,
    abortSignal,
  }: ListDirectoryOptions): Promise<Array<SandboxDirectoryEntry> | null> {
    abortSignal?.throwIfAborted();
    const fs = this.sandbox.bashEnvInstance.fs;
    const resolved = this.resolvePath(path);
    try {
      if (fs.readdirWithFileTypes != null) {
        const entries = await fs.readdirWithFileTypes(resolved);
        return entries.map(entry => ({
          name: entry.name,
          type: entry.isSymbolicLink
            ? 'symlink'
            : entry.isFile
              ? 'file'
              : entry.isDirectory
                ? 'directory'
                : 'other',
        }));
      }

      const names = await fs.readdir(resolved);
      return await Promise.all(
        names.map(async name => {
          const stat = await fs.lstat(posix.join(resolved, name));
          return {
            name,
            type: stat.isSymbolicLink
              ? ('symlink' as const)
              : stat.isFile
                ? ('file' as const)
                : stat.isDirectory
                  ? ('directory' as const)
                  : ('other' as const),
          };
        }),
      );
    } catch (error) {
      if (isFileNotFoundError(error)) return null;
      throw error;
    }
  }

  async deleteFile({ path, abortSignal }: DeleteFileOptions): Promise<boolean> {
    abortSignal?.throwIfAborted();
    const fs = this.sandbox.bashEnvInstance.fs;
    const resolved = this.resolvePath(path);
    try {
      const stat = await fs.lstat(resolved);
      if (stat.isDirectory) {
        throw new Error(`Cannot delete ${path}: it is a directory.`);
      }
      await fs.rm(resolved);
      return true;
    } catch (error) {
      if (isFileNotFoundError(error) || isNotDirectoryError(error)) {
        return false;
      }
      throw error;
    }
  }
}

function createBashArgs(
  command: string,
  env: Record<string, string> | undefined,
): string[] {
  // just-bash applies runCommand's env to the outer execution, but its `bash`
  // command only inherits exported variables. Export assignments passed as
  // positional arguments so values are not interpolated into the script.
  const assignments =
    env == null
      ? []
      : Object.entries(env).map(([name, value]) => `${name}=${value}`);

  if (assignments.length === 0) {
    return ['-c', command];
  }

  return [
    '-c',
    `${assignments.map(() => 'export -- "$1"; shift').join('\n')}\n${command}`,
    'bash',
    ...assignments,
  ];
}

function createSandboxProcess(
  command: SandboxCommand,
  abortSignal: AbortSignal | undefined,
): SandboxProcess {
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
      for await (const message of command.logs()) {
        const target =
          message.type === 'stdout' ? controllers.stdout : controllers.stderr;
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

function isNotDirectoryError(error: unknown): boolean {
  if (error == null || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  if (code === 'ENOTDIR') return true;
  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' && /ENOTDIR/.test(message);
}
