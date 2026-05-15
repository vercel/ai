import { exec } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { isAbsolute, join, dirname } from 'node:path';
import { Readable, type Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { type Experimental_Sandbox as Sandbox } from 'ai';
import {
  bytesToStream,
  collectStream,
  sliceTextLines,
} from './lib/stream-utils';

const execAsync = promisify(exec);

/**
 * WARNING: This is not a security sandbox.
 *
 * LocalSandbox only sets the working directory for shell commands. Commands can
 * still read or edit files outside `rootDirectory` through absolute paths,
 * parent-directory paths, symlinks, subprocesses, and shell features. Only use
 * this with trusted commands.
 */
export class LocalSandbox implements Sandbox {
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

  async runCommand({
    command,
    workingDirectory,
    abortSignal,
  }: {
    command: string;
    workingDirectory?: string;
    abortSignal?: AbortSignal;
  }) {
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: workingDirectory ?? this.rootDirectory,
        timeout: 60_000,
        maxBuffer: 10 * 1024 * 1024,
        signal: abortSignal,
      });

      return {
        exitCode: 0,
        stdout: stdout || '',
        stderr: stderr || '',
      };
    } catch (error: any) {
      return {
        exitCode:
          error?.killed || error?.signal === 'SIGTERM' ? 1 : (error?.code ?? 1),
        stdout: error?.stdout ?? '',
        stderr: error?.stderr ?? String(error),
      };
    }
  }

  async readFile({
    path,
    abortSignal,
  }: {
    path: string;
    abortSignal?: AbortSignal;
  }): Promise<ReadableStream<Uint8Array> | null> {
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
  }: {
    path: string;
    content: ReadableStream<Uint8Array>;
    abortSignal?: AbortSignal;
  }): Promise<void> {
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
  }: {
    path: string;
    abortSignal?: AbortSignal;
  }): Promise<Uint8Array | null> {
    const stream = await this.readFile({ path, abortSignal });
    if (stream == null) return null;
    return collectStream(stream);
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
    return sliceTextLines({ text, startLine, endLine });
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
    const bytes = Buffer.from(content, encoding as BufferEncoding);
    await this.writeBinaryFile({
      path,
      content: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
      abortSignal,
    });
  }

  get description() {
    return [
      'WARNING: LocalSandbox is not a true sandbox.',
      'Commands can access files outside the root directory.',
      `Root directory: ${this.rootDirectory}`,
    ].join('\n');
  }
}
