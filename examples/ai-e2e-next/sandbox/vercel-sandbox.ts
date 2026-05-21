import { isAbsolute, join } from 'node:path';
import { Readable } from 'node:stream';
import { extractLines } from '@ai-sdk/provider-utils';
import { type Experimental_Sandbox as Sandbox } from 'ai';
import type { Sandbox as VercelSandboxSDK } from '@vercel/sandbox';
import { bytesToStream, collectStream } from './stream-utils';

const rootDirectory = '/vercel/sandbox';

// Vercel Sandbox authenticates with a Vercel OIDC token.
//
// Deployed on Vercel:
// 1. Open the project in the Vercel dashboard.
// 2. Go to Settings > Security.
// 3. Enable "Secure backend access with OIDC federation" and save.
//
// Local development:
// 1. Run `vercel link`.
// 2. Run `vercel env pull` to write VERCEL_OIDC_TOKEN to .env.local.
//
// Without OIDC, @vercel/sandbox reports a missing `x-vercel-oidc-token`
// header when creating or retrieving sandboxes.
export class VercelSandbox implements Sandbox {
  constructor(
    public readonly sandbox: Awaited<
      ReturnType<typeof VercelSandboxSDK.create>
    >,
  ) {}

  private resolvePath(path: string): string {
    return isAbsolute(path) ? path : join(rootDirectory, path);
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
    const sandboxCommand = await this.sandbox.runCommand({
      cmd: 'bash',
      args: ['-c', command],
      cwd: workingDirectory ?? rootDirectory,
      detached: true,
    });

    const abortCommand = () => void sandboxCommand.kill('SIGTERM');
    if (abortSignal?.aborted) {
      abortCommand();
    } else {
      abortSignal?.addEventListener('abort', abortCommand, { once: true });
    }

    try {
      const result = await sandboxCommand.wait();

      return {
        exitCode: result.exitCode,
        stdout: await result.stdout(),
        stderr: await result.stderr(),
      };
    } finally {
      abortSignal?.removeEventListener('abort', abortCommand);
    }
  }

  async readFile({
    path,
    abortSignal,
  }: {
    path: string;
    abortSignal?: AbortSignal;
  }): Promise<ReadableStream<Uint8Array> | null> {
    abortSignal?.throwIfAborted();
    const result = await this.sandbox.readFile({
      path: this.resolvePath(path),
    });
    if (result == null) return null;
    return Readable.toWeb(
      Readable.from(result as NodeJS.ReadableStream),
    ) as ReadableStream<Uint8Array>;
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
    await this.sandbox.writeFiles([
      { path: this.resolvePath(path), content: Buffer.from(bytes) },
    ]);
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

  async stop() {
    await this.sandbox.stop();
  }

  spawnCommand(): never {
    throw new Error(
      'VercelSandbox: spawnCommand is not yet implemented for this sandbox.',
    );
  }

  get description() {
    return `Vercel Sandbox: ${this.sandbox.sandboxId}\nRoot directory: ${rootDirectory}`;
  }
}
