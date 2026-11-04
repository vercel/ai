import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, stat, unlink } from 'node:fs/promises';
import { isAbsolute, join, dirname } from 'node:path';
import { Readable, type Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  extractLines,
  type Experimental_SandboxDirectoryEntry,
  type Experimental_SandboxFileStat,
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
  type Experimental_SandboxProcess,
  type Experimental_SandboxSpawnOptions as SpawnOptions,
  type Experimental_SandboxSpawnOptionsWithStdin as SpawnOptionsWithStdin,
  type Experimental_SandboxSpawnOptionsWithoutStdin as SpawnOptionsWithoutStdin,
} from '@ai-sdk/provider-utils';
import { type Experimental_SandboxSession as SandboxSession } from 'ai';
import {
  bytesToStream,
  collectStream,
  collectStreamToString,
} from './lib/stream-utils';

/**
 * WARNING: This is not a security sandbox.
 *
 * LocalSandboxSession only sets the working directory for shell commands. Commands can
 * still read or edit files outside `rootDirectory` through absolute paths,
 * parent-directory paths, symlinks, subprocesses, and shell features. Only use
 * this with trusted commands.
 */
export class LocalSandboxSession implements SandboxSession {
  /**
   * Root directory used as the default working directory and the anchor for
   * relative paths in file methods.
   *
   * WARNING: This does not provide filesystem isolation.
   */
  readonly rootDirectory: string;

  constructor({ rootDirectory }: { rootDirectory: string }) {
    this.rootDirectory = rootDirectory;
  }

  private resolvePath(path: string): string {
    return isAbsolute(path) ? path : join(this.rootDirectory, path);
  }

  async run({ command, workingDirectory, env, abortSignal }: RunOptions) {
    const proc = await this.spawn({
      command,
      workingDirectory,
      env,
      abortSignal,
    });

    const [stdout, stderr, { exitCode }] = await Promise.all([
      collectStreamToString(proc.stdout),
      collectStreamToString(proc.stderr),
      proc.wait(),
    ]);

    return { exitCode, stdout, stderr };
  }

  spawn(options: SpawnOptionsWithStdin): Promise<never>;
  spawn(
    options: SpawnOptionsWithoutStdin,
  ): Promise<Experimental_SandboxProcess>;
  spawn(options: SpawnOptions): Promise<Experimental_SandboxProcess>;
  async spawn({
    command,
    workingDirectory,
    env,
    abortSignal,
    stdin,
  }: SpawnOptions): Promise<Experimental_SandboxProcess> {
    abortSignal?.throwIfAborted();
    if (stdin === true) {
      throw new Error('LocalSandboxSession does not support writable stdin.');
    }

    if (env != null && Object.keys(env).length > 0) {
      throw new Error('LocalSandboxSession does not support the `env` option.');
    }

    const child = spawn('bash', ['-c', command], {
      cwd:
        workingDirectory === undefined
          ? this.rootDirectory
          : this.resolvePath(workingDirectory),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const stdout = Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>;
    const stderr = Readable.toWeb(child.stderr) as ReadableStream<Uint8Array>;

    const exitPromise = new Promise<{ exitCode: number }>((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => {
        if (code != null) {
          resolve({ exitCode: code });
        } else if (signal != null) {
          resolve({
            exitCode: 128 + (typeof signal === 'number' ? signal : 1),
          });
        } else {
          resolve({ exitCode: 1 });
        }
      });
    });

    const abortHandler = () => {
      child.kill('SIGTERM');
    };
    if (abortSignal?.aborted) {
      abortHandler();
    } else {
      abortSignal?.addEventListener('abort', abortHandler, { once: true });
    }

    return {
      pid: child.pid,
      stdout,
      stderr,
      async wait(): Promise<{ exitCode: number }> {
        try {
          const result = await exitPromise;
          if (abortSignal?.aborted) {
            throw (
              abortSignal.reason ?? new DOMException('Aborted', 'AbortError')
            );
          }
          return result;
        } finally {
          abortSignal?.removeEventListener('abort', abortHandler);
        }
      },
      async kill(): Promise<void> {
        child.kill('SIGTERM');
      },
    };
  }

  async readFile({
    path,
    abortSignal,
  }: ReadFileOptions): Promise<ReadableStream<Uint8Array> | null> {
    const resolved = this.resolvePath(path);
    try {
      await stat(resolved);
    } catch (error: any) {
      if (error?.code === 'ENOENT') return null;
      throw error;
    }
    const nodeStream = createReadStream(resolved, { signal: abortSignal });
    return Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
  }

  async writeFile({
    path,
    content,
    abortSignal,
  }: WriteFileOptions): Promise<void> {
    const resolved = this.resolvePath(path);
    await mkdir(dirname(resolved), { recursive: true });
    const source = Readable.fromWeb(content as any);
    const sink = createWriteStream(resolved);
    await pipeline(source, sink as unknown as Writable, {
      signal: abortSignal,
    });
  }

  async readBinaryFile({
    path,
    abortSignal,
  }: ReadBinaryFileOptions): Promise<Uint8Array | null> {
    const stream = await this.readFile({ path, abortSignal });
    if (stream == null) return null;
    return collectStream(stream);
  }

  async writeBinaryFile({
    path,
    content,
    abortSignal,
  }: WriteBinaryFileOptions): Promise<void> {
    await this.writeFile({
      path,
      content: bytesToStream(content),
      abortSignal,
    });
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

  async writeTextFile({
    path,
    content,
    encoding = 'utf-8',
    abortSignal,
  }: WriteTextFileOptions): Promise<void> {
    const bytes = Buffer.from(content, encoding as BufferEncoding);
    await this.writeBinaryFile({
      path,
      content: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
      abortSignal,
    });
  }

  async stat({
    path,
    abortSignal,
  }: StatOptions): Promise<Experimental_SandboxFileStat | null> {
    abortSignal?.throwIfAborted();
    try {
      const stats = await stat(this.resolvePath(path));
      return {
        type: stats.isFile()
          ? 'file'
          : stats.isDirectory()
            ? 'directory'
            : 'other',
        size: stats.size,
      };
    } catch (error: any) {
      if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return null;
      throw error;
    }
  }

  async listDirectory({
    path,
    abortSignal,
  }: ListDirectoryOptions): Promise<Array<Experimental_SandboxDirectoryEntry> | null> {
    abortSignal?.throwIfAborted();
    try {
      const entries = await readdir(this.resolvePath(path), {
        withFileTypes: true,
      });
      return entries.map(entry => ({
        name: entry.name,
        type: entry.isSymbolicLink()
          ? 'symlink'
          : entry.isFile()
            ? 'file'
            : entry.isDirectory()
              ? 'directory'
              : 'other',
      }));
    } catch (error: any) {
      if (error?.code === 'ENOENT') return null;
      throw error;
    }
  }

  async deleteFile({ path, abortSignal }: DeleteFileOptions): Promise<boolean> {
    abortSignal?.throwIfAborted();
    try {
      await unlink(this.resolvePath(path));
      return true;
    } catch (error: any) {
      if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return false;
      throw error;
    }
  }

  get description() {
    return [
      'WARNING: LocalSandboxSession is not a true sandbox.',
      'Commands can access files outside the root directory.',
      `Root directory: ${this.rootDirectory}`,
    ].join('\n');
  }
}
