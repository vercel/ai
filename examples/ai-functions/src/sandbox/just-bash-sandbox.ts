import { isAbsolute, join } from 'node:path';
import { extractLines } from '@ai-sdk/provider-utils';
import { type Experimental_Sandbox as Sandbox } from 'ai';
import { type Bash } from 'just-bash';
import { bytesToStream, collectStream } from './lib/stream-utils';

export class JustBashSandbox implements Sandbox {
  constructor(private readonly bash: Bash) {}

  private resolvePath(path: string): string {
    return isAbsolute(path) ? path : join(this.bash.getCwd(), path);
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
    abortSignal?.throwIfAborted();

    const result = await this.bash.exec(command, { cwd: workingDirectory });

    return {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }

  async readFile({
    path,
    abortSignal,
  }: {
    path: string;
    abortSignal?: AbortSignal;
  }): Promise<ReadableStream<Uint8Array> | null> {
    abortSignal?.throwIfAborted();
    const resolved = this.resolvePath(path);
    try {
      const bytes = await this.bash.fs.readFileBuffer(resolved);
      return bytesToStream(bytes);
    } catch (error: any) {
      if (
        error?.code === 'ENOENT' ||
        /no such file|ENOENT/i.test(String(error?.message))
      ) {
        return null;
      }
      throw error;
    }
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
    abortSignal?.throwIfAborted();
    const bytes = await collectStream(content);
    abortSignal?.throwIfAborted();
    await this.bash.fs.writeFile(this.resolvePath(path), bytes);
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
    return extractLines({ text, startLine, endLine });
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
      'just-bash JavaScript bash environment with a virtual filesystem.',
      'Shell state resets between commands, while filesystem changes are shared.',
      `Current working directory: ${this.bash.getCwd()}`,
    ].join('\n');
  }
}
